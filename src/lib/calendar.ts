import type { ChronicleEntry } from './chronicle.ts';
import { hasDied } from './constants.ts';
import { dayOf } from './lifeClock.ts';
import type { PlannerCalendar, SimNode } from '../types/whiteboard.ts';

/**
 * The board's calendar years: a decades or historical playthrough counts
 * its own years ("Day 1 is 1300, a year every 4 days"), where the game
 * only counts days. Every year here is a calendar year; the game's day is
 * Day 1 at tick 0 (dayOf), and days before play count 0, −1, …
 */

/** Days a calendar year may last: from one sim day to four 28-day seasons. */
export const MIN_DAYS_PER_YEAR = 1;
export const MAX_DAYS_PER_YEAR = 112;

/** A calendar the board can use: whole numbers, a year at least a day long. Null for anything else. */
export function validCalendar(c: Partial<PlannerCalendar> | null | undefined): PlannerCalendar | null {
  if (!c) return null;
  const { startYear, daysPerYear } = c;
  if (typeof startYear !== 'number' || !Number.isInteger(startYear) || Math.abs(startYear) > 100_000) return null;
  if (typeof daysPerYear !== 'number' || !Number.isInteger(daysPerYear)) return null;
  if (daysPerYear < MIN_DAYS_PER_YEAR || daysPerYear > MAX_DAYS_PER_YEAR) return null;
  return { startYear, daysPerYear };
}

/** Whether the board shows these years now. */
export function calendarOn(cal: PlannerCalendar | null | undefined): cal is PlannerCalendar {
  return !!cal && !cal.off;
}

/** "1 sim day", "4 sim days". */
export function simDays(n: number): string {
  return n === 1 ? '1 sim day' : `${n} sim days`;
}

/**
 * One line for where the calendar is summed up (⋮ and Your save): on and
 * its years, or off and what it is for.
 */
export function calendarSummary(cal: PlannerCalendar | null | undefined): string {
  return calendarOn(cal)
    ? `On · Day 1 is ${yearLabel(cal.startYear)}, a year every ${simDays(cal.daysPerYear)}`
    : 'Off · for decades and historical saves';
}

/** The calendar year of a game day: Day 1 starts `startYear`. */
export function calendarYear(day: number, cal: PlannerCalendar): number {
  return cal.startYear + Math.floor((day - 1) / cal.daysPerYear);
}

/** The first game day of a calendar year. */
export function firstDayOfYear(year: number, cal: PlannerCalendar): number {
  return (year - cal.startYear) * cal.daysPerYear + 1;
}

/** "1300", "1 BCE" for year 0, "45 BCE" for −44: there is no year 0, as historians count. */
export function yearLabel(year: number): string {
  return year >= 1 ? String(year) : `${1 - year} BCE`;
}

/** Whole calendar years between two game days (an age): the years that have fully passed. */
export function yearsBetween(fromDay: number, toDay: number, cal: PlannerCalendar): number {
  return Math.max(0, Math.floor((toDay - fromDay) / cal.daysPerYear));
}

/** The game day a sim was born, from the save's facts; none for a card the save never dated. */
export function bornDayOf(n: Pick<SimNode, 'life'>): number | undefined {
  return n.life ? dayOf(n.life.born) : undefined;
}

/**
 * When a death came to light: the first upload whose story says they died
 * (`by`, a game day), and the upload before it (`after`), when there is
 * one. The save can't say the day; it died between the two.
 */
export type DeathWindow = { by: number; after?: number };

/** Each sim the story says died, by card id: when (see DeathWindow). */
export function deathWindows(chronicle: readonly ChronicleEntry[]): Map<string, DeathWindow> {
  const out = new Map<string, DeathWindow>();
  let before: number | undefined;
  for (const e of chronicle) {
    const day = dayOf(e.game.clock);
    for (const s of e.recap?.died ?? []) {
      if (!out.has(s.id)) out.set(s.id, before === undefined ? { by: day } : { by: day, after: before });
    }
    before = day;
  }
  return out;
}

/** Two card ids as one key, either way round. */
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * When each couple the story saw begin got together, by pairKey: the game
 * day of the first upload that told it, and how ("marriage" or "romance").
 * Couples the save already had at its first upload are left out: it can't
 * say when they began.
 */
export function unionDays(chronicle: readonly ChronicleEntry[]): Map<string, { by: number; type: 'marriage' | 'romance' }> {
  const out = new Map<string, { by: number; type: 'marriage' | 'romance' }>();
  for (const e of chronicle) {
    const day = dayOf(e.game.clock);
    for (const t of e.recap?.together ?? []) {
      if (t.standing) continue;
      const key = pairKey(t.a.id, t.b.id);
      const had = out.get(key);
      // A romance that became a marriage is dated by its marriage.
      if (!had || (had.type === 'romance' && t.type === 'marriage')) out.set(key, { by: day, type: t.type });
    }
  }
  return out;
}

/** A sim's years on the board's calendar, each from the board (typed) or the save. */
export type SimYears = {
  born?: number;
  /** Typed on the board rather than told by the save. */
  bornTyped?: true;
  died?: number;
  diedTyped?: true;
  /** The death came to light at an upload: it happened by that year, maybe earlier. */
  diedBy?: true;
  /** Whole years they lived, when both ends are known. */
  ageAtDeath?: number;
};

/** A sim's birth and death years on `cal`, from what was typed, the save, and the story's uploads. */
export function simYears(
  n: Pick<SimNode, 'life' | 'state' | 'yearBorn' | 'yearDied'>,
  cal: PlannerCalendar,
  death?: DeathWindow,
): SimYears {
  const out: SimYears = {};
  const bornDay = bornDayOf(n);
  if (n.yearBorn !== undefined) {
    out.born = n.yearBorn;
    out.bornTyped = true;
  } else if (bornDayOf(n) !== undefined) {
    out.born = calendarYear(bornDay!, cal);
  }
  // A ghost died too: a playable one keeps their years.
  const dead = hasDied(n.state);
  if (n.yearDied !== undefined) {
    out.died = n.yearDied;
    out.diedTyped = true;
  } else if (dead && death) {
    out.died = calendarYear(death.by, cal);
    // Known to the year when the uploads either side fall in the same one.
    if (death.after === undefined || calendarYear(death.after, cal) !== out.died) out.diedBy = true;
  }
  if (out.born !== undefined && out.died !== undefined) {
    // Typed years count whole years; a save's days count the years fully lived.
    out.ageAtDeath =
      out.bornTyped || out.diedTyped || bornDay === undefined || !death
        ? Math.max(0, out.died - out.born)
        : yearsBetween(bornDay, death.by, cal);
  }
  return out;
}

/**
 * The years on a card: "1266–1299" for one who died (a ghost too), "b. 1282" for one
 * alive, "d. 1299" for a death with no birth. Empty when the board knows
 * neither, or for one alive with no birth year.
 */
export function cardYearsText(y: SimYears): string {
  if (y.born !== undefined && y.died !== undefined) return `${yearLabel(y.born)}–${yearLabel(y.died)}`;
  if (y.born !== undefined) return `b. ${yearLabel(y.born)}`;
  if (y.died !== undefined) return `d. ${yearLabel(y.died)}`;
  return '';
}

/** "Day 40 · 1309": a game day with its calendar year, or the day alone without a calendar. */
export function dayWithYear(day: number, cal: PlannerCalendar | null | undefined): string {
  const d = `Day ${day < 0 ? `−${-day}` : day}`;
  return cal ? `${d} · ${yearLabel(calendarYear(day, cal))}` : d;
}

/**
 * A year as typed: "1282", "45 BCE" (or BC), "-44". Null for anything else,
 * undefined for nothing typed.
 */
export function parseYear(text: string): number | null | undefined {
  const t = text.trim();
  if (!t) return undefined;
  const bce = /^(\d{1,6})\s*(?:BCE|BC|B\.C\.E?\.?)$/i.exec(t);
  if (bce) return 1 - Number(bce[1]);
  const ce = /^(-?\d{1,6})\s*(?:CE|AD|A\.D\.)?$/i.exec(t);
  return ce ? Number(ce[1]) : null;
}
