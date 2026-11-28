/**
 * Builds the dynasty crests' pictures: every 128 × 128 picture in the
 * Royalty & Legacy pack (EP21), as public/game-crests/<instance>.webp, and
 * src/data/gameCrests.json, the instances there are.
 *
 * A save keeps each dynasty's crest as two picture keys in its dynasty record
 * (gameplay 2.8.60): field 11 the shield, field 3 the emblem drawn on it,
 * each {1 type, 2 group, 3 instance}. The pictures are the pack's DDS images
 * (type 0x00B2D882) of that instance, 128 × 128 DST5. The game keeps no list
 * of them that names which is which, so every one of that size is taken
 * (502 in 2026: shields, emblems and a few other icons): the board shows only
 * those a save names.
 *
 * Usage (needs cwebp: brew install webp):
 *   node --experimental-strip-types scripts/build-crests.ts [game folder]
 * The game folder defaults to /Applications/EA Games.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { readDbpf } from '../src/lib/savegame/dbpf.ts';
import { decode, png } from './dds.ts';

const ROOT = new URL('..', import.meta.url).pathname;
const OUT_DIR = join(ROOT, 'public/game-crests');
const OUT_LIST = join(ROOT, 'src/data/gameCrests.json');
const IMAGE = 0x00b2d882;
/** The crest is shown at up to 40px: twice that is sharp on every screen. */
const SIZE = 80;

const gameDir = process.argv[2] ?? '/Applications/EA Games';
const pack = join(gameDir, 'The Sims 4 Packs/EP21/ClientFullBuild0.package');
if (!existsSync(pack)) {
  console.error(`No Royalty & Legacy pack at ${pack}`);
  process.exit(1);
}
try {
  execFileSync('cwebp', ['-version'], { stdio: 'ignore' });
} catch {
  console.error('cwebp is needed to write the crests: brew install webp');
  process.exit(1);
}

rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });
const work = mkdtempSync(join(tmpdir(), 'game-crests-'));
const ids: string[] = [];
for (const r of readDbpf(new Uint8Array(readFileSync(pack)))) {
  if (r.type !== IMAGE) continue;
  let b = r.bytes;
  if (b[0] === 0x78) b = new Uint8Array(inflateSync(b));
  if (String.fromCharCode(b[0]!, b[1]!, b[2]!, b[3]!) !== 'DDS ') continue;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (v.getUint32(12, true) !== 128 || v.getUint32(16, true) !== 128) continue;
  const picture = decode(b);
  if (!picture) continue;
  const id = r.instance.toString();
  const source = join(work, `${id}.png`);
  writeFileSync(source, png(picture.w, picture.h, picture.px));
  execFileSync('cwebp', ['-quiet', '-q', '82', '-alpha_q', '90', '-m', '6', '-resize', String(SIZE), String(SIZE), source, '-o', join(OUT_DIR, `${id}.webp`)]);
  ids.push(id);
}
rmSync(work, { recursive: true, force: true });

ids.sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0));
writeFileSync(
  OUT_LIST,
  `${JSON.stringify({ note: 'Built by scripts/build-crests.ts from the installed game: the Royalty & Legacy pictures a dynasty crest can be made of, in public/game-crests/<id>.webp.', ids })}\n`,
);
const bytes = ids.reduce((sum, id) => sum + statSync(join(OUT_DIR, `${id}.webp`)).size, 0);
console.log(`${ids.length} crest pictures, ${Math.round(bytes / 1024)} KB.`);
