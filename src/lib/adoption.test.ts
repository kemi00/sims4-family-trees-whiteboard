import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { adopteeSearch, whyCantAdopt, whyNotAdopt } from './adoption.ts';
import type { Edge, SimNode } from '../types/whiteboard.ts';

function sim(id: string, age: string, extra: Partial<SimNode> = {}): SimNode {
  return {
    id,
    first: id,
    sur: 'X',
    age,
    state: 'Sim',
    gender: 'Female',
    hh: 'X',
    world: 'Willow Creek',
    nb: '-',
    color: '#000',
    townie: false,
    oworld: 'Willow Creek',
    onb: '-',
    ohh: 'X',
    oplay: 'Resident',
    pack: 'Base Game',
    gid: 'Willow Creek||X',
    x: 0,
    y: 0,
    w: 0,
    h: 0,
    ...extra,
  };
}

describe('adoption', () => {
  const dani = sim('Dani', 'Young Adult');
  const nodes = [
    dani,
    sim('Tot', 'Toddler'),
    sim('Kid', 'Child'),
    sim('Teen', 'Teen'),
    sim('Peer', 'Young Adult'),
    sim('Elda', 'Elder'),
    sim('Sis', 'Child'),
    sim('Mum', 'Adult'),
    sim('Ex', 'Teen'),
    sim('Gone', 'Child', { state: 'Deceased' }),
    sim('Rex', 'Child', { species: 'Dog' }),
    sim('Bump', 'Infant'),
  ];
  const edges: Edge[] = [
    { id: 'p1', a: 'Mum', b: 'Dani', type: 'parent', source: 'save' },
    { id: 'p2', a: 'Mum', b: 'Sis', type: 'parent', source: 'save' },
    { id: 'p3', a: 'Mum', b: 'Teen', type: 'parent', source: 'save' },
    { id: 'c1', a: 'Dani', b: 'Ex', type: 'divorced', source: 'save' },
    { id: 'p4', a: 'Elda', b: 'Kid', type: 'parent', source: 'save' },
  ];
  const unborn = new Set(['Bump']);

  it('lets young adults and older adopt, not teens or pets', () => {
    assert.equal(whyCantAdopt(dani), null);
    assert.equal(whyCantAdopt(sim('Old', 'Elder')), null);
    assert.match(whyCantAdopt(sim('T', 'Teen')) ?? '', /young adults and older/);
    assert.match(whyCantAdopt(sim('P', 'Adult', { species: 'Cat' })) ?? '', /Pets/);
  });

  it('lists younger sims who are not family, youngest first', () => {
    const ids = adopteeSearch({ id: 'Dani', nodes, edges, unborn }).map((h) => h.id);
    // Sis and Teen are her siblings, Mum her mother, Ex her ex; Peer is no
    // younger, Elda older; Gone has died, Rex is a pet, Bump not born yet.
    assert.deepEqual(ids, ['Tot', 'Kid']);
  });

  it('counts the parents they have already', () => {
    const hits = adopteeSearch({ id: 'Dani', nodes, edges, unborn });
    assert.deepEqual(hits.map((h) => [h.id, h.parents]), [['Tot', 0], ['Kid', 1]]);
    assert.ok(hits.every((h) => h.candidate.gapDays < 0), 'all younger');
  });

  it('lets an elder adopt grown-ups', () => {
    const ids = adopteeSearch({ id: 'Elda', nodes, edges, unborn }).map((h) => h.id);
    assert.ok(ids.includes('Dani') && ids.includes('Mum') && ids.includes('Peer'), ids.join(','));
    assert.ok(!ids.includes('Kid'), 'her own child is family');
  });

  it('narrows by name', () => {
    assert.deepEqual(adopteeSearch({ id: 'Dani', nodes, edges, unborn, query: 'ki' }).map((h) => h.id), ['Kid']);
  });

  it('is no plan conflict for a child who has two parents already', async () => {
    const { planConflicts } = await import('./plan.ts');
    const kid = sim('Kid2', 'Child');
    const withParents: Edge[] = [
      { id: 'b1', a: 'Mum', b: 'Kid2', type: 'parent', source: 'save' },
      { id: 'b2', a: 'Elda', b: 'Kid2', type: 'parent', source: 'save' },
    ];
    const adopted: Edge = { id: 'u1', a: 'Dani', b: 'Kid2', type: 'parent', source: 'planned', adopted: true };
    assert.deepEqual(planConflicts([...nodes, kid], [...withParents, adopted]), []);
    // A third parent by birth is still one the game went against.
    const { adopted: _a, ...birth } = adopted;
    assert.equal(planConflicts([...nodes, kid], [...withParents, birth])[0]?.kind, 'otherParents');
  });

  it('says why one pair cannot be', () => {
    const by = Object.fromEntries(nodes.map((n) => [n.id, n]));
    assert.equal(whyNotAdopt(dani, by.Tot!, edges, unborn), null);
    assert.match(whyNotAdopt(dani, by.Sis!, edges, unborn) ?? '', /family already/);
    assert.match(whyNotAdopt(dani, by.Ex!, edges, unborn) ?? '', /family already/);
    assert.match(whyNotAdopt(dani, by.Peer!, edges, unborn) ?? '', /isn’t younger/);
    assert.match(whyNotAdopt(dani, by.Bump!, edges, unborn) ?? '', /isn’t born yet/);
  });
});
