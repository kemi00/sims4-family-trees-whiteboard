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

/** Index flag bits: the field is written once in the index header, not per entry. */
const CONST_TYPE = 0x1;
const CONST_GROUP = 0x2;
const CONST_INSTANCE_HI = 0x4;

/**
 * Read a DBPF 2.x archive (Sims 4 .package / .save).
 *
 * The index starts with a flags word. Each set bit means one field is the
 * same for every entry, so it is written once after the flags instead of in
 * each entry: 0x1 type, 0x2 group, 0x4 instance high word. An entry is then
 * whichever of type, group and instance high are not constant, followed by
 * instance low, offset, file size, memory size, and a compression code and
 * committed flag (two u16) — 32 bytes with no constants, 28 with one. The
 * game picks the layout itself: saves from late 2026 share group 0 (flags
 * 0x2), older ones wrote every field.
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
  if (flags & ~(CONST_TYPE | CONST_GROUP | CONST_INSTANCE_HI)) {
    throw new Error('This save uses an index layout this reader does not handle');
  }
  let pos = 4;
  const header = (bit: number): number | null => {
    if (!(flags & bit)) return null;
    if (pos + 4 > idx.byteLength) throw new Error('Save index ended early');
    const v = u32(idxView, pos);
    pos += 4;
    return v;
  };
  const constType = header(CONST_TYPE);
  const constGroup = header(CONST_GROUP);
  const constInstHi = header(CONST_INSTANCE_HI);
  const entrySize =
    20 + 4 * [constType, constGroup, constInstHi].filter((v) => v === null).length;
  const resources: DbpfResource[] = [];
  for (let i = 0; i < indexCount; i++) {
    if (pos + entrySize > idx.byteLength) throw new Error('Save index ended early');
    const field = () => {
      const v = u32(idxView, pos);
      pos += 4;
      return v;
    };
    const type = constType ?? field();
    const group = constGroup ?? field();
    const instHi = constInstHi ?? field();
    const instLo = field();
    const off = field();
    const fileSize = field() & 0x7fffffff;
    pos += 8; // memory size, compression code, committed
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
