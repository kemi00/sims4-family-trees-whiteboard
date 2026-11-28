/**
 * Builds the gazette's stickers: the game's own moodlet icons, one for each
 * kind of story, as public/gazette-stickers/<kind>.webp, and
 * src/data/gazetteStickers.json, the kinds there are with the moodlet's
 * name ("Just Married!").
 *
 * Each moodlet is a Buff SimData record with an icon (a resource key); the
 * pictures are DDS images (type 0x00B2D882) in the Client packages.
 *
 * Usage (needs cwebp: brew install webp):
 *   node --experimental-strip-types scripts/build-gazette-stickers.ts [game folder]
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
const OUT_DIR = join(ROOT, 'public/gazette-stickers');
const OUT_LIST = join(ROOT, 'src/data/gazetteStickers.json');
const SIMDATA = 0x545ac67a;
const STBL = 0x220557da;
const IMAGE = 0x00b2d882;
/** Larger pictures are made this size; a smaller one stays as it is: never stretched. */
const MAX_SIZE = 128;

/** Each kind of story, and the moodlet (Buff tuning id) its sticker is. */
const KINDS: Record<string, string> = {
  wedding: '12587', // Just Married!
  romance: '29350', // First Kiss!
  baby: '97243', // New Baby!
  adoption: '40069', // Ready-Made Kid
  death: '103190', // A Loved One Has Passed
  divorce: '32616', // Divorced
  breakup: '77249', // Break Up Blues
  affair: '12456', // Heartbroken by Betrayal
  promotion: '36047', // Got the Promotion!
  noble: '469424', // Royal Radiance
  fame: '189446', // Proper Celebrity
  birthday: '28561', // Birthday!
  head: '491558', // Stepping Into Power
  heir: '466620', // Chosen
  outcast: '479172', // Cast Out Sorrow: the black sheep the game shows a cast-out sim (the Black Sheep trait's own icon is a placeholder llama)
};

const gameDir = process.argv[2] ?? '/Applications/EA Games';
try {
  execFileSync('cwebp', ['-version'], { stdio: 'ignore' });
} catch {
  console.error('cwebp is needed: brew install webp');
  process.exit(1);
}

function unpack(bytes: Uint8Array): Uint8Array {
  const magic = String.fromCharCode(bytes[0] ?? 0, bytes[1] ?? 0, bytes[2] ?? 0, bytes[3] ?? 0);
  if (magic === 'DATA' || magic === 'DDS ' || magic === 'STBL') return bytes;
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

const appData = join(gameDir, 'The Sims 4.app/Contents/Data');
const packsDir = join(gameDir, 'The Sims 4 Packs');
const packs = existsSync(packsDir) ? readdirSync(packsDir).filter((d) => /^(EP|GP|SP|FP)\d+$/.test(d)).sort().map((d) => join(packsDir, d)) : [];
const builds = (dir: string, kind: 'Simulation' | 'Client'): string[] => {
  if (!existsSync(dir)) return [];
  const re = new RegExp(`^${kind}(Full|Delta)Build(\\d+)\\.package$`);
  return readdirSync(dir)
    .filter((f) => re.test(f))
    .sort((a, b) => {
      const o = (f: string) => {
        const m = re.exec(f)!;
        return (m[1] === 'Full' ? 0 : 1000) + Number(m[2]);
      };
      return o(a) - o(b);
    })
    .map((f) => join(dir, f));
};

const wanted = new Set(Object.values(KINDS));
const iconOf = new Map<string, string>();
const nameKeyOf = new Map<string, number>();
for (const path of [...builds(join(appData, 'Simulation'), 'Simulation'), ...packs.flatMap((p) => builds(p, 'Simulation'))]) {
  for (const r of readDbpf(new Uint8Array(readFileSync(path)))) {
    if (r.type !== SIMDATA || !wanted.has(r.instance.toString())) continue;
    const rec = readDataRecord(unpack(r.bytes));
    if (!rec) continue;
    const icon = (rec.row.icon as { instance?: string } | null)?.instance;
    if (icon && icon !== '0') iconOf.set(r.instance.toString(), icon);
    const name = rec.row.buff_name ?? rec.row.display_name;
    if (typeof name === 'number' && name) nameKeyOf.set(r.instance.toString(), name);
  }
}

const strings = new Map<number, string>();
const wantKeys = new Set(nameKeyOf.values());
for (const path of [join(appData, 'Client/Strings_ENG_US.package'), ...packs.map((p) => join(p, 'Strings_ENG_US.package'))].filter(existsSync)) {
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
      if (wantKeys.has(key) && !strings.has(key)) strings.set(key, new TextDecoder().decode(b.subarray(pos, pos + length)).trim());
      pos += length;
    }
  }
}

const pictures = new Map<string, Uint8Array>();
const want = new Set(iconOf.values());
for (const path of [...builds(join(appData, 'Client'), 'Client'), ...packs.flatMap((p) => builds(p, 'Client'))]) {
  for (const r of readDbpf(new Uint8Array(readFileSync(path)))) {
    if (r.type !== IMAGE) continue;
    const inst = r.instance.toString(16);
    if (want.has(inst)) pictures.set(inst, unpack(r.bytes));
  }
}

rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });
const work = mkdtempSync(join(tmpdir(), 'gazette-stickers-'));
const kinds: Record<string, string> = {};
const sizes: Record<string, number> = {};
for (const [kind, buff] of Object.entries(KINDS)) {
  const icon = iconOf.get(buff);
  const dds = icon ? pictures.get(icon) : undefined;
  const picture = dds ? decode(dds) : null;
  if (!picture) {
    console.warn(`No picture for ${kind} (${buff})`);
    continue;
  }
  const source = join(work, `${kind}.png`);
  writeFileSync(source, png(picture.w, picture.h, picture.px));
  const size = Math.min(picture.w, MAX_SIZE);
  const resize = picture.w > MAX_SIZE ? ['-resize', String(MAX_SIZE), String(MAX_SIZE)] : [];
  execFileSync('cwebp', ['-quiet', '-q', '90', '-alpha_q', '100', '-m', '6', ...resize, source, '-o', join(OUT_DIR, `${kind}.webp`)]);
  sizes[kind] = size;
  const key = nameKeyOf.get(buff);
  kinds[kind] = (key ? strings.get(key) : undefined) ?? kind;
}
rmSync(work, { recursive: true, force: true });
writeFileSync(
  OUT_LIST,
  `${JSON.stringify({ note: 'Built by scripts/build-gazette-stickers.ts: the game moodlet each kind of story wears in the gazette, public/gazette-stickers/<kind>.webp, and its size in pixels (never drawn larger).', kinds, sizes }, null, 1)}\n`,
);
console.log(`${Object.keys(kinds).length} of ${Object.keys(KINDS).length} stickers: ${Object.values(kinds).join(', ')}.`);
