/**
 * The game's pictures: DDS images, most in its shuffled DST1/DST5 layout,
 * decoded to RGBA, and RGBA written as PNG (for cwebp). Shared by the build
 * scripts that take pictures from the installed game.
 */
import { deflateSync } from 'node:zlib';

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
export function decode(dds: Uint8Array): { w: number; h: number; px: Uint8Array } | null {
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
export function png(w: number, h: number, px: Uint8Array): Buffer {
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

