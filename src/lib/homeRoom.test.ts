import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { homeRoom } from './homeRoom.ts';
import { lotNamed, lotsIn } from './places.ts';
import type { Edge, SimNode } from '../types/whiteboard.ts';

const sim = (id: string, extra: Partial<SimNode> = {}): SimNode =>
  ({ id, gid: 'Willow Creek||Goth', first: id, sur: 'Goth', age: 'Adult', state: 'Sim', saveSimId: 's' + id, ...extra }) as SimNode;

describe('a household’s room on its lot', () => {
  const ophelia = lotNamed('Willow Creek', 'Ophelia Villa')!; // 3 bedrooms
  const free = lotsIn('Willow Creek').filter((l) => l.name !== 'Ophelia Villa');
  const couple: Edge[] = [{ id: 'm', a: 'bella', b: 'mortimer', type: 'marriage' }];

  it('counts a couple as one bedroom and everyone else, planned babies too, as one each', () => {
    const nodes = [sim('bella'), sim('mortimer'), sim('cassandra'), sim('alexander')];
    const r = homeRoom({ gid: 'Willow Creek||Goth', nodes, edges: couple, lot: ophelia, free })!;
    assert.deepEqual([r.sims, r.planned, r.rooms, r.short, r.overCap], [4, 0, 3, false, false]);
    assert.deepEqual(r.fits, []);
  });

  it('says when planned babies outgrow the house, and which free lots would fit', () => {
    const nodes = [
      sim('bella'), sim('mortimer'), sim('cassandra'), sim('alexander'),
      sim('k1', { added: true, saveSimId: undefined, age: 'Unknown' }),
      sim('k2', { added: true, saveSimId: undefined, age: 'Unknown' }),
    ];
    const r = homeRoom({ gid: 'Willow Creek||Goth', nodes, edges: couple, lot: ophelia, free })!;
    assert.deepEqual([r.planned, r.rooms, r.short], [2, 5, true]);
    assert.ok(r.fits.length > 0);
    assert.ok(r.fits.filter((l) => l.kind === 'house').every((l) => l.beds >= 5));
  });

  it('knows the game’s limit of eight in a household, pets included', () => {
    const nodes = [...Array.from({ length: 7 }, (_, i) => sim(`s${i}`)), sim('dog', { species: 'Dog', state: 'Pet' })];
    assert.equal(homeRoom({ gid: 'Willow Creek||Goth', nodes, edges: [], lot: ophelia, free })!.overCap, false);
    const more = [...nodes, sim('cat', { species: 'Cat', state: 'Pet' })];
    assert.equal(homeRoom({ gid: 'Willow Creek||Goth', nodes: more, edges: [], lot: ophelia, free })!.overCap, true);
  });
});
