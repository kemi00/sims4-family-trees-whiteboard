import type { Lifespan, SaveGameInfo, SimLife, SimNode } from '../types/whiteboard.ts';

/**
 * The game's clock and life stages, as read from real saves on 2026-11-06/07:
 * 90,000 ticks a sim hour; stage lengths on Normal as below (the game
 * back-dates premades by exactly these); Short halves them and Long makes
 * them four times as long. Malcolm Landgraab, 5.45 days into his teens on
 * Short, showed "Days till age up: 5" in the game, 10 on Normal.
 */
export const TICKS_PER_HOUR = 90_000;
export const TICKS_PER_DAY = 24 * TICKS_PER_HOUR;

export const LIFESPAN_SCALE: Record<Lifespan, number> = { Short: 0.5, Normal: 1, Long: 4 };

/** Normal-lifespan days of each stage. An elder lives at least this long. */
const NORMAL_DAYS: Record<string, number> = {
  Newborn: 1,
  Infant: 5,
  Toddler: 7,
  Child: 14,
  Teen: 21,
  'Young Adult': 28,
  Adult: 42,
  Elder: 14,
};

const ORDER = ['Newborn', 'Infant', 'Toddler', 'Child', 'Teen', 'Young Adult', 'Adult', 'Elder'];

/** The board's life stage, with a newborn told apart from an infant. */
function stageKey(stage: string, newborn?: boolean): string {
  return newborn && stage === 'Infant' ? 'Newborn' : stage;
}

export function scaleOf(lifespan?: Lifespan): number {
  return LIFESPAN_SCALE[lifespan ?? 'Normal'];
}

/** The stage a sim can marry in, and the first one counted as grown up. */
export const GROWN_UP = 'Young Adult';

/**
 * Normal-lifespan days of an elder's shortest life. Old age can come from
 * then on, usually within a few days; traits like Long Lived stretch it,
 * and a save does not show by how much.
 */
export const ELDER_MIN_DAYS = NORMAL_DAYS.Elder!;

/** Normal-lifespan days of life before this stage begins. */
export function daysBeforeStage(stage: string, newborn?: boolean): number | null {
  const key = stageKey(stage, newborn);
  const at = ORDER.indexOf(key);
  if (at < 0) return null;
  let days = 0;
  for (const s of ORDER.slice(0, at)) days += NORMAL_DAYS[s]!;
  return days;
}

/**
 * Where a sim is in life, in Normal-lifespan days: the stages before theirs
 * plus their days into it. Two sims with the same value reach every birthday
 * together while both age. Null for a stage the clock does not know.
 */
export function lifeDays(life: SimLife): number | null {
  const before = daysBeforeStage(life.stage, life.newborn);
  return before === null ? null : before + life.stageDays;
}

/**
 * Days, on `lifespan`, until a sim `stageDays` Normal days into `stage`
 * reaches `target`: 0 when they are there or past it, null for a stage the
 * clock does not know. A teen 10.9 Normal days in is a young adult in
 * 5.05 Short days.
 */
export function daysUntilStage(
  stage: string,
  stageDays: number,
  target: string,
  lifespan?: Lifespan,
  newborn?: boolean,
): number | null {
  const from = daysBeforeStage(stage, newborn);
  const to = daysBeforeStage(target);
  if (from === null || to === null) return null;
  return Math.max(0, to - (from + stageDays)) * scaleOf(lifespan);
}

/** The life stage `days` Normal-lifespan days into a life: "Newborn" for the first. */
export function stageAtLifeDays(days: number): string {
  let out = ORDER[0]!;
  for (const s of ORDER) if (daysBeforeStage(s)! <= days) out = s;
  return out;
}

/** Days from birth to `target` on `lifespan`: a baby not born yet grows up 24 Short days after birth. */
export function daysFromBirth(target: string, lifespan?: Lifespan): number | null {
  const to = daysBeforeStage(target);
  return to === null ? null : to * scaleOf(lifespan);
}

/**
 * Days left, on `lifespan`, before old age can come for an elder
 * `stageDays` Normal days in: the earliest, never a date (ELDER_MIN_DAYS).
 * 0 once they are past it.
 */
export function oldAgeEarliest(stageDays: number, lifespan?: Lifespan): number {
  return Math.max(0, ELDER_MIN_DAYS - stageDays) * scaleOf(lifespan);
}

/** "old age in 4+ days", "old age in under a day", "old age any day now". */
export function oldAgeSoonText(oldAgeIn: number | undefined): string {
  if (!oldAgeIn) return 'old age any day now';
  const n = Math.floor(oldAgeIn);
  return n < 1 ? 'old age in under a day' : `old age in ${n}+ ${n === 1 ? 'day' : 'days'}`;
}

/**
 * Best guess for a card with no save facts: the middle of its life stage.
 * Null for pets and unknown stages.
 */
export function approxLifeDays(n: SimNode): number | null {
  if (n.species) return null;
  const before = daysBeforeStage(n.age);
  return before === null ? null : before + NORMAL_DAYS[n.age]! / 2;
}

/** Day number on the game's clock: Day 1 starts at tick 0, earlier days count 0, −1… */
export function dayOf(tick: number): number {
  return Math.floor(tick / TICKS_PER_DAY) + 1;
}

/** Year of a day when years are four seasons long; Year 1 begins on Day 1. */
export function yearOf(day: number, seasonDays: number): number {
  return Math.floor((day - 1) / (4 * seasonDays)) + 1;
}

/** "Day 6", "Day −26": a typographic minus for the days before play. */
export function dayText(day: number): string {
  return `Day ${day < 0 ? `\u2212${-day}` : day}`;
}

/** "Year 1", "Year −1". */
export function yearText(year: number): string {
  return `Year ${year < 0 ? `\u2212${-year}` : year}`;
}

/** "Day 6, 3:43 AM". */
export function clockText(tick: number): string {
  const day = dayOf(tick);
  const into = tick - (day - 1) * TICKS_PER_DAY;
  const minutes = Math.floor(into / (TICKS_PER_HOUR / 60));
  const h24 = Math.floor(minutes / 60) % 24;
  const mm = String(minutes % 60).padStart(2, '0');
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${dayText(day)}, ${h12}:${mm} ${h24 < 12 ? 'AM' : 'PM'}`;
}

/** "5 days", "1 day", "less than a day": whole days, rounded down like the game. */
export function wholeDaysText(days: number): string {
  if (days < 1) return 'less than a day';
  const n = Math.floor(days);
  return `${n} ${n === 1 ? 'day' : 'days'}`;
}

/** "31.8 days", "1 day". */
export function daysText(days: number): string {
  const n = Math.round(days * 10) / 10;
  return `${n} ${n === 1 ? 'day' : 'days'}`;
}

export type LifeView = {
  stage: string;
  newborn: boolean;
  /** Days lived when the save was made. */
  daysAlive: number;
  bornDay: number;
  /** With a known season length. */
  bornYear?: number;
  inPlay: boolean;
  /** Share of the stage behind them, 0–1; elders have none. */
  through?: number;
  /** Days left before the next stage, on the save's lifespan. */
  daysToNext?: number;
  next?: string;
  /** How long an elder has been one, on the save's lifespan. */
  elderDays?: number;
  /** An elder's days left before old age can come; 0 once past (oldAgeEarliest). */
  oldAgeIn?: number;
  /** Days left to Young Adult, for a sim not grown up yet. */
  grownUpIn?: number;
  frozen?: SimLife['frozen'];
  lifespan: Lifespan;
  /** The save's lifespan is unknown; Normal is assumed. */
  lifespanGuessed: boolean;
  /** The facts come from an import before the board's last one. */
  fromEarlierImport: boolean;
  /** Game clock when they were read. */
  at: number;
};

/**
 * What the editor shows about a sim's age. Null for a card with no save
 * facts, a pet, or one whose life stage was changed on the board since.
 */
export function lifeView(n: SimNode, game?: SaveGameInfo | null): LifeView | null {
  const life = n.life;
  if (!life || n.species || life.stage !== n.age) return null;
  const lifespan = game?.lifespan ?? 'Normal';
  const scale = scaleOf(lifespan);
  const key = stageKey(life.stage, life.newborn);
  const length = NORMAL_DAYS[key];
  if (length === undefined) return null;
  const bornDay = dayOf(life.born);
  const nextKey = key === 'Elder' ? undefined : ORDER[ORDER.indexOf(key) + 1];
  return {
    stage: life.stage,
    newborn: !!life.newborn,
    daysAlive: (life.at - life.born) / TICKS_PER_DAY,
    bornDay,
    ...(game?.seasonDays ? { bornYear: yearOf(bornDay, game.seasonDays) } : {}),
    inPlay: !!life.inPlay,
    ...(key === 'Elder'
      ? { elderDays: life.stageDays * scale, oldAgeIn: oldAgeEarliest(life.stageDays, lifespan) }
      : {
          through: Math.min(1, life.stageDays / length),
          daysToNext: Math.max(0, (length - life.stageDays) * scale),
          next: nextKey,
        }),
    ...(ORDER.indexOf(key) < ORDER.indexOf(GROWN_UP)
      ? { grownUpIn: daysUntilStage(life.stage, life.stageDays, GROWN_UP, lifespan, life.newborn)! }
      : {}),
    ...(life.frozen ? { frozen: life.frozen } : {}),
    lifespan,
    lifespanGuessed: !game?.lifespan,
    fromEarlierImport: !!game && game.clock !== life.at,
    at: life.at,
  };
}

/** Why a sim is not aging, in words. */
export function frozenText(frozen: NonNullable<SimLife['frozen']>): string {
  if (frozen === 'inactive') return 'not aging now: only the active household ages';
  if (frozen === 'unplayed') return 'not aging now: unplayed households don’t age';
  return 'not aging now: played households don’t age';
}

/**
 * Was a sim in this household aging when the game saved? Undefined when the
 * save does not say enough to tell.
 */
export function frozenReason(opts: {
  played: boolean;
  active: boolean;
  playedAging?: SaveGameInfo['playedAging'];
  unplayedAging?: boolean;
}): SimLife['frozen'] | undefined | null {
  if (opts.played) {
    if (opts.playedAging === 'Yes') return null;
    if (opts.playedAging === 'Active') return opts.active ? null : 'inactive';
    if (opts.playedAging === 'No') return 'played';
    return undefined;
  }
  if (opts.unplayedAging === undefined) return undefined;
  return opts.unplayedAging ? null : 'unplayed';
}

/** Auto Age (Played Households) in words for the save details. */
export function playedAgingText(v: SaveGameInfo['playedAging']): string {
  if (v === 'Yes') return 'Yes';
  if (v === 'No') return 'No';
  if (v === 'Active') return 'Only the active household';
  return 'Unknown';
}

/** Does every household age under these options? */
export function everyoneAges(game: Pick<SaveGameInfo, 'playedAging' | 'unplayedAging'>): boolean {
  return game.playedAging === 'Yes' && game.unplayedAging === true;
}

const NEXT_SEASON = { Spring: 'Summer', Summer: 'Fall', Fall: 'Winter', Winter: 'Spring' } as const;

/**
 * Where the save is in its Seasons calendar: the season, which day of it,
 * and the next one. Null without Seasons, whose saves only count days.
 */
export function seasonNow(
  game: Pick<SaveGameInfo, 'clock' | 'season' | 'seasonSince' | 'seasonDays'>,
): { season: NonNullable<SaveGameInfo['season']>; day: number; of: number; next: NonNullable<SaveGameInfo['season']>; nextIn: number } | null {
  if (!game.season || !game.seasonDays) return null;
  const of = game.seasonDays;
  const into = Math.max(0, game.clock - (game.seasonSince ?? 0)) / TICKS_PER_DAY;
  const day = Math.min(of, Math.floor(into) + 1);
  return { season: game.season, day, of, next: NEXT_SEASON[game.season], nextIn: Math.max(0, Math.ceil(of - into)) };
}

/**
 * The season on game tick `tick`, counting whole seasons on from the one
 * the save is in. Null without Seasons.
 */
export function seasonAt(
  game: Pick<SaveGameInfo, 'season' | 'seasonSince' | 'seasonDays'>,
  tick: number,
): NonNullable<SaveGameInfo['season']> | null {
  if (!game.season || !game.seasonDays) return null;
  const steps = Math.floor((tick - (game.seasonSince ?? 0)) / (game.seasonDays * TICKS_PER_DAY));
  const order = ['Spring', 'Summer', 'Fall', 'Winter'] as const;
  const at = order.indexOf(game.season);
  return order[(((at + steps) % 4) + 4) % 4]!;
}

/**
 * "Short · Spring, day 2 of 7" for the save chip; "Short · Day 2" without
 * Seasons, where the calendar is days alone.
 */
export function saveChipText(game: SaveGameInfo): string {
  const life = game.lifespan ?? 'Lifespan unknown';
  const s = seasonNow(game);
  if (s) return `${life} · ${s.season}, day ${s.day} of ${s.of}`;
  if (game.calendar === 'days') return `${life} · ${dayText(dayOf(game.clock))}`;
  // Read before the board knew the calendar: what it knew then.
  return game.seasonDays ? `${life} · ${game.seasonDays}-day seasons` : `${life} lifespan`;
}

/** Who ages under these options, in a phrase: "only the active household ages". */
export function agingSummary(game: Pick<SaveGameInfo, 'playedAging' | 'unplayedAging'>): string {
  const played = game.playedAging;
  const unplayed = game.unplayedAging;
  if (played === undefined || unplayed === undefined) return '';
  if (played === 'Yes') return unplayed ? 'every household ages' : 'played households age, unplayed ones don’t';
  if (played === 'Active') return unplayed ? 'the active and unplayed households age' : 'only the active household ages';
  return unplayed ? 'only unplayed households age' : 'no household ages';
}
