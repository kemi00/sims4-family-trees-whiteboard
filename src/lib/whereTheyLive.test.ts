import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ADDED_HOUSEHOLD, NOT_IN_WORLD } from './constants.ts';
import type { GameLot } from './places.ts';
import { unhousedGid } from './unhoused.ts';
import {
  HOUSEHOLD_LIMIT_KEY,
  choiceWorld,
  homePlaces,
  householdsOverLimit,
  needsHome,
  placesIn,
  readHouseholdLimit,
  searchPlaces,
  sizeOfLimit,
  writeHouseholdLimit,
} from './whereTheyLive.ts';
import type { Group } from '../types/whiteboard.ts';

function memory() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
}

const group = (gid: string, hh: string, world: string, nb = '-'): Group => ({ gid, hh, world, nb, color: '#fff', x: 0, y: 0, w: 0, h: 0 });
const lot = (name: string, world: string, nb: string) => ({ name, world, nb }) as GameLot;

describe('the household limit', () => {
  it('is the game’s 8 until changed, a mod’s number, or none', () => {
    const s = memory();
    assert.equal(readHouseholdLimit(s), 8);
    writeHouseholdLimit(12, s);
    assert.equal(readHouseholdLimit(s), 12);
    writeHouseholdLimit(null, s);
    assert.equal(s.m.get(HOUSEHOLD_LIMIT_KEY), 'off');
    assert.equal(readHouseholdLimit(s), null);
    s.setItem(HOUSEHOLD_LIMIT_KEY, 'nonsense');
    assert.equal(readHouseholdLimit(s), 8);
  });

  it('flags households past it, never the Unhoused or Needs a home boxes', () => {
    const sizes = new Map([
      ['W||Goth', 9],
      ['W||Pancakes', 8],
      [unhousedGid('W'), 14],
      [`W||${ADDED_HOUSEHOLD}`, 10],
    ]);
    assert.deepEqual([...householdsOverLimit(sizes, 8)], [['W||Goth', 9]]);
    assert.deepEqual([...householdsOverLimit(sizes, 10)], []);
    assert.deepEqual([...householdsOverLimit(sizes, null)], []);
    assert.equal(sizeOfLimit(9, 8), '9 of 8');
    assert.equal(sizeOfLimit(9, null), '9');
  });
});

describe('where they live', () => {
  const groups = [
    group('Willow Creek||Goth', 'Goth', 'Willow Creek', 'Pendula View'),
    group('Willow Creek||Pancakes', 'Pancakes', 'Willow Creek', 'Pendula View'),
    group(unhousedGid('Willow Creek'), 'Unhoused sims', 'Willow Creek'),
    group(`Willow Creek||${ADDED_HOUSEHOLD}`, ADDED_HOUSEHOLD, 'Willow Creek'),
    group('San Sequoia||Michaelson', 'Michaelson', 'San Sequoia', 'Hopewell Hills'),
  ];
  const places = homePlaces({
    groups,
    sizes: new Map([['Willow Creek||Goth', 4]]),
    freeLots: new Map([['San Sequoia', [lot('Parkside Place', 'San Sequoia', 'Gilbert Gardens')]]]),
    worlds: ['Willow Creek', 'San Sequoia', NOT_IN_WORLD],
  });

  it('lists households, free lots and worlds, never the boxes that are no home', () => {
    assert.deepEqual(
      places.map((p) => (p.kind === 'household' ? `${p.hh} ${p.size}` : p.kind === 'lot' ? p.lot.name : p.world)),
      ['Goth 4', 'Michaelson 0', 'Pancakes 0', 'Parkside Place', 'Willow Creek', 'San Sequoia'],
    );
  });

  it('shows the world in view’s own places', () => {
    assert.deepEqual(
      placesIn(places, 'San Sequoia').map((p) => p.kind),
      ['household', 'lot', 'world'],
    );
  });

  it('finds a place by its name first, then by where it is', () => {
    assert.deepEqual(searchPlaces(places, 'goth').map((p) => p.kind === 'household' && p.hh), ['Goth']);
    assert.deepEqual(
      searchPlaces(places, 'gilbert').map((p) => p.kind === 'lot' && p.lot.name),
      ['Parkside Place'],
    );
    assert.deepEqual(
      searchPlaces(places, 'willow').map((p) => (p.kind === 'world' ? `world ${p.world}` : p.kind === 'household' ? p.hh : '')),
      ['world Willow Creek', 'Goth', 'Pancakes'],
    );
    assert.deepEqual(searchPlaces(places, '  '), []);
  });

  it('knows the Needs a home box, and the world each choice goes to', () => {
    assert.equal(needsHome(`Willow Creek||${ADDED_HOUSEHOLD}`), true);
    assert.equal(needsHome('Willow Creek||Goth'), false);
    assert.equal(choiceWorld({ kind: 'none' }), NOT_IN_WORLD);
    assert.equal(choiceWorld({ kind: 'lot', lot: lot('Parkside Place', 'San Sequoia', 'Gilbert Gardens') }), 'San Sequoia');
  });
});
