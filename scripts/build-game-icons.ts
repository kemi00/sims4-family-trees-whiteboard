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
import { deflateSync, inflateSync } from 'node:zlib';
import { readDbpf } from '../src/lib/savegame/dbpf.ts';
import { refpackDecompress } from '../src/lib/savegame/refpack.ts';
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

/** The game's DST layouts keep each part of every block together; DXT puts each block's parts together. */
function unshuffle(data: Uint8Array, fourCC: string): Uint8Array {
  const size = data.length;
  const out = new Uint8Array(size);
  if (fourCC === 'DST1') {
    const half = size >> 1;
    for (let i = 0; 8 * i < size; i++) {
      out.set(data.subarray(4 * i, 4 * i + 4), 8 * i);
      out.set(data.subarray(half + 4 * i, half + 4 * i + 4), 8 * i + 4);
    }
    return out;
  }
  // DST5: alpha ends, colour ends, alpha indices, colour indices.
  const colours = size >> 3;
  const alphaBits = colours + (size >> 2);
  const colourBits = alphaBits + ((6 * size) >> 4);
  for (let i = 0; 16 * i < size; i++) {
    out.set(data.subarray(2 * i, 2 * i + 2), 16 * i);
    out.set(data.subarray(alphaBits + 6 * i, alphaBits + 6 * i + 6), 16 * i + 2);
    out.set(data.subarray(colours + 4 * i, colours + 4 * i + 4), 16 * i + 8);
    out.set(data.subarray(colourBits + 4 * i, colourBits + 4 * i + 4), 16 * i + 12);
  }
  return out;
}

const rgb565 = (c: number): number[] => [(((c >> 11) & 31) * 255) / 31, (((c >> 5) & 63) * 255) / 63, ((c & 31) * 255) / 31].map(Math.round);

/** One 4×4 colour block (DXT1 or DXT5's colour half) into the picture. */
function colourBlock(b: Uint8Array, o: number, px: Uint8Array, w: number, x: number, y: number, dxt1: boolean, alpha?: number[]): void {
  const c0 = b[o]! | (b[o + 1]! << 8);
  const c1 = b[o + 2]! | (b[o + 3]! << 8);
  const p0 = rgb565(c0);
  const p1 = rgb565(c1);
  const four = !dxt1 || c0 > c1;
  const p2 = p0.map((v, i) => (four ? Math.round((2 * v + p1[i]!) / 3) : Math.round((v + p1[i]!) / 2)));
  const p3 = four ? p0.map((v, i) => Math.round((v + 2 * p1[i]!) / 3)) : [0, 0, 0];
  const pal = [p0, p1, p2, p3];
  const bits = (b[o + 4]! | (b[o + 5]! << 8) | (b[o + 6]! << 16) | (b[o + 7]! << 24)) >>> 0;
  for (let i = 0; i < 16; i++) {
    const k = (bits >>> (2 * i)) & 3;
    const q = ((y + (i >> 2)) * w + x + (i & 3)) * 4;
    px.set(pal[k]!, q);
    px[q + 3] = alpha ? alpha[i]! : !four && k === 3 ? 0 : 255;
  }
}

/** DXT5's alpha half of a block: 16 alphas. */
function alphaBlock(b: Uint8Array, o: number): number[] {
  const a0 = b[o]!;
  const a1 = b[o + 1]!;
  const pal = [a0, a1];
  if (a0 > a1) for (let i = 1; i < 7; i++) pal.push(Math.round(((7 - i) * a0 + i * a1) / 7));
  else {
    for (let i = 1; i < 5; i++) pal.push(Math.round(((5 - i) * a0 + i * a1) / 5));
    pal.push(0, 255);
  }
  let bits = 0n;
  for (let i = 0; i < 6; i++) bits |= BigInt(b[o + 2 + i]!) << BigInt(8 * i);
  return Array.from({ length: 16 }, (_, i) => pal[Number((bits >> BigInt(3 * i)) & 7n)]!);
}

/** A DDS picture's first (largest) image as RGBA; null for a layout this doesn't read. */
function decode(dds: Uint8Array): { w: number; h: number; px: Uint8Array } | null {
  if (dds.length < 128 || String.fromCharCode(dds[0]!, dds[1]!, dds[2]!, dds[3]!) !== 'DDS ') return null;
  const v = new DataView(dds.buffer, dds.byteOffset, dds.byteLength);
  const h = v.getUint32(12, true);
  const w = v.getUint32(16, true);
  const fourCC = String.fromCharCode(dds[84]!, dds[85]!, dds[86]!, dds[87]!);
  let data = dds.subarray(128);
  if (fourCC === 'DST1' || fourCC === 'DST5') data = unshuffle(data, fourCC);
  const px = new Uint8Array(w * h * 4);
  if (fourCC === 'DXT1' || fourCC === 'DST1') {
    let o = 0;
    for (let y = 0; y < h; y += 4) for (let x = 0; x < w; x += 4, o += 8) colourBlock(data, o, px, w, x, y, true);
  } else if (fourCC === 'DXT5' || fourCC === 'DST5') {
    let o = 0;
    for (let y = 0; y < h; y += 4) for (let x = 0; x < w; x += 4, o += 16) colourBlock(data, o + 8, px, w, x, y, false, alphaBlock(data, o));
  } else if (v.getUint32(88, true) === 32) {
    // Not compressed: BGRA.
    for (let i = 0; i < w * h; i++) px.set([data[4 * i + 2]!, data[4 * i + 1]!, data[4 * i]!, data[4 * i + 3]!], 4 * i);
  } else return null;
  return { w, h, px };
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (b: Uint8Array): number => {
  let c = 0xffffffff;
  for (const x of b) c = crcTable[(c ^ x) & 255]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

/** RGBA as a PNG file, for cwebp to read. */
function png(w: number, h: number, px: Uint8Array): Buffer {
  const chunk = (type: string, data: Uint8Array) => {
    const out = new Uint8Array(12 + data.length);
    const v = new DataView(out.buffer);
    v.setUint32(0, data.length);
    out.set(Buffer.from(type, 'ascii'), 4);
    out.set(data, 8);
    v.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
    return out;
  };
  const head = new Uint8Array(13);
  const hv = new DataView(head.buffer);
  hv.setUint32(0, w);
  hv.setUint32(4, h);
  head[8] = 8; // bits per channel
  head[9] = 6; // RGBA
  const rows = new Uint8Array(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) rows.set(px.subarray(y * w * 4, (y + 1) * w * 4), y * (w * 4 + 1) + 1);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', head), chunk('IDAT', deflateSync(rows)), chunk('IEND', new Uint8Array())]);
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
