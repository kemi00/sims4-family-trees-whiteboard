import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ChronicleEntry } from './chronicle.ts';
import {
  calendarYear,
  cardYearsText,
  dayWithYear,
  deathWindows,
  firstDayOfYear,
  pairKey,
  simYears,
  unionDays,
  validCalendar,
  yearLabel,
} from './calendar.ts';
import { TICKS_PER_DAY } from './lifeClock.ts';
import type { SimLife } from '../types/whiteboard.ts';

const cal = { startYear: 1300, daysPerYear: 4 };
/** The tick at the start of a game day (Day 1 is tick 0). */
const tick = (day: number) => (day - 1) * TICKS_PER_DAY;
const life = (bornDay: number): SimLife => ({ born: tick(bornDay) + 100, stageDays: 1, stage: 'Adult', at: tick(60) });
const entry = (day: number, recap?: Partial<NonNullable<ChronicleEntry['recap']>>): ChronicleEntry =>
  ({
    at: `2026-11-${String(day).padStart(2, '0')}T00:00:00.000Z`,
    game: { clock: tick(day) + 5 },
    ...(recap ? { recap: { days: 1, born: [], together: [], apart: [], moved: [], grew: [], died: [], met: 0, plansDone: 0, ...recap } } : {}),
  }) as ChronicleEntry;

describe('calendar years', () => {
  it('counts a year every daysPerYear days from Day 1', () => {
    assert.equal(calendarYear(1, cal), 1300);
    assert.equal(calendarYear(4, cal), 1300);
    assert.equal(calendarYear(5, cal), 1301);
    assert.equal(calendarYear(161, cal), 1340);
    assert.equal(firstDayOfYear(1340, cal), 161);
  });

  it('counts the days before play back into earlier years', () => {
    assert.equal(calendarYear(0, cal), 1299);
    assert.equal(calendarYear(-3, cal), 1299);
    assert.equal(calendarYear(-4, cal), 1298);
  });

  it('tells years before 1 as BCE, with no year 0', () => {
    assert.equal(yearLabel(1), '1');
    assert.equal(yearLabel(0), '1 BCE');
    assert.equal(yearLabel(-44), '45 BCE');
  });

  it('accepts only whole numbers and a year of 1 to 112 days', () => {
    assert.deepEqual(validCalendar({ startYear: 1300, daysPerYear: 2 }), { startYear: 1300, daysPerYear: 2 });
    assert.equal(validCalendar({ startYear: 1300, daysPerYear: 0 }), null);
    assert.equal(validCalendar({ startYear: 1300.5, daysPerYear: 2 }), null);
    assert.equal(validCalendar({ startYear: 1300 }), null);
    assert.equal(validCalendar(null), null);
  });

  it('says a day with its year', () => {
    assert.equal(dayWithYear(40, cal), 'Day 40 · 1309');
    assert.equal(dayWithYear(-2, null), 'Day −2');
  });
});

describe('when deaths and couples came to light', () => {
  const story = [
    entry(10),
    entry(14, { died: [{ id: 'a', name: 'Aldwin' }], together: [{ a: { id: 'x', name: 'X' }, b: { id: 'y', name: 'Y' }, type: 'romance', planned: false }] }),
    entry(30, { died: [{ id: 'b', name: 'Mairwen' }], together: [{ a: { id: 'y', name: 'Y' }, b: { id: 'x', name: 'X' }, type: 'marriage', planned: true }] }),
  ];

  it('dates a death by the upload that told it, after the one before', () => {
    const w = deathWindows(story);
    assert.deepEqual(w.get('a'), { by: 14, after: 10 });
    assert.deepEqual(w.get('b'), { by: 30, after: 14 });
  });

  it('dates a couple by its marriage over the romance before it', () => {
    assert.deepEqual(unionDays(story).get(pairKey('x', 'y')), { by: 30, type: 'marriage' });
  });

  it('leaves out couples the first upload already had', () => {
    const first = [entry(5, { together: [{ a: { id: 'p', name: 'P' }, b: { id: 'q', name: 'Q' }, type: 'marriage', planned: false, standing: true }] })];
    assert.equal(unionDays(first).size, 0);
  });
});

describe('a sim’s years', () => {
  it('reads the birth year from the save', () => {
    const y = simYears({ life: life(-26), state: 'Sim' }, cal);
    assert.equal(y.born, 1293);
    assert.equal(cardYearsText(y), 'b. 1293');
  });

  it('dates a death by its upload, and says "by" when the year is not sure', () => {
    const y = simYears({ life: life(1), state: 'Deceased' }, cal, { by: 14, after: 10 });
    assert.equal(y.died, 1303);
    assert.equal(y.diedBy, true);
    assert.equal(cardYearsText(y), '1300–1303');
    assert.equal(y.ageAtDeath, 3);
  });

  it('knows the death year when both uploads fall in it', () => {
    const y = simYears({ life: life(1), state: 'Deceased' }, cal, { by: 15, after: 14 });
    assert.equal(y.died, 1303);
    assert.equal(y.diedBy, undefined);
  });

  it('puts typed years before the save', () => {
    const y = simYears({ life: life(1), state: 'Deceased', yearBorn: 1266, yearDied: 1299 }, cal, { by: 14 });
    assert.deepEqual([y.born, y.died, y.bornTyped, y.diedTyped, y.ageAtDeath], [1266, 1299, true, true, 33]);
    assert.equal(cardYearsText(y), '1266–1299');
  });

  it('shows a death alone, and nothing for one the board can’t date', () => {
    assert.equal(cardYearsText(simYears({ state: 'Deceased', yearDied: 1299 }, cal)), 'd. 1299');
    assert.equal(cardYearsText(simYears({ state: 'Sim' }, cal)), '');
  });

  it('gives no death year to one alive, whatever the story says', () => {
    assert.equal(simYears({ life: life(1), state: 'Sim' }, cal, { by: 14 }).died, undefined);
  });
});

describe('a typed year', () => {
  it('reads plain years, BCE and minus', async () => {
    const { parseYear } = await import('./calendar.ts');
    assert.equal(parseYear('1282'), 1282);
    assert.equal(parseYear(' 45 BCE '), -44);
    assert.equal(parseYear('1 bc'), 0);
    assert.equal(parseYear('-44'), -44);
    assert.equal(parseYear('1300 AD'), 1300);
    assert.equal(parseYear(''), undefined);
    assert.equal(parseYear('soon'), null);
  });
});

describe('how they died, and posters with years', () => {
  it('names the game’s death from a relative’s tree record or a sim’s ghost trait', async () => {
    const { gameDeathOf } = await import('./simAbout.ts');
    const names = { skillLevels: {}, traits: {}, skills: {}, tracks: {}, aspirations: {}, deaths: { '101685': 'Old Age', '7': 'Drowning' } };
    assert.equal(gameDeathOf({ deathTrait: '101685' }, names), 'Old Age');
    assert.equal(gameDeathOf({ about: { traits: ['1', '7'] } }, names), 'Drowning');
    assert.equal(gameDeathOf({ about: { traits: ['1'] } }, names), null);
    // A names file built before deaths were read says nothing.
    assert.equal(gameDeathOf({ deathTrait: '101685' }, { ...names, deaths: undefined }), null);
  });

  it('puts the board’s years on poster cards, and leaves a poster alone without them', async () => {
    const { withPosterYears } = await import('./poster.ts');
    const model = { kind: 'household', title: 'The Goths', subtitle: '', color: '#000', rows: [{ cards: [{ id: 'a', name: 'A', stage: 'Elder', deceased: true, planned: false, color: '#000' }] }], couples: [], families: [], calendar: '', slug: 'goth' } as const;
    const withYears = withPosterYears(model as never, new Map([['a', '1266–1299']]));
    assert.equal(withYears.rows[0]!.cards[0]!.years, '1266–1299');
    assert.equal(withPosterYears(model as never, null), model);
  });

  it('shows the nickname in quotes, and the name alone without one', async () => {
    const { nameWithNick } = await import('./plan.ts');
    assert.equal(nameWithNick({ first: 'Leofstan', sur: 'Baines', nick: ' Leo ' }), 'Leofstan “Leo” Baines');
    assert.equal(nameWithNick({ first: 'Leofstan', sur: 'Baines' }), 'Leofstan Baines');
  });
});
