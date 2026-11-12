import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { findResults, type FindAction } from './findPalette.ts';
import type { DynastyName } from './generations.ts';
import type { Group, SimNode, World } from '../types/whiteboard.ts';

const sim = (id: string, first: string, sur: string, gid: string, extra: Partial<SimNode> = {}): SimNode =>
  ({ id, first, sur, gid, world: gid.split('||')[0]!, hh: gid.split('||')[1]!, nb: 'Garden District', age: 'Adult', state: 'Sim', ...extra }) as SimNode;
const group = (gid: string, nb = 'Garden District'): Group =>
  ({ gid, hh: gid.split('||')[1]!, world: gid.split('||')[0]!, nb, color: '#888', x: 0, y: 0, w: 0, h: 0 });
const world = (name: string): World => ({ name, color: '#888' }) as World;

const worlds = [world('Willow Creek'), world('Del Sol Valley'), world('Ondarion'), world('Batuu')];
const groups = [group('Willow Creek||Goth'), group('Del Sol Valley||Alto', 'The Pinnacles'), group('Ondarion||Alto', 'Spire'), group('Batuu||Rey', 'Outpost')];
const visibleNodes = [
  sim('bella', 'Bella', 'Goth', 'Willow Creek||Goth', { dynastyId: '7' }),
  sim('mortimer', 'Mortimer', 'Goth', 'Willow Creek||Goth', { dynastyId: '7' }),
  sim('holly', 'Holly', 'Alto', 'Del Sol Valley||Alto', { nb: 'The Pinnacles' }),
  sim('enzo', 'Enzo', 'Alto', 'Ondarion||Alto', { nb: 'Spire' }),
  sim('cassandra', 'Cassandra', 'Goth', 'Willow Creek||Goth', { marriedSur: 'Vatore' }),
  sim('cleo', 'Cleo', 'Goth', 'Willow Creek||Goth', { species: 'Cat', age: 'Child' }),
];
const dynastyNames = new Map<string, DynastyName>([['id:7', { name: 'Goth' }]]);
const board = { worlds, groups, visibleNodes, dynastyNames };
const actions: FindAction[] = [
  { id: 'upload-save', label: 'Upload a save', detail: 'Bring your game’s newest .save into the board', words: 'load import refresh' },
  { id: 'up-next', label: 'Open Up next', detail: 'A suggested order', words: 'play order household' },
];
const keys = (q: string) => findResults(q, board, actions).map((g) => `${g.title}: ${g.items.map((i) => i.key).join(', ')}`);

describe('search', () => {
  it('finds nothing for an empty query', () => {
    assert.deepEqual(findResults('  ', board, actions), []);
  });

  it('groups what a name finds, the kind with the best match first: the Goth household and dynasty before its sims', () => {
    assert.deepEqual(keys('goth'), [
      'Households: Willow Creek||Goth',
      'Dynasties: id:7',
      'Sims: bella, mortimer, cassandra, cleo',
    ]);
  });

  it('says where each one is', () => {
    const [sims] = findResults('bella', board);
    assert.deepEqual(sims!.items[0], { kind: 'sim', key: 'bella', label: 'Bella Goth', detail: 'Adult · Goth household · Willow Creek' });
    const cat = findResults('cleo', board)[0]!.items[0]!;
    assert.equal(cat.detail, 'Cat · Goth household · Willow Creek');
    const home = findResults('goth', board)[0]!.items[0]!;
    assert.deepEqual([home.label, home.detail], ['The Goth household', 'Garden District · Willow Creek · 4 sims']);
    assert.equal(findResults('goth', board)[1]!.items[0]!.detail, 'Dynasty · 2 sims');
  });

  it('tells two households of one name apart by where they are', () => {
    const [homes] = findResults('alto', board);
    assert.deepEqual(homes!.items.map((i) => i.detail), ['The Pinnacles · Del Sol Valley · 1 sim', 'Spire · Ondarion · 1 sim']);
  });

  it('finds worlds and neighbourhoods by part of their name', () => {
    assert.deepEqual(keys('willow'), ['Worlds: Willow Creek']);
    assert.deepEqual(keys('pinn'), ['Neighbourhoods: Del Sol Valley||The Pinnacles']);
    assert.equal(findResults('batuu', board).length, 0, 'a world with no sim on the board is left out');
  });

  it('still finds a sim by the game’s married name', () => {
    assert.deepEqual(keys('vatore'), ['Sims: cassandra']);
  });

  it('puts a name’s start before a word inside it, and the whole name first', () => {
    const sims = findResults('o', { ...board, visibleNodes: [...visibleNodes, sim('o', 'O', '', 'Willow Creek||Goth')] }).find((g) => g.title === 'Sims')!;
    assert.equal(sims.items[0]!.key, 'o');
  });

  it('looks inside a word only from three letters', () => {
    assert.deepEqual(keys('rt'), []);
    assert.deepEqual(keys('rti'), ['Sims: mortimer']);
  });

  it('finds things to do by their words', () => {
    assert.deepEqual(keys('import'), ['Do: upload-save']);
    assert.deepEqual(keys('up next'), ['Do: up-next']);
  });

  it('shows a few of each kind and counts the rest', () => {
    const many = Array.from({ length: 11 }, (_, i) => sim(`s${i}`, `Sam${i}`, 'Many', 'Willow Creek||Goth'));
    const sims = findResults('sam', { ...board, visibleNodes: many }).find((g) => g.title === 'Sims')!;
    assert.deepEqual([sims.items.length, sims.more], [8, 3]);
  });
});
