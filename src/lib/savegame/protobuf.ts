export type ProtoWire = 0 | 1 | 2 | 5;

export type ProtoField = {
  field: number;
  wire: ProtoWire;
  int: bigint;
  bytes: Uint8Array | null;
};

function readVarint(buf: Uint8Array, i: number): { value: bigint; next: number } | null {
  let x = 0n;
  let s = 0n;
  const end = buf.byteLength;
  while (i < end) {
    const b = BigInt(buf[i]!);
    i += 1;
    x |= (b & 0x7fn) << s;
    if ((b & 0x80n) === 0n) return { value: x, next: i };
    s += 7n;
    if (s > 70n) return null;
  }
  return null;
}

function readU64LE(buf: Uint8Array, i: number): bigint {
  const view = new DataView(buf.buffer, buf.byteOffset + i, 8);
  const lo = BigInt(view.getUint32(0, true));
  const hi = BigInt(view.getUint32(4, true));
  return lo + (hi << 32n);
}

/** Walk a protobuf message. Stops at the first undecodable tag. */
export function decodeFields(buf: Uint8Array): ProtoField[] {
  const out: ProtoField[] = [];
  let i = 0;
  const end = buf.byteLength;
  while (i < end) {
    const tag = readVarint(buf, i);
    if (!tag || tag.next === i) break;
    i = tag.next;
    const field = Number(tag.value >> 3n);
    const wire = Number(tag.value & 7n) as ProtoWire;
    if (field === 0) break;
    if (wire === 0) {
      const v = readVarint(buf, i);
      if (!v) break;
      i = v.next;
      out.push({ field, wire, int: v.value, bytes: null });
    } else if (wire === 1) {
      if (i + 8 > end) break;
      out.push({ field, wire, int: readU64LE(buf, i), bytes: null });
      i += 8;
    } else if (wire === 2) {
      const ln = readVarint(buf, i);
      if (!ln) break;
      i = ln.next;
      const n = Number(ln.value);
      if (n < 0 || i + n > end) break;
      out.push({ field, wire, int: 0n, bytes: buf.subarray(i, i + n) });
      i += n;
    } else if (wire === 5) {
      if (i + 4 > end) break;
      const view = new DataView(buf.buffer, buf.byteOffset + i, 4);
      out.push({ field, wire, int: BigInt(view.getUint32(0, true)), bytes: null });
      i += 4;
    } else {
      break;
    }
  }
  return out;
}

export function fieldsOf(buf: Uint8Array, n: number): ProtoField[] {
  return decodeFields(buf).filter((f) => f.field === n);
}

export function firstBytes(buf: Uint8Array, n: number): Uint8Array | null {
  const f = decodeFields(buf).find((x) => x.field === n && x.bytes);
  return f?.bytes ?? null;
}

export function utf8(bytes: Uint8Array | null): string | null {
  if (!bytes || bytes.byteLength === 0) return null;
  try {
    const s = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return s.length ? s : null;
  } catch {
    return null;
  }
}
