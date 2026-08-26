/**
 * QFS / RefPack used by Sims 4 save resources (`50 FB` + 3-byte big-endian size).
 * Layout follows the community DBPF spec, not guessed per file.
 */
export function refpackDecompress(src: Uint8Array, expected?: number): Uint8Array {
  if (src.byteLength < 5 || src[1] !== 0xfb) {
    throw new Error('Save data is not RefPack-compressed');
  }
  const flags = src[0]!;
  let pos = 2;
  if (flags & 0x01) pos += 3;
  if (pos + 3 > src.byteLength) throw new Error('RefPack header is truncated');
  const ucsize = (src[pos]! << 16) | (src[pos + 1]! << 8) | src[pos + 2]!;
  pos += 3;
  const out = new Uint8Array(expected ?? ucsize);
  let o = 0;
  const slen = src.byteLength;

  const copyPlain = (n: number) => {
    if (pos + n > slen || o + n > out.length) throw new Error('RefPack copy overruns buffer');
    out.set(src.subarray(pos, pos + n), o);
    pos += n;
    o += n;
  };
  const copyBack = (offset: number, length: number) => {
    const start = o - offset;
    if (start < 0 || o + length > out.length) throw new Error('RefPack back-reference is invalid');
    for (let i = 0; i < length; i++) out[o++] = out[start + i]!;
  };

  while (pos < slen) {
    const b0 = src[pos++]!;
    if (b0 <= 0x7f) {
      if (pos >= slen) break;
      const b1 = src[pos++]!;
      copyPlain(b0 & 0x03);
      copyBack(((b0 & 0x60) << 3) + b1 + 1, ((b0 & 0x1c) >> 2) + 3);
    } else if (b0 <= 0xbf) {
      if (pos + 1 >= slen) break;
      const b1 = src[pos++]!;
      const b2 = src[pos++]!;
      copyPlain((b1 & 0xc0) >> 6);
      copyBack(((b1 & 0x3f) << 8) + b2 + 1, (b0 & 0x3f) + 4);
    } else if (b0 <= 0xdf) {
      if (pos + 2 >= slen) break;
      const b1 = src[pos++]!;
      const b2 = src[pos++]!;
      const b3 = src[pos++]!;
      copyPlain(b0 & 0x03);
      copyBack(((b0 & 0x10) << 12) + (b1 << 8) + b2 + 1, ((b0 & 0x0c) << 6) + b3 + 5);
    } else if (b0 <= 0xfb) {
      copyPlain(((b0 & 0x1f) << 2) + 4);
    } else {
      copyPlain(b0 & 0x03);
      break;
    }
  }
  return expected != null && o === expected ? out : out.subarray(0, o);
}
