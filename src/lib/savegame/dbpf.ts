/** Sims 4 package / .save header is 96 bytes, little-endian. */

export type DbpfResource = {
  type: number;
  group: number;
  instance: bigint;
  bytes: Uint8Array;
};

function u32(view: DataView, offset: number): number {
  return view.getUint32(offset, true);
}

/**
 * Read a DBPF 2.x archive (Sims 4 .package / .save).
 * Index flags 0: each entry is type, group, instance hi/lo, offset, file size, mem size, extra.
 */
export function readDbpf(buf: Uint8Array): DbpfResource[] {
  if (buf.byteLength < 96) throw new Error('File is too small to be a Sims 4 save');
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const magic = String.fromCharCode(buf[0]!, buf[1]!, buf[2]!, buf[3]!);
  if (magic !== 'DBPF') throw new Error('Not a Sims 4 save (missing DBPF header)');
  const indexCount = u32(view, 0x24);
  const indexSize = u32(view, 0x2c);
  const indexOff = u32(view, 0x40);
  if (indexOff + indexSize > buf.byteLength) {
    throw new Error('Save index is truncated');
  }
  const idx = buf.subarray(indexOff, indexOff + indexSize);
  const idxView = new DataView(idx.buffer, idx.byteOffset, idx.byteLength);
  const flags = u32(idxView, 0);
  if (flags !== 0) {
    throw new Error('This save uses an index layout this reader does not handle');
  }
  const resources: DbpfResource[] = [];
  let pos = 4;
  for (let i = 0; i < indexCount; i++) {
    if (pos + 32 > idx.byteLength) throw new Error('Save index ended early');
    const type = u32(idxView, pos);
    const group = u32(idxView, pos + 4);
    const instHi = u32(idxView, pos + 8);
    const instLo = u32(idxView, pos + 12);
    const off = u32(idxView, pos + 16);
    const fileSize = u32(idxView, pos + 20) & 0x7fffffff;
    pos += 32;
    if (off + fileSize > buf.byteLength) throw new Error('Save resource is truncated');
    resources.push({
      type,
      group,
      instance: (BigInt(instHi) << 32n) | BigInt(instLo),
      bytes: buf.subarray(off, off + fileSize),
    });
  }
  return resources;
}

/** Save Game Data resource type in .save packages. */
export const SAVE_GAME_DATA_TYPE = 0x0000000d;
