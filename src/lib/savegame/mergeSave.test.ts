import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Edge, SimNode } from '../../types/whiteboard.ts';
import { mergeSaveIntoBoard, nameKey, seedNameKeysFromNodes } from './mergeSave.ts';
import type { ParsedSave } from './parseSave.ts';

const world = [{ name: 'Other', color: '#9aa0a6' }];

function sim(partial: Partial<SimNode> & Pick<SimNode, 'id' | 'first' | 'sur'>): SimNode {
  return {
    gid: 'Willow Creek||Pancakes',
    age: 'Young Adult',
    state: 'Sim',
    gender: 'Male',
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
    x: 0,
    y: 0,
    w: 0,
    h: 0,
    ...partial,
  };
}

describe('mergeSaveIntoBoard', () => {
  it('updates fodder cards, keeps planned links, confirms matching ones', () => {
    const bob = sim({ id: 'Bob Pancakes', first: 'Bob', sur: 'Pancakes' });
    const eliza = sim({
      id: 'Eliza Pancakes',
      first: 'Eliza',
      sur: 'Pancakes',
      gender: 'Female',
    });
    const edges: Edge[] = [
      {
        id: 'u1',
        a: bob.id,
        b: eliza.id,
        type: 'romance',
        source: 'planned',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ];
    const parsed: ParsedSave = {
      sims: [
        {
          saveSimId: '1',
          householdId: '10',
          first: 'Bob',
          last: 'Pancakes',
          household: 'Pancakes',
          age: 'Adult',
          gender: 'Male',
        },
        {
          saveSimId: '2',
          householdId: '10',
          first: 'Eliza',
          last: 'Pancakes',
          household: 'Pancakes',
          age: 'Adult',
          gender: 'Female',
        },
        {
          saveSimId: '3',
          householdId: '11',
          first: 'Eden',
          last: 'Flores',
          household: 'Flores',
          age: 'Young Adult',
          gender: 'Female',
        },
      ],
      rels: [
        { a: '1', b: '2', type: 'marriage' },
        { a: '3', b: '1', type: 'parent' },
      ],
    };
    const seedKeys = seedNameKeysFromNodes([bob, eliza]);
    const result = mergeSaveIntoBoard({
      nodes: [bob, eliza],
      edges,
      groups: [],
      worlds: world,
      parsed,
      seedNameKeys: seedKeys,
      now: '2026-08-24T12:00:00.000Z',
      nextEdgeId: (() => {
        let n = 1;
        return () => 'v' + n++;
      })(),
    });
    const updatedBob = result.nodes.find((n) => n.id === bob.id)!;
    assert.equal(updatedBob.age, 'Adult');
    assert.equal(updatedBob.saveSimId, '1');
    assert.equal(updatedBob.fromSave, undefined);
    const eden = result.nodes.find((n) => n.first === 'Eden')!;
    assert.equal(eden.fromSave, true);
    assert.equal(eden.added, undefined);
    const planned = result.edges.find((e) => e.id === 'u1')!;
    assert.equal(planned.source, 'save');
    assert.equal(planned.type, 'marriage');
    assert.ok(result.edges.some((e) => e.type === 'parent' && e.source === 'save'));
    assert.equal(result.summary.added, 1);
    assert.equal(result.summary.matched, 2);
  });

  it('keeps planned links that are not in the save', () => {
    const a = sim({ id: 'A', first: 'A', sur: 'One' });
    const b = sim({ id: 'B', first: 'B', sur: 'Two' });
    const result = mergeSaveIntoBoard({
      nodes: [a, b],
      edges: [{ id: 'u9', a: 'A', b: 'B', type: 'custom', source: 'planned' }],
      groups: [],
      worlds: world,
      parsed: { sims: [], rels: [] },
      seedNameKeys: new Set([nameKey('A', 'One'), nameKey('B', 'Two')]),
      now: '2026-08-24T12:00:00.000Z',
      nextEdgeId: () => 'v1',
    });
    assert.equal(result.edges[0]?.source, 'planned');
    assert.equal(result.summary.stillPlanned, 1);
  });

  it('keeps seed marriages seed so they stay out of the log', () => {
    const bob = sim({ id: 'Bob Pancakes', first: 'Bob', sur: 'Pancakes' });
    const eliza = sim({
      id: 'Eliza Pancakes',
      first: 'Eliza',
      sur: 'Pancakes',
      gender: 'Female',
    });
    const result = mergeSaveIntoBoard({
      nodes: [bob, eliza],
      edges: [{ id: 'e1', a: bob.id, b: eliza.id, type: 'marriage' }],
      groups: [],
      worlds: world,
      parsed: {
        sims: [
          {
            saveSimId: '1',
            householdId: '10',
            first: 'Bob',
            last: 'Pancakes',
            household: 'Pancakes',
            age: 'Adult',
            gender: 'Male',
          },
          {
            saveSimId: '2',
            householdId: '10',
            first: 'Eliza',
            last: 'Pancakes',
            household: 'Pancakes',
            age: 'Adult',
            gender: 'Female',
          },
        ],
        rels: [{ a: '1', b: '2', type: 'marriage' }],
      },
      seedNameKeys: seedNameKeysFromNodes([bob, eliza]),
      now: '2026-08-24T12:00:00.000Z',
      nextEdgeId: () => 'v1',
    });
    assert.equal(result.edges.length, 1);
    assert.equal(result.edges[0]?.source, 'seed');
    assert.equal(result.summary.newLinks, 0);
    assert.equal(result.summary.confirmed, 0);
  });

  it('skips ambiguous same-name matches', () => {
    const a = sim({ id: 'Alex-1', first: 'Alex', sur: 'Johnson', hh: 'One' });
    const b = sim({
      id: 'Alex-2',
      first: 'Alex',
      sur: 'Johnson',
      hh: 'Two',
      gid: 'Willow Creek||Two',
    });
    const result = mergeSaveIntoBoard({
      nodes: [a, b],
      edges: [],
      groups: [],
      worlds: world,
      parsed: {
        sims: [
          {
            saveSimId: '9',
            householdId: '90',
            first: 'Alex',
            last: 'Johnson',
            household: 'Three',
            age: 'Adult',
            gender: 'Male',
          },
        ],
        rels: [],
      },
      seedNameKeys: seedNameKeysFromNodes([a, b]),
      now: '2026-08-24T12:00:00.000Z',
      nextEdgeId: () => 'v1',
    });
    assert.deepEqual(result.summary.skipped, ['Alex Johnson']);
    assert.equal(result.summary.matched, 0);
    assert.equal(result.summary.added, 0);
  });

  it('marks an editor-added card as fromSave and drops the plus look', () => {
    const eden = sim({
      id: 'new1',
      first: 'Eden',
      sur: 'Flores',
      added: true,
      ox: 12,
      oy: 8,
    });
    const result = mergeSaveIntoBoard({
      nodes: [eden],
      edges: [],
      groups: [],
      worlds: world,
      parsed: {
        sims: [
          {
            saveSimId: '3',
            householdId: '11',
            first: 'Eden',
            last: 'Flores',
            household: 'Flores',
            age: 'Young Adult',
            gender: 'Female',
          },
        ],
        rels: [],
      },
      seedNameKeys: new Set(),
      now: '2026-08-24T12:00:00.000Z',
      nextEdgeId: () => 'v1',
    });
    const card = result.nodes.find((n) => n.id === 'new1')!;
    assert.equal(card.fromSave, true);
    assert.equal(card.added, undefined);
    assert.equal(card.saveSimId, '3');
    assert.equal(card.ox, 12);
    assert.equal(card.oy, 8);
  });

  it('matches a one-letter first-name spelling and does not duplicate', () => {
    const board = sim({
      id: 'Liliana Kealoha',
      first: 'Liliana',
      sur: 'Kealoha',
      hh: 'Kealoha',
      world: 'Sulani',
      gid: 'Sulani||Kealoha',
    });
    const result = mergeSaveIntoBoard({
      nodes: [board],
      edges: [],
      groups: [],
      worlds: [{ name: 'Sulani', color: '#4e79a7' }, ...world],
      parsed: {
        sims: [
          {
            saveSimId: '9',
            householdId: '90',
            first: 'Lilliana',
            last: 'Kealoha',
            household: 'Kealoha',
            age: 'Young Adult',
            gender: 'Female',
            world: 'Sulani',
          },
        ],
        rels: [],
      },
      seedNameKeys: seedNameKeysFromNodes([board]),
      now: '2026-08-24T12:00:00.000Z',
      nextEdgeId: () => 'v1',
    });
    assert.equal(result.summary.matched, 1);
    assert.equal(result.summary.added, 0);
    assert.equal(result.nodes.length, 1);
    assert.equal(result.nodes[0]?.first, 'Lilliana');
    assert.equal(result.nodes[0]?.gid, 'Sulani||Kealoha');
    assert.equal(result.nodes[0]?.fromSave, undefined);
  });

  it('does not dump a new household into an existing same-named Other house', () => {
    const zoe = sim({
      id: 'Zoe Flores',
      first: 'Zoe',
      sur: 'Flores',
      hh: 'Flores',
      world: 'Other',
      gid: 'Other||Flores',
    });
    const result = mergeSaveIntoBoard({
      nodes: [zoe],
      edges: [],
      groups: [{ gid: 'Other||Flores', hh: 'Flores', world: 'Other', nb: '-', color: '#9aa0a6', x: 0, y: 0, w: 0, h: 0 }],
      worlds: [
        { name: 'Ciudad Enamorada', color: '#e15759' },
        ...world,
      ],
      parsed: {
        sims: [
          {
            saveSimId: '3',
            householdId: '11',
            first: 'Eden',
            last: 'Flores',
            household: 'Flores',
            age: 'Young Adult',
            gender: 'Female',
            world: 'Ciudad Enamorada',
          },
          {
            saveSimId: '4',
            householdId: '11',
            first: 'Lily',
            last: 'Flores',
            household: 'Flores',
            age: 'Child',
            gender: 'Female',
            world: 'Ciudad Enamorada',
          },
        ],
        rels: [{ a: '3', b: '4', type: 'parent' }],
      },
      seedNameKeys: seedNameKeysFromNodes([zoe]),
      now: '2026-08-24T12:00:00.000Z',
      nextEdgeId: (() => {
        let n = 1;
        return () => 'v' + n++;
      })(),
    });
    const eden = result.nodes.find((n) => n.first === 'Eden')!;
    const lily = result.nodes.find((n) => n.first === 'Lily')!;
    assert.equal(eden.world, 'Ciudad Enamorada');
    assert.equal(eden.gid, 'Ciudad Enamorada||Flores');
    assert.equal(lily.gid, eden.gid);
    assert.equal(zoe.gid, 'Other||Flores');
    assert.ok(result.nodes.some((n) => n.id === 'Zoe Flores' && n.gid === 'Other||Flores'));
  });

  it('does not follow a shared household id when household names differ', () => {
    const elsa = sim({
      id: 'Elsa Bjergsen',
      first: 'Elsa',
      sur: 'Bjergsen',
      hh: 'Bjergsen',
      world: 'Windenburg',
      gid: 'Windenburg||Bjergsen',
    });
    const result = mergeSaveIntoBoard({
      nodes: [elsa],
      edges: [],
      groups: [],
      worlds: [
        { name: 'Windenburg', color: '#4e79a7' },
        { name: 'Ciudad Enamorada', color: '#e15759' },
        ...world,
      ],
      parsed: {
        sims: [
          {
            saveSimId: '1',
            householdId: '99',
            first: 'Elsa',
            last: 'Bjergsen',
            household: 'Bjergsen',
            age: 'Young Adult',
            gender: 'Female',
            world: 'Ciudad Enamorada',
          },
          {
            saveSimId: '2',
            householdId: '99',
            first: 'Eden',
            last: 'Flores',
            household: 'Flores',
            age: 'Young Adult',
            gender: 'Female',
            world: 'Ciudad Enamorada',
          },
          {
            saveSimId: '3',
            householdId: '99',
            first: 'Lily',
            last: 'Flores',
            household: 'Flores',
            age: 'Child',
            gender: 'Female',
            world: 'Ciudad Enamorada',
          },
        ],
        rels: [],
      },
      seedNameKeys: seedNameKeysFromNodes([elsa]),
      now: '2026-08-24T12:00:00.000Z',
      nextEdgeId: () => 'v1',
    });
    const eden = result.nodes.find((n) => n.first === 'Eden')!;
    const lily = result.nodes.find((n) => n.first === 'Lily')!;
    assert.equal(eden.gid, 'Ciudad Enamorada||Flores');
    assert.equal(lily.gid, eden.gid);
    assert.equal(elsa.gid, 'Windenburg||Bjergsen');
    assert.ok(result.nodes.some((n) => n.id === 'Elsa Bjergsen' && n.gid === 'Windenburg||Bjergsen'));
  });

  it('does not dump uninstantiated household-id-0 sims into a matched house', () => {
    const moyer = sim({
      id: 'Alex Moyer',
      first: 'Alex',
      sur: 'Moyer',
      hh: 'Moyer',
      world: 'Other',
      gid: 'Other||Moyer',
    });
    const result = mergeSaveIntoBoard({
      nodes: [moyer],
      edges: [],
      groups: [],
      worlds: world,
      parsed: {
        sims: [
          {
            saveSimId: '1',
            householdId: '0',
            first: 'Alex',
            last: 'Moyer',
            household: 'Moyer',
            age: 'Young Adult',
            gender: 'Female',
          },
          {
            saveSimId: '2',
            householdId: '0',
            first: 'Janie',
            last: 'Crowley',
            household: 'Crowley',
            age: 'Young Adult',
            gender: 'Female',
          },
          {
            saveSimId: '3',
            householdId: '0',
            first: 'Lawrence',
            last: 'Koch',
            household: 'Koch',
            age: 'Adult',
            gender: 'Male',
          },
        ],
        rels: [],
      },
      seedNameKeys: seedNameKeysFromNodes([moyer]),
      now: '2026-08-24T12:00:00.000Z',
      nextEdgeId: () => 'v1',
    });
    assert.equal(result.summary.matched, 1);
    const janie = result.nodes.find((n) => n.first === 'Janie')!;
    const lawrence = result.nodes.find((n) => n.first === 'Lawrence')!;
    assert.equal(janie.gid, 'Other||Crowley');
    assert.equal(lawrence.gid, 'Other||Koch');
    assert.ok(result.nodes.some((n) => n.id === 'Alex Moyer' && n.gid === 'Other||Moyer'));
  });

  it('reports save worlds and hides packs whose worlds are not in the save', () => {
    const kylo = sim({
      id: 'Kylo Ren',
      first: 'Kylo',
      sur: 'Ren',
      pack: 'Journey to Batuu',
      world: 'Batuu',
      hh: 'Kylo Ren',
      gid: 'Batuu||Kylo Ren',
    });
    const bob = sim({
      id: 'Bob Pancakes',
      first: 'Bob',
      sur: 'Pancakes',
      pack: 'Base Game',
    });
    const result = mergeSaveIntoBoard({
      nodes: [kylo, bob],
      edges: [],
      groups: [],
      worlds: [
        { name: 'Batuu', color: '#4e79a7' },
        { name: 'Willow Creek', color: '#4e79a7' },
        ...world,
      ],
      parsed: {
        sims: [
          {
            saveSimId: '1',
            householdId: '10',
            first: 'Bob',
            last: 'Pancakes',
            household: 'Pancakes',
            age: 'Adult',
            gender: 'Male',
            world: 'Willow Creek',
          },
        ],
        rels: [],
        worlds: ['Willow Creek', 'Granite Falls'],
      },
      seedNameKeys: seedNameKeysFromNodes([kylo, bob]),
      now: '2026-08-24T12:00:00.000Z',
      nextEdgeId: () => 'v1',
    });
    assert.deepEqual(result.summary.hidePacks, ['Journey to Batuu']);
    assert.ok(result.summary.saveWorlds.includes('Willow Creek'));
    assert.ok(!result.summary.saveWorlds.includes('Batuu'));
    assert.deepEqual(result.summary.extraWorlds, ['Granite Falls']);
  });
});
