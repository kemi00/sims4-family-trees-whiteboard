import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { SaveGameInfo, SimNode } from '../types/whiteboard.ts';
import {
  TICKS_PER_DAY,
  clockText,
  dayOf,
  dayText,
  daysBeforeStage,
  frozenReason,
  lifeDays,
  lifeView,
  wholeDaysText,
  yearOf,
} from './lifeClock.ts';

const node = (extra: Partial<SimNode>): SimNode =>
  ({ id: 'x', first: 'Malcolm', sur: 'Landgraab', age: 'Teen', ...extra }) as SimNode;
const game = (lifespan: SaveGameInfo['lifespan'], extra: Partial<SaveGameInfo> = {}): SaveGameInfo => ({
  importedAt: 'now',
  clock: 11_135_049,
  lifespan,
  seasonDays: 7,
  ...extra,
});
/** Malcolm in the real save: 31.82 days old, 5.45 Short days (10.9 Normal) into his teens. */
const malcolm = node({
  life: { born: 11_135_049 - Math.round(31.82 * TICKS_PER_DAY), stageDays: 10.9, stage: 'Teen', at: 11_135_049 },
});

describe('the game clock', () => {
  it('numbers days from tick 0, with no Day 0 gap before play', () => {
    assert.equal(dayOf(0), 1);
    assert.equal(dayOf(11_135_049), 6);
    assert.equal(dayOf(-1), 0);
    assert.equal(dayOf(-TICKS_PER_DAY - 1), -1);
  });

  it('counts four seasons to a year, with Year 0 before play', () => {
    assert.equal(yearOf(1, 7), 1);
    assert.equal(yearOf(28, 7), 1);
    assert.equal(yearOf(29, 7), 2);
    assert.equal(yearOf(0, 7), 0);
    assert.equal(yearOf(-27, 7), 0);
    assert.equal(yearOf(-28, 7), -1);
    assert.equal(yearOf(56, 14), 1);
  });

  it('writes days before play with a minus sign', () => {
    assert.equal(dayText(-26), 'Day \u221226');
    assert.equal(dayText(6), 'Day 6');
  });

  it('reads the time of day', () => {
    assert.equal(clockText(11_135_049), 'Day 6, 3:43 AM');
    assert.equal(clockText(720_000), 'Day 1, 8:00 AM');
    assert.equal(clockText(12_600_000), 'Day 6, 8:00 PM');
  });

  it('rounds whole days down, as the game does', () => {
    assert.equal(wholeDaysText(5.05), '5 days');
    assert.equal(wholeDaysText(1.9), '1 day');
    assert.equal(wholeDaysText(0.4), 'less than a day');
  });
});

describe('a sim’s place in life', () => {
  it('adds the Normal stages before theirs', () => {
    assert.equal(daysBeforeStage('Infant', true), 0);
    assert.equal(daysBeforeStage('Infant'), 1);
    assert.equal(daysBeforeStage('Child'), 13);
    assert.equal(daysBeforeStage('Teen'), 27);
    assert.equal(daysBeforeStage('Young Adult'), 48);
    assert.equal(daysBeforeStage('Elder'), 118);
    assert.equal(daysBeforeStage('Unknown'), null);
    assert.equal(lifeDays(malcolm.life!), 37.9);
  });

  it('gives the days to the next stage the game shows on each lifespan', () => {
    // The game showed 5 on Short, 10 on Normal; Long works out at 40.
    assert.equal(Math.floor(lifeView(malcolm, game('Short'))!.daysToNext!), 5);
    assert.equal(Math.floor(lifeView(malcolm, game('Normal'))!.daysToNext!), 10);
    assert.equal(Math.floor(lifeView(malcolm, game('Long'))!.daysToNext!), 40);
    const v = lifeView(malcolm, game('Short'))!;
    assert.equal(v.next, 'Young Adult');
    assert.ok(Math.abs(v.through! - 10.9 / 21) < 1e-9);
    assert.ok(Math.abs(v.daysAlive - 31.82) < 1e-6);
    assert.deepEqual([v.bornDay, v.bornYear, v.fromEarlierImport, v.lifespanGuessed], [-26, 0, false, false]);
  });

  it('counts an elder’s days as one, and a newborn’s next stage is infancy', () => {
    const elder = node({ age: 'Elder', life: { born: 0, stageDays: 2, stage: 'Elder', at: 0 } });
    const v = lifeView(elder, game('Short'))!;
    assert.deepEqual([v.elderDays, v.daysToNext, v.next], [1, undefined, undefined]);
    const baby = node({ age: 'Infant', life: { born: 0, stageDays: 0.25, stage: 'Infant', newborn: true, at: 0 } });
    const b = lifeView(baby, game('Normal'))!;
    assert.deepEqual([b.next, b.daysToNext], ['Infant', 0.75]);
  });

  it('has nothing to say once the card’s stage changed, or for a pet', () => {
    assert.equal(lifeView({ ...malcolm, age: 'Young Adult' }, game('Short')), null);
    assert.equal(lifeView({ ...malcolm, species: 'Dog' }, game('Short')), null);
    assert.equal(lifeView(node({}), game('Short')), null);
  });

  it('flags facts from an earlier import and a lifespan it had to guess', () => {
    const v = lifeView(malcolm, game(undefined, { clock: 20_000_000 }))!;
    assert.deepEqual([v.fromEarlierImport, v.lifespanGuessed, v.lifespan], [true, true, 'Normal']);
  });
});

describe('who is aging', () => {
  it('follows the played and unplayed options', () => {
    assert.equal(frozenReason({ played: true, active: true, playedAging: 'Active' }), null);
    assert.equal(frozenReason({ played: true, active: false, playedAging: 'Active' }), 'inactive');
    assert.equal(frozenReason({ played: true, active: false, playedAging: 'Yes' }), null);
    assert.equal(frozenReason({ played: true, active: true, playedAging: 'No' }), 'played');
    assert.equal(frozenReason({ played: false, active: false, unplayedAging: false }), 'unplayed');
    assert.equal(frozenReason({ played: false, active: false, unplayedAging: true }), null);
    assert.equal(frozenReason({ played: false, active: false }), undefined);
  });
});
