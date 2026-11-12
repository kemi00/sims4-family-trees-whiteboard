import { calendarDay, lifeAhead, type AgingClock, type SuccessionForecast } from './forecast.ts';
import type { SaveGameInfo, SimNode } from '../types/whiteboard.ts';

/**
 * The matchmaking clock: whether two sims planned together (a couple, or
 * the parents of a planned baby) will both be grown up while one who can
 * carry a baby is still not an elder, counted on the days that age each
 * of them. With only the active household aging, two households age on
 * different days: the board can't say who gets there first, only what
 * happens if you play them alike, and which to play.
 */

/** Days within which a closing window warns even with everyone grown. */
export const WINDOW_SOON_DAYS = 7;

/** One of the two, where they are going, and where they age. */
export type WindowSide = {
  id: string;
  /** The household they age in: where the game has them. */
  gid: string;
  clock: AgingClock;
  /** Not born yet: `days` to grow up count from birth. */
  unborn: boolean;
  days: number;
};

export type PlanWindow = {
  /**
   * open: everyone grown up; waiting: someone still has to grow up;
   * closing: if their households are played alike, the window for babies
   * shuts first (or shuts soon); closed: it shuts first for sure, or has.
   */
  state: 'open' | 'waiting' | 'closing' | 'closed';
  /** The last of them still to grow up, and the days until they do. */
  opens?: WindowSide;
  /** The one whose turning Elder ends the chance of babies, and the days until then. */
  closes?: WindowSide;
  /** Everyone who could carry a baby is an Elder already. */
  elders?: string[];
  /** Their birthdays line up: one clock, every day or the same household's play. */
  together: boolean;
};

/** Where a sim ages: the household the game has them in. */
export type HomeOf = (n: SimNode) => string;

/**
 * The window for babies between `sims` (two partners, or a planned baby's
 * parents), or null when the board can't tell: a sim without save facts,
 * a pet, one not in the game yet. Who can carry: the women among them,
 * or everyone when none is one, as the game lets anyone carry.
 */
export function planWindow(sims: SimNode[], game: SaveGameInfo | null | undefined, homeOf: HomeOf = (n) => n.gid): PlanWindow | null {
  if (sims.length < 2 || !game || sims.some((n) => n.species)) return null;
  const sides = sims.map((n) => {
    const gid = homeOf(n);
    const ahead = lifeAhead({ ...n, gid }, game);
    return { n, gid, ahead };
  });
  if (sides.some((s) => s.ahead.clock === 'unknown' && !s.ahead.unborn)) return null;
  const side = (s: (typeof sides)[number], days: number): WindowSide => ({
    id: s.n.id,
    gid: s.gid,
    clock: s.ahead.clock,
    unborn: s.ahead.unborn,
    days,
  });

  const growing = sides.filter((s) => (s.ahead.grownUpIn ?? 0) > 0);
  const last = growing.sort((a, b) => b.ahead.grownUpIn! - a.ahead.grownUpIn!)[0];
  const opens = last ? side(last, last.ahead.grownUpIn!) : undefined;

  const women = sides.filter((s) => s.n.gender === 'Female');
  const carriers = women.length ? women : sides;
  const young = carriers.filter((s) => s.ahead.elderIn !== undefined);
  if (!young.length) {
    return { state: 'closed', ...(opens ? { opens } : {}), elders: carriers.map((s) => s.n.id), together: false };
  }
  // The window lasts while any who could carry is not an elder: the last of them to turn one.
  const latest = young.sort((a, b) => b.ahead.elderIn! - a.ahead.elderIn!)[0]!;
  const closes = side(latest, latest.ahead.elderIn!);
  // A baby not born yet ages where it is born: with the carrier, when that's one clock.
  const together = !!opens && (opens.unborn ? closes.clock === 'always' || (closes.gid === opens.gid && closes.clock === 'played') : sameClock(opens, closes));
  if (!opens) {
    return { state: closes.days <= WINDOW_SOON_DAYS ? 'closing' : 'open', closes, together: false };
  }
  // The carrier is the one still growing up: nothing to race.
  if (opens.id === closes.id) return { state: 'waiting', opens, closes, together };
  const comparable = !opens.unborn && aging(opens.clock) && aging(closes.clock);
  if (opens.unborn) {
    // Born today, they'd still grow up after the carrier turns Elder.
    const late = closes.days <= opens.days;
    return { state: late ? (together ? 'closed' : 'closing') : 'waiting', opens, closes, together };
  }
  if (comparable && opens.days >= closes.days) return { state: together ? 'closed' : 'closing', opens, closes, together };
  return { state: 'waiting', opens, closes, together };
}

const aging = (c: AgingClock) => c === 'always' || c === 'played';

/** Do the two age on the same days: both every day, or both while one household is played. */
function sameClock(a: WindowSide, b: WindowSide): boolean {
  if (a.clock === 'always' && b.clock === 'always') return true;
  return a.gid === b.gid && a.clock === b.clock && (a.clock === 'played' || a.clock === 'paused');
}

/** "5 days", "1 day", "less than a day", as the game rounds them. */
function days(n: number): string {
  if (n < 1) return 'less than a day';
  const d = Math.floor(n);
  return `${d} ${d === 1 ? 'day' : 'days'}`;
}

/**
 * When something happens to a side, on their clock: "in 9 days (Day 34,
 * in Summer)" for one who ages every day, "after 9 days of playing the
 * Dreamer household" for one who ages only while played.
 */
function whenText(s: WindowSide, hhOf: (gid: string) => string, game: SaveGameInfo | null | undefined): string {
  if (s.clock === 'always') return `in ${days(s.days)}${game ? ` (${calendarDay(game, s.days)})` : ''}`;
  if (s.clock === 'paused') return `after ${days(s.days)} of play, once you play ${hhOf(s.gid)}`;
  if (s.clock === 'never') return `in ${days(s.days)} of aging, but ${hhOf(s.gid)} isn’t aging`;
  return `after ${days(s.days)} of playing ${hhOf(s.gid)}`;
}

/**
 * The window in a sentence, and how much it matters, or null when there
 * is nothing worth a line: a couple both grown with years ahead.
 * `babies`: the plan is a baby, so a window still open is worth saying.
 */
export function windowText(
  w: PlanWindow,
  nameOf: (id: string) => string,
  hhOf: (gid: string) => string,
  game: SaveGameInfo | null | undefined,
  babies = false,
): { text: string; tone: 'info' | 'warn' } | null {
  if (w.elders) {
    const who = w.elders.map(nameOf);
    const are = who.length > 1 ? `${who.slice(0, -1).join(', ')} and ${who[who.length - 1]} are Elders` : `${who[0]} is an Elder`;
    return { text: `${are}: in the game, an Elder can’t carry a baby.`, tone: 'warn' };
  }
  const c = w.closes!;
  const C = nameOf(c.id);
  if (!w.opens) {
    if (w.state === 'closing') return { text: `Babies before ${C} turns Elder: ${whenText(c, hhOf, game)}.`, tone: 'warn' };
    return babies ? { text: `${C} turns Elder ${whenText(c, hhOf, game)}.`, tone: 'info' } : null;
  }
  const o = w.opens;
  const O = nameOf(o.id);
  if (o.id === c.id) return null;
  if (o.unborn) {
    if (w.state === 'waiting') {
      return w.together
        ? { text: `Born within ${days(c.days - o.days)}, ${O} grows up before ${C} turns Elder.`, tone: 'info' }
        : { text: `${C} turns Elder ${whenText(c, hhOf, game)}: ${O} grows up ${days(o.days)} after birth.`, tone: 'info' };
    }
    return {
      text: `${C} turns Elder ${whenText(c, hhOf, game)}, before ${O} could grow up, ${days(o.days)} after birth: no babies of theirs together.`,
      tone: 'warn',
    };
  }
  if (w.state === 'closed') {
    return { text: `${C} turns Elder ${whenText(c, hhOf, game)}, before ${O} grows up: no babies of theirs together.`, tone: 'warn' };
  }
  if (w.state === 'closing') {
    return {
      text: `${C} turns Elder ${whenText(c, hhOf, game)}. Play ${hhOf(o.gid)} more than ${hhOf(c.gid)}, or ${C} turns Elder before ${O} grows up.`,
      tone: 'warn',
    };
  }
  return { text: `${C} turns Elder ${whenText(c, hhOf, game)}.`, tone: 'info' };
}

/**
 * Why playing the household of the one still growing up is urgent, for Up
 * next: "Dirk Dreamer needs 9 days here to catch up with Beatrice Capp, who
 * turns Elder after 30 days of playing the Capp household".
 */
export function catchUpText(w: PlanWindow, nameOf: (id: string) => string, hhOf: (gid: string) => string): string | null {
  if (!w.opens || !w.closes || w.opens.unborn) return null;
  return `${nameOf(w.opens.id)} needs ${days(w.opens.days)} here to catch up with ${nameOf(w.closes.id)}, who turns Elder ${whenText(w.closes, hhOf, null)}`;
}

/**
 * The matchmaking clock of each heir in a dynasty's line with their
 * partner, the game's or planned: the next heir comes from them. Heads
 * are left out; an heir not born yet has no partner to time.
 */
export function partnerWindows(f: SuccessionForecast, nodes: readonly SimNode[], game: SaveGameInfo | null | undefined): Map<string, PlanWindow> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const out = new Map<string, PlanWindow>();
  for (const s of f.steps) {
    if (s.place === 'head' || s.unborn || !s.partner) continue;
    const me = byId.get(s.id);
    const them = byId.get(s.partner.id);
    if (!me || !them) continue;
    const w = planWindow([me, them], game);
    if (w) out.set(s.id, w);
  }
  return out;
}
