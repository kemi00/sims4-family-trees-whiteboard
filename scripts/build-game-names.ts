/**
 * Builds src/data/gameNames.json: the game's own English names for what a
 * save stores as numbers on each sim — traits (personality or earned),
 * careers with their branch and level titles, skills with their level
 * steps, and aspirations — for the base game and every installed pack.
 *
 * Names come from each item's SimData record (the small binary record the
 * game's interface reads, the same layout in the base game and the packs;
 * see simdata.ts), turned into words by the English string tables. The
 * skill level steps come from the base game's tuning (SKILL_LEVEL_LIST).
 *
 * Usage:
 *   node --experimental-strip-types scripts/build-game-names.ts [game folder]
 * The game folder defaults to /Applications/EA Games, where the EA app
 * installs the game on macOS. Run it again after installing a pack, then
 * scripts/build-game-icons.ts for the Life tab's icons.
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { readDbpf } from '../src/lib/savegame/dbpf.ts';
import { refpackDecompress } from '../src/lib/savegame/refpack.ts';
import { readDataRecord, type DataValue } from './simdata.ts';

const ROOT = new URL('..', import.meta.url).pathname;
const OUT = join(ROOT, 'src/data/gameNames.json');
const SIMDATA = 0x545ac67a;
const STBL = 0x220557da;
const COMBINED_TUNING = 0x62e94d38;

const gameDir = process.argv[2] ?? '/Applications/EA Games';

/** Trait types (SimData trait_type) shown as personality, and as earned in play. */
const PERSONALITY = 0;
/**
 * Earned during life: gameplay rewards (1: Savant, Collector), aspiration
 * rewards (6: Muser, Quick Learner), university degrees (18), lifestyles
 * (21), how high school ended (30) and childhood inspirations (36). The
 * rest are walk styles, hidden ones, ghosts' causes, phone colours and
 * the game's own bookkeeping, and stay off the board.
 */
const EARNED = new Set([1, 6, 18, 21, 30, 36]);
/** Skill level types (SimData skill_level_type): major, minor, child. Others (toddler, hidden) have no steps here. */
const SKILL_TYPE_NAMES: Record<string, string> = { MAJOR: '0', MINOR: '1', CHILD: '2' };

function unpack(bytes: Uint8Array): Uint8Array {
  const magic = String.fromCharCode(bytes[0] ?? 0, bytes[1] ?? 0, bytes[2] ?? 0, bytes[3] ?? 0);
  if (magic === 'DATA' || magic === 'STBL' || bytes[0] === 0x3c) return bytes;
  if (bytes[0] === 0x78) {
    try {
      return new Uint8Array(inflateSync(bytes));
    } catch {
      return bytes;
    }
  }
  try {
    return refpackDecompress(bytes);
  } catch {
    return bytes;
  }
}

/** Every file called `file` under `dir`. */
function find(dir: string, file: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    let info;
    try {
      info = statSync(path);
    } catch {
      continue;
    }
    if (info.isDirectory()) out.push(...find(path, file));
    else if (entry === file) out.push(path);
  }
  return out;
}

// The English text, every pack's.
const strings = new Map<number, string>();
for (const path of find(gameDir, 'Strings_ENG_US.package')) {
  for (const r of readDbpf(new Uint8Array(readFileSync(path)))) {
    if (r.type !== STBL) continue;
    const b = unpack(r.bytes);
    if (String.fromCharCode(b[0]!, b[1]!, b[2]!, b[3]!) !== 'STBL') continue;
    const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
    const count = Number(view.getBigUint64(7, true));
    let pos = 21;
    for (let i = 0; i < count; i++) {
      const key = view.getUint32(pos, true);
      const length = view.getUint16(pos + 5, true);
      pos += 7;
      if (!strings.has(key)) strings.set(key, new TextDecoder().decode(b.subarray(pos, pos + length)));
      pos += length;
    }
  }
}
const say = (key: DataValue | undefined): string => (typeof key === 'number' && key ? (strings.get(key) ?? '').trim() : '');
const ids = (v: DataValue | undefined): string[] => (Array.isArray(v) ? v.map(String) : []);

// Base game first, each Full build before its Delta (a patch overrides), then the packs.
const appData = join(gameDir, 'The Sims 4.app/Contents/Data/Simulation');
const packsDir = join(gameDir, 'The Sims 4 Packs');
const roots = [appData, ...(existsSync(packsDir) ? readdirSync(packsDir).sort().map((d) => join(packsDir, d)) : [])];
const packages = roots.flatMap((r) => ['SimulationFullBuild0.package', 'SimulationDeltaBuild0.package'].map((f) => join(r, f))).filter(existsSync);

const traits: Record<string, [string, 'p' | 'e']> = {};
const skills: Record<string, [string, number]> = {};
const aspirations: Record<string, string> = {};
/** The ghost traits a death leaves a sim with (trait_Ghost_OldAge…): trait id → the death, for the editor's "How they died". */
const deaths: Record<string, string> = {};
/** "trait_Ghost_UrbanMyth" → "Urban Myth": a ghost trait's tuning name in words, for one with no name of its own. */
const deathWords = (tuning: string): string =>
  tuning
    .replace(/^trait_Ghost_?/i, '')
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim();
/**
 * The death a ghost trait stands for, in the game's words: "Death by Old
 * Age" gives "Old Age", "Consumed by the Mother" stays as it is. Null for
 * the ghost forms a living sim takes for a while (Temporary Specter, a
 * séance's Spiritual Ascendance, a failed immortality potion, the Night
 * Wraith curse): the game calls them temporary, or gives them no story.
 */
function deathOf(tuning: string, name: string, description: string): string | null {
  if (!name) return deathWords(tuning) || null;
  const by = /^Death by\s+(.+)$/i.exec(name);
  if (by) return by[1]!.trim();
  if (!description || /temporar|will pass/i.test(description)) return null;
  return name;
}
const levelTitle = new Map<string, string>();
const rawTracks = new Map<string, { name: string; levels: string[]; branches: string[] }>();
let baseTuning = '';

for (const path of packages) {
  for (const r of readDbpf(new Uint8Array(readFileSync(path)))) {
    if (r.type === COMBINED_TUNING && path.startsWith(appData) && path.endsWith('FullBuild0.package')) {
      const b = unpack(r.bytes);
      if (b[0] === 0x3c) baseTuning = new TextDecoder().decode(b);
      continue;
    }
    if (r.type !== SIMDATA) continue;
    const rec = readDataRecord(unpack(r.bytes));
    if (!rec) continue;
    const id = r.instance.toString();
    const row = rec.row;
    if (rec.schema === 'Trait') {
      const name = say(row.display_name);
      const type = Number(row.trait_type);
      // How a ghost died is a trait of its own, named for the death ("Death by Old Age").
      if (/^trait_Ghost_./i.test(rec.name ?? '')) {
        const death = deathOf(rec.name!, name, say(row.trait_description));
        if (death) deaths[id] = death;
        continue;
      }
      if (!name) continue;
      if (type === PERSONALITY) traits[id] = [name, 'p'];
      else if (EARNED.has(type)) traits[id] = [name, 'e'];
    } else if (rec.schema === 'Skill' || rec.schema === 'statistics.skill.Skill') {
      const name = say(row.stat_name);
      if (name && !/hidden/i.test(rec.name)) skills[id] = [name, Number(row.skill_level_type)];
    } else if (rec.schema === 'AspirationTrack') {
      const name = say(row.display_text);
      if (name) aspirations[id] = name;
    } else if (rec.schema === 'CareerLevel') {
      const title = say(row.title);
      if (title) levelTitle.set(id, title);
    } else if (rec.schema === 'TunableCareerTrack' || rec.schema === 'UniversityCourseTrack') {
      // A university course slot (Discover University) is a career track too. Its own name is a
      // placeholder the game never shows, so it reads as being at university, with no level.
      if (rec.schema === 'UniversityCourseTrack') rawTracks.set(id, { name: 'University student', levels: [], branches: [] });
      else rawTracks.set(id, { name: say(row.career_name), levels: ids(row.career_levels), branches: ids(row.branches) });
    }
  }
}

// A career track: its name, its level titles in order, the top level it leads to, and the track it branches from.
const parentOf = new Map<string, string>();
for (const [id, t] of rawTracks) for (const b of t.branches) parentOf.set(b, id);
const depthBefore = (id: string): number => {
  const p = parentOf.get(id);
  return p ? (rawTracks.get(p)?.levels.length ?? 0) + depthBefore(p) : 0;
};
const deepest = (id: string): number => {
  const t = rawTracks.get(id);
  if (!t) return 0;
  return t.levels.length + Math.max(0, ...t.branches.map(deepest));
};
const tracks: Record<string, [string, string[], number, string?]> = {};
for (const [id, t] of rawTracks) {
  if (!t.name) continue;
  const titles = t.levels.map((l) => levelTitle.get(l) ?? '');
  // Careers end at level 10 in the game: the Villain branch's tuning lists a fourth title past it.
  const top = Math.min(10, depthBefore(id) + deepest(id));
  const parent = parentOf.get(id);
  tracks[id] = parent ? [t.name, titles, top, parent] : [t.name, titles, top];
}

// Skill level steps, from the base game's module tuning: values pooled once and referenced by number.
const skillLevels: Record<string, number[]> = {};
if (baseTuning) {
  const pool = new Map<string, string>();
  for (const m of baseTuning.matchAll(/<[ETV](?: t="[^"]*")? x="(\d+)"[^>]*>([^<]*)<\/[ETV]>/g)) pool.set(m[1]!, m[2]!);
  const at = baseTuning.indexOf('<L n="SKILL_LEVEL_LIST">');
  const end = baseTuning.indexOf('</L></U></L>', at) + 12;
  for (const u of baseTuning.slice(at, end).matchAll(/<U>(.*?)<\/L><\/U>/g)) {
    const body = u[1]!;
    const ref = /<r n="key" x="(\d+)" \/>/.exec(body)?.[1];
    const key = ref ? pool.get(ref) : /<E n="key">([A-Z_]+)<\/E>/.exec(body)?.[1];
    const steps = [...body.matchAll(/<r x="(\d+)" \/>|<T>(\d+)<\/T>/g)].map((m) => Number(m[1] ? pool.get(m[1]) : m[2]));
    const type = key ? SKILL_TYPE_NAMES[key] : undefined;
    if (type !== undefined && steps.every((n) => Number.isFinite(n))) skillLevels[type] = steps;
  }
}

const sorted = <T>(o: Record<string, T>): Record<string, T> =>
  Object.fromEntries(Object.entries(o).sort(([a], [b]) => (BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0)));
const out = {
  note: 'Built by scripts/build-game-names.ts from the installed game. Traits: [name, p personality | e earned]. Skills: [name, level type]. Tracks: [name, level titles, top level, branched from]. skillLevels: points per level, by level type.',
  skillLevels,
  traits: sorted(traits),
  skills: sorted(skills),
  tracks: sorted(tracks),
  aspirations: sorted(aspirations),
  deaths: sorted(deaths),
};
writeFileSync(OUT, `${JSON.stringify(out)}\n`);
console.log(
  `${packages.length} packages, ${strings.size} strings: ${Object.keys(traits).length} traits, ${Object.keys(skills).length} skills, ${Object.keys(tracks).length} career tracks, ${Object.keys(aspirations).length} aspirations, ${Object.keys(deaths).length} deaths (${Object.values(deaths).slice(0, 6).join(', ')}…), skill level types ${Object.keys(skillLevels).join(', ')}. Wrote ${OUT} (${(JSON.stringify(out).length / 1024).toFixed(0)} KB).`,
);
