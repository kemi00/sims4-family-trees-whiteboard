import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { chronicleEntry, chronicleWhen, entryAbout, mergeChronicles, storyLines, withEntry } from './chronicle.ts';
import { TICKS_PER_DAY } from './lifeClock.ts';
import type { SaveRecap } from './saveRecap.ts';
import type { SaveGameInfo } from '../types/whiteboard.ts';

const game = (day: number, extra: Partial<SaveGameInfo> = {}): SaveGameInfo => ({
  importedAt: `2026-11-${String(day).padStart(2, '0')}T10:00:00Z`,
  clock: (day - 1) * TICKS_PER_DAY + TICKS_PER_DAY / 2,
  lifespan: 'Short',
  calendar: 'days',
  ...extra,
});
const recap: SaveRecap = {
  days: 3,
  born: [{ id: 'h', name: 'Helena Capp', parents: ['Beatrice Capp', 'Adekoya Darong'], parentIds: ['b', 'a'], planned: false }],
  together: [{ a: { id: 'b', name: 'Beatrice Capp' }, b: { id: 'a', name: 'Adekoya Darong' }, type: 'marriage', planned: true }],
  apart: [],
  moved: [{ id: 'a', name: 'Adekoya Darong', from: 'the Darong household', to: 'the Capp household' }],
  grew: [],
  died: [{ id: 'g', name: 'Giacomo Capp' }],
  met: 4,
  plansDone: 1,
  celebrate: ['b', 'a'],
};

describe('the chronicle', () => {
  const first = chronicleEntry(game(6), { start: { sims: 456, households: 120 } });
  const next = chronicleEntry(game(9, { fileName: 'Slot_6.save' }), { recap });

  it('keeps each upload once, in the game’s order, without the celebration', () => {
    const list = withEntry(withEntry([], next), first);
    assert.deepEqual(list.map((e) => e.at), [first.at, next.at]);
    assert.equal('celebrate' in list[1]!.recap!, false);
    assert.deepEqual(withEntry(list, next).length, 2);
    assert.deepEqual(mergeChronicles([first], [next, first]).map((e) => e.at), [first.at, next.at]);
  });

  it('dates an upload by the save’s calendar: seasons only with Seasons', () => {
    assert.equal(chronicleWhen(next), 'Day 9');
    const seasons = chronicleEntry(game(9, { calendar: 'seasons', season: 'Summer', seasonSince: 7 * TICKS_PER_DAY, seasonDays: 7 }), {});
    assert.equal(chronicleWhen(seasons), 'Summer, day 2 of 7 · Year 1');
  });

  it('tells one family’s story: a birth counts for its parents, the start belongs to everyone', () => {
    const capps = entryAbout(next, new Set(['b']))!.recap!;
    assert.deepEqual(capps.born.map((b) => b.name), ['Helena Capp']);
    assert.deepEqual(capps.together.length, 1);
    assert.deepEqual([capps.moved.length, capps.died.length, capps.met], [0, 0, 0]);
    assert.equal(entryAbout(first, new Set(['b'])), null);
    assert.equal(entryAbout(first, null), first);
    assert.equal(entryAbout(next, new Set(['nobody'])), null);
  });

  it('finds a name in the story', () => {
    const found = entryAbout(next, null, 'giacomo')!.recap!;
    assert.deepEqual([found.born.length, found.died.map((d) => d.name)], [0, ['Giacomo Capp']]);
  });

  it('gives a poster its big moments, oldest first', () => {
    assert.deepEqual(storyLines([first, next], new Set(['b', 'a', 'g'])), [
      { when: 'Day 9', text: 'Helena Capp was born to Beatrice Capp and Adekoya Darong' },
      { when: 'Day 9', text: 'Beatrice Capp married Adekoya Darong' },
      { when: 'Day 9', text: 'Giacomo Capp passed away' },
    ]);
  });
});
