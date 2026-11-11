/**
 * Builds src/data/places.json and the icons under public/places/: every
 * world's neighbourhoods and the lots people can live on, with their names,
 * sizes, bedrooms and bathrooms, whether they are empty, and whether the game
 * puts a premade household there.
 *
 *   node --experimental-strip-types scripts/build-places.ts <save>
 *
 * Reads The Sims 4 as installed (lot, lot description and neighbourhood
 * resources, and the English string tables) and one save, for each world's
 * name and each lot's venue. Only game facts are written: names come from
 * the game's strings, never from the save, so a lot or household the player
 * renamed stays private. Icons are listed from public/places (see below).
 *
 * Game resources used (DBPF packages, zlib-compressed):
 * - 0x729F6C4F lot: name key at 4, bedrooms at 44 and bathrooms at 45 (an
 *   empty lot has neither), the lot hash the save stores per lot, the lot id,
 *   and 8 bytes after it a premade household reference (zero when free).
 * - 0x01942E2C lot description, by lot id: neighbourhood at 4, width and
 *   depth at 20 and 21.
 * - 0xA680EA4B neighbourhood: name key at 4, world id at 16.
 * - 0x220557DA string table.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { readDbpf } from '../src/lib/savegame/dbpf.ts';
import { refpackDecompress } from '../src/lib/savegame/refpack.ts';
import { decodeFields, utf8 } from '../src/lib/savegame/protobuf.ts';

const GAME = '/Applications/EA Games/The Sims 4.app/Contents';
const PACKS = '/Applications/EA Games/The Sims 4 Packs';
const ROOT = path.resolve(import.meta.dirname, '..');
const [savePath] = process.argv.slice(2);
if (!savePath) throw new Error('usage: build-places.ts <save>');

/** Venues people live on, from the save's lot records. */
const HOME_VENUES: Record<number, 'house' | 'rental' | 'dorm'> = { 28614: 'house', 341299: 'rental', 208182: 'dorm' };

type Entry = { type: number; instance: bigint; offset: number; size: number; comp: number };
function readIndex(file: string): { fd: number; entries: Entry[] } {
  const fd = fs.openSync(file, 'r');
  const head = Buffer.alloc(96);
  fs.readSync(fd, head, 0, 96, 0);
  if (head.toString('latin1', 0, 4) !== 'DBPF') throw new Error(`not a package: ${file}`);
  const count = head.readUInt32LE(0x24);
  const idx = Buffer.alloc(head.readUInt32LE(0x2c));
  fs.readSync(fd, idx, 0, idx.length, head.readUInt32LE(0x40));
  let p = 0;
  const u32 = () => ((p += 4), idx.readUInt32LE(p - 4));
  const flags = u32();
  const cType = flags & 1 ? u32() : 0;
  if (flags & 2) u32();
  const cHi = flags & 4 ? u32() : 0;
  const entries: Entry[] = [];
  for (let i = 0; i < count; i++) {
    const type = flags & 1 ? cType : u32();
    if (!(flags & 2)) u32();
    const hi = flags & 4 ? cHi : u32();
    const lo = u32();
    const offset = u32();
    const size = u32() & 0x7fffffff;
    u32();
    const comp = idx.readUInt16LE(p);
    p += 4;
    entries.push({ type, instance: (BigInt(hi) << 32n) | BigInt(lo), offset, size, comp });
  }
  return { fd, entries };
}
function read(fd: number, e: Entry): Buffer {
  const b = Buffer.alloc(e.size);
  fs.readSync(fd, b, 0, e.size, e.offset);
  if (e.comp === 0x5a42) return zlib.inflateSync(b);
  if (e.comp === 0xffff) return Buffer.from(refpackDecompress(b));
  return b;
}
function packages(match: RegExp): string[] {
  const dirs = [`${GAME}/Data/Simulation`, `${GAME}/Data/Client`];
  for (const d of fs.readdirSync(PACKS)) if (fs.statSync(`${PACKS}/${d}`).isDirectory()) dirs.push(`${PACKS}/${d}`);
  for (const d of fs.readdirSync(`${GAME}/Delta`)) dirs.push(`${GAME}/Delta/${d}`);
  return dirs.flatMap((d) => fs.readdirSync(d).filter((f) => match.test(f)).map((f) => `${d}/${f}`));
}

// English strings.
const strings = new Map<number, string>();
for (const file of packages(/^Strings_ENG_US\.package$/)) {
  const { fd, entries } = readIndex(file);
  for (const e of entries.filter((x) => x.type === 0x220557da)) {
    const b = read(fd, e);
    if (b.toString('latin1', 0, 4) !== 'STBL') continue;
    let p = 7;
    const n = Number(b.readBigUInt64LE(p));
    p += 14;
    for (let i = 0; i < n && p + 7 <= b.length; i++) {
      const key = b.readUInt32LE(p);
      const len = b.readUInt16LE(p + 5);
      strings.set(key, b.toString('utf8', p + 7, p + 7 + len));
      p += 7 + len;
    }
  }
  fs.closeSync(fd);
}

// The save: world names by id, and each lot's id, hash and venue.
const sgd = readDbpf(new Uint8Array(fs.readFileSync(savePath))).find((r) => r.type === 0xd);
if (!sgd) throw new Error('no save game data');
const worldName = new Map<number, string>();
const saveLots: { lotId: number; hash: number; venue: number; world: string }[] = [];
for (const rec of decodeFields(refpackDecompress(sgd.bytes))) {
  if (rec.field !== 4 || !rec.bytes) continue;
  const fields = decodeFields(rec.bytes);
  const name = utf8(fields.find((f) => f.field === 3 && f.bytes)?.bytes ?? null) ?? '';
  const id = Number(fields.find((f) => f.field === 4 && !f.bytes)?.int ?? 0n);
  if (name && id) worldName.set(id, name);
  for (const f of fields.filter((x) => x.field === 5 && x.bytes)) {
    const l = decodeFields(f.bytes!);
    const num = (n: number) => Number(l.find((x) => x.field === n && !x.bytes)?.int ?? 0n);
    saveLots.push({ lotId: num(1), hash: num(5), venue: num(7), world: name });
  }
}
const byHash = new Map(saveLots.map((l) => [l.hash, l]));

// Game lots, lot descriptions and neighbourhoods.
type GameLot = { name: string; beds: number; baths: number; household: bigint };
/**
 * Each lot's records by the lot hash the save stores, then by record. An
 * apartment or rental building has a record per unit (11A, 11B and 11C
 * Sungai Point), all with the building's hash and lot id, each with its own
 * name, rooms and premade household; a rental also has one for the building
 * itself, with no rooms.
 */
const lotByHash = new Map<number, Map<bigint, GameLot>>();
const desc = new Map<number, { nb: number; w: number; d: number }>();
const nbs = new Map<number, { name: string; world: number }>();
for (const file of packages(/^Simulation(Full|Delta)Build\d\.package$/)) {
  let idx;
  try {
    idx = readIndex(file);
  } catch {
    continue;
  }
  for (const e of idx.entries) {
    if (e.type === 0x729f6c4f) {
      const b = read(idx.fd, e);
      if (b.length < 60) continue;
      for (let o = 48; o + 4 <= b.length; o++) {
        const hash = b.readUInt32LE(o);
        const lot = byHash.get(hash);
        if (!lot) continue;
        let at = -1;
        for (let q = o + 4; q + 4 <= b.length; q++) if (b.readUInt32LE(q) === lot.lotId) { at = q; break; }
        const ref = at >= 0 && at + 24 <= b.length ? b.subarray(at + 8, at + 24) : Buffer.alloc(0);
        const name = strings.get(b.readUInt32LE(4)) ?? '';
        // A later record (a pack's update) replaces an earlier one. One with
        // no name is not a home: a Seasons record shares Oakenstead's hash.
        if (name) {
          const units = lotByHash.get(hash) ?? new Map<bigint, GameLot>();
          units.set(e.instance, { name, beds: b[44]!, baths: b[45]!, household: ref.length === 16 ? ref.readBigUInt64LE(8) : 0n });
          lotByHash.set(hash, units);
        }
        break;
      }
    } else if (e.type === 0x01942e2c) {
      const b = read(idx.fd, e);
      if (b.length >= 22) desc.set(Number(e.instance), { nb: b.readUInt32LE(4), w: b[20]!, d: b[21]! });
    } else if (e.type === 0xa680ea4b) {
      const b = read(idx.fd, e);
      if (b.length >= 20) nbs.set(Number(e.instance), { name: strings.get(b.readUInt32LE(4)) ?? '', world: b.readUInt32LE(16) });
    }
  }
  fs.closeSync(idx.fd);
}

// Premade households, by the household template a lot names: field 1 is the
// household, each field 6 in it a sim, with a first and last name as text
// (5 and 6) or as string keys (55 and 56).
const wanted = new Set([...lotByHash.values()].flatMap((u) => [...u.values()].map((g) => g.household)).filter((h) => h));
const householdSims = new Map<bigint, string[]>();
for (const file of packages(/^Client(Full|Delta)Build\d\.package$/)) {
  let idx;
  try {
    idx = readIndex(file);
  } catch {
    continue;
  }
  for (const e of idx.entries) {
    if (e.type !== 0xb3c438f0 || !wanted.has(e.instance)) continue;
    const b = read(idx.fd, e);
    const hh = decodeFields(b.subarray(16)).find((f) => f.field === 1 && f.bytes)?.bytes;
    if (!hh) continue;
    const sims: string[] = [];
    for (const f of decodeFields(hh)) {
      if (f.field !== 6 || !f.bytes) continue;
      const sim = decodeFields(f.bytes);
      const text = (n: number) => utf8(sim.find((x) => x.field === n && x.bytes)?.bytes ?? null)?.trim() ?? '';
      const key = (n: number) => strings.get(Number(sim.find((x) => x.field === n && !x.bytes)?.int ?? 0n))?.trim() ?? '';
      const name = `${text(5) || key(55)} ${text(6) || key(56)}`.trim();
      if (name) sims.push(name);
    }
    householdSims.set(e.instance, sims);
  }
  fs.closeSync(idx.fd);
}

// Each premade household's name on the starter board: the household there
// most of its sims live in.
type BoardNode = { first: string; sur: string; world: string; hh: string; gid: string };
const board = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/whiteboard.json'), 'utf8')) as { nodes: BoardNode[] };
const fold = (s: string) => s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
function boardHousehold(world: string, template: bigint): string | undefined {
  const sims = new Set((householdSims.get(template) ?? []).map(fold));
  const votes = new Map<string, number>();
  for (const n of board.nodes) {
    if (n.world !== world || !sims.has(fold(`${n.first} ${n.sur}`))) continue;
    votes.set(n.hh, (votes.get(n.hh) ?? 0) + 1);
  }
  return [...votes].sort((a, b) => b[1] - a[1])[0]?.[0];
}

// Lots people can live on. \`hash\` is the game's for the lot, as a save
// stores it; a building's units share it. \`household\`, the premade
// household the game puts there.
type Lot = {
  world: string;
  nb: string;
  name: string;
  hash: number;
  w: number;
  d: number;
  beds: number;
  baths: number;
  kind: 'house' | 'empty';
  venue: 'house' | 'rental' | 'dorm';
  household?: string;
};
const lots: Lot[] = [];
const skipped: string[] = [];
const seen = new Set<number>();
for (const s of saveLots) {
  const venue = HOME_VENUES[s.venue];
  // The save repeats a building's lot once per unit (by zone): one pass each.
  if (!venue || seen.has(s.hash)) continue;
  seen.add(s.hash);
  const all = [...(lotByHash.get(s.hash)?.values() ?? [])];
  // A building's own record, with no rooms, is not a home when it has units.
  const units = all.length > 1 ? all.filter((g) => g.beds || g.baths) : all;
  const dsc = desc.get(s.lotId);
  const nb = dsc ? nbs.get(dsc.nb) : undefined;
  if (!units.length || !dsc || !nb) {
    skipped.push(`${s.world} lot ${s.lotId}${all[0] ? ` ${all[0].name}` : ''}`);
    continue;
  }
  const world = worldName.get(nb.world) ?? s.world;
  for (const g of units) {
    lots.push({
      world,
      // A world of one neighbourhood (Forgotten Hollow, Glimmerbrook) gives it
      // no name of its own: the world's stands for it.
      nb: (nb.name || world).trim(),
      name: g.name.trim(),
      hash: s.hash,
      w: dsc.w,
      d: dsc.d,
      beds: g.beds,
      baths: g.baths,
      kind: g.beds || g.baths ? 'house' : 'empty',
      venue,
      ...(g.household ? { household: boardHousehold(world, g.household) ?? '?' } : {}),
    });
  }
}
lots.sort((a, b) => a.world.localeCompare(b.world) || a.nb.localeCompare(b.nb) || a.name.localeCompare(b.name));

// Neighbourhoods of the worlds people live in.
const slug = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const worlds = new Map<string, Set<string>>();
for (const l of lots) worlds.set(l.world, (worlds.get(l.world) ?? new Set()).add(l.nb));

// Icons, as they sit in public/places: each world's and each neighbourhood's
// from the Sims Wiki (the in-game world picture and the neighbourhood disc),
// 64px wide, named by slug ("willow-creek.webp", "willow-creek--foundry-cove.webp").
// The wiki's image server turns scripts away, so they are saved through a
// browser; this only lists what is there. A world of one neighbourhood uses
// the world's picture for it.
const outDir = path.join(ROOT, 'public/places');
const have = (dir: string, name: string) => fs.readdirSync(path.join(outDir, dir)).find((f) => f.replace(/\.[^.]+$/, '') === name);
const worldIcon: Record<string, string> = {};
const nbIcon: Record<string, string> = {};
for (const [world, names] of worlds) {
  const w = have('worlds', slug(world));
  if (w) worldIcon[world] = `worlds/${w}`;
  for (const nb of names) {
    const own = have('neighbourhoods', `${slug(world)}--${slug(nb)}`);
    const icon = own ? `neighbourhoods/${own}` : names.size === 1 ? worldIcon[world] : undefined;
    if (icon) nbIcon[`${world}||${nb}`] = icon;
  }
}
// One world per key, A to Z; its lots one per line, so a rebuild's diff
// reads lot by lot.
const worldEntries = [...worlds].sort(([a], [b]) => a.localeCompare(b)).map(([world, names]) => {
  const head = {
    ...(worldIcon[world] ? { icon: worldIcon[world] } : {}),
    neighbourhoods: Object.fromEntries([...names].sort().map((nb) => [nb, nbIcon[`${world}||${nb}`] ? { icon: nbIcon[`${world}||${nb}`] } : {}])),
  };
  const own = lots.filter((l) => l.world === world).map(({ world: _w, ...l }) => `   ${JSON.stringify(l)}`);
  const headJson = JSON.stringify(head).slice(0, -1);
  return `  ${JSON.stringify(world)}: ${headJson},\n   "lots": [\n${own.join(',\n')}\n  ]}`;
});
fs.writeFileSync(path.join(ROOT, 'src/data/places.json'), `{"worlds": {\n${worldEntries.join(',\n')}\n}}\n`);
console.log(`${lots.length} lots in ${worlds.size} worlds; ${lots.filter((l) => !l.household).length} free (${lots.filter((l) => !l.household && l.kind === 'empty').length} empty)`);
const unnamed = lots.filter((l) => l.household === '?');
if (unnamed.length) console.log(`premade households not found: ${unnamed.map((l) => l.name).join(', ')}`);
console.log(`world icons ${Object.keys(worldIcon).length}/${worlds.size}; neighbourhood icons ${Object.keys(nbIcon).length}/${[...worlds.values()].reduce((s, n) => s + n.size, 0)}`);
if (skipped.length) console.log(`skipped ${skipped.length}: ${skipped.join('; ')}`);
