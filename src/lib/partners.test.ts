import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Edge, SimNode, SimLife } from '../types/whiteboard.ts';
import { bloodRelatives, coupleLine, couplesNow, filterPartners, gapText, livesApart, moveInChoices, partnerCandidates, partnerCounts, partnerOptions, partnerSearch, partnerWorlds, kinship, cousinText, isFarKin, partnerTitleChoices, partnerMarkerCounts } from './partners.ts';
import { NOT_IN_WORLD } from './constants.ts';
import { unhousedGid } from './unhoused.ts';

const life = (stage: string, stageDays: number, extra: Partial<SimLife> = {}): SimLife => ({ born: 0, stage, stageDays, at: 0, ...extra });
const sim = (id: string, age: string, extra: Partial<SimNode> = {}): SimNode =>
  ({ id, first: id, sur: 'X', age, gender: 'Female', state: 'Sim', ...extra }) as SimNode;
const parent = (a: string, b: string): Edge => ({ id: `${a}>${b}`, a, b, type: 'parent' });

describe('blood relatives', () => {
  it('reaches siblings, cousins, aunts and children through shared ancestors', () => {
    const edges = [parent('Gran', 'Mum'), parent('Gran', 'Aunt'), parent('Mum', 'Me'), parent('Mum', 'Sis'), parent('Aunt', 'Cousin'), parent('Me', 'Kid'), parent('InLaw', 'Kid')];
    assert.deepEqual([...bloodRelatives('Me', edges)].sort(), ['Aunt', 'Cousin', 'Gran', 'Kid', 'Mum', 'Sis']);
  });
});

describe('possible partners', () => {
  const heir = sim('Heir', 'Teen', { gender: 'Male', life: life('Teen', 4) });
  const nodes = [
    heir,
    sim('Close', 'Teen', { life: life('Teen', 5) }),
    sim('Far', 'Young Adult', { life: life('Young Adult', 20), }),
    sim('Frozen', 'Teen', { life: life('Teen', 2, { frozen: 'inactive' }) }),
    sim('Guess', 'Teen'),
    sim('Sister', 'Teen', { life: life('Teen', 4) }),
    sim('Wed', 'Teen', { life: life('Teen', 4) }),
    sim('Gone', 'Teen', { state: 'Deceased', life: life('Teen', 4) }),
    sim('Rex', 'Adult', { species: 'Dog' }),
  ];
  const edges: Edge[] = [parent('Mum', 'Heir'), parent('Mum', 'Sister'), { id: 'm', a: 'Wed', b: 'Someone', type: 'marriage' }];

  it('ranks living, unmarried non-relatives by how close they are in life', () => {
    const list = partnerCandidates({ id: 'Heir', nodes, edges, game: { importedAt: '', clock: 0, lifespan: 'Short' } });
    // Far is a young adult: a teen is suggested teens only.
    assert.deepEqual(list.map((c) => c.id), ['Close', 'Frozen', 'Guess']);
    assert.deepEqual([list[0]!.gapDays, list[1]!.frozen, list[2]!.approx], [0.5, 'inactive', true]);
    assert.equal(gapText(list[0]!), 'same age');
    assert.equal(gapText({ ...list[1]!, gapDays: -1 }), '1 day younger');
    assert.equal(gapText({ ...list[0]!, gapDays: 18.4 }), '18 days older');
  });

  it('suggests grown-ups to grown-ups, and keeps teens, children and the littlest apart', () => {
    const all = [
      sim('YA', 'Young Adult'),
      sim('Ad', 'Adult'),
      sim('El', 'Elder'),
      sim('Tn', 'Teen'),
      sim('Ch', 'Child'),
      sim('Tod', 'Toddler'),
      sim('Inf', 'Infant'),
      sim('Unk', 'Unknown'),
    ];
    const pick = (id: string) => partnerCandidates({ id, nodes: all, edges: [] }).map((c) => c.id).sort();
    assert.deepEqual(pick('YA'), ['Ad', 'El']);
    assert.deepEqual(pick('El'), ['Ad', 'YA']);
    assert.deepEqual(pick('Tn'), []);
    assert.deepEqual(pick('Ch'), []);
    assert.deepEqual(pick('Inf'), ['Tod']);
    assert.deepEqual(pick('Tod'), ['Inf']);
    assert.deepEqual(pick('Unk'), []);
    assert.equal(partnerCandidates({ id: 'YA', nodes: all, edges: [], limit: 1 }).length, 1);
  });

  it('can leave out sims with no home: Not in any world, or a world’s Unhoused sims box', () => {
    const all = [
      sim('Me', 'Adult', { world: 'Oasis Springs', gid: 'Oasis Springs||Landgraab' }),
      sim('Housed', 'Adult', { world: 'Oasis Springs', gid: 'Oasis Springs||Goth' }),
      sim('Away', 'Adult', { world: 'Not in any world', gid: 'Not in any world||Capp' }),
      sim('Townie', 'Adult', { world: 'Oasis Springs', gid: 'Oasis Springs||Unhoused sims' }),
    ];
    const ids = (housedOnly: boolean) =>
      partnerCandidates({ id: 'Me', nodes: all, edges: [], housedOnly }).map((c) => c.id).sort();
    assert.deepEqual(ids(false), ['Away', 'Housed', 'Townie']);
    assert.deepEqual(ids(true), ['Housed']);
  });

  it('lists sims the same distance away by name, not shuffled by their ids', () => {
    // No ages from a save: every adult gets the same guess, so all tie.
    const all = [
      sim('me', 'Adult'),
      sim('s9', 'Adult', { first: 'Zoe', sur: 'Ng' }),
      sim('s1', 'Adult', { first: 'abe', sur: 'Moss' }),
      sim('s5', 'Adult', { first: 'Mia', sur: 'Ali' }),
    ];
    const list = partnerCandidates({ id: 'me', nodes: all, edges: [] });
    assert.deepEqual(list.map((c) => c.id), ['s1', 's5', 's9']);
  });

  it('narrows to one gender', () => {
    const list = partnerCandidates({ id: 'Heir', nodes: [...nodes, sim('Boy', 'Teen', { gender: 'Male', life: life('Teen', 4) })], edges, gender: 'Male' });
    assert.deepEqual(list.map((c) => c.id), ['Boy']);
  });
});

describe('the partner menu’s search', () => {
  const heir = sim('Heir', 'Young Adult', { gender: 'Male', sur: 'Munch', life: life('Young Adult', 4) });
  const nodes = [
    heir,
    sim('Mara', 'Young Adult', { sur: 'Summerdream', life: life('Young Adult', 5) }),
    sim('Mary', 'Teen', { sur: 'Mar', life: life('Teen', 5) }),
    sim('Martha', 'Young Adult', { sur: 'Munch', life: life('Young Adult', 6) }),
    sim('Marla', 'Adult', { sur: 'Wed', life: life('Adult', 6) }),
    sim('Marge', 'Adult', { sur: 'Gone', state: 'Deceased' }),
    sim('Marmalade', 'Adult', { species: 'Cat' }),
  ];
  const edges: Edge[] = [parent('Dad', 'Heir'), parent('Dad', 'Martha'), { id: 'm', a: 'Marla', b: 'Ex', type: 'marriage' }];
  const search = (query: string) => partnerSearch({ id: 'Heir', nodes, edges, query, game: { importedAt: '', clock: 0, lifespan: 'Short' } });

  it('suggests the closest in life with nothing typed', () => {
    assert.deepEqual(search('').map((h) => h.id), ['Mara']);
  });

  it('finds anyone living by name, suggested partners first, and marks relatives and the married', () => {
    const hits = search('mar');
    assert.deepEqual(hits.map((h) => h.id), ['Mara', 'Marla', 'Martha', 'Mary']);
    assert.ok(hits[0]!.candidate);
    assert.deepEqual(
      hits.slice(1).map((h) => [h.id, !!h.candidate, h.related, h.married]),
      [
        ['Marla', false, false, true],
        ['Martha', false, true, false],
        ['Mary', false, false, false],
      ],
    );
    assert.deepEqual(search('summer').map((h) => h.id), ['Mara']);
  });
});

describe('a couple who live apart', () => {
  const iris = sim('iris', 'Young Adult', { world: 'Brindleton Bay', gid: 'Brindleton Bay||Ladipo', hh: 'Ladipo' });
  const glen = sim('glen', 'Young Adult', { world: 'Willow Creek', gid: 'Willow Creek||Nhoam', hh: 'Nhoam' });
  const flora = sim('flora', 'Adult', { world: 'Brindleton Bay', gid: 'Brindleton Bay||Ladipo', hh: 'Ladipo' });
  const drifter = sim('drifter', 'Adult', { world: 'Willow Creek', gid: unhousedGid('Willow Creek') });
  const away = sim('away', 'Adult', { world: NOT_IN_WORLD, gid: `${NOT_IN_WORLD}||Away`, hh: 'Away' });

  it('are in different households, one at least with a home', () => {
    assert.equal(livesApart(iris, glen), true);
    assert.equal(livesApart(iris, flora), false);
    assert.equal(livesApart(drifter, glen), true);
    assert.equal(livesApart(drifter, away), false);
  });

  it('are offered the second sim moving in with the first, then the other way', () => {
    assert.deepEqual(
      moveInChoices(iris, glen).map((m) => `${m.mover.id}>${m.host.id}`),
      ['glen>iris', 'iris>glen'],
    );
  });

  it('only move into a home', () => {
    assert.deepEqual(
      moveInChoices(iris, drifter).map((m) => `${m.mover.id}>${m.host.id}`),
      ['drifter>iris'],
    );
    assert.deepEqual(
      moveInChoices(away, glen).map((m) => `${m.mover.id}>${m.host.id}`),
      ['away>glen'],
    );
    assert.deepEqual(moveInChoices(iris, flora), []);
  });
});

describe('the ♥ finder', () => {
  const ya = (id: string, extra: Partial<SimNode> = {}) => sim(id, 'Young Adult', { life: life('Young Adult', 3), world: 'Oasis Springs', gid: `Oasis Springs||${id}`, ...extra });
  const nodes = [
    ya('Johnny', { gender: 'Male' }),
    ya('Bob', { gender: 'Male', world: 'Willow Creek', gid: 'Willow Creek||Pancakes' }),
    ya('Eliza', { world: 'Willow Creek', gid: 'Willow Creek||Pancakes' }),
    ya('Cordelia', { world: 'Ondarion', gid: 'Ondarion||Thebe' }),
    ya('Fia', { world: NOT_IN_WORLD, gid: `${NOT_IN_WORLD}||Acosta` }),
    ya('Thiago', { gender: 'Male', world: 'Ondarion', gid: 'Ondarion||Thebe' }),
    ya('Dina'),
    ya('Siobhan', { world: 'Willow Creek', gid: 'Willow Creek||Fyres' }),
    ya('Sergio', { gender: 'Male', world: 'Willow Creek', gid: 'Willow Creek||Bro' }),
  ];
  const edges: Edge[] = [
    { id: 'm1', a: 'Bob', b: 'Eliza', type: 'marriage', source: 'save' },
    { id: 'm2', a: 'Cordelia', b: 'Thiago', type: 'marriage', source: 'save' },
    { id: 's', a: 'Cordelia', b: 'Fia', type: 'romance', source: 'save', secret: true },
    { id: 'r', a: 'Siobhan', b: 'Sergio', type: 'romance', source: 'planned' },
  ];

  it('lists married sims too, each saying who they are with, by name', () => {
    const list = partnerOptions({ id: 'Johnny', nodes, edges });
    assert.equal(list.length, 8);
    const couples = couplesNow(nodes, edges);
    const line = (id: string) => coupleLine(couples.get(id), (x) => x);
    assert.equal(line('Bob'), 'Married to Eliza');
    assert.equal(line('Cordelia'), 'Married to Thiago · secret romance with Fia');
    assert.equal(line('Fia'), 'Secret romance with Cordelia');
    assert.equal(line('Siobhan'), 'In a romance with Sergio (planned)');
    assert.equal(line('Dina'), '');
    assert.equal(coupleLine([
      { type: 'romance', secret: false, with: 'A', planned: false },
      { type: 'romance', secret: false, with: 'B', planned: false },
      { type: 'romance', secret: false, with: 'C', planned: false },
    ], (x) => x), 'In a romance with A, B and C');
  });

  it('filters by relationship and world, counting each menu with the other filters on', () => {
    const list = partnerOptions({ id: 'Johnny', nodes, edges });
    const any = { stage: 'Young Adult', gender: '', relation: '' as const, world: '', housedOnly: false };
    assert.deepEqual(Object.fromEntries(partnerCounts(list, any, 'relation')), { married: 4, romance: 3, single: 1 });
    assert.deepEqual(filterPartners(list, { ...any, relation: 'single' }).map((o) => o.id), ['Dina']);
    // No home hides Fia, and her romance with her.
    assert.deepEqual(Object.fromEntries(partnerCounts(list, { ...any, housedOnly: true }, 'relation')), { married: 4, romance: 2, single: 1 });
    const worlds = partnerCounts(list, any, 'world');
    assert.deepEqual(partnerWorlds(worlds, 'Oasis Springs', ''), ['Oasis Springs', 'Ondarion', 'Willow Creek', NOT_IN_WORLD]);
    assert.deepEqual(partnerWorlds(partnerCounts(list, { ...any, relation: 'single' }, 'world'), 'Oasis Springs', 'Ondarion'), ['Oasis Springs', 'Ondarion']);
  });
});

describe('kin and standing in the ♥ finder', () => {
  // Great-gran → Gran A, Gran B → Mum, Uncle → Me, Cousin2 → Kid (second cousin once removed to Me).
  const edges: Edge[] = [
    parent('GG', 'GranA'),
    parent('GG', 'GranB'),
    parent('GranA', 'Mum'),
    parent('GranB', 'Uncle'),
    parent('Mum', 'Me'),
    parent('Uncle', 'Cousin2'),
    parent('Cousin2', 'Kid'),
    parent('Mum', 'Sis'),
  ];

  it('names cousins by their closest shared ancestor', () => {
    assert.deepEqual(kinship('Me', 'Cousin2', edges), { up: 3, down: 3 });
    assert.equal(cousinText(kinship('Me', 'Cousin2', edges)!), 'second cousin');
    assert.equal(cousinText(kinship('Me', 'Kid', edges)!), 'second cousin once removed');
    assert.equal(isFarKin(kinship('Me', 'Sis', edges)!), false);
    assert.equal(isFarKin(kinship('Me', 'Uncle', edges)!), false);
    assert.equal(kinship('Me', 'Stranger', edges), undefined);
  });

  it('lets second cousins in only when asked, each named', () => {
    const nodes = ['Me', 'Cousin2', 'Sis', 'Uncle', 'Stranger'].map((id) => sim(id, 'Young Adult', { life: life('Young Adult', 4) }));
    const without = partnerCandidates({ id: 'Me', nodes, edges }).map((c) => c.id);
    assert.deepEqual(without, ['Stranger']);
    const withFar = partnerCandidates({ id: 'Me', nodes, edges, farKin: true });
    assert.deepEqual(withFar.map((c) => [c.id, c.kin]), [['Cousin2', 'second cousin'], ['Stranger', undefined]]);
  });

  it('counts no declared parent as blood', () => {
    const declared: Edge[] = [parent('Dad', 'A'), { ...parent('Dad', 'B'), declared: true }];
    assert.deepEqual([...bloodRelatives('A', declared)].sort(), ['Dad']);
    const nodes = ['A', 'B'].map((id) => sim(id, 'Young Adult', { life: life('Young Adult', 4) }));
    assert.deepEqual(partnerCandidates({ id: 'A', nodes, edges: declared }).map((c) => c.id), ['B']);
  });

  it('filters by title or rank and by marker, with counts', () => {
    const home = { gid: 'W||H', world: 'W' };
    const nodes = [
      sim('Me', 'Adult', { ...home, life: life('Adult', 4) }),
      sim('Duke', 'Adult', { ...home, life: life('Adult', 4), titles: [{ title: 'Duke', rank: 8, game: 'career' }] }),
      sim('Lady', 'Adult', { ...home, life: life('Adult', 4), titles: [{ title: 'Lady', rank: 9, game: 'birth' }], markers: ['wealthy'] }),
      sim('Poet', 'Adult', { ...home, life: life('Adult', 4), titles: [{ title: 'Laureate' }] }),
      sim('Plain', 'Adult', { ...home, life: life('Adult', 4), markers: ['wealthy', 'illegitimate'] }),
    ];
    const options = partnerOptions({ id: 'Me', nodes, edges: [] });
    const f = { stage: '', gender: '', relation: '' as const, world: '', housedOnly: false };
    assert.deepEqual(partnerTitleChoices(options, f), [
      { value: 'titled', count: 3 },
      { value: 'r9', count: 1 },
      { value: 'r8', count: 2 },
    ]);
    assert.deepEqual(filterPartners(options, { ...f, title: 'r8' }).map((o) => o.id).sort(), ['Duke', 'Lady']);
    assert.deepEqual([...partnerMarkerCounts(options, f)].sort(), [['illegitimate', 1], ['wealthy', 2]]);
    assert.deepEqual(filterPartners(options, { ...f, marker: 'wealthy', title: 'titled' }).map((o) => o.id), ['Lady']);
  });
});
