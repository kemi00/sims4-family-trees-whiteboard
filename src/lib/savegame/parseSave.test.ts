import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { readDbpf, SAVE_GAME_DATA_TYPE } from './dbpf.ts';
import { pairTagsFromBits, parseSaveGame } from './parseSave.ts';
import { decodeFields, utf8 } from './protobuf.ts';
import { refpackDecompress } from './refpack.ts';

const LOCAL_SAVE =
  '/Users/kemi/Documents/Electronic Arts/The Sims 4/saves/Slot_0000000a.save';

function concat(...parts: Uint8Array[]): Uint8Array {
  const n = parts.reduce((s, p) => s + p.byteLength, 0);
  const out = new Uint8Array(n);
  let i = 0;
  for (const p of parts) {
    out.set(p, i);
    i += p.byteLength;
  }
  return out;
}

function encodeVarint(n: number | bigint): Uint8Array {
  let x = BigInt(n);
  const bytes: number[] = [];
  while (x >= 0x80n) {
    bytes.push(Number((x & 0x7fn) | 0x80n));
    x >>= 7n;
  }
  bytes.push(Number(x));
  return Uint8Array.from(bytes);
}

function encodeKey(field: number, wire: number): Uint8Array {
  return encodeVarint((field << 3) | wire);
}

function encodeVarintField(field: number, n: number | bigint): Uint8Array {
  return concat(encodeKey(field, 0), encodeVarint(n));
}

function encodeBytes(field: number, data: Uint8Array): Uint8Array {
  return concat(encodeKey(field, 2), encodeVarint(data.byteLength), data);
}

function encodeString(field: number, s: string): Uint8Array {
  return encodeBytes(field, new TextEncoder().encode(s));
}

function refpackCompress(data: Uint8Array): Uint8Array {
  const size = data.byteLength;
  const chunks: number[] = [
    0x10,
    0xfb,
    (size >> 16) & 0xff,
    (size >> 8) & 0xff,
    size & 0xff,
  ];
  let i = 0;
  while (i < size) {
    const left = size - i;
    if (left >= 4) {
      const n = Math.min(112, Math.floor(left / 4) * 4);
      chunks.push(0xe0 | ((n - 4) >> 2));
      for (let j = 0; j < n; j++) chunks.push(data[i++]!);
    } else {
      chunks.push(0xfc | left);
      for (let j = 0; j < left; j++) chunks.push(data[i++]!);
    }
  }
  if (size === 0 || size % 4 === 0) chunks.push(0xfc);
  return Uint8Array.from(chunks);
}

/**
 * One-resource DBPF. `compactGroup` writes the index the way late-2026 saves
 * do: flags 0x2 and the shared group once, then 28-byte entries without it.
 */
function wrapDbpf(payload: Uint8Array, compactGroup = false): Uint8Array {
  const headerSize = 96;
  const indexSize = compactGroup ? 4 + 4 + 28 : 4 + 32;
  const indexOff = headerSize + payload.byteLength;
  const buf = new Uint8Array(indexOff + indexSize);
  const view = new DataView(buf.buffer);
  buf[0] = 0x44;
  buf[1] = 0x42;
  buf[2] = 0x50;
  buf[3] = 0x46;
  view.setUint32(4, 2, true);
  view.setUint32(8, 1, true);
  view.setUint32(0x24, 1, true);
  view.setUint32(0x2c, indexSize, true);
  view.setUint32(0x40, indexOff, true);
  buf.set(payload, headerSize);
  let at = indexOff;
  const put = (v: number) => {
    view.setUint32(at, v, true);
    at += 4;
  };
  put(compactGroup ? 0x2 : 0); // index flags
  if (compactGroup) put(0); // the shared group
  put(SAVE_GAME_DATA_TYPE);
  if (!compactGroup) put(0); // group
  put(0); // instance high
  put(1); // instance low
  put(headerSize); // offset
  put(payload.byteLength); // file size
  put(payload.byteLength); // memory size
  put(0); // compression code + committed
  return buf;
}

function simBlob(opts: {
  id: number;
  householdId: number;
  first: string;
  last: string;
  household: string;
  gender: number;
  age: number;
}): Uint8Array {
  return concat(
    encodeVarintField(1, opts.id),
    encodeVarintField(2, opts.householdId),
    encodeString(5, opts.first),
    encodeString(6, opts.last),
    encodeVarintField(7, opts.gender),
    encodeVarintField(8, opts.age),
    encodeString(22, opts.household),
  );
}

function treeEdge(a: number, b: number, kind: number): Uint8Array {
  return encodeBytes(
    4,
    concat(
      encodeVarintField(1, a),
      encodeVarintField(2, b),
      encodeVarintField(3, kind),
    ),
  );
}

function treeNode(self: number, ...edges: Uint8Array[]): Uint8Array {
  return encodeBytes(1, concat(encodeVarintField(1, self), ...edges));
}

/** Tiny DBPF + RefPack + protobuf save: two spouses and one child. */
function tinySave(compactGroup = false): Uint8Array {
  const bob = simBlob({
    id: 1,
    householdId: 10,
    first: 'Bob',
    last: 'Pancakes',
    household: 'Pancakes',
    gender: 4096,
    age: 32,
  });
  const eliza = simBlob({
    id: 2,
    householdId: 10,
    first: 'Eliza',
    last: 'Pancakes',
    household: 'Pancakes',
    gender: 8192,
    age: 32,
  });
  const iggy = simBlob({
    id: 3,
    householdId: 10,
    first: 'Iggy',
    last: 'Pancakes',
    household: 'Pancakes',
    gender: 4096,
    age: 4,
  });
  const graph = concat(
    treeNode(1, treeEdge(1, 2, 4), treeEdge(1, 3, 1)),
    treeNode(2, treeEdge(2, 1, 4), treeEdge(2, 3, 1)),
    treeNode(3),
  );
  const tree = encodeBytes(62, encodeBytes(1, graph));
  const gameplay = encodeBytes(8, tree);
  const slot = encodeBytes(2, gameplay);
  const data = concat(
    encodeBytes(6, bob),
    encodeBytes(6, eliza),
    encodeBytes(6, iggy),
    slot,
  );
  return wrapDbpf(refpackCompress(data), compactGroup);
}

/** Packed repeated varint field (how the game stores relationship bits). */
function encodePacked(field: number, values: (number | bigint)[]): Uint8Array {
  return encodeBytes(field, concat(...values.map(encodeVarint)));
}

/** One relationship record: shared bits, then each side's one-way bits. */
function relRecord(
  a: number,
  b: number,
  shared: number[],
  aAboutB: number[] = [],
  bAboutA: number[] = [],
): Uint8Array {
  return encodeBytes(
    1,
    concat(
      encodeVarintField(1, a),
      encodeVarintField(2, b),
      encodeBytes(3, encodePacked(1, shared)),
      encodeBytes(4, aAboutB.length ? encodePacked(1, aAboutB) : new Uint8Array()),
      encodeBytes(5, bAboutA.length ? encodePacked(1, bAboutA) : new Uint8Array()),
    ),
  );
}

/**
 * Four sims: Ann (1) married to Ben (2), their child Cal (3) in the tree,
 * and Dee (4), Ann's secret lover and Cal's secret parent — the tree leaves
 * Dee out. Ben and Dee are best (and good) friends.
 */
function secretsSave(): Uint8Array {
  const sims = [
    [1, 'Ann', 8192, 32],
    [2, 'Ben', 4096, 32],
    [3, 'Cal', 4096, 4],
    [4, 'Dee', 4096, 32],
  ] as const;
  const blobs = sims.map(([id, first, gender, age]) =>
    encodeBytes(
      6,
      simBlob({ id, householdId: 10, first, last: 'Ames', household: 'Ames', gender, age }),
    ),
  );
  const graph = concat(
    treeNode(1, treeEdge(1, 2, 4), treeEdge(1, 3, 1)),
    treeNode(2, treeEdge(2, 3, 1)),
  );
  const rels = concat(
    relRecord(1, 2, [15822, 15797]), // married, friends
    relRecord(1, 4, [491011]), // secret lovers
    relRecord(3, 4, [], [491219], [487507]), // Dee (b) holds secret child about Cal
    relRecord(2, 4, [15794, 15799, 15797]), // bff + good friends + friends
    relRecord(2, 3, [26560, 15802]), // enemy + disliked
  );
  const gameplay = encodeBytes(
    8,
    concat(encodeBytes(13, rels), encodeBytes(62, encodeBytes(1, graph))),
  );
  return wrapDbpf(refpackCompress(concat(...blobs, encodeBytes(2, gameplay))));
}

describe('save relationships', () => {
  const parsed = parseSaveGame(secretsSave());
  const tags = (a: string, b: string) =>
    parsed.pairs?.find((p) => (p.a === a && p.b === b) || (p.a === b && p.b === a))?.tags;

  it('reads each pair\'s strongest status of each kind', () => {
    assert.deepEqual(tags('1', '2'), ['married', 'friends']);
    assert.deepEqual(tags('2', '4'), ['bestFriends']);
    assert.deepEqual(tags('2', '3'), ['enemies']);
    assert.deepEqual(tags('1', '4'), ['secretLovers']);
  });

  it('adds the secret parent the family tree leaves out', () => {
    const parents = parsed.rels.filter((r) => r.type === 'parent' && r.b === '3');
    assert.deepEqual(
      parents.map((r) => [r.a, !!r.secret]).sort(),
      [
        ['1', false],
        ['2', false],
        ['4', true],
      ],
    );
  });

  it('adds secret lovers as a secret romance', () => {
    const romance = parsed.rels.filter((r) => r.type === 'romance');
    assert.deepEqual(romance, [{ a: '1', b: '4', type: 'romance', secret: true }]);
  });

  it('ignores bits it does not know', () => {
    assert.deepEqual(pairTagsFromBits(new Set([1n, 34619n])), []);
  });
});

describe('parseSaveGame', () => {
  it('rejects a file that is not DBPF', () => {
    assert.throws(
      () => parseSaveGame(new Uint8Array([1, 2, 3, 4, 5])),
      /too small|DBPF/,
    );
  });

  it('reads sims and parent/marriage edges from a tiny fixture', () => {
    const parsed = parseSaveGame(tinySave());
    assert.equal(parsed.sims.length, 3);
    assert.deepEqual(
      parsed.sims.map((s) => `${s.first} ${s.last}`).sort(),
      ['Bob Pancakes', 'Eliza Pancakes', 'Iggy Pancakes'],
    );
    const bob = parsed.sims.find((s) => s.first === 'Bob')!;
    assert.equal(bob.saveSimId, '1');
    assert.equal(bob.household, 'Pancakes');
    assert.equal(bob.age, 'Adult');
    assert.equal(bob.gender, 'Male');
    assert.ok(
      parsed.rels.some(
        (r) => r.type === 'marriage' && r.a === '1' && r.b === '2',
      ),
    );
    assert.ok(
      parsed.rels.some((r) => r.type === 'parent' && r.b === '3'),
    );
  });

  it('reads a save whose index writes the shared group once (late-2026 saves)', () => {
    const compact = parseSaveGame(tinySave(true));
    assert.deepEqual(compact, parseSaveGame(tinySave()));
    assert.equal(compact.sims.length, 3);
  });

  it('still refuses index flags it does not know', () => {
    const buf = tinySave();
    const view = new DataView(buf.buffer);
    view.setUint32(view.getUint32(0x40, true), 0x8, true);
    assert.throws(() => parseSaveGame(buf), /index layout/);
  });

  it('round-trips RefPack on a protobuf blob', () => {
    const blob = encodeString(5, 'Willow');
    const out = refpackDecompress(refpackCompress(blob));
    assert.deepEqual([...out], [...blob]);
    const fields = decodeFields(out);
    assert.equal(utf8(fields[0]!.bytes), 'Willow');
  });

  it('indexes a one-resource DBPF', () => {
    const payload = new Uint8Array([0x10, 0xfb, 0, 0, 0, 0xfc]);
    const resources = readDbpf(wrapDbpf(payload));
    assert.equal(resources.length, 1);
    assert.equal(resources[0]!.type, SAVE_GAME_DATA_TYPE);
  });

  it('reads the local slot when present', { skip: !existsSync(LOCAL_SAVE) }, () => {
    const parsed = parseSaveGame(readFileSync(LOCAL_SAVE));
    assert.ok(parsed.sims.length > 0);
    assert.ok(parsed.sims.some((s) => s.first === 'Bob' && s.last === 'Pancakes'));
    assert.ok(parsed.rels.some((r) => r.type === 'marriage'));
    assert.ok(parsed.rels.some((r) => r.type === 'parent'));
    const kealoha = parsed.sims.find((s) => s.last === 'Kealoha' && s.household === 'Kealoha');
    if (kealoha) {
      assert.equal(parsed.householdWorld?.[kealoha.householdId], 'Sulani');
      assert.equal(kealoha.world, 'Sulani');
    }
    const flores = parsed.sims.find((s) => s.first === 'Eden' && s.last === 'Flores');
    if (flores) {
      assert.equal(flores.world, 'Ciudad Enamorada');
    }
    assert.ok(parsed.worlds?.includes('Willow Creek'));
    assert.ok(parsed.worlds?.includes('Ciudad Enamorada'));
    assert.ok(!parsed.worlds?.includes('Batuu'));
  });
});
