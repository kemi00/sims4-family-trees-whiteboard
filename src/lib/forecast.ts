import { DECEASED_STATE } from './constants.ts';
import {
  ELDER_MIN_DAYS,
  GROWN_UP,
  TICKS_PER_DAY,
  dayOf,
  dayText,
  daysFromBirth,
  daysUntilStage,
  lifeDays,
  oldAgeEarliest,
  scaleOf,
  seasonAt,
  stageAtLifeDays,
} from './lifeClock.ts';
import { isPlannedSim } from './plan.ts';
import { successionLine } from './succession.ts';
import { isUnhousedGid } from './unhoused.ts';
import { edgeSourceOf } from './utils.ts';
import type { Edge, SaveGameInfo, SimNode } from '../types/whiteboard.ts';

/**
 * Which days count toward a sim's birthdays, under the save's aging options.
 * The game's clock only runs while you play, so every count is days of play.
 */
export type AgingClock =
  /** Every day of play, whichever household you play. */
  | 'always'
  /** Only days you play their household (Auto Age: only the active household). */
  | 'played'
  /** None until you play their household: unplayed households don't age. */
  | 'paused'
  /** None: played households don't age. */
  | 'never'
  /** The board has no save facts for them. */
  | 'unknown';

const STAGES = ['Newborn', 'Infant', 'Toddler', 'Child', 'Teen', 'Young Adult', 'Adult', 'Elder'];
const grown = (stage: string) => STAGES.indexOf(stage) >= STAGES.indexOf(GROWN_UP);

/** A card's save facts, when they still describe it: not a pet, its stage unchanged since. */
function factsOf(n: SimNode) {
  const life = n.life;
  return life && !n.species && life.stage === n.age ? life : null;
}

/**
 * Which days count toward `n`'s birthdays. A sim whose household was
 * aging when the game saved is either the active one (aging only while
 * played, under Only Active Household) or ages along with everyone.
 */
export function agingClock(n: SimNode, game: SaveGameInfo | null | undefined): AgingClock {
  const life = factsOf(n);
  if (!life || !game) return 'unknown';
  if (life.frozen === 'inactive') return 'played';
  if (life.frozen === 'played') return 'never';
  if (life.frozen === 'unplayed') return game.playedAging === 'No' ? 'never' : 'paused';
  if (game.playedAging !== 'Active') return 'always';
  // Aging under Only Active Household: the active household, or an unplayed one that ages anyway.
  if (!game.unplayedAging) return 'played';
  const active = (game.lastPlayedGid && n.gid === game.lastPlayedGid) || (!!game.activeHousehold && n.hh === game.activeHousehold);
  return active ? 'played' : 'always';
}

/** One sim in a dynasty's line, with where they are in life. */
export type LineStep = {
  id: string;
  place: 'head' | 'heir' | 'later';
  /** A planned role, or an heir planned after another. */
  planned: boolean;
  /** A planned sim not in the game yet. */
  unborn: boolean;
  stage: string;
  /** "the Goth household". */
  home: string;
  gid: string;
  clock: AgingClock;
  /** Days, on the save's lifespan, until they are a young adult: 0 once grown. Unborn: from birth. */
  grownUpIn?: number;
  /** Days until they are an elder; absent once one. */
  elderIn?: number;
  /** Days until old age can first come for them: 0 from then on. */
  oldAgeIn?: number;
  /** Their partner now, from a marriage or romance with no end planned. */
  partner?: { id: string; married: boolean; planned: boolean };
};

/** Between one in line and the next: will the next be grown up in time? */
export type Handover =
  /** The next is a young adult or older already. */
  | { kind: 'ready' }
  /** They grow up before old age can come for the one before. */
  | { kind: 'first' }
  /** Old age can come first: they could take over at `stage`. */
  | { kind: 'late'; stage: string }
  /** Not born yet: born within `days`, they still grow up in time; 0 or less, not even born today. */
  | { kind: 'bornBy'; days: number; stage?: string }
  /** The one before isn't aging now: nothing is due. Paused: not until you play their household. */
  | { kind: 'still'; paused: boolean }
  /** They age on different days, so their countdowns don't line up. */
  | { kind: 'apart' }
  /** The board can't tell. */
  | { kind: 'unknown' };

export type SuccessionForecast = {
  steps: LineStep[];
  /** handovers[i] is between steps[i] and steps[i + 1]. */
  handovers: Handover[];
};

/** Their partner on the board: a marriage before a romance, the game's before a plan. */
function partnerOf(id: string, edges: readonly Edge[], byId: Map<string, SimNode>): LineStep['partner'] {
  const found = edges
    .filter((e) => (e.type === 'marriage' || e.type === 'romance') && !e.ending && (e.a === id || e.b === id))
    .map((e) => ({ e, other: byId.get(e.a === id ? e.b : e.a) }))
    .filter((x): x is { e: Edge; other: SimNode } => !!x.other && x.other.state !== DECEASED_STATE)
    .sort(
      (x, y) =>
        Number(x.e.type !== 'marriage') - Number(y.e.type !== 'marriage') ||
        Number(edgeSourceOf(x.e) === 'planned') - Number(edgeSourceOf(y.e) === 'planned'),
    )[0];
  return found
    ? { id: found.other.id, married: found.e.type === 'marriage', planned: edgeSourceOf(found.e) === 'planned' }
    : undefined;
}

function stepOf(
  n: SimNode,
  place: LineStep['place'],
  planned: boolean,
  game: SaveGameInfo | null | undefined,
  edges: readonly Edge[],
  byId: Map<string, SimNode>,
): LineStep {
  const unborn = isPlannedSim(n) && !factsOf(n);
  const step: LineStep = {
    id: n.id,
    place,
    planned,
    unborn,
    stage: n.age,
    home: isUnhousedGid(n.gid) || !n.hh ? 'their household' : `the ${n.hh} household`,
    gid: n.gid,
    clock: agingClock(n, game),
  };
  const partner = partnerOf(n.id, edges, byId);
  if (partner) step.partner = partner;
  const lifespan = game?.lifespan;
  if (unborn) {
    step.grownUpIn = daysFromBirth(GROWN_UP, lifespan)!;
    return step;
  }
  const life = factsOf(n);
  if (!life || !game) return step;
  // Facts read at an earlier import, for a sim who ages every day: the days since count.
  const since = step.clock === 'always' ? Math.max(0, (game.clock - life.at) / TICKS_PER_DAY) : 0;
  const left = (d: number | null) => (d === null ? undefined : Math.max(0, d - since));
  step.grownUpIn = left(daysUntilStage(life.stage, life.stageDays, GROWN_UP, lifespan, life.newborn));
  if (life.stage === 'Elder') {
    step.oldAgeIn = left(oldAgeEarliest(life.stageDays, lifespan));
    return step;
  }
  const toElder = daysUntilStage(life.stage, life.stageDays, 'Elder', lifespan, life.newborn);
  if (toElder === null) return step;
  step.elderIn = left(toElder);
  step.oldAgeIn = left(toElder + ELDER_MIN_DAYS * scaleOf(lifespan));
  return step;
}

/** Where a sim `step` will be in life `days` from now, on the save's lifespan. */
function stageIn(n: SimNode, days: number, game: SaveGameInfo | null | undefined): string | undefined {
  const life = factsOf(n);
  if (!life || !game) return undefined;
  const lived = lifeDays(life);
  return lived === null ? undefined : stageAtLifeDays(lived + days / scaleOf(game.lifespan));
}

/** Do `a` and `b` age on the same days? Then their countdowns line up. */
function sameClock(a: LineStep, b: LineStep): boolean {
  if (a.clock === 'unknown' || b.clock === 'unknown' || a.clock === 'never' || b.clock === 'never') return false;
  if (a.gid === b.gid) return a.clock === b.clock;
  return a.clock === 'always' && b.clock === 'always';
}

function handover(a: LineStep, b: LineStep, bNode: SimNode, game: SaveGameInfo | null | undefined): Handover {
  if (!b.unborn && grown(b.stage)) return { kind: 'ready' };
  if (a.clock === 'never' || a.clock === 'paused') return { kind: 'still', paused: a.clock === 'paused' };
  if (a.oldAgeIn === undefined || b.grownUpIn === undefined) return { kind: 'unknown' };
  if (b.unborn) {
    // Born into the card's household: it lines up when that household ages with the one before.
    const lines = a.clock === 'always' || (a.clock === 'played' && a.gid === b.gid);
    if (!lines) return { kind: 'apart' };
    const days = a.oldAgeIn - b.grownUpIn;
    if (days > 0) return { kind: 'bornBy', days };
    // Born today, where they'd be when old age can come.
    return { kind: 'bornBy', days, stage: stageAtLifeDays(a.oldAgeIn / scaleOf(game?.lifespan)) };
  }
  if (!sameClock(a, b)) return { kind: 'apart' };
  if (b.grownUpIn <= a.oldAgeIn) return { kind: 'first' };
  return { kind: 'late', stage: stageIn(bNode, a.oldAgeIn, game) ?? b.stage };
}

/**
 * A dynasty's line of succession as planned (successionLine), each sim
 * with their countdowns on the save's lifespan, and between each two
 * whether the next grows up before old age can come for the one before.
 * Countdowns count the days that age each sim: every day, only days their
 * household is played, or none, as the save's aging options have it.
 */
export function successionForecast(
  nodes: SimNode[],
  edges: readonly Edge[],
  key: string,
  game: SaveGameInfo | null | undefined,
): SuccessionForecast {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const steps = successionLine(nodes, key).map((p) => stepOf(byId.get(p.id)!, p.place, p.planned, game, edges, byId));
  const handovers = steps.slice(1).map((b, i) => handover(steps[i]!, b, byId.get(b.id)!, game));
  return { steps, handovers };
}

/** "a Teen", "an Elder", "a Young Adult". */
export function aStage(stage: string): string {
  return `${/^[AEIOU]/.test(stage) ? 'an' : 'a'} ${stage}`;
}

/** "5 days", "1 day", "less than a day": whole days, as the game rounds them. */
function days(n: number): string {
  if (n < 1) return 'less than a day';
  const d = Math.floor(n);
  return `${d} ${d === 1 ? 'day' : 'days'}`;
}

/** " (Day 34, in Summer)": when a count of days lands, for a sim who ages every day. */
function onDay(step: LineStep, n: number, game: SaveGameInfo | null | undefined): string {
  if (step.clock !== 'always' || !game) return '';
  const tick = game.clock + n * TICKS_PER_DAY;
  const season = seasonAt(game, tick);
  return ` (${dayText(dayOf(tick))}${season ? `, in ${season}` : ''})`;
}

/**
 * Where one in line is going, in a few words: "Young adult in 5 days",
 * "Elder in 10 days · old age in 17+ days", "Old age any day now", or for
 * one not born yet "A young adult 24 days after birth". Empty without save
 * facts.
 */
export function stepWhen(step: LineStep, game: SaveGameInfo | null | undefined): string {
  if (step.unborn) {
    return step.grownUpIn === undefined ? '' : `A young adult ${days(step.grownUpIn)} after birth`;
  }
  if (step.clock === 'unknown') return '';
  if (step.grownUpIn) return `Young adult in ${days(step.grownUpIn)}${onDay(step, step.grownUpIn, game)}`;
  // Grown up: an heir's old age is a generation away; the head's is the handover.
  if (step.place !== 'head' && step.elderIn !== undefined) return '';
  if (step.oldAgeIn === undefined) return '';
  const old = step.oldAgeIn < 1 ? 'Old age any day now' : `Old age in ${Math.floor(step.oldAgeIn)}+ days${onDay(step, step.oldAgeIn, game)}`;
  return step.elderIn !== undefined ? `Elder in ${days(step.elderIn)} · ${old.charAt(0).toLowerCase()}${old.slice(1)}` : old;
}

/**
 * Which days count for them, when it isn't every day, said of their
 * household: "The Goth household ages only while you play it". Empty when
 * the one before in line (`prev`) already said it: same household, same
 * clock.
 */
export function stepClockText(step: LineStep, prev?: LineStep): string {
  if (step.unborn) return '';
  if (prev && prev.gid === step.gid && prev.clock === step.clock) return '';
  const home = `${step.home.charAt(0).toUpperCase()}${step.home.slice(1)}`;
  if (step.clock === 'played') return `${home} ages only while you play it`;
  if (step.clock === 'paused') return `${home} isn’t aging until you play it: unplayed households don’t age`;
  if (step.clock === 'never') return `${home} isn’t aging: played households don’t age`;
  return '';
}

/** The one clock note for a whole line, when everyone in it shares a household and a clock. */
export function lineClockText(steps: readonly LineStep[]): string {
  const born = steps.filter((s) => !s.unborn);
  const first = born[0];
  if (!first || !born.every((s) => s.gid === first.gid && s.clock === first.clock)) return '';
  return stepClockText(first);
}

/** The handover between `from` and `to`, in a sentence; empty when there is nothing to say. */
export function handoverText(h: Handover, from: string, to: string): string {
  switch (h.kind) {
    case 'ready':
      return `${to} is grown up and ready to take over from ${from}.`;
    case 'first':
      return `${to} grows up before old age can come for ${from}.`;
    case 'late':
      return `Old age can come for ${from} before ${to} grows up: ${to} could take over as ${aStage(h.stage)}.`;
    case 'bornBy':
      return h.days > 0
        ? `Born within ${days(h.days)}, ${to} grows up before old age can come for ${from}.`
        : `Even born today, ${to} could only take over from ${from} as ${aStage(h.stage ?? 'Child')}.`;
    case 'still':
      return h.paused
        ? `${from} isn’t aging until you play their household, so no handover is due yet.`
        : `${from} isn’t aging, so no handover is due.`;
    case 'apart':
      return `${from} and ${to} don’t age on the same days, so their countdowns don’t line up.`;
    default:
      return '';
  }
}
