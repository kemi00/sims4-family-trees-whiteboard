import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { LAYOUT_EPOCH } from './constants.ts';
import {
  AUTOSAVE_KEY,
  boardMatchesBuiltIn,
  persistPayloadFromSeed,
  bootWhiteboardData,
  buildPersistPayload,
  clearDraft,
  createDraftGuard,
  readDraft,
  toCore,
  writeDraft,
} from './autosave.ts';
import type { Edge, Group, SimNode, WhiteboardData, World } from '../types/whiteboard.ts';
import seedRoster from '../data/whiteboard.json' with { type: 'json' };

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
    assert.equal(draft.layoutEpoch, LAYOUT_EPOCH);
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

  it('treats the unaltered seed as the built-in board', () => {
    const seed: WhiteboardData = {
      nodes: [node('Seed')],
      edges: [{ id: 'e1', a: 'Seed', b: 'Seed', type: 'marriage' }],
      groups,
      worlds,
    };
    const payload = persistPayloadFromSeed(seed);
    assert.equal(boardMatchesBuiltIn(payload, seed), true);
    assert.equal(
      boardMatchesBuiltIn(
        {
          ...payload,
          nodes: payload.nodes.map((n) => ({ ...n, ox: 80 })),
        },
        seed,
      ),
      false,
    );
    assert.equal(
      boardMatchesBuiltIn({ ...payload, sourceFileName: 'mine.json' }, seed),
      false,
    );
  });

  it('ignores an autosave that is still the built-in board', () => {
    const seed: WhiteboardData = {
      nodes: [node('Seed')],
      edges: [],
      groups,
      worlds,
    };
    const store = memoryStore();
    writeDraft(persistPayloadFromSeed(seed), store);
    const booted = bootWhiteboardData(seed, store);
    assert.equal(booted.fromDraft, false);
    assert.equal(booted.data.nodes[0]!.id, 'Seed');
  });

  it('counts the shipped fodder roster as unaltered', () => {
    const seed = seedRoster as WhiteboardData;
    assert.equal(boardMatchesBuiltIn(persistPayloadFromSeed(seed), seed), true);
    assert.equal(boardMatchesBuiltIn(persistPayloadFromSeed(seed), seed), true);
  });
});

describe('two open tabs', () => {
  const seed = seedRoster as WhiteboardData;
  const board = (who: string) =>
    buildPersistPayload({
      nodesCore: [node(who)].map(toCore),
      edges: [],
      groups,
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
    });
  let tick = 0;
  const now = () => `2026-10-13T18:00:${String(tick++).padStart(2, '0')}.000Z`;

  it('lets a tab keep saving over its own draft', () => {
    const store = memoryStore();
    const tab = createDraftGuard('a', bootWhiteboardData(seed, store).stamp, () => store);
    assert.equal(tab.write(board('First'), now), 'ok');
    assert.equal(tab.write(board('Second'), now), 'ok');
    assert.equal(readDraft(store)!.nodes[0]!.id, 'Second');
    assert.equal(readDraft(store)!.writer, 'a');
  });

  it('stops a tab from saving over a newer board from another tab', () => {
    const store = memoryStore();
    // Both tabs open the same board.
    const a = createDraftGuard('a', bootWhiteboardData(seed, store).stamp, () => store);
    const b = createDraftGuard('b', bootWhiteboardData(seed, store).stamp, () => store);
    assert.equal(a.write(board('Merged'), now), 'ok');
    // Tab b still shows the old board; its next autosave must not land.
    assert.equal(b.write(board('Old'), now), 'stale');
    assert.equal(b.clear(), false, 'nor may it clear the draft');
    assert.equal(readDraft(store)!.nodes[0]!.id, 'Merged');
  });

  it('tells a tab when a storage event means another tab saved', () => {
    const store = memoryStore();
    const a = createDraftGuard('a', null, () => store);
    a.write(board('Mine'), now);
    const mine = store.getItem(AUTOSAVE_KEY);
    assert.equal(a.changedElsewhere(mine), false);
    const b = createDraftGuard('b', null, () => store);
    assert.equal(b.changedElsewhere(mine), true);
    assert.equal(a.changedElsewhere(null), true, 'another tab cleared it');
  });

  it('picks up a draft from before tabs were stamped', () => {
    const store = memoryStore();
    writeDraft(board('Old'), store, () => '2026-10-01T00:00:00.000Z');
    const tab = createDraftGuard('a', bootWhiteboardData(seed, store).stamp, () => store);
    assert.equal(tab.write(board('New'), now), 'ok');
  });
});
