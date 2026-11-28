/**
 * Writes src/data/nobleTitles.json: the noble titles of Royalty & Legacy,
 * from the installed game.
 *
 * - `ranks`: the kingdom's titles by noble rank, 1 to 10 (the Noble career
 *   level), from the game's client_KingdomTitles table. Each rank has two
 *   rows, as the game's Kingdom Manager explains: the title the career gives
 *   ("Grand Duke", "Grand Duchess", "Grand Duchum") and the one a noble's
 *   children use ("Lord", "Lady", "Lordem"; a monarch's: "Prince",
 *   "Princess", "Princem"). Each row is masculine, feminine, neutral.
 * - `words`: every key of the game's text whose words are a noble title, a
 *   child's title or a world's name. A family-tree ancestor's title is kept
 *   in a save only as such keys (title, realm), with the rank.
 *
 * Usage:
 *   node --experimental-strip-types scripts/build-noble-titles.ts [game folder]
 * The game folder defaults to /Applications/EA Games.
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { readDbpf } from '../src/lib/savegame/dbpf.ts';
import { refpackDecompress } from '../src/lib/savegame/refpack.ts';

const ROOT = new URL('..', import.meta.url).pathname;
const OUT = join(ROOT, 'src/data/nobleTitles.json');
const SIMDATA = 0x545ac67a;
const STBL = 0x220557da;
/** client_KingdomTitles, in the Royalty & Legacy pack (EP21). */
const KINGDOM_TITLES = 2148277019287873311n;

const [gameDir = '/Applications/EA Games'] = process.argv.slice(2);

function unpack(bytes: Uint8Array): Uint8Array {
  const magic = String.fromCharCode(bytes[0] ?? 0, bytes[1] ?? 0, bytes[2] ?? 0, bytes[3] ?? 0);
  if (magic === 'DATA' || magic === 'STBL') return bytes;
  if (bytes[0] === 0x78) return new Uint8Array(inflateSync(bytes));
  return refpackDecompress(bytes);
}

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
      if (!strings.has(key)) strings.set(key, new TextDecoder().decode(b.subarray(pos, pos + length)).trim());
      pos += length;
    }
  }
}

const pack = join(gameDir, 'The Sims 4 Packs/EP21/SimulationFullBuild0.package');
if (!existsSync(pack)) {
  console.error(`No Royalty & Legacy pack at ${pack}`);
  process.exit(1);
}
const table = readDbpf(new Uint8Array(readFileSync(pack))).find((r) => r.type === SIMDATA && r.instance === KINGDOM_TITLES);
if (!table) {
  console.error('No client_KingdomTitles in the Royalty & Legacy pack');
  process.exit(1);
}
// The table's text keys sit in one run, six to a rank (title m/f/n, child's
// m/f/n), rank 1 first. Read them as the run of keys that are text.
const data = unpack(table.bytes);
const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
const run: string[] = [];
for (let i = 0; i + 4 <= data.length; i += 4) {
  const text = strings.get(view.getUint32(i, true));
  if (text) run.push(text);
  else if (run.length) break;
}
if (run.length !== 60) {
  console.error(`Expected 60 titles (10 ranks × 6), found ${run.length}: ${run.join(', ')}`);
  process.exit(1);
}
const ranks = Array.from({ length: 10 }, (_, i) => ({
  rank: i + 1,
  title: run.slice(i * 6, i * 6 + 3),
  child: run.slice(i * 6 + 3, i * 6 + 6),
}));

// Every key whose text is one of these titles, or a world's name (a realm).
const places = JSON.parse(readFileSync(join(ROOT, 'src/data/places.json'), 'utf8')) as Record<string, unknown>;
const worldNames = new Set(Object.keys(places.worlds ?? places));
const titleWords = new Set(run);
const words: Record<string, string> = {};
for (const [key, text] of strings) if (titleWords.has(text) || worldNames.has(text)) words[String(key)] = text;
const sorted = Object.fromEntries(Object.entries(words).sort(([a], [b]) => Number(a) - Number(b)));

writeFileSync(OUT, JSON.stringify({ ranks, words: sorted }, null, 1) + '\n');
console.log(`${ranks.length} ranks; ${Object.keys(sorted).length} title and realm words. Rank 9: ${ranks[8]!.title.join(' / ')}.`);
