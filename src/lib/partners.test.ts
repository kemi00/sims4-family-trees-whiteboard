import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Edge, SimNode, SimLife } from '../types/whiteboard.ts';
import { bloodRelatives, gapText, partnerCandidates, partnerSearch } from './partners.ts';

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
