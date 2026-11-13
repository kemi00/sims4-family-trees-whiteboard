import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NOT_IN_WORLD } from './constants.ts';
import { dynastyDetail, familyDetail, highlightDetail, homeLabel, simList } from './simList.ts';
import { unhousedGid } from './unhoused.ts';
import type { Group, SimNode, World } from '../types/whiteboard.ts';

const sim = (id: string, extra: Partial<SimNode>): SimNode =>
  ({ id, first: id, sur: 'X', age: 'Elder', gender: 'Male', state: 'Sim', pack: 'Base Game', x: 0, y: 0, w: 120, h: 60, ...extra }) as SimNode;

const worlds: World[] = [{ name: 'Willow Creek', color: '#000' }, { name: NOT_IN_WORLD, color: '#000' }, { name: 'Ondarion', color: '#000' }];
const groups = [
  { gid: 'Willow Creek||Goth', hh: 'Goth', world: 'Willow Creek' },
  { gid: 'Willow Creek||Pancakes', hh: 'Pancakes', world: 'Willow Creek' },
  { gid: 'Ondarion||Darong', hh: 'Darong', world: 'Ondarion' },
] as Group[];

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
    groups,
    worlds,
    detail: (n) => n.age,
  });

  it('reads like the board: worlds in its order with Not in any world last, households and sims as they stand', () => {
    assert.deepEqual(list.worlds.map((w) => w.world), ['Willow Creek', 'Ondarion', NOT_IN_WORLD]);
    const wc = list.worlds[0]!;
    assert.equal(wc.count, 3);
    assert.deepEqual(wc.homes.map((h) => h.label), ['Pancakes household', 'Goth household']);
    assert.deepEqual(wc.homes[1]!.rows.map((r) => r.name), ['Mortimer Goth', 'Alexander Goth']);
  });

  it('leaves out what the filters hide, and counts it', () => {
    assert.equal(list.count, 5);
    assert.equal(list.hidden, 1);
    assert.ok(!list.az.some((r) => r.id === 'Hidden'));
  });

  it('A to Z, with where each lives', () => {
    assert.deepEqual(list.az.map((r) => r.name), ['Adekoya Darong', 'Alexander Goth', 'Bob Pancakes', 'Drifter Lee', 'Mortimer Goth']);
    assert.equal(list.az[0]!.where, 'Darong household · Ondarion');
  });
});

describe('a list row', () => {
  it('names a household, the unhoused and a household called “The …”', () => {
    assert.equal(homeLabel('Willow Creek||Goth', 'Goth'), 'Goth household');
    assert.equal(homeLabel('Willow Creek||the Bests', 'the Bests'), 'The Bests household');
    assert.equal(homeLabel(unhousedGid(NOT_IN_WORLD), ''), 'Unhoused sims');
  });

  it('says what a sim is, gently when they passed away', () => {
    const matthew = sim('Matthew', { sur: 'Cuthbert', dynasty: 'Cuthbert' });
    assert.equal(highlightDetail(matthew, false), 'Elder · Cuthbert dynasty');
    assert.equal(highlightDetail(sim('Baby', { age: 'Infant' }), true), 'Not born yet');
    assert.equal(highlightDetail(sim('Hurricane', { species: 'Horse', age: 'Child' }), false), 'Horse');
    assert.equal(dynastyDetail({ ...matthew, dynastyRole: 'heir' }, false), 'Heir · Elder');
    assert.equal(dynastyDetail({ ...matthew, state: 'Deceased' }, false), 'Member · Elder · passed away');
    assert.equal(familyDetail(matthew, 'aunt', false), 'Aunt · Elder');
    assert.equal(familyDetail(sim('Cordelia', { age: 'Unknown', state: 'Deceased' }), 'parent', false), 'Parent · passed away');
  });
});
