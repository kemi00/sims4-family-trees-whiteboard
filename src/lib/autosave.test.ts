import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  AUTOSAVE_KEY,
  bootWhiteboardData,
  buildPersistPayload,
  clearDraft,
  readDraft,
  toCore,
  writeDraft,
} from './autosave.ts';
import type { Edge, Group, SimNode, WhiteboardData, World } from '../types/whiteboard.ts';

function memoryStore(initial: Record<string, string> = {}): Storage {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    key(index: number) {
      return [...map.keys()][index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
  };
}

function node(id: string): SimNode {
  return {
    id,
    gid: 'Willow Creek||Pancakes',
    first: id,
    sur: 'Pancakes',
    age: 'Adult',
    state: 'Sim',
    gender: 'Female',
    hh: 'Pancakes',
    world: 'Willow Creek',
    nb: '-',
    color: '#4e79a7',
    townie: false,
    oworld: 'Willow Creek',
    onb: '-',
    ohh: 'Pancakes',
    oplay: 'Resident',
    pack: '',
    x: 120,
    y: 340,
    w: 200,
    h: 100,
    ox: 10,
    oy: 20,
  };
}

const worlds: World[] = [{ name: 'Willow Creek', color: '#4e79a7' }];
const groups: Group[] = [
  {
    gid: 'Willow Creek||Pancakes',
    hh: 'Pancakes',
    world: 'Willow Creek',
    nb: '-',
    color: '#4e79a7',
    x: 0,
    y: 0,
    w: 0,
    h: 0,
  },
];

describe('autosave', () => {
  it('strips derived geometry in toCore', () => {
    const c = toCore(node('Bob'));
    assert.equal(c.x, 0);
    assert.equal(c.y, 0);
    assert.equal(c.w, 0);
    assert.equal(c.h, 0);
    assert.equal(c.ox, 10);
    assert.equal(c.oy, 20);
  });

  it('round-trips a draft through storage', () => {
    const store = memoryStore();
    const edges: Edge[] = [
      { id: 'u1', a: 'Bob', b: 'Eliza', type: 'marriage', source: 'planned' },
    ];
    const payload = buildPersistPayload({
      nodesCore: [node('Bob'), node('Eliza')].map(toCore),
      edges,
      groups,
      hiddenPacks: ['Spa Day'],
      hiddenPlay: [],
      hiAges: ['Adult'],
      hiSingle: false,
      bloodlineId: 'Bob',
      householdMoves: [],
      householdAgeUps: [],
      deceasedMarks: [],
      simAgeUps: [],
      connectionLog: [{ text: 'Linked Bob and Eliza' }],
      sourceFileName: 'my-board.json',
    });
    assert.equal(writeDraft(payload, store, () => '2026-01-02T03:04:05.000Z'), 'ok');
    const draft = readDraft(store);
    assert.ok(draft);
    assert.equal(draft.savedAt, '2026-01-02T03:04:05.000Z');
    assert.equal(draft.nodes.length, 2);
    assert.equal(draft.edges[0]!.id, 'u1');
    assert.equal(draft.hiddenPacks[0], 'Spa Day');
    assert.equal(draft.bloodlineId, 'Bob');
    assert.equal(draft.connectionLog[0], 'Linked Bob and Eliza');
    assert.equal(draft.layoutEpoch, 1);
    assert.equal(draft.sourceFileName, 'my-board.json');
    assert.ok(store.getItem(AUTOSAVE_KEY));
    clearDraft(store);
    assert.equal(readDraft(store), null);
  });

  it('reports quota when setItem throws QuotaExceededError', () => {
    const store = memoryStore();
    store.setItem = () => {
      const err = new Error('full');
      err.name = 'QuotaExceededError';
      throw err;
    };
    const result = writeDraft(
      buildPersistPayload({
        nodesCore: [],
        edges: [],
        groups: [],
        hiddenPacks: [],
        hiddenPlay: [],
        hiAges: [],
        hiSingle: false,
        bloodlineId: null,
        householdMoves: [],
        householdAgeUps: [],
        deceasedMarks: [],
        simAgeUps: [],
        connectionLog: [],
        sourceFileName: null,
      }),
      store,
    );
    assert.equal(result, 'quota');
  });

  it('boots from draft when present, else seed', () => {
    const seed: WhiteboardData = {
      nodes: [node('Seed')],
      edges: [],
      groups,
      worlds,
    };
    const empty = bootWhiteboardData(seed, memoryStore());
    assert.equal(empty.fromDraft, false);
    assert.equal(empty.data.nodes[0]!.id, 'Seed');

    const store = memoryStore();
    writeDraft(
      buildPersistPayload({
        nodesCore: [toCore(node('Draft'))],
        edges: [],
        groups,
        hiddenPacks: [],
        hiddenPlay: [],
        hiAges: [],
        hiSingle: true,
        bloodlineId: null,
        householdMoves: [],
        householdAgeUps: [],
        deceasedMarks: [],
        simAgeUps: [],
        connectionLog: [],
        sourceFileName: 'draft.json',
      }),
      store,
    );
    const booted = bootWhiteboardData(seed, store);
    assert.equal(booted.fromDraft, true);
    assert.equal(booted.data.nodes[0]!.id, 'Draft');
    assert.equal(booted.data.hiSingle, true);
    assert.equal(booted.data.worlds[0]!.name, 'Willow Creek');
  });
});
