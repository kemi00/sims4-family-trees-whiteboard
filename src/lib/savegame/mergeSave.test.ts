import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Edge, SaveGameInfo, SimNode } from '../../types/whiteboard.ts';
import {
  fillMissingSavePacks,
  hiddenPacksAfterImport,
  isStarterBoard,
  mergeSaveIntoBoard,
  nameKey,
  seedNameKeysFromNodes,
} from './mergeSave.ts';
import type { ParsedSave } from './parseSave.ts';

const world = [{ name: 'Not in any world', color: '#9aa0a6' }];

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
      world: 'Not in any world',
      gid: 'Not in any world||Flores',
    });
    const result = mergeSaveIntoBoard({
      nodes: [zoe],
      edges: [],
      groups: [{ gid: 'Not in any world||Flores', hh: 'Flores', world: 'Not in any world', nb: '-', color: '#9aa0a6', x: 0, y: 0, w: 0, h: 0 }],
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
    assert.equal(zoe.gid, 'Not in any world||Flores');
    assert.ok(result.nodes.some((n) => n.id === 'Zoe Flores' && n.gid === 'Not in any world||Flores'));
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
      world: 'Not in any world',
      gid: 'Not in any world||Moyer',
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
    assert.equal(janie.gid, 'Not in any world||Crowley');
    assert.equal(lawrence.gid, 'Not in any world||Koch');
    assert.ok(result.nodes.some((n) => n.id === 'Alex Moyer' && n.gid === 'Not in any world||Moyer'));
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

  it('knows a game from the roster when the board has none of its sims', () => {
    const kylo = sim({ id: 'Kylo Ren', first: 'Kylo', sur: 'Ren', pack: 'Journey to Batuu', world: 'Batuu' });
    const result = mergeSaveIntoBoard({
      nodes: [],
      edges: [],
      groups: [],
      worlds: [{ name: 'Batuu', color: '#4e79a7' }, ...world],
      parsed: { sims: [], rels: [], worlds: ['Willow Creek'] },
      seedNameKeys: new Set(),
      packReference: [kylo],
      now: 'x',
      nextEdgeId: () => 'v1',
    });
    assert.deepEqual(result.summary.hidePacks, ['Journey to Batuu']);
  });
});

describe('hiddenPacksAfterImport', () => {
  it('switches off the games the save shows you do not have, keeping yours', () => {
    const next = hiddenPacksAfterImport({
      hidden: ['Get Together'],
      hidePacks: ['Journey to Batuu'],
      before: ['Get Together', 'Base Game'],
      after: ['Get Together', 'Base Game'],
    });
    assert.deepEqual([...next].sort(), ['Get Together', 'Journey to Batuu']);
  });

  it('switches a game back on when its sims first arrive', () => {
    const next = hiddenPacksAfterImport({
      hidden: ['Journey to Batuu', 'Get Together'],
      hidePacks: [],
      before: ['Base Game', 'Get Together'],
      after: ['Base Game', 'Get Together', 'Journey to Batuu'],
    });
    assert.deepEqual([...next], ['Get Together']);
  });
});

describe('households split across boxes', () => {
  const worlds = [
    { name: 'Henford-on-Bagley', color: '#b6992d' },
    { name: 'Ravenwood', color: '#6b5b95' },
    ...world,
  ];
  const card = (id: string, w: string, hh: string, gid = `${w}||${hh}`) =>
    sim({ id, first: id, sur: hh, hh, ohh: hh, world: w, oworld: w, gid, saveSimId: id });
  const saveSim = (id: string, householdId: string, household: string, w?: string) => ({
    saveSimId: id,
    householdId,
    first: id,
    last: household,
    household,
    age: 'Adult',
    gender: 'Female',
    world: w,
  });
  /** A sim with no home lot ("Currently Not in World"), premade or player-made. */
  const unhousedSim = (id: string, householdId: string, household: string) => ({
    ...saveSim(id, householdId, household),
    unhoused: true as const,
  });
  /** A sim the game generated as the player played, with no home lot. */
  const townie = (id: string, householdId: string, household: string) => ({
    ...unhousedSim(id, householdId, household),
    generated: true as const,
  });
  const N = 'Not in any world';
  const merge = (nodes: SimNode[], sims: ParsedSave['sims'], movedByHand?: Set<string>) =>
    mergeSaveIntoBoard({
      nodes,
      edges: [],
      groups: [...new Set(nodes.map((n) => n.gid))].map((gid) => {
        const n = nodes.find((x) => x.gid === gid)!;
        return { gid, hh: n.hh, world: n.world, nb: '-', color: n.color, x: 0, y: 0, w: 0, h: 0 };
      }),
      worlds,
      parsed: { sims, rels: [] },
      seedNameKeys: new Set(),
      movedByHand,
      now: '2026-10-13T12:00:00.000Z',
      nextEdgeId: () => 'v1',
    });
  const gidOf = (r: ReturnType<typeof merge>, id: string) =>
    r.nodes.find((n) => n.id === id)!.gid;
  const H = 'Henford-on-Bagley';

  it('brings a sim who was out visiting back into their household\'s box', () => {
    const r = merge(
      [card('Sara', H, 'Scott'), card('Simon', H, 'Scott', `${H}||Scott::77`)],
      [saveSim('Sara', '10', 'Scott', H), saveSim('Simon', '10', 'Scott', H)],
    );
    assert.equal(gidOf(r, 'Simon'), `${H}||Scott`);
    assert.deepEqual(r.rehomed, ['Simon']);
    assert.deepEqual(r.summary.rejoined, ['Simon Scott']);
    assert.ok(!r.groups.some((g) => g.gid === `${H}||Scott::77`), 'the empty box goes');
  });

  it('gathers a household where most of it already is', () => {
    const r = merge(
      [
        card('Bella', H, 'Goth', `${H}||Goth::5`),
        card('Cassandra', H, 'Goth', `${H}||Goth::5`),
        card('Mortimer', H, 'Goth'),
      ],
      ['Bella', 'Cassandra', 'Mortimer'].map((id) => saveSim(id, '20', 'Goth', H)),
    );
    assert.equal(gidOf(r, 'Mortimer'), `${H}||Goth::5`);
    assert.deepEqual(r.rehomed, ['Mortimer']);
  });

  it('settles a tie in the household\'s home world (Not in any world when it is not on the board)', () => {
    const r = merge(
      [card('Mariah', 'Ravenwood', 'Camacho'), card('Judith', 'Not in any world', 'Camacho')],
      [saveSim('Mariah', '30', 'Camacho'), saveSim('Judith', '30', 'Camacho')],
    );
    const mariah = r.nodes.find((n) => n.id === 'Mariah')!;
    assert.equal(mariah.gid, 'Not in any world||Camacho');
    assert.equal(mariah.world, 'Not in any world');
    assert.equal(mariah.oworld, 'Not in any world', 'her origin was the box she left, so it follows');
  });

  it('leaves a sim the player moved to another household by hand', () => {
    const r = merge(
      [card('Sara', H, 'Scott'), card('Simon', H, 'Watson')],
      [saveSim('Sara', '10', 'Scott', H), saveSim('Simon', '10', 'Scott', H)],
      new Set(['Simon']),
    );
    assert.equal(gidOf(r, 'Simon'), `${H}||Watson`);
    assert.deepEqual(r.rehomed, []);
  });

  it('never splits a box that holds two households', () => {
    const r = merge(
      [card('Laxmi', 'Not in any world', 'Kunal'), card('Raheel', 'Not in any world', 'Kunal')],
      [saveSim('Laxmi', '40', 'Kunal'), saveSim('Raheel', '41', 'Kunal')],
    );
    assert.equal(gidOf(r, 'Raheel'), 'Not in any world||Kunal');
    assert.deepEqual(r.rehomed, []);
  });

  it('puts a new member in the box the household was gathered into', () => {
    const r = merge(
      [card('Sara', H, 'Scott', `${H}||Scott::77`), card('Simon', H, 'Scott'), card('Ann', H, 'Scott')],
      [
        saveSim('Sara', '10', 'Scott', H),
        saveSim('Simon', '10', 'Scott', H),
        saveSim('Ann', '10', 'Scott', H),
        saveSim('Maisie', '10', 'Scott', H),
      ],
    );
    assert.equal(gidOf(r, 'Sara'), `${H}||Scott`);
    assert.equal(r.nodes.find((n) => n.first === 'Maisie')!.gid, `${H}||Scott`);
  });

  it('puts sims the game generated in one Unhoused sims box, in Not in any world', () => {
    const r = merge(
      [
        { ...card('Judith', N, 'Camacho'), pack: 'Base Game' },
        { ...card('Mariah', 'Ravenwood', 'Camacho'), pack: 'Life & Death', fromSave: true },
        card('Derek', 'Willow Creek', 'Hadley'),
      ],
      [townie('Judith', '30', 'Camacho'), townie('Mariah', '30', 'Camacho'), townie('Derek', '31', 'Hadley')],
    );
    for (const id of ['Judith', 'Mariah', 'Derek']) assert.equal(gidOf(r, id), `${N}||Unhoused sims`, id);
    const mariah = r.nodes.find((n) => n.id === 'Mariah')!;
    assert.equal(mariah.hh, 'Unhoused sims');
    assert.equal(mariah.ohh, 'Camacho', 'her family name stays as her origin');
    assert.equal(mariah.pack, 'Base Game', 'her game came from Ravenwood; she takes the new world\'s');
    assert.equal(mariah.oplay, 'Townie', 'the game made her: a townie, not a resident');
    assert.deepEqual(r.summary.toNotInWorld.sort(), ['Derek Hadley', 'Mariah Camacho']);
    assert.equal(r.summary.unhoused.length, 3);
    assert.ok(!r.groups.some((g) => g.gid === `${N}||Camacho`), 'emptied boxes go');
  });

  it('keeps a premade or player-made family with no home lot as a household', () => {
    const r = merge(
      [card('Lavina', N, 'Chopra'), card('Rahul', N, 'Chopra'), card('Waylon', 'Ravenwood', 'Warez')],
      [unhousedSim('Lavina', '40', 'Chopra'), unhousedSim('Rahul', '40', 'Chopra'), unhousedSim('Waylon', '50', 'Warez')],
    );
    assert.equal(gidOf(r, 'Lavina'), `${N}||Chopra`);
    assert.equal(gidOf(r, 'Rahul'), `${N}||Chopra`);
    assert.equal(gidOf(r, 'Waylon'), `${N}||Warez`, 'the game has him Currently Not in World');
    assert.deepEqual(r.summary.toNotInWorld, ['Waylon Warez']);
    assert.deepEqual(r.summary.unhoused, []);
  });

  it('gives a household back to a premade sim an earlier import put in Unhoused sims', () => {
    const box = `${N}||Unhoused sims`;
    const r = merge(
      [card('Lavina', N, 'Unhoused sims', box), card('Rahul', N, 'Unhoused sims', box), card('Rae', N, 'Unhoused sims', box)],
      [unhousedSim('Lavina', '40', 'Chopra'), unhousedSim('Rahul', '40', 'Chopra'), townie('Rae', '30', 'Durham')],
    );
    assert.equal(gidOf(r, 'Lavina'), `${N}||Chopra`);
    assert.equal(gidOf(r, 'Rahul'), `${N}||Chopra`);
    assert.equal(gidOf(r, 'Rae'), box);
  });

  it('puts new sims with no home lot in a household, or Unhoused sims if the game made them', () => {
    const r = merge([], [unhousedSim('Bell', '30', 'Bell'), townie('Kim', '31', 'Novac')]);
    assert.deepEqual(r.nodes.map((n) => n.gid), [`${N}||Bell`, `${N}||Unhoused sims`]);
    assert.equal(r.nodes[1]!.oplay, 'Townie');
  });

  it('gives a sim the game has housed since a box of its own', () => {
    const box = `${N}||Unhoused sims`;
    const r = merge(
      [card('Kai', N, 'Unhoused sims', box), card('Rae', N, 'Unhoused sims', box)],
      [saveSim('Kai', '60', 'Aether', 'Ravenwood'), townie('Rae', '30', 'Durham')],
    );
    assert.equal(gidOf(r, 'Kai'), 'Ravenwood||Aether');
    assert.equal(gidOf(r, 'Rae'), box);
    assert.deepEqual(r.summary.rejoined, ['Kai Aether']);
  });

  it('leaves an unhoused sim the player moved by hand', () => {
    const r = merge(
      [card('Mariah', 'Ravenwood', 'Gomes')],
      [townie('Mariah', '30', 'Camacho')],
      new Set(['Mariah']),
    );
    assert.equal(gidOf(r, 'Mariah'), 'Ravenwood||Gomes');
    assert.deepEqual(r.summary.unhoused, []);
  });
});

describe('mergeSaveIntoBoard secrets and statuses', () => {
  const saveSim = (saveSimId: string, first: string) => ({
    saveSimId,
    householdId: '10',
    first,
    last: 'Ames',
    household: 'Ames',
    age: 'Adult',
    gender: 'Female',
  });
  const parsed: ParsedSave = {
    sims: [saveSim('1', 'Ann'), saveSim('2', 'Ben'), saveSim('3', 'Cal'), saveSim('4', 'Dee')],
    rels: [
      { a: '1', b: '2', type: 'marriage' },
      { a: '1', b: '3', type: 'parent' },
      { a: '4', b: '3', type: 'parent', secret: true },
      { a: '1', b: '4', type: 'romance', secret: true },
    ],
    pairs: [
      { a: '1', b: '2', tags: ['married', 'friends'] },
      { a: '2', b: '4', tags: ['bestFriends'] },
    ],
  };
  let n = 0;
  const merge = (input: Partial<Parameters<typeof mergeSaveIntoBoard>[0]> = {}) =>
    mergeSaveIntoBoard({
      nodes: [],
      edges: [],
      groups: [],
      worlds: world,
      parsed,
      seedNameKeys: new Set(),
      now: '2026-10-12T00:00:00.000Z',
      nextEdgeId: () => `v${n++}`,
      ...input,
    });

  it('imports secret parents and secret lovers as secret links', () => {
    const r = merge();
    const secret = r.edges.filter((e) => e.secret).map((e) => `${e.type}:${e.a}>${e.b}`);
    assert.deepEqual(secret.sort(), ['parent:s4>s3', 'romance:s1>s4']);
    assert.equal(r.summary.secretParents, 1);
    assert.equal(r.summary.secretLovers, 1);
  });

  it('maps statuses onto board sims and keeps pairs the save does not cover', () => {
    const r = merge({
      pairStatus: [
        { a: 's2', b: 's1', tags: ['exes'] },
        { a: 's1', b: 'Board Only', tags: ['friends'] },
      ],
    });
    assert.deepEqual(
      r.pairStatus.map((p) => `${p.a}+${p.b}:${p.tags.join(',')}`).sort(),
      ['s1+Board Only:friends', 's1+s2:married,friends', 's2+s4:bestFriends'],
    );
  });

  it('drops the secret flag once the save no longer keeps the secret', () => {
    const first = merge();
    const revealed: ParsedSave = {
      ...parsed,
      rels: parsed.rels.map(({ secret: _secret, ...r }) => r),
    };
    const again = mergeSaveIntoBoard({
      nodes: first.nodes,
      edges: first.edges,
      groups: first.groups,
      worlds: world,
      parsed: revealed,
      seedNameKeys: new Set(),
      now: '2026-10-13T00:00:00.000Z',
      nextEdgeId: () => `w${n++}`,
    });
    assert.equal(again.edges.filter((e) => e.secret).length, 0);
    assert.equal(again.summary.newLinks, 0);
  });

  it('keeps a secret the user planned that the save does not have yet', () => {
    const first = merge();
    const planned = [
      { id: 'u1', a: 's2', b: 's3', type: 'parent' as const, source: 'planned' as const, secret: true as const },
      { id: 'u2', a: 's2', b: 's4', type: 'romance' as const, source: 'planned' as const, secret: true as const },
    ];
    const again = mergeSaveIntoBoard({
      nodes: first.nodes,
      edges: [...first.edges, ...planned],
      groups: first.groups,
      worlds: world,
      parsed,
      seedNameKeys: new Set(),
      now: '2026-10-13T00:00:00.000Z',
      nextEdgeId: () => `w${n++}`,
    });
    const kept = again.edges.filter((e) => e.id === 'u1' || e.id === 'u2');
    assert.deepEqual(
      kept.map((e) => `${e.id}:${e.source}:${!!e.secret}`),
      ['u1:planned:true', 'u2:planned:true'],
    );
  });
});

describe('games for save sims', () => {
  const worlds = [
    { name: 'Willow Creek', color: '#4e79a7' },
    { name: 'San Myshuno', color: '#e15759' },
    { name: 'Not in any world', color: '#9aa0a6' },
  ];
  const roster = [
    sim({ id: 'r1', first: 'Bella', sur: 'Goth', world: 'Willow Creek', pack: 'Base Game' }),
    sim({ id: 'r2', first: 'Miko', sur: 'Ojo', world: 'San Myshuno', pack: 'City Living' }),
  ];
  const parsed: ParsedSave = {
    sims: [
      { saveSimId: '1', householdId: '7', first: 'Ann', last: 'Ames', household: 'Ames', age: 'Adult', gender: 'Female', world: 'San Myshuno' },
      { saveSimId: '2', householdId: '8', first: 'Bo', last: 'Bly', household: 'Bly', age: 'Adult', gender: 'Male', world: 'Willow Creek' },
    ],
    rels: [],
  };
  const replace = (packReference?: SimNode[]) =>
    mergeSaveIntoBoard({
      nodes: [],
      edges: [],
      groups: [],
      worlds,
      parsed,
      seedNameKeys: new Set(),
      packReference,
      now: 'x',
      nextEdgeId: () => 'v',
    });

  it('gives a replaced board the built-in roster\'s game for each world', () => {
    const packs = Object.fromEntries(replace(roster).nodes.map((n) => [n.first, n.pack]));
    assert.deepEqual(packs, { Ann: 'City Living', Bo: 'Base Game' });
  });

  it('left every sim without a game when there was nothing to go on', () => {
    assert.deepEqual(replace().nodes.map((n) => n.pack), ['', '']);
  });

  it('repairs save sims with no game, and leaves sims added in the editor alone', () => {
    const board = [
      sim({ id: 's1', first: 'Ann', sur: 'Ames', world: 'San Myshuno', pack: '', saveSimId: '1' }),
      sim({ id: 'u1', first: 'New', sur: 'Sim', world: 'San Myshuno', pack: '', added: true }),
      sim({ id: 's2', first: 'Bo', sur: 'Bly', world: 'Willow Creek', pack: 'Base Game', saveSimId: '2' }),
    ];
    const fixed = fillMissingSavePacks(board, roster);
    assert.deepEqual(
      fixed.map((n) => [n.id, n.pack]),
      [
        ['s1', 'City Living'],
        ['u1', ''],
        ['s2', 'Base Game'],
      ],
    );
    const whole = [board[2]!];
    assert.equal(fillMissingSavePacks(whole, roster), whole);
  });
});

describe('roster details for premades the board has no card for', () => {
  const worlds = [
    { name: 'Ondarion', color: '#c99700' },
    { name: 'Not in any world', color: '#9aa0a6' },
  ];
  const roster = [
    sim({
      id: 'Fia Acosta',
      first: 'Fia',
      sur: 'Acosta',
      world: 'Not in any world',
      pack: 'Royalty & Legacy',
      oplay: 'NPC',
      state: 'Spellcaster',
      townie: true,
    }),
    sim({
      id: 'Ava Rose',
      first: 'Ava',
      sur: 'Rose',
      world: 'Ondarion',
      nb: 'Thornwick',
      pack: 'Royalty & Legacy',
    }),
  ];
  const r = mergeSaveIntoBoard({
    nodes: [],
    edges: [],
    groups: [],
    worlds,
    parsed: {
      sims: [
        { saveSimId: '1', householdId: '7', first: 'Fia', last: 'Acosta', household: 'Acosta', age: 'Adult', gender: 'Female', unhoused: true },
        { saveSimId: '2', householdId: '8', first: 'Ava', last: 'Rose', household: 'Rose', age: 'Adult', gender: 'Female', world: 'Ondarion' },
      ],
      rels: [],
    },
    seedNameKeys: seedNameKeysFromNodes(roster),
    packReference: roster,
    now: 'x',
    nextEdgeId: () => 'v',
  });
  const card = (first: string) => r.nodes.find((n) => n.first === first)!;

  it('takes the game, playability and life state the save does not record', () => {
    const fia = card('Fia');
    assert.equal(fia.world, 'Not in any world');
    assert.deepEqual([fia.pack, fia.oplay, fia.state], ['Royalty & Legacy', 'NPC', 'Spellcaster']);
  });

  it('takes the roster breed for a pet an earlier import took for a human', () => {
    const horse = sim({ id: 'Duke', first: 'Duke', sur: 'Gooseman', world: 'Ondarion', species: 'Horse', state: 'Pet', breed: 'Clydesdale' });
    const r2 = mergeSaveIntoBoard({
      nodes: [sim({ id: 'Duke', first: 'Duke', sur: 'Gooseman', world: 'Ondarion', saveSimId: '9' })],
      edges: [],
      groups: [],
      worlds,
      parsed: {
        sims: [{ saveSimId: '9', householdId: '3', first: 'Duke', last: 'Gooseman', household: 'Gooseman', age: 'Adult', gender: 'Male', species: 'Horse', world: 'Ondarion' }],
        rels: [],
      },
      seedNameKeys: seedNameKeysFromNodes([horse]),
      packReference: [horse],
      now: 'x',
      nextEdgeId: () => 'v',
    });
    const duke = r2.nodes.find((n) => n.id === 'Duke')!;
    assert.deepEqual([duke.state, duke.species, duke.breed], ['Pet', 'Horse', 'Clydesdale']);
  });

  it('takes the neighbourhood when the sim still lives in that world', () => {
    assert.equal(card('Ava').nb, 'Thornwick');
    assert.equal(card('Fia').nb, '-');
  });
});

describe('family-tree relatives with no sim', () => {
  const N = 'Not in any world';
  const worlds = [{ name: 'Nordhaven', color: '#7b6bd6' }, { name: N, color: '#9aa0a6' }];
  const hoffman = (first: string, id: string) => ({
    saveSimId: id,
    householdId: '5',
    first,
    last: 'Hoffman',
    household: 'Hoffman',
    age: 'Elder',
    gender: 'Male',
    unhoused: true as const,
  });
  const parsed: ParsedSave = {
    sims: [hoffman('Bruno', '1'), hoffman('Felix', '2')],
    rels: [
      { a: '1', b: 'g1', type: 'parent' },
      { a: 'g1', b: '2', type: 'parent' },
      // Bruno's own mother links him to nobody else.
      { a: 'g2', b: '1', type: 'parent' },
    ],
    relatives: [
      { treeId: 'g1', gender: 'Male' },
      { treeId: 'g2', gender: 'Female', deceased: true },
    ],
  };
  const merge = (nodes: SimNode[]) =>
    mergeSaveIntoBoard({
      nodes,
      edges: [],
      groups: [],
      worlds,
      parsed,
      seedNameKeys: new Set(),
      now: 'x',
      nextEdgeId: (() => {
        let n = 0;
        return () => `v${n++}`;
      })(),
    });

  it('adds a card for one who links two sims, in their family', () => {
    const r = merge([]);
    const felix = r.nodes.find((n) => n.first === 'Felix')!;
    const unknown = r.nodes.find((n) => n.treeId === 'g1')!;
    assert.deepEqual(
      [unknown.first, unknown.sur, unknown.gender, unknown.gid],
      ['Unknown', 'Hoffman', 'Male', felix.gid],
    );
    assert.ok(r.edges.some((e) => e.type === 'parent' && e.b === unknown.id));
    assert.ok(r.edges.some((e) => e.type === 'parent' && e.a === unknown.id && e.b === felix.id));
    assert.deepEqual(r.summary.relatives, ['Unknown Hoffman']);
  });

  it("gives a card the game's name for them, split as the game splits sims'", () => {
    const named: ParsedSave = {
      ...parsed,
      relatives: [{ treeId: 'g1', gender: 'Male', name: 'Rodrigo De Pablo' }],
    };
    const r = mergeSaveIntoBoard({
      nodes: [],
      edges: [],
      groups: [],
      worlds,
      parsed: named,
      seedNameKeys: new Set(),
      now: 'x',
      nextEdgeId: () => 'v',
    });
    const card = r.nodes.find((n) => n.treeId === 'g1')!;
    assert.deepEqual([card.first, card.sur], ['Rodrigo', 'De Pablo']);
  });

  it('names an Unknown card on the next merge, but not one renamed by hand', () => {
    const once = merge([]);
    const named: ParsedSave = { ...parsed, relatives: [{ treeId: 'g1', gender: 'Male', name: 'Klaus Hoffman' }] };
    const again = (nodes: SimNode[]) =>
      mergeSaveIntoBoard({
        nodes,
        edges: [],
        groups: [],
        worlds,
        parsed: named,
        seedNameKeys: new Set(),
        now: 'x',
        nextEdgeId: () => 'w',
      });
    const r = again(once.nodes);
    const card = r.nodes.find((n) => n.treeId === 'g1')!;
    assert.deepEqual([card.first, card.sur, card.id], ['Klaus', 'Hoffman', 'tg1']);
    assert.deepEqual(r.summary.relativesNamed, ['Klaus Hoffman']);
    const mine = once.nodes.map((n) => (n.treeId === 'g1' ? { ...n, first: 'Otto' } : n));
    assert.equal(again(mine).nodes.find((n) => n.treeId === 'g1')!.first, 'Otto');
  });

  it('leaves out one who links nobody else', () => {
    assert.ok(!merge([]).nodes.some((n) => n.treeId === 'g2'));
  });

  it('adds nothing the second time', () => {
    const once = merge([]);
    const twice = merge(once.nodes);
    assert.equal(twice.nodes.length, once.nodes.length);
    assert.deepEqual(twice.summary.relatives, []);
  });

  it("turns the roster's placeholder into the relative and brings it home", () => {
    const placeholder = sim({
      id: 'Unknown Hoffman',
      first: 'Unknown',
      sur: 'Hoffman',
      hh: 'Hoffman',
      world: 'Nordhaven',
      gid: 'Nordhaven||Hoffman',
    });
    const r = merge([placeholder]);
    const card = r.nodes.find((n) => n.id === 'Unknown Hoffman')!;
    const felix = r.nodes.find((n) => n.first === 'Felix')!;
    assert.equal(card.treeId, 'g1');
    assert.equal(card.gid, felix.gid);
    assert.equal(r.nodes.filter((n) => n.first === 'Unknown').length, 1);
    assert.deepEqual(r.rehomed, ['Unknown Hoffman']);
    assert.ok(!r.groups.some((g) => g.gid === 'Nordhaven||Hoffman'), 'its old box goes');
  });
});

describe('relatives the save keeps nameless', () => {
  const N = 'Not in any world';
  const worlds = [{ name: 'San Sequoia', color: '#6b4c9a' }, { name: N, color: '#9aa0a6' }];
  const lunaSullivan = (id: string, first: string, sur: string, extra: Partial<SimNode> = {}) =>
    sim({ id, first, sur, world: 'San Sequoia', hh: 'Luna-Sullivan', gid: 'San Sequoia||Luna-Sullivan', ...extra });
  const roster = [
    lunaSullivan('Eleanor Sullivan', 'Eleanor', 'Sullivan'),
    lunaSullivan('Karmine Luna', 'Karmine', 'Luna'),
    lunaSullivan('Colin Sullivan', 'Colin', 'Sullivan', { state: 'Deceased' }),
  ];
  const rosterEdges: Edge[] = [
    { id: 'r1', a: 'Eleanor Sullivan', b: 'Colin Sullivan', type: 'parent', source: 'seed' },
    { id: 'r2', a: 'Colin Sullivan', b: 'Karmine Luna', type: 'parent', source: 'seed' },
  ];
  const saveSim = (id: string, first: string, last: string) => ({
    saveSimId: id, householdId: '4', first, last, household: 'Luna-Sullivan', age: 'Adult', gender: 'Female', world: 'San Sequoia',
  });
  const merge = (rels: ParsedSave['rels'], nodes: SimNode[] = []) =>
    mergeSaveIntoBoard({
      nodes,
      edges: [],
      groups: [],
      worlds,
      parsed: {
        sims: [saveSim('1', 'Eleanor', 'Sullivan'), saveSim('2', 'Karmine', 'Luna')],
        rels,
        relatives: [{ treeId: 'g1', gender: 'Male' }],
      },
      seedNameKeys: seedNameKeysFromNodes(roster),
      packReference: roster,
      rosterEdges,
      now: 'x',
      nextEdgeId: (() => {
        let n = 0;
        return () => `v${n++}`;
      })(),
    });
  const between: ParsedSave['rels'] = [
    { a: '1', b: 'g1', type: 'parent' },
    { a: 'g1', b: '2', type: 'parent' },
  ];

  it("takes the roster's name when its links match the relative's", () => {
    const colin = merge(between).nodes.find((n) => n.treeId === 'g1')!;
    assert.deepEqual([colin.first, colin.sur, colin.state], ['Colin', 'Sullivan', 'Deceased']);
  });

  it('renames the Unknown card a board already has for them', () => {
    const before = merge(between).nodes.map((n) =>
      n.treeId === 'g1' ? { ...n, first: 'Unknown', sur: 'Luna', state: 'Sim' } : n,
    );
    const after = merge(between, before);
    const card = after.nodes.find((n) => n.treeId === 'g1')!;
    assert.deepEqual([card.first, card.sur, card.state], ['Colin', 'Sullivan', 'Deceased']);
    assert.equal(after.nodes.filter((n) => n.treeId === 'g1').length, 1);
  });

  it('names nobody when one link differs from the roster card', () => {
    // Married to Eleanor here, her son on the roster: not Colin.
    const other = merge([{ a: 'g1', b: '2', type: 'parent' }, { a: '1', b: 'g1', type: 'marriage' }]);
    assert.equal(other.nodes.find((n) => n.treeId === 'g1')!.first, 'Unknown');
  });
});

describe('isStarterBoard', () => {
  const roster = ['a', 'b', 'c', 'd'].map((id) => sim({ id, first: id, sur: 'X' }));

  it('is the roster, wherever its cards were dragged', () => {
    assert.ok(isStarterBoard(roster.map((n) => ({ ...n, ox: 500 })), roster));
  });

  it('is not once a save came in, or once most of the roster is gone', () => {
    assert.ok(!isStarterBoard([...roster, sim({ id: 's', first: 's', sur: 'Y', saveSimId: '1' })], roster));
    assert.ok(!isStarterBoard(roster.slice(0, 1), roster));
  });
});

describe('married sims under their own surname', () => {
  const worlds = [{ name: 'Willow Creek', color: '#4e79a7' }, ...world];
  const goth = (id: string, first: string, sur: string, extra: Partial<SimNode> = {}) =>
    sim({ id, first, sur, hh: 'Goth', ohh: 'Goth', gid: 'Willow Creek||Goth', ...extra });
  const roster = [
    goth('Bella Goth', 'Bella', 'Goth', { gender: 'Female' }),
    goth('Mortimer Goth', 'Mortimer', 'Goth'),
    goth('Cassandra Goth', 'Cassandra', 'Goth', { gender: 'Female', pack: 'Base Game' }),
    sim({ id: 'Caleb Vatore', first: 'Caleb', sur: 'Vatore', hh: 'Vatore', ohh: 'Vatore' }),
    sim({ id: 'Celeste Capp', first: 'Celeste', sur: 'Capp', gender: 'Non-Binary', hh: 'Capp', ohh: 'Capp' }),
    sim({ id: 'Tybalt Capp', first: 'Tybalt', sur: 'Capp', hh: 'Capp', ohh: 'Capp' }),
    sim({ id: 'Summer Holiday', first: 'Summer', sur: 'Holiday', gender: 'Female', hh: 'BFF', ohh: 'BFF' }),
  ];
  const rosterEdges: Edge[] = [
    { id: 'r1', a: 'Bella Goth', b: 'Cassandra Goth', type: 'parent', source: 'seed' },
    { id: 'r2', a: 'Mortimer Goth', b: 'Cassandra Goth', type: 'parent', source: 'seed' },
    { id: 'r3', a: 'Tybalt Capp', b: 'Celeste Capp', type: 'parent', source: 'seed' },
  ];
  const saveSim = (id: string, first: string, last: string, household: string, gender = 'Female') => ({
    saveSimId: id, householdId: `h-${household}`, first, last, household, age: 'Young Adult', gender, world: 'Willow Creek',
  });
  /** Cassandra married Caleb, and the game gave her his surname. */
  const married: ParsedSave = {
    sims: [
      saveSim('1', 'Cassandra', 'Vatore', 'Goth'),
      saveSim('2', 'Caleb', 'Vatore', 'Goth', 'Male'),
      saveSim('3', 'Bella', 'Goth', 'Goth'),
      saveSim('4', 'Mortimer', 'Goth', 'Goth', 'Male'),
    ],
    rels: [
      { a: '1', b: '2', type: 'marriage' },
      { a: '3', b: '4', type: 'marriage' },
      { a: '3', b: '1', type: 'parent' },
      { a: '4', b: '1', type: 'parent' },
    ],
  };
  const merge = (parsed: ParsedSave, nodes: SimNode[] = []) =>
    mergeSaveIntoBoard({
      nodes,
      edges: [],
      groups: [],
      worlds,
      parsed,
      seedNameKeys: seedNameKeysFromNodes(roster),
      packReference: roster,
      rosterEdges,
      now: 'x',
      nextEdgeId: (() => {
        let n = 0;
        return () => `v${n++}`;
      })(),
    });
  const card = (r: ReturnType<typeof merge>, saveSimId: string) =>
    r.nodes.find((n) => n.saveSimId === saveSimId)!;

  it("keeps the card's surname when the game gives a sim their spouse's", () => {
    const r = merge(married, [goth('c', 'Cassandra', 'Goth', { saveSimId: '1', gender: 'Female' })]);
    const cassandra = card(r, '1');
    assert.deepEqual([cassandra.sur, cassandra.marriedSur], ['Goth', 'Vatore']);
    const caleb = card(r, '2');
    assert.deepEqual([caleb.sur, caleb.marriedSur], ['Vatore', undefined]);
    assert.equal(card(r, '3').marriedSur, undefined);
    assert.deepEqual(r.summary.ownSurnames, [{ name: 'Cassandra Goth', married: 'Vatore' }]);
  });

  it('knows a renamed premade from the roster when the card already has the married name', () => {
    const r = merge(married, [
      goth('c', 'Cassandra', 'Vatore', { saveSimId: '1', gender: 'Female', fromSave: true }),
    ]);
    const cassandra = card(r, '1');
    assert.deepEqual([cassandra.sur, cassandra.marriedSur, cassandra.fromSave], ['Goth', 'Vatore', undefined]);
  });

  it('gives a renamed premade its roster card on Replace, by a parent when the household moved', () => {
    const r = merge({
      sims: [
        saveSim('5', 'Celeste', 'Alto', 'Alto'),
        saveSim('6', 'Enzo', 'Alto', 'Alto', 'Male'),
        saveSim('7', 'Tybalt', 'Capp', 'Capp', 'Male'),
      ],
      rels: [
        { a: '5', b: '6', type: 'marriage' },
        { a: '7', b: '5', type: 'parent' },
      ],
    });
    const celeste = card(r, '5');
    assert.deepEqual([celeste.sur, celeste.marriedSur, !!celeste.fromSave], ['Capp', 'Alto', false]);
  });

  it('takes no roster card that only shares a first name', () => {
    const r = merge({
      sims: [saveSim('8', 'Summer', 'Smith', 'Smith'), saveSim('9', 'John', 'Smith', 'Smith', 'Male')],
      rels: [{ a: '8', b: '9', type: 'marriage' }],
    });
    assert.deepEqual([card(r, '8').sur, card(r, '8').marriedSur], ['Smith', undefined]);
  });

  it('keeps the married name once the player typed it on the card', () => {
    const typed = goth('c', 'Cassandra', 'Vatore', { saveSimId: '1', gender: 'Female', marriedSur: 'Vatore' });
    const cassandra = card(merge(married, [typed]), '1');
    assert.deepEqual([cassandra.sur, cassandra.marriedSur], ['Vatore', 'Vatore']);
  });

  it('drops the married name when the game gives their own back', () => {
    const divorced: ParsedSave = {
      ...married,
      sims: married.sims.map((s) => (s.saveSimId === '1' ? { ...s, last: 'Goth' } : s)),
      rels: married.rels.map((r) => (r.a === '1' && r.b === '2' ? { ...r, type: 'divorced' as const } : r)),
    };
    const before = goth('c', 'Cassandra', 'Goth', { saveSimId: '1', gender: 'Female', marriedSur: 'Vatore' });
    const cassandra = card(merge(divorced, [before]), '1');
    assert.deepEqual([cassandra.sur, cassandra.marriedSur], ['Goth', undefined]);
  });

  it('drops the from-save mark once the game calls a premade by its own name again', () => {
    const fixedInCas: ParsedSave = {
      ...married,
      sims: married.sims.map((s) => (s.saveSimId === '1' ? { ...s, last: 'Goth' } : s)),
    };
    const before = goth('c', 'Cassandra', 'Vatore', { saveSimId: '1', gender: 'Female', fromSave: true });
    const cassandra = card(merge(fixedInCas, [before]), '1');
    assert.deepEqual([cassandra.sur, cassandra.marriedSur, cassandra.fromSave], ['Goth', undefined, undefined]);
  });

  it('settles on the same names when the same save comes in again', () => {
    const once = merge(married, [goth('c', 'Cassandra', 'Vatore', { saveSimId: '1', gender: 'Female', fromSave: true })]);
    const twice = merge(married, once.nodes);
    assert.deepEqual(
      twice.nodes.map((n) => [n.first, n.sur, n.marriedSur ?? '']),
      once.nodes.map((n) => [n.first, n.sur, n.marriedSur ?? '']),
    );
  });
});

describe('dynasty marks from the save', () => {
  const worlds = [{ name: 'Willow Creek', color: '#4e79a7' }, ...world];
  const goth = (id: string, first: string, extra: Partial<SimNode> = {}) =>
    sim({ id, first, sur: 'Goth', hh: 'Goth', ohh: 'Goth', gid: 'Willow Creek||Goth', ...extra });
  const roster = [goth('Bella Goth', 'Bella'), goth('Mortimer Goth', 'Mortimer'), goth('Cassandra Goth', 'Cassandra')];
  const saveSim = (id: string, first: string, extra: Partial<ParsedSave['sims'][number]> = {}) => ({
    saveSimId: id,
    householdId: 'h1',
    first,
    last: 'Goth',
    household: 'Goth',
    age: 'Adult',
    gender: 'Female',
    world: 'Willow Creek',
    ...extra,
  });
  const merge = (parsed: ParsedSave, nodes: SimNode[]) =>
    mergeSaveIntoBoard({
      nodes,
      edges: [],
      groups: [],
      worlds,
      parsed,
      seedNameKeys: seedNameKeysFromNodes(roster),
      packReference: roster,
      now: 'x',
      nextEdgeId: (() => {
        let n = 0;
        return () => `v${n++}`;
      })(),
    });
  const marks = (r: ReturnType<typeof merge>) =>
    Object.fromEntries(r.nodes.map((n) => [n.first, [n.dynasty ?? '', n.dynastyRole ?? '']]));

  it("puts the game's head, heir and outcast on matched and new cards", () => {
    const r = merge(
      {
        sims: [
          saveSim('1', 'Mortimer', { dynasty: 'Goth', dynastyRole: 'head' }),
          saveSim('2', 'Cassandra', { dynasty: 'Goth', dynastyRole: 'heir' }),
          saveSim('3', 'Bella', { dynasty: 'Goth' }),
          saveSim('4', 'Alexander', { dynasty: 'Goth', dynastyRole: 'outcast' }),
        ],
        rels: [],
        dynasties: true,
      },
      roster.map((n) => ({ ...n })),
    );
    assert.deepEqual(marks(r), {
      Mortimer: ['Goth', 'head'],
      Cassandra: ['Goth', 'heir'],
      Bella: ['Goth', ''],
      Alexander: ['Goth', 'outcast'],
    });
  });

  it('takes a role the game no longer gives away, when the save keeps dynasties', () => {
    const board = [
      goth('m', 'Mortimer', { saveSimId: '1', dynasty: 'Goth', dynastyRole: 'head' }),
      goth('c', 'Cassandra', { saveSimId: '2', dynasty: 'Goth', dynastyRole: 'heir' }),
    ];
    const r = merge(
      {
        sims: [saveSim('1', 'Mortimer'), saveSim('2', 'Cassandra', { dynasty: 'Goth', dynastyRole: 'head' })],
        rels: [],
        dynasties: true,
      },
      board,
    );
    assert.deepEqual(marks(r), { Mortimer: ['', ''], Cassandra: ['Goth', 'head'] });
  });

  it('leaves the marks alone when the save keeps no dynasties', () => {
    const board = [goth('c', 'Cassandra', { saveSimId: '2', dynasty: 'Goth', dynastyRole: 'heir' })];
    const r = merge({ sims: [saveSim('2', 'Cassandra')], rels: [] }, board);
    assert.deepEqual(marks(r), { Cassandra: ['Goth', 'heir'] });
  });
});

describe('ages, game options and first heads from the save', () => {
  const DAY = 2_160_000;
  const worlds = [{ name: 'Willow Creek', color: '#4e79a7' }, ...world];
  const goth = (id: string, first: string, extra: Partial<SimNode> = {}) =>
    sim({ id, first, sur: 'Goth', hh: 'Goth', ohh: 'Goth', gid: 'Willow Creek||Goth', ...extra });
  const roster = [goth('Bella Goth', 'Bella'), goth('Mortimer Goth', 'Mortimer'), goth('Cassandra Goth', 'Cassandra')];
  const saveSim = (id: string, first: string, extra: Partial<ParsedSave['sims'][number]> = {}) => ({
    saveSimId: id,
    householdId: 'h1',
    first,
    last: 'Goth',
    household: 'Goth',
    age: 'Adult',
    gender: 'Female',
    world: 'Willow Creek',
    ...extra,
  });
  const game = (extra: Partial<NonNullable<ParsedSave['game']>> = {}): NonNullable<ParsedSave['game']> => ({
    clock: 11_135_049,
    lifespan: 'Short',
    seasonDays: 7,
    playedAging: 'Active',
    unplayedAging: false,
    activeHouseholdId: 'h2',
    playedHouseholds: ['h1', 'h2'],
    ...extra,
  });
  const merge = (parsed: ParsedSave, nodes: SimNode[], prev: SaveGameInfo | null = null) =>
    mergeSaveIntoBoard({
      nodes,
      edges: [],
      groups: [],
      worlds,
      parsed,
      seedNameKeys: seedNameKeysFromNodes(roster),
      packReference: roster,
      game: prev,
      fileName: 'Slot_00000006.save',
      now: 'now',
      nextEdgeId: (() => {
        let n = 0;
        return () => `v${n++}`;
      })(),
    });
  const of = (r: ReturnType<typeof merge>, first: string) => r.nodes.find((n) => n.first === first)!;

  it('stores birth, days into the stage in Normal days, and why a sim is not aging', () => {
    const r = merge(
      {
        sims: [
          saveSim('1', 'Cassandra', { age: 'Teen', aliveTicks: Math.round(31.82 * DAY), stageDays: 5.45 }),
          saveSim('2', 'Kelvin', { last: 'Bheeda', household: 'Bheeda', householdId: 'h2', age: 'Infant', newborn: true, bornInPlay: true, aliveTicks: DAY, stageDays: 0.2 }),
          saveSim('3', 'Rex', { species: 'Dog', aliveTicks: DAY, stageDays: 1 }),
          saveSim('4', 'Townie', { householdId: 'h9', aliveTicks: DAY, stageDays: 1 }),
        ],
        rels: [],
        game: game(),
      },
      roster.map((n) => ({ ...n })),
    );
    const cass = of(r, 'Cassandra').life!;
    assert.equal(cass.born, 11_135_049 - Math.round(31.82 * DAY));
    assert.equal(cass.stageDays, 10.9);
    assert.deepEqual([cass.stage, cass.at, cass.frozen], ['Teen', 11_135_049, 'inactive']);
    const kelvin = of(r, 'Kelvin').life!;
    assert.deepEqual([kelvin.newborn, kelvin.inPlay, kelvin.frozen, kelvin.stageDays], [true, true, undefined, 0.4]);
    assert.equal(of(r, 'Rex').life, undefined);
    assert.equal(of(r, 'Townie').life?.frozen, 'unplayed');
  });

  it('records the options, the active household and the file, and says what changed', () => {
    const parsed: ParsedSave = {
      sims: [saveSim('2', 'Kelvin', { last: 'Bheeda', household: 'Bheeda', householdId: 'h2' })],
      rels: [],
      game: game(),
    };
    const first = merge(parsed, []);
    assert.deepEqual(first.saveGame, {
      fileName: 'Slot_00000006.save',
      importedAt: 'now',
      clock: 11_135_049,
      lifespan: 'Short',
      seasonDays: 7,
      playedAging: 'Active',
      unplayedAging: false,
      activeHousehold: 'Bheeda',
    });
    assert.deepEqual(first.summary.gameChanges, []);
    const everyone = merge({ ...parsed, game: game({ lifespan: 'Long', playedAging: 'Yes', unplayedAging: true }) }, [], first.saveGame);
    assert.deepEqual(everyone.summary.gameChanges, [
      'Sim Lifespan: Short → Long',
      'Auto Age (Played Households): Only the active household → Yes',
      'Auto Age (Unplayed Households): Off → On',
    ]);
    assert.equal(everyone.saveGame?.allAgingSince, 11_135_049);
    const later = merge({ ...parsed, game: game({ clock: 20_000_000, playedAging: 'Yes', unplayedAging: true }) }, [], everyone.saveGame);
    assert.equal(later.saveGame?.allAgingSince, 11_135_049);
    const stopped = merge({ ...parsed, game: game({ clock: 30_000_000 }) }, [], later.saveGame);
    assert.equal(stopped.saveGame?.allAgingSince, undefined);
  });

  it('keeps the board’s save details when the save has no clock', () => {
    const prev: SaveGameInfo = { importedAt: 'before', clock: 5, lifespan: 'Normal' };
    const r = merge({ sims: [saveSim('1', 'Bella')], rels: [] }, [], prev);
    assert.equal(r.saveGame, prev);
  });

  it('remembers the first head it sees, and keeps them when the heir succeeds', () => {
    const first = merge(
      {
        sims: [
          saveSim('1', 'Mortimer', { dynasty: 'Goth', dynastyId: '9', dynastyRole: 'head' }),
          saveSim('2', 'Cassandra', { dynasty: 'Goth', dynastyId: '9', dynastyRole: 'heir' }),
        ],
        rels: [],
        dynasties: true,
      },
      roster.map((n) => ({ ...n })),
    );
    assert.equal(of(first, 'Mortimer').firstHeadOf, 'id:9');
    assert.equal(of(first, 'Cassandra').firstHeadOf, undefined);
    // Mortimer has left the dynasty; Cassandra heads it now.
    const next = merge(
      {
        sims: [saveSim('1', 'Mortimer'), saveSim('2', 'Cassandra', { dynasty: 'Goth', dynastyId: '9', dynastyRole: 'head' })],
        rels: [],
        dynasties: true,
      },
      first.nodes,
    );
    assert.deepEqual([of(next, 'Mortimer').firstHeadOf, of(next, 'Mortimer').dynasty], ['id:9', undefined]);
    assert.equal(of(next, 'Cassandra').firstHeadOf, undefined);
  });
});
