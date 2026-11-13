import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { arrivalText, dynastyText, homeText, recapHasNews, recapTimeText, relationshipText, saveRecap } from './saveRecap.ts';
import type { Edge, PairStatus, SimNode } from '../types/whiteboard.ts';

const sim = (id: string, first: string, extra: Partial<SimNode> = {}): SimNode =>
  ({
    id, first, sur: 'Capp', gid: 'Ondarion||Capp', hh: 'Capp', world: 'Ondarion', nb: '-', age: 'Adult', state: 'Sim',
    gender: 'Female', color: '#999', townie: false, oworld: 'Ondarion', onb: '-', ohh: 'Capp', oplay: 'Resident', pack: '',
    x: 0, y: 0, w: 0, h: 0, saveSimId: 's' + id, ...extra,
  }) as SimNode;
const day = 2_160_000;

describe('previously on', () => {
  const tybalt = sim('t', 'Tybalt');
  const beatrice = sim('b', 'Beatrice', { age: 'Young Adult' });
  const planned = sim('k', '', { added: true, saveSimId: undefined, age: 'Unknown' });
  const juliette = sim('j', 'Juliette', { gid: 'Ondarion||Monty', hh: 'Monty' });
  const before = {
    nodes: [tybalt, beatrice, planned, juliette],
    edges: [
      { id: 'p', a: 't', b: 'k', type: 'parent', source: 'planned' },
      { id: 'w', a: 'b', b: 'j', type: 'marriage', source: 'planned' },
    ] as Edge[],
    saveGame: { importedAt: 'x', clock: 10 * day, season: 'Spring' as const },
  };
  const after = {
    nodes: [
      { ...tybalt, age: 'Elder' },
      { ...beatrice, gid: 'Ondarion||Monty', hh: 'Monty' },
      { ...planned, first: 'Hero', saveSimId: 's99', age: 'Newborn' },
      juliette,
      sim('n', 'Townie', { gid: 'Ondarion||Town', hh: 'Town' }),
    ],
    edges: [
      { id: 'p', a: 't', b: 'k', type: 'parent', source: 'save' },
      { id: 'w', a: 'b', b: 'j', type: 'marriage', source: 'save', wasPlanned: true },
    ] as Edge[],
    saveGame: { importedAt: 'y', clock: 13 * day, season: 'Summer' as const },
  };

  it('tells what happened in the game, as a story', () => {
    const r = saveRecap(before, after);
    assert.equal(recapTimeText(r.days), '3 days of play');
    assert.deepEqual(r.seasons, { from: 'Spring', to: 'Summer' });
    assert.deepEqual(r.born.map((b) => [b.name, b.parents, b.planned]), [['Hero Capp', ['Tybalt Capp'], true]]);
    assert.deepEqual(r.together.map((t) => [t.a.name, t.b.name, t.type, t.planned]), [['Beatrice Capp', 'Juliette Capp', 'marriage', true]]);
    assert.deepEqual(r.moved.map((m) => [m.name, m.from, m.to]), [['Beatrice Capp', 'the Capp household', 'the Monty household']]);
    assert.deepEqual(r.grew.map((g) => [g.name, g.from, g.to]), [['Tybalt Capp', 'Adult', 'Elder']]);
    assert.equal(r.met, 1);
    assert.equal(r.plansDone, 2);
    assert.ok(recapHasNews(r));
  });

  it('celebrates the planned birth and wedding the save confirmed, and no one else', () => {
    assert.deepEqual(saveRecap(before, after).celebrate.sort(), ['b', 'j', 'k']);
  });

  it('tells which dynasties gained or lost prestige', () => {
    const capp = (n: SimNode) => ({ ...n, dynasty: 'Capp', dynastyId: '7' });
    const r = saveRecap(
      { ...before, nodes: before.nodes.map(capp), saveGame: { ...before.saveGame, prestige: { 'id:7': 350, 'id:9': 75 } } },
      { ...after, nodes: after.nodes.map(capp), saveGame: { ...after.saveGame, prestige: { 'id:7': 625, 'id:9': 75 } } },
    );
    assert.deepEqual(r.prestige, [{ key: 'id:7', name: 'Capp', from: 350, to: 625 }]);
  });

  it('has no news when nothing changed', () => {
    const r = saveRecap(after, after);
    assert.equal(recapHasNews(r), false);
    assert.equal(recapTimeText(r.days), null);
  });
});

describe('everything else a save changed, planned or not', () => {
  const thebe = { dynasty: 'Thebe', dynastyId: '7' };
  const cordelia = sim('c5', 'Cordelia', { sur: 'Thebe', ...thebe, dynastyRole: 'head' });
  const thiago = sim('th', 'Thiago', { sur: 'Abrantes', ...thebe, dynastyRole: 'heir' });
  const baby = sim('c6', 'Cordelia VI', { sur: 'Thebe', added: true, saveSimId: undefined, age: 'Unknown', ...thebe, dynastyRole: 'heir', dynastyPlan: 'member' });
  const miko = sim('m', 'Miko', { sur: 'Ojo', gid: 'Ondarion||Ojo', hh: 'Ojo' });
  const darling = sim('d', 'Darling', { sur: 'Walsh', gid: 'Ondarion||Walsh', hh: 'Walsh', age: 'Child' });
  const kai = sim('k', 'Kai', { sur: 'Ojo', gid: 'Ondarion||Ojo', hh: 'Ojo', age: 'Teen' });
  const before = { nodes: [cordelia, thiago, baby, miko, darling, kai], edges: [] as Edge[], saveGame: { importedAt: 'x', clock: day } };
  const after = {
    nodes: [
      cordelia,
      { ...thiago, dynastyRole: undefined },
      { ...baby, added: undefined, saveSimId: 's-c6', age: 'Newborn', dynastyPlan: undefined },
      { ...miko, state: 'Vampire', marriedSur: 'Capp' },
      { ...darling, gid: 'Ondarion||Ojo', hh: 'Ojo' },
      kai,
    ],
    edges: [
      { id: 'a', a: 'm', b: 'd', type: 'parent', source: 'save', adopted: true },
      { id: 'f', a: 'm', b: 'k', type: 'parent', source: 'save', secret: true },
    ] as Edge[],
    saveGame: { importedAt: 'y', clock: 2 * day },
  };
  const r = saveRecap(before, after);

  it('tells a new heir in place of the old one, as planned, in both their stories', () => {
    const heir = r.dynasty!.find((d) => d.kind === 'heir')!;
    assert.deepEqual([heir.sim.id, heir.replaced?.id, heir.planned], ['c6', 'th', true]);
    // One line for both: no separate "no longer heir" for Thiago.
    assert.equal(r.dynasty!.filter((d) => d.kind === 'noLongerHeir').length, 0);
  });

  it('tells an heir dropped with no one in their place', () => {
    const r2 = saveRecap(before, { ...after, nodes: after.nodes.map((n) => (n.id === 'c6' ? { ...n, dynastyRole: undefined } : n)) });
    const gone = r2.dynasty!.find((d) => d.kind === 'noLongerHeir')!;
    assert.equal(gone.sim.id, 'th');
  });

  it('tells an unplanned adoption, a parent the tree now shows, a new life state and a new name', () => {
    assert.deepEqual(
      r.family!.map((f) => (f.kind === 'adopted' ? ['adopted', f.parents.map((p) => p.id), f.child.id, !!f.planned] : ['found', f.parent.id, f.child.id, !!f.secret])),
      [
        ['adopted', ['m'], 'd', false],
        ['found', 'm', 'k', true],
      ],
    );
    assert.deepEqual(
      r.life!.map((l) => [l.kind, l.sim.id, l.to]),
      [
        ['state', 'm', 'Vampire'],
        ['name', 'm', 'Capp'],
      ],
    );
  });

  it('tells a household moving home together as one move', () => {
    const r3 = saveRecap(before, {
      ...before,
      nodes: before.nodes.map((n) => (n.hh === 'Ojo' ? { ...n, world: 'Willow Creek', gid: 'Willow Creek||Ojo', lot: 'Ophelia Villa' } : n)),
      saveGame: after.saveGame,
    });
    assert.deepEqual(r3.homes, [{ hh: 'Ojo', ids: ['m', 'k'], to: 'Ophelia Villa in Willow Creek' }]);
    assert.equal(r3.moved.length, 0);
  });
});

describe('what the first round missed', () => {
  const marilla = sim('ma', 'Marilla', { sur: 'Cuthbert', gid: 'Chestnut Ridge||Green Gables', hh: 'Green Gables', world: 'Chestnut Ridge' });
  const matthew = sim('mt', 'Matthew', { sur: 'Cuthbert', gid: 'Chestnut Ridge||Green Gables', hh: 'Green Gables', world: 'Chestnut Ridge', gender: 'Male' });
  const anne = sim('an', 'Anne-Shirley', { sur: 'Cuthbert', gid: 'Chestnut Ridge||Green Gables', hh: 'Green Gables', world: 'Chestnut Ridge', age: 'Teen' });
  const cuthbert = { dynasty: 'Cuthbert', dynastyId: '9' };
  const horse = (id: string, age: string, extra: Partial<SimNode> = {}) =>
    sim(id, 'Hurricane', { species: 'Horse', state: 'Pet', age, gid: 'Chestnut Ridge||Green Gables', hh: 'Green Gables', world: 'Chestnut Ridge', ...extra });
  const before = {
    nodes: [marilla, matthew, anne],
    edges: [] as Edge[],
    saveGame: { importedAt: 'x', clock: day },
    pairStatus: [{ a: 'ma', b: 'mt', tags: ['friends'] }] as PairStatus[],
  };
  const after = (extra: SimNode[] = [], edges: Edge[] = [], pairStatus: PairStatus[] = before.pairStatus) => ({
    nodes: [
      { ...marilla, ...cuthbert, dynastyRole: 'head' as const },
      { ...matthew, ...cuthbert },
      { ...anne, ...cuthbert, dynastyRole: 'heir' as const },
      ...extra,
    ],
    edges,
    saveGame: { importedAt: 'y', clock: 2 * day, lastPlayedGid: 'Chestnut Ridge||Green Gables' },
    pairStatus,
  });

  it('names everyone in a dynasty founded: one line for all their stories', () => {
    const r = saveRecap(before, after());
    assert.deepEqual(r.dynasty!.map(dynastyText), ['Marilla Cuthbert founded the Cuthbert dynasty with Matthew Cuthbert, and Anne-Shirley Cuthbert as heir']);
    assert.deepEqual(r.played, { hh: 'Green Gables', ids: ['ma', 'mt', 'an'] });
  });

  it('names a pet or sim who joined a household, at any age, in everyone there’s story', () => {
    for (const [age, as] of [
      ['Child', 'a foal'],
      ['Adult', 'a horse'],
      ['Elder', 'an elder horse'],
    ] as const) {
      const r = saveRecap(before, after([horse('h', age)]));
      assert.deepEqual(r.arrivals!.map(arrivalText), [`Hurricane Capp, ${as}, joined the Green Gables household`]);
      assert.deepEqual(r.arrivals![0]!.ids, ['ma', 'mt', 'an']);
      assert.equal(r.met, 0);
    }
  });

  it('counts a foal born to parents on the board as born', () => {
    const mare = horse('m', 'Adult', { first: 'Mare' });
    const r = saveRecap(
      { ...before, nodes: [...before.nodes, mare] },
      after([mare, horse('f', 'Child')], [{ id: 'p', a: 'm', b: 'f', type: 'parent', source: 'save' }]),
    );
    assert.deepEqual(r.born.map((b) => b.id), ['f']);
    assert.equal(r.arrivals, undefined);
  });

  it('tells relationships taking a step, up or down, and secrets coming out', () => {
    const r = saveRecap(
      { ...before, edges: [{ id: 's', a: 'ma', b: 'an', type: 'parent', source: 'save', secret: true }] },
      after(
        [],
        [{ id: 's', a: 'ma', b: 'an', type: 'parent', source: 'save' }],
        [
          { a: 'ma', b: 'mt', tags: ['goodFriends'] },
          { a: 'an', b: 'mt', tags: ['enemies', 'disliked'] },
          { a: 'an', b: 'ma', tags: ['engaged'] },
        ] as PairStatus[],
      ),
    );
    assert.deepEqual(r.relationships!.map(relationshipText), [
      'Marilla Cuthbert and Matthew Cuthbert became good friends',
      'Anne-Shirley Cuthbert and Matthew Cuthbert started to dislike each other',
      'Anne-Shirley Cuthbert and Matthew Cuthbert became enemies',
      'Anne-Shirley Cuthbert and Marilla Cuthbert got engaged',
      'Marilla Cuthbert is no longer a secret parent of Anne-Shirley Cuthbert',
    ]);
  });

  it('tells a household renamed in the game as one line', () => {
    const r = saveRecap(before, {
      ...before,
      nodes: before.nodes.map((n) => ({ ...n, gid: 'Chestnut Ridge||Cuthbert', hh: 'Cuthbert' })),
      saveGame: { importedAt: 'y', clock: 2 * day },
    });
    assert.deepEqual(r.homes!.map(homeText), ['The Green Gables household is now called the Cuthbert household']);
    assert.equal(r.moved.length, 0);
  });
});
