import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NOT_IN_WORLD } from './constants.ts';
import { boardStats, worldStats } from './worldStats.ts';
import type { SimNode } from '../types/whiteboard.ts';

const sim = (id: string, world: string, gid: string, extra: Partial<SimNode> = {}): SimNode =>
  ({ id, first: id, sur: 'X', age: 'Adult', gender: 'Female', state: 'Sim', world, gid, hh: gid, ...extra }) as SimNode;

describe('worlds in numbers', () => {
  const nodes = [
    sim('a', 'Willow Creek', 'WC||Goth'),
    sim('b', 'Willow Creek', 'WC||Goth', { age: 'Child', gender: 'Male' }),
    sim('c', 'Willow Creek', 'WC||Pancakes', { gender: 'Non-Binary' }),
    sim('dog', 'Willow Creek', 'WC||Pancakes', { species: 'Dog' }),
    sim('ghost', 'Willow Creek', 'WC||Goth', { state: 'Deceased' }),
    sim('plan', 'Willow Creek', 'WC||Goth', { added: true, age: 'Not born yet' }),
    sim('n', 'Newcrest', 'NC||Solo', { age: 'Elder' }),
    sim('o', NOT_IN_WORLD, 'OUT||Drifter'),
  ];
  const lots = new Map([['Willow Creek', [1, 2, 3]], ['Newcrest', [1]]]);

  it('counts each world’s sims by stage and gender, households, lots, pets, the dead and plans', () => {
    const list = worldStats(nodes, lots, ['Newcrest', 'Willow Creek']);
    assert.deepEqual(list.map((s) => s.world), ['Newcrest', 'Willow Creek', NOT_IN_WORLD]);
    const wc = list[1]!;
    assert.equal(wc.sims, 3);
    assert.deepEqual(wc.byStage, { Adult: 2, Child: 1 });
    assert.deepEqual(wc.byGender, { Female: 1, Male: 1, 'Non-Binary': 1 });
    assert.equal(wc.pets, 1);
    assert.equal(wc.remembered, 1);
    assert.equal(wc.households, 2);
    assert.equal(wc.freeLots, 3);
    assert.equal(list[2]!.freeLots, 0);
  });

  it('adds every world up for the whole board', () => {
    const all = boardStats(worldStats(nodes, lots));
    assert.equal(all.sims, 5);
    assert.equal(all.households, 4);
    assert.equal(all.freeLots, 4);
    assert.deepEqual(all.byStage, { Adult: 3, Child: 1, Elder: 1 });
  });
});
