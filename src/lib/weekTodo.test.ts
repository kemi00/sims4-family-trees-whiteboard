import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { SaveGameInfo, SimNode } from '../types/whiteboard.ts';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from './lifeClock.ts';
import { gameWeek, weekTodo, weekdayOf } from './weekTodo.ts';

// Slot 10 after Bella Goth died: Day 2 (a Monday), 7:01 AM, Short lifespan, only the active household ages.
const CLOCK = TICKS_PER_DAY + 7 * TICKS_PER_HOUR + Math.round(TICKS_PER_HOUR / 60);
const game = (extra: Partial<SaveGameInfo> = {}): SaveGameInfo => ({
  importedAt: 'now',
  clock: CLOCK,
  lifespan: 'Short',
  seasonDays: 7,
  playedAging: 'Active',
  unplayedAging: false,
  lastPlayedGid: 'Willow Creek||Goth',
  playedHouseholds: ['h-goth', 'h-bheeda'],
  ...extra,
});
const sim = (id: string, extra: Partial<SimNode>): SimNode =>
  ({ id, first: id, sur: 'Goth', hh: 'Goth', gid: 'Willow Creek||Goth', hhId: 'h-goth', age: 'Teen', state: 'Sim', gender: 'Female', ...extra }) as SimNode;
/** A teen `left` Short days from being a young adult, in a household aging (or not). */
const teen = (id: string, left: number, frozen?: 'inactive') =>
  sim(id, { life: { born: 0, stage: 'Teen', stageDays: (10.5 - left) * 2, at: CLOCK, ...(frozen ? { frozen } : {}) } });

describe('the game’s week', () => {
  it('runs Sunday to Saturday, Day 1 a Sunday', () => {
    assert.deepEqual(gameWeek(2), { first: 1, last: 7 });
    assert.deepEqual(gameWeek(8), { first: 8, last: 14 });
    assert.deepEqual(gameWeek(0), { first: -6, last: 0 });
    assert.equal(weekdayOf(1), 'Sunday');
    assert.equal(weekdayOf(2), 'Monday');
    assert.equal(weekdayOf(7), 'Saturday');
  });
});

describe('the week’s to-do', () => {
  it('lists an age-up this week on its day, with its outfits, and leaves later ones out', () => {
    const todo = weekTodo({ nodes: [teen('Cassandra', 2), teen('Later', 9)], saveGame: game(), scope: 'all' });
    assert.deepEqual(
      todo.items.map((i) => [i.kind, i.text]),
      [
        ['ageUp', 'Cassandra Goth becomes a Young Adult on Day 4'],
        ['outfits', 'New outfits for Cassandra Goth as a Young Adult'],
      ],
    );
    assert.equal(todo.first, 1);
    assert.equal(todo.last, 7);
  });

  it('says how long to play a household that isn’t aging now', () => {
    const todo = weekTodo({ nodes: [teen('Lilith', 3, 'inactive')], saveGame: game(), scope: 'all' });
    assert.equal(todo.items[0]!.text, 'Lilith Goth becomes a Young Adult after 3 days of play');
  });

  it('counts by your own stage lengths', () => {
    // Teens of 12 days: 1.5 days more than on Short, so Day 4 becomes Day 5.
    const todo = weekTodo({ nodes: [teen('Cassandra', 2)], saveGame: game({ stageLengths: { Teen: 12 } }), scope: 'all' });
    assert.equal(todo.items[0]!.text, 'Cassandra Goth becomes a Young Adult on Day 5');
  });

  it('lists babies due: the save’s, and a planned baby whose last try worked', () => {
    const jesminder = sim('Jesminder', { sur: 'Bheeda', hh: 'Bheeda', gid: 'San Myshuno||Bheeda', hhId: 'h-bheeda', pregnancy: { dueAt: 3 * TICKS_PER_DAY + 6 * TICKS_PER_HOUR, with: 'Arun' } });
    const arun = sim('Arun', { sur: 'Bheeda', hh: 'Bheeda', gid: 'San Myshuno||Bheeda', hhId: 'h-bheeda', gender: 'Male' });
    const nancy = sim('Nancy', { sur: 'Landgraab', hh: 'Landgraab', gid: 'Willow Creek||Landgraab', hhId: 'h-landgraab' });
    const geoffrey = sim('Geoffrey', { sur: 'Landgraab', hh: 'Landgraab', gid: 'Willow Creek||Landgraab', hhId: 'h-landgraab', gender: 'Male' });
    // Two planned Landgraab babies: one took on Day 2, the other hasn't yet.
    const heir = sim('Heir', { sur: 'Landgraab', hh: 'Landgraab', gid: 'Willow Creek||Landgraab', added: true, tries: [{ day: 1, pregnant: false }, { day: 2, pregnant: true }] });
    const spare = sim('Spare', { sur: 'Landgraab', hh: 'Landgraab', gid: 'Willow Creek||Landgraab', added: true, tries: [{ day: 2, pregnant: false }] });
    // A planned Bheeda baby whose try worked: the save's own pregnancy tells it instead.
    const bheedaBaby = sim('Baby', { sur: 'Bheeda', hh: 'Bheeda', gid: 'San Myshuno||Bheeda', added: true, tries: [{ day: 1, pregnant: true }] });
    const parent = (a: string, b: string) => ({ id: `${a}>${b}`, a, b, type: 'parent' as const });
    const todo = weekTodo({
      nodes: [jesminder, arun, nancy, geoffrey, heir, spare, bheedaBaby],
      edges: [parent('Nancy', 'Heir'), parent('Geoffrey', 'Heir'), parent('Nancy', 'Spare'), parent('Geoffrey', 'Spare'), parent('Jesminder', 'Baby'), parent('Arun', 'Baby')],
      saveGame: game(),
      scope: 'all',
    });
    assert.deepEqual(
      todo.items.filter((i) => i.kind === 'baby').map((i) => i.text),
      ['Jesminder and Arun Bheeda’s baby is due Day 4, 6:00 AM', 'Heir Landgraab is due about Day 6, from your tries'],
    );
  });

  it('covers the households asked for: played last, played, or all', () => {
    const goth = teen('Cassandra', 2);
    const capp = sim('Tybalt', { sur: 'Capp', hh: 'Capp', gid: 'Windenburg||Capp', hhId: 'h-capp', life: { born: 0, stage: 'Teen', stageDays: 17, at: CLOCK } });
    const bheeda = sim('Arun', { sur: 'Bheeda', hh: 'Bheeda', gid: 'San Myshuno||Bheeda', hhId: 'h-bheeda', life: { born: 0, stage: 'Teen', stageDays: 17, at: CLOCK } });
    const who = (scope: 'active' | 'played' | 'all') =>
      [...new Set(weekTodo({ nodes: [goth, capp, bheeda], saveGame: game(), scope }).items.map((i) => i.gid))];
    assert.deepEqual(who('active'), ['Willow Creek||Goth']);
    assert.deepEqual(who('played').sort(), ['San Myshuno||Bheeda', 'Willow Creek||Goth']);
    assert.equal(who('all').length, 3);
  });

  it('asks for new outfits everywhere when a calendar decade begins this week', () => {
    // A year every sim day from 1295: 1300 begins on Day 6.
    const todo = weekTodo({ nodes: [teen('Cassandra', 9)], saveGame: game(), calendar: { startYear: 1295, daysPerYear: 1 }, scope: 'all' });
    assert.deepEqual(todo.items.map((i) => i.text), ['The 1300s begin on Day 6: new outfits for the Goths']);
  });

  it('leaves out the dead, planned sims and pets', () => {
    const todo = weekTodo({
      nodes: [teen('Bella', 1), { ...teen('Gone', 1), state: 'Deceased' }, { ...teen('Pup', 1), species: 'Dog' }],
      saveGame: game(),
      scope: 'all',
    });
    assert.deepEqual([...new Set(todo.items.map((i) => i.text.split(' ')[0]))], ['Bella', 'New']);
  });
});
