import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NOT_IN_WORLD } from './constants.ts';
import { dynastyWhat, familyWhat, simList, stageWord } from './simList.ts';
import type { SimNode, World } from '../types/whiteboard.ts';

const sim = (id: string, extra: Partial<SimNode>): SimNode =>
  ({ id, first: id, sur: 'X', age: 'Elder', gender: 'Male', state: 'Sim', pack: 'Base Game', x: 0, y: 0, w: 120, h: 60, ...extra }) as SimNode;

const worlds: World[] = [{ name: 'Willow Creek', color: '#000' }, { name: NOT_IN_WORLD, color: '#000' }, { name: 'Ondarion', color: '#000' }];

describe('a highlight as a list', () => {
  const nodes = [
    sim('Mortimer', { sur: 'Goth', gid: 'Willow Creek||Goth', hh: 'Goth', world: 'Willow Creek', x: 300, y: 100 }),
    sim('Alexander', { sur: 'Goth', gid: 'Willow Creek||Goth', hh: 'Goth', world: 'Willow Creek', x: 100, y: 200 }),
    sim('Bob', { sur: 'Pancakes', gid: 'Willow Creek||Pancakes', hh: 'Pancakes', world: 'Willow Creek', x: 900, y: 0 }),
    sim('Adekoya', { sur: 'Darong', gid: 'Ondarion||Darong', hh: 'Darong', world: 'Ondarion' }),
    sim('Drifter', { sur: 'Lee', gid: `${NOT_IN_WORLD}||Lee`, hh: 'Lee', world: NOT_IN_WORLD }),
    sim('Hidden', { sur: 'Goth', gid: 'Willow Creek||Goth', hh: 'Goth', world: 'Willow Creek', pack: 'Some Pack' }),
  ];
  const list = simList({
    nodes,
    pick: () => true,
    shown: (n) => n.pack === 'Base Game',
    worlds,
    what: (n) => n.age,
  });

  it('reads like the board: worlds in its order with Not in any world last, households and sims as they stand', () => {
    assert.deepEqual(list.worlds.map((w) => w.world), ['Willow Creek', 'Ondarion', NOT_IN_WORLD]);
    const wc = list.worlds[0]!;
    assert.equal(wc.count, 3);
    assert.deepEqual(wc.homes.map((h) => h.gid), ['Willow Creek||Pancakes', 'Willow Creek||Goth']);
    assert.deepEqual(wc.homes[1]!.rows.map((r) => r.sim.id), ['Mortimer', 'Alexander']);
    assert.equal(wc.homes[1]!.rows[0]!.what, 'Elder');
  });

  it('leaves out what the filters hide, and counts it', () => {
    assert.equal(list.count, 5);
    assert.equal(list.hidden, 1);
    assert.ok(!list.az.some((r) => r.sim.id === 'Hidden'));
  });

  it('A to Z by name', () => {
    assert.deepEqual(list.az.map((r) => r.sim.id), ['Adekoya', 'Alexander', 'Bob', 'Drifter', 'Mortimer']);
  });
});

describe('what a sim in a list is', () => {
  it('says their life stage, their role in a dynasty, or what they are to a sim', () => {
    const matthew = sim('Matthew', { sur: 'Cuthbert', dynasty: 'Cuthbert' });
    assert.equal(stageWord(matthew, false), 'Elder');
    assert.equal(stageWord(sim('Baby', { age: 'Infant' }), true), 'Not born yet');
    assert.equal(stageWord(sim('Hurricane', { species: 'Horse', age: 'Child' }), false), 'Horse');
    assert.equal(dynastyWhat({ ...matthew, dynastyRole: 'heir' }, false), 'Heir · Elder');
    assert.equal(dynastyWhat(matthew, false), 'Elder');
    assert.equal(familyWhat(matthew, 'aunt', false), 'Aunt · Elder');
    assert.equal(familyWhat(sim('Cordelia', { age: 'Unknown' }), 'parent', false), 'Parent');
  });
});
