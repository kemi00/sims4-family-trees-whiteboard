/**
 * A reader for the game's binary "DATA" records (SimData, resource type
 * 0x545AC67A): the small companion each tuning item has for the game's own
 * interface, with its name key, type and the like. Every pack has them, in
 * the same layout as the base game, so one reader names both.
 *
 * Layout (little-endian; offsets are relative to where they are stored,
 * 0x80000000 for none): "DATA", version, table headers, their count,
 * schemas, their count. A table header (28 bytes): name, name hash,
 * schema, data type, row size, rows, row count. A schema (24): name, name
 * hash, schema hash, size, columns, column count. A column (20): name,
 * name hash, data type (u16), flags (u16), offset in the row, schema.
 */

export type DataValue = null | boolean | number | bigint | string | DataValue[] | { [key: string]: DataValue };

type Schema = { name: string; cols: { name: string; type: number; offset: number; schema: Schema | null }[] };
type Table = { name: string; schema: Schema | null; type: number; rowSize: number; rowAt: number; rows: number };

/** The record's first table: its name (the tuning's, "trait_Creative"), its schema's ("Trait") and its row. */
export type DataRecord = { name: string; schema: string; row: Record<string, DataValue> };

const NONE = -0x80000000;

export function readDataRecord(b: Uint8Array): DataRecord | null {
  if (b.length < 32 || String.fromCharCode(b[0]!, b[1]!, b[2]!, b[3]!) !== 'DATA') return null;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const i32 = (o: number) => v.getInt32(o, true);
  const u32 = (o: number) => v.getUint32(o, true);
  const rel = (o: number) => {
    const x = i32(o);
    return x === NONE ? -1 : o + x;
  };
  const text = new TextDecoder();
  const str = (o: number) => {
    if (o < 0 || o >= b.length) return '';
    let e = o;
    while (e < b.length && b[e] !== 0) e++;
    return text.decode(b.subarray(o, e));
  };
  const tablesAt = rel(8);
  const nTables = i32(12);
  const schemasAt = rel(16);
  const nSchemas = i32(20);
  if (tablesAt < 0 || nTables <= 0) return null;

  const schemas = new Map<number, Schema>();
  for (let i = 0; i < nSchemas; i++) schemas.set(schemasAt + i * 24, { name: str(rel(schemasAt + i * 24)), cols: [] });
  for (const [p, s] of schemas) {
    const colsAt = rel(p + 16);
    const n = u32(p + 20);
    for (let c = 0; c < n; c++) {
      const q = colsAt + c * 20;
      const sp = rel(q + 16);
      s.cols.push({ name: str(rel(q)), type: v.getUint16(q + 8, true), offset: u32(q + 12), schema: sp >= 0 ? (schemas.get(sp) ?? null) : null });
    }
  }
  const tables: Table[] = [];
  for (let i = 0; i < nTables; i++) {
    const p = tablesAt + i * 28;
    const sp = rel(p + 8);
    tables.push({
      name: str(rel(p)),
      schema: sp >= 0 ? (schemas.get(sp) ?? null) : null,
      type: u32(p + 12),
      rowSize: u32(p + 16),
      rowAt: rel(p + 20),
      rows: u32(p + 24),
    });
  }
  const tableAt = (pos: number) => tables.find((t) => pos >= t.rowAt && pos < t.rowAt + Math.max(1, t.rowSize * t.rows));

  const value = (type: number, o: number, schema: Schema | null, depth: number): DataValue => {
    if (depth > 12) return null;
    switch (type) {
      case 0:
        return b[o] !== 0;
      case 1:
      case 3:
        return b[o]!;
      case 2:
        return v.getInt8(o);
      case 4:
        return v.getInt16(o, true);
      case 5:
        return v.getUint16(o, true);
      case 6:
        return i32(o);
      case 7:
        return u32(o);
      case 8:
        return v.getBigInt64(o, true);
      case 9:
      case 18:
        return v.getBigUint64(o, true);
      case 10:
        return v.getFloat32(o, true);
      case 11:
      case 12:
        return str(rel(o));
      case 13: {
        const at = rel(o);
        return at < 0 ? null : row(schema, at, depth + 1);
      }
      case 14: {
        // A vector: where its items are, and how many; they sit in a table of their own.
        const at = rel(o);
        const n = u32(o + 4);
        const t = at >= 0 && n ? tableAt(at) : undefined;
        if (!t) return [];
        const out: DataValue[] = [];
        for (let k = 0; k < n; k++) {
          const p = at + k * t.rowSize;
          out.push(t.schema ? row(t.schema, p, depth + 1) : value(t.type, p, null, depth + 1));
        }
        return out;
      }
      case 20:
        // A key into the game's string tables.
        return u32(o);
      default:
        return null;
    }
  };
  const row = (schema: Schema | null, at: number, depth: number): Record<string, DataValue> => {
    const out: Record<string, DataValue> = {};
    if (!schema) return out;
    for (const c of schema.cols) out[c.name] = value(c.type, at + c.offset, c.schema, depth);
    return out;
  };

  const first = tables[0]!;
  if (!first.schema || first.rowAt < 0) return null;
  return { name: first.name, schema: first.schema.name, row: row(first.schema, first.rowAt, 0) };
}
