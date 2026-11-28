/**
 * Builds the Life tab's icons: the game's own picture for each trait,
 * skill, career track and aspiration that src/data/gameNames.json names,
 * as public/game-icons/<id>.webp (40px, sharp at the 16px and 20px the tab
 * shows them), and src/data/gameIcons.json, the ids that have one.
 *
 * Each item's SimData record points at its icon (a resource key); the
 * pictures themselves are DDS images (type 0x00B2D882) in the Client
 * packages, most of them in the game's shuffled DST1/DST5 layout. They are
 * unshuffled, decoded and written as PNG, then cwebp makes the WebP.
 *
 * Usage (needs cwebp: brew install webp):
 *   node --experimental-strip-types scripts/build-game-icons.ts [game folder]
 * The game folder defaults to /Applications/EA Games. Run it after
 * build-game-names.ts, and again after installing a pack.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { readDbpf } from '../src/lib/savegame/dbpf.ts';
import { refpackDecompress } from '../src/lib/savegame/refpack.ts';
import { decode, png } from './dds.ts';
import { readDataRecord } from './simdata.ts';

const ROOT = new URL('..', import.meta.url).pathname;
const NAMES = join(ROOT, 'src/data/gameNames.json');
const OUT_LIST = join(ROOT, 'src/data/gameIcons.json');
const OUT_DIR = join(ROOT, 'public/game-icons');
const SIMDATA = 0x545ac67a;
const IMAGE = 0x00b2d882;
/** Twice the largest size shown (20px), for sharp screens. */
const SIZE = 40;
/** The records that carry an icon, by their SimData schema. */
const WITH_ICONS = new Set(['Trait', 'Skill', 'AspirationTrack', 'TunableCareerTrack']);

const gameDir = process.argv[2] ?? '/Applications/EA Games';

try {
  execFileSync('cwebp', ['-version'], { stdio: 'ignore' });
} catch {
  console.error('cwebp is needed to write the icons: brew install webp');
  process.exit(1);
}

function unpack(bytes: Uint8Array): Uint8Array {
  const magic = String.fromCharCode(bytes[0] ?? 0, bytes[1] ?? 0, bytes[2] ?? 0, bytes[3] ?? 0);
  if (magic === 'DATA' || magic === 'DDS ') return bytes;
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

// What the board names: only these get an icon.
const names = JSON.parse(readFileSync(NAMES, 'utf8')) as Record<string, Record<string, unknown>>;
const wanted = new Set(['traits', 'skills', 'tracks', 'aspirations', 'deaths'].flatMap((k) => Object.keys(names[k] ?? {})));

// Base game first, each Full build before its Deltas (a patch overrides), then the packs.
const appData = join(gameDir, 'The Sims 4.app/Contents/Data');
const packsDir = join(gameDir, 'The Sims 4 Packs');
const packs = existsSync(packsDir) ? readdirSync(packsDir).filter((d) => /^(EP|GP|SP|FP)\d+$/.test(d)).sort().map((d) => join(packsDir, d)) : [];
const builds = (dir: string, kind: 'Simulation' | 'Client'): string[] => {
  if (!existsSync(dir)) return [];
  const re = new RegExp(`^${kind}(Full|Delta)Build(\\d+)\\.package$`);
  const files = readdirSync(dir).filter((f) => re.test(f));
  const order = (f: string) => {
    const m = re.exec(f)!;
    return (m[1] === 'Full' ? 0 : 1000) + Number(m[2]);
  };
  return files.sort((a, b) => order(a) - order(b)).map((f) => join(dir, f));
};

// Each named item's icon, from its SimData record.
const iconOf = new Map<string, string>();
for (const path of [...builds(join(appData, 'Simulation'), 'Simulation'), ...packs.flatMap((p) => builds(p, 'Simulation'))]) {
  for (const r of readDbpf(new Uint8Array(readFileSync(path)))) {
    if (r.type !== SIMDATA) continue;
    const id = r.instance.toString();
    if (!wanted.has(id)) continue;
    const rec = readDataRecord(unpack(r.bytes));
    if (!rec || !WITH_ICONS.has(rec.schema)) continue;
    const icon = (rec.row.icon as { instance?: string } | null)?.instance;
    if (icon && icon !== '0') iconOf.set(id, icon);
  }
}

// The pictures, the last build's copy of each.
const pictures = new Map<string, Uint8Array>();
const want = new Set(iconOf.values());
for (const path of [...builds(join(appData, 'Client'), 'Client'), ...packs.flatMap((p) => builds(p, 'Client'))]) {
  for (const r of readDbpf(new Uint8Array(readFileSync(path)))) {
    if (r.type !== IMAGE) continue;
    const inst = r.instance.toString(16);
    if (want.has(inst)) pictures.set(inst, unpack(r.bytes));
  }
}

// Written fresh: an icon the game dropped goes with it.
rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });
const work = mkdtempSync(join(tmpdir(), 'game-icons-'));
const ids: string[] = [];
let unread = 0;
for (const [id, icon] of iconOf) {
  const dds = pictures.get(icon);
  const picture = dds ? decode(dds) : null;
  if (!picture) {
    unread++;
    continue;
  }
  const source = join(work, `${id}.png`);
  writeFileSync(source, png(picture.w, picture.h, picture.px));
  execFileSync('cwebp', ['-quiet', '-q', '85', '-alpha_q', '90', '-m', '6', '-resize', String(SIZE), String(SIZE), source, '-o', join(OUT_DIR, `${id}.webp`)]);
  ids.push(id);
}
rmSync(work, { recursive: true, force: true });

ids.sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0));
writeFileSync(
  OUT_LIST,
  `${JSON.stringify({ note: 'Built by scripts/build-game-icons.ts from the installed game: the traits, skills, career tracks, aspirations and deaths with an icon in public/game-icons/<id>.webp.', ids })}\n`,
);
console.log(`${ids.length} of ${wanted.size} named items have an icon${unread ? `; ${unread} pictures couldn’t be read` : ''}.`);
