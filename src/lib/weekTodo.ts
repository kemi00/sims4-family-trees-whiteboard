import { calendarYear, yearLabel } from './calendar.ts';
import type { ChronicleEntry } from './chronicle.ts';
import { DECEASED_STATE, hasDied } from './constants.ts';
import { TICKS_PER_DAY, clockText, dayOf, dayText, lifeView, wholeDaysText } from './lifeClock.ts';
import { cardName, isPlannedSim } from './plan.ts';
import { isUnhousedGid } from './unhoused.ts';
import type { BabyTry, PlannerCalendar, SaveGameInfo, SimNode } from '../types/whiteboard.ts';

/** Which households the week's to-do covers: the one played last, every one played, or all. */
export type WeekScope = 'active' | 'played' | 'all';

export const WEEK_SCOPES: readonly { scope: WeekScope; label: string }[] = [
  { scope: 'active', label: 'Played last' },
  { scope: 'played', label: 'Played' },
  { scope: 'all', label: 'All' },
];

export type WeekItemKind = 'ageUp' | 'baby' | 'outfits';

/** One thing to do this week, ticked off by its key (the week's first day in it, so last week's ticks don't carry). */
export type WeekItem = {
  key: string;
  kind: WeekItemKind;
  /** The household it is for, to filter by. */
  gid: string;
  text: string;
  /** The game day it falls on, when it has one: the list is in day order. */
  day?: number;
};

export type WeekTodo = {
  /** The game's week, Sunday to Saturday: Day 1 of a save is a Sunday. */
  first: number;
  last: number;
  today: number;
  items: WeekItem[];
};

/** A pregnancy lasts 100 sim hours (the game's PREGNANCY_RATE to 100): a try that took is due about four days on. */
export const DAYS_TO_DUE = 4;

/** The game's week `day` falls in: Sunday (Day 1, 8, 15…) to Saturday. */
export function gameWeek(day: number): { first: number; last: number } {
  const into = (((day - 1) % 7) + 7) % 7;
  return { first: day - into, last: day - into + 6 };
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

/** "Sunday", "Saturday": the day of the game's week. */
export function weekdayOf(day: number): string {
  return WEEKDAYS[(((day - 1) % 7) + 7) % 7]!;
}

/** "a Young Adult", "an Adult", "an Elder". */
function aStage(stage: string): string {
  return `${/^[AEIOU]/.test(stage) ? 'an' : 'a'} ${stage}`;
}

/** "the Goth household", or "their household" for one with none. */
function householdOf(n: Pick<SimNode, 'gid' | 'hh'>): string {
  return isUnhousedGid(n.gid) || !n.hh ? 'their household' : `the ${n.hh} household`;
}

/** "the Goths, the Capps and 3 more households". */
function householdsText(names: string[]): string {
  const shown = names.slice(0, 2).map((h) => `the ${h}s`);
  const more = names.length - shown.length;
  if (more > 0) return `${shown.join(', ')} and ${more} more ${more === 1 ? 'household' : 'households'}`;
  return shown.length === 2 ? `${shown[0]} and ${shown[1]}` : (shown[0] ?? 'every household');
}

/**
 * What a sim-week of play holds, household by household, for the game's
 * week the last save falls in:
 * - age-ups: a sim whose next stage comes this week, on the day it comes
 *   when their household ages, or after so many days of playing it when it
 *   doesn't (only the active household ages, say);
 * - babies due: pregnancies the save has (their due day), and tries for a
 *   baby that took with no pregnancy in the save yet (about four days on);
 * - outfits: new ones after an age-up (this week's, and those the last
 *   upload saw this week), and for every household when a new calendar
 *   decade begins this week (calendar years on).
 * Each counts by the save's own pace (paceOf: the player's stage lengths too).
 */
export function weekTodo(opts: {
  nodes: readonly SimNode[];
  saveGame: SaveGameInfo;
  calendar?: PlannerCalendar | null;
  tries?: Record<string, BabyTry[]>;
  chronicle?: readonly ChronicleEntry[];
  scope: WeekScope;
}): WeekTodo {
  const { nodes, saveGame, calendar, scope } = opts;
  const today = dayOf(saveGame.clock);
  const { first, last } = gameWeek(today);
  const weekEnds = last * TICKS_PER_DAY;
  const played = new Set(saveGame.playedHouseholds ?? []);
  const inScope = (n: SimNode) =>
    scope === 'all' ? true : scope === 'active' ? !!saveGame.lastPlayedGid && n.gid === saveGame.lastPlayedGid : !!n.hhId && played.has(n.hhId);
  const living = nodes.filter((n) => !isPlannedSim(n) && !n.species && !hasDied(n.state) && inScope(n));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const items: WeekItem[] = [];
  const key = (...parts: (string | number)[]) => [first, ...parts].join('|');

  // Age-ups this week, and the outfits each needs.
  for (const n of living) {
    const v = lifeView(n, saveGame);
    if (!v?.next || v.daysToNext === undefined) continue;
    const name = cardName(n);
    if (!v.frozen) {
      const due = v.at + v.daysToNext * TICKS_PER_DAY;
      if (due >= weekEnds) continue;
      const day = dayOf(due);
      items.push({ key: key('age', n.id, v.next), kind: 'ageUp', gid: n.gid, day, text: `${name} becomes ${aStage(v.next)} on ${dayText(day)}` });
      items.push({ key: key('outfit', n.id, v.next), kind: 'outfits', gid: n.gid, day, text: `New outfits for ${name} as ${aStage(v.next)}` });
    } else if (v.daysToNext * TICKS_PER_DAY <= weekEnds - saveGame.clock) {
      // Not aging now: it comes when their household is played that long.
      items.push({
        key: key('age', n.id, v.next),
        kind: 'ageUp',
        gid: n.gid,
        text: `${name} becomes ${aStage(v.next)} after ${wholeDaysText(v.daysToNext)} of playing ${householdOf(n)}`,
      });
      items.push({ key: key('outfit', n.id, v.next), kind: 'outfits', gid: n.gid, text: `New outfits for ${name} once ${aStage(v.next)}` });
    }
  }

  // Age-ups the last upload saw this week: their outfits are still to do.
  const latest = opts.chronicle?.[opts.chronicle.length - 1];
  if (latest?.recap && dayOf(latest.game.clock) >= first && dayOf(latest.game.clock) <= last) {
    for (const g of latest.recap.grew ?? []) {
      const n = byId.get(g.id);
      if (!n || !living.includes(n)) continue;
      if (items.some((i) => i.key === key('outfit', n.id, g.to))) continue;
      items.push({ key: key('outfit', n.id, g.to), kind: 'outfits', gid: n.gid, text: `New outfits for ${cardName(n)} as ${aStage(g.to)}` });
    }
  }

  // Babies due this week: the save's pregnancies, and tries that took.
  const expecting = new Set<string>();
  for (const n of nodes) {
    if (!n.pregnancy || hasDied(n.state) || !inScope(n)) continue;
    expecting.add(n.id);
    if (n.pregnancy.with) expecting.add(n.pregnancy.with);
    const day = dayOf(n.pregnancy.dueAt);
    if (day > last) continue;
    const other = n.pregnancy.with ? byId.get(n.pregnancy.with) : undefined;
    const parents = other ? `${n.first} and ${cardName(other)}` : cardName(n);
    items.push({ key: key('baby', n.id, day), kind: 'baby', gid: n.gid, day, text: `${parents}’s baby is due ${clockText(n.pregnancy.dueAt)}` });
  }
  for (const [pair, tries] of Object.entries(opts.tries ?? {})) {
    const [a, b] = pair.split('|').map((id) => byId.get(id));
    if (!a || !b || expecting.has(a.id) || expecting.has(b.id)) continue;
    const took = [...tries].reverse().find((t) => t.pregnant);
    if (!took) continue;
    const day = took.day + DAYS_TO_DUE;
    if (day < today || day > last) continue;
    const home = [a, b].find((x) => inScope(x) && x.state !== DECEASED_STATE);
    if (!home) continue;
    items.push({ key: key('baby', pair, took.day), kind: 'baby', gid: home.gid, day, text: `${a.first} and ${cardName(b)}’s baby is due about ${dayText(day)}, from your tries` });
  }

  // A new decade on the board's calendar: new outfits everywhere.
  if (calendar) {
    for (let day = first; day <= last; day++) {
      const decade = Math.floor(calendarYear(day, calendar) / 10);
      if (decade === Math.floor(calendarYear(day - 1, calendar) / 10)) continue;
      const homes = [...new Map(living.filter((n) => !isUnhousedGid(n.gid) && n.hh).map((n) => [n.gid, n.hh])).values()];
      if (!homes.length) break;
      const year = decade * 10;
      items.push({
        key: key('decade', year),
        kind: 'outfits',
        gid: '',
        day,
        text: `The ${yearLabel(year)}s begin on ${dayText(day)}: new outfits for ${householdsText(homes)}`,
      });
    }
  }

  const order: Record<WeekItemKind, number> = { ageUp: 0, baby: 1, outfits: 2 };
  items.sort((x, y) => order[x.kind] - order[y.kind] || (x.day ?? last + 1) - (y.day ?? last + 1) || x.text.localeCompare(y.text));
  return { first, last, today, items };
}
