import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { findMatches } from './findMatches.ts';
import type { Group, SimNode, World } from '../types/whiteboard.ts';

const sim = (id: string, first: string, sur: string, gid: string, extra: Partial<SimNode> = {}): SimNode =>
  ({ id, first, sur, gid, world: gid.split('||')[0]!, hh: gid.split('||')[1]!, age: 'Adult', state: 'Sim', ...extra }) as SimNode;
const group = (gid: string): Group =>
  ({ gid, hh: gid.split('||')[1]!, world: gid.split('||')[0]!, nb: '', color: '#888', x: 0, y: 0, w: 0, h: 0 });
const world = (name: string): World => ({ name, color: '#888' }) as World;

const worlds = [world('Willow Creek'), world('Del Sol Valley'), world('Ondarion'), world('Batuu')];
const groups = [group('Willow Creek||Goth'), group('Del Sol Valley||Alto'), group('Ondarion||Alto'), group('Batuu||Rey')];
const visibleNodes = [
  sim('bella', 'Bella', 'Goth', 'Willow Creek||Goth'),
  sim('mortimer', 'Mortimer', 'Goth', 'Willow Creek||Goth'),
  sim('holly', 'Holly', 'Alto', 'Del Sol Valley||Alto'),
  sim('enzo', 'Enzo', 'Alto', 'Ondarion||Alto'),
  sim('cassandra', 'Cassandra', 'Goth', 'Willow Creek||Goth', { marriedSur: 'Vatore' }),
];
const board = { worlds, groups, visibleNodes };
const keys = (q: string) => findMatches(q, board).map((h) => `${h.kind}:${h.key}`);

describe('Find', () => {
  it('lists households before their sims: Goth', () => {
    assert.deepEqual(keys('goth'), ['household:Willow Creek||Goth', 'sim:bella', 'sim:mortimer', 'sim:cassandra']);
  });

  it('finds a world by part of its name', () => {
    assert.deepEqual(keys('  WILLOW '), ['world:Willow Creek']);
    assert.deepEqual(keys('ondar'), ['world:Ondarion']);
  });

  it('tells two households of one name apart by their world', () => {
    const hits = findMatches('alto', board).filter((h) => h.kind === 'household');
    assert.deepEqual(hits.map((h) => h.label), ['Alto, Del Sol Valley', 'Alto, Ondarion']);
  });

  it('puts worlds first, then households, then sims', () => {
    const order = findMatches('o', board).map((h) => h.kind);
    assert.deepEqual(order, [...order].sort((a, b) => ['world', 'household', 'sim'].indexOf(a) - ['world', 'household', 'sim'].indexOf(b)));
    assert.ok(order.includes('world') && order.includes('household') && order.includes('sim'));
  });

  it('still finds a sim by the game’s married name', () => {
    assert.deepEqual(keys('vatore'), ['sim:cassandra']);
  });

  it('leaves out a world or household with no sim on the board', () => {
    assert.deepEqual(keys('batuu'), []);
    assert.deepEqual(keys('rey'), []);
  });

  it('finds nothing for an empty query', () => {
    assert.deepEqual(findMatches('   ', board), []);
  });
});
