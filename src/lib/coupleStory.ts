import { uKey } from './utils.ts';
import type { Edge } from '../types/whiteboard.ts';

/**
 * A couple's story: their romances, marriages and the ends planned for them,
 * in order. Romance, a breakup, back together, married, divorced, back
 * together again: each is its own link (or a link's planned end), so each is
 * its own step, with its own Log line and bin (plans are stories).
 *
 * The order is when each was known: the board's links first (the starter
 * roster's, then the save's, by when it was uploaded), then each plan by when
 * it was made. Links known at the same moment go a past divorce, then a
 * romance, then a marriage. The couple is where the last link puts them.
 */

const UNION = new Set(['marriage', 'romance', 'divorced']);
const RANK: Record<string, number> = { divorced: 0, romance: 1, marriage: 2 };

export function isUnionEdge(e: Edge): boolean {
  return UNION.has(e.type);
}

function time(iso: string | undefined): number {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? t : 0;
}

/** Each couple's links in story order, by the couple's key (uKey). */
export function storiesByPair(edges: readonly Edge[]): Map<string, Edge[]> {
  const out = new Map<string, Edge[]>();
  edges.forEach((e) => {
    if (!UNION.has(e.type)) return;
    const k = uKey(e.a, e.b);
    const list = out.get(k) ?? [];
    list.push(e);
    out.set(k, list);
  });
  const at = new Map(edges.map((e, i) => [e, i]));
  for (const list of out.values()) {
    list.sort(
      (x, y) =>
        time(x.createdAt) - time(y.createdAt) ||
        (RANK[x.type] ?? 0) - (RANK[y.type] ?? 0) ||
        at.get(x)! - at.get(y)!,
    );
  }
  return out;
}

const pastCache = new WeakMap<readonly Edge[], ReadonlySet<string>>();

/**
 * Couple links a later step of the same couple's story replaced: every one
 * but each couple's last. Worked out once per list of links.
 */
export function pastUnionIds(edges: readonly Edge[]): ReadonlySet<string> {
  let past = pastCache.get(edges);
  if (!past) {
    const ids = new Set<string>();
    for (const list of storiesByPair(edges).values()) {
      for (const e of list.slice(0, -1)) ids.add(e.id);
    }
    past = ids;
    pastCache.set(edges, past);
  }
  return past;
}

/** The links as the board shows them now: each couple at the last step of its story. */
export function withoutPastUnions<T extends Edge>(edges: readonly T[]): T[] {
  const past = pastUnionIds(edges);
  return past.size ? edges.filter((e) => !past.has(e.id)) : [...edges];
}

/**
 * A marriage or romance that holds now: no planned divorce or breakup, and
 * no later step of the couple's story in its place.
 */
export function isOngoingCouple(e: Edge, edges: readonly Edge[]): boolean {
  return (e.type === 'marriage' || e.type === 'romance') && !e.ending && !pastUnionIds(edges).has(e.id);
}

export type StoryStepKind = 'romance' | 'marriage' | 'divorced' | 'breakup' | 'divorce';

export type StoryStep = {
  kind: StoryStepKind;
  /** The link this step is: its start, or its planned end. */
  edgeId: string;
  part: 'start' | 'end';
  /** A plan (violet, with a bin), or the board's own link. */
  planned: boolean;
  /** Its words: "Romance", "Get back together", "Marry", "Break up". */
  label: string;
  secret?: true;
};

/** The couple's story, step by step, from their links in story order. */
export function storySteps(links: readonly Edge[], plannedOf: (e: Edge) => boolean): StoryStep[] {
  const steps: StoryStep[] = [];
  let ended = false;
  let married = false;
  for (const e of links) {
    const planned = plannedOf(e);
    if (e.type === 'divorced') {
      steps.push({ kind: 'divorced', edgeId: e.id, part: 'start', planned, label: 'Divorced' });
      ended = true;
      married = true;
      continue;
    }
    if (e.type === 'romance') {
      const label = e.secret ? 'Secret lovers' : ended ? 'Get back together' : 'Romance';
      steps.push({ kind: 'romance', edgeId: e.id, part: 'start', planned, label, ...(e.secret ? { secret: true as const } : {}) });
    } else if (e.type === 'marriage') {
      const label = planned ? (married ? 'Remarry' : 'Marry') : 'Married';
      steps.push({ kind: 'marriage', edgeId: e.id, part: 'start', planned, label });
      married = true;
    }
    ended = false;
    if (e.ending) {
      const divorce = e.type === 'marriage';
      steps.push({
        kind: divorce ? 'divorce' : 'breakup',
        edgeId: e.id,
        part: 'end',
        planned: true,
        label: divorce ? 'Divorce' : 'Break up',
      });
      ended = true;
    }
  }
  return steps;
}

export type NextStep = 'romance' | 'marriage' | 'breakup' | 'divorce';

/**
 * What can come next in a couple's story, from its last link: a romance can
 * end or become a marriage, a marriage can end, and after an end they can
 * get back together or marry. Nothing once a passing ended it.
 */
export function nextSteps(last: Edge | undefined, endedByPassing = false): NextStep[] {
  if (!last || endedByPassing) return [];
  if (last.type === 'divorced' || last.ending) return ['romance', 'marriage'];
  if (last.type === 'marriage') return ['divorce'];
  return ['marriage', 'breakup'];
}

/** The words for a next step on its button, given the couple's story so far. */
export function nextStepLabel(step: NextStep, steps: readonly StoryStep[]): string {
  const married = steps.some((s) => s.kind === 'marriage' || s.kind === 'divorced');
  const ended = steps.length > 0 && (steps[steps.length - 1]!.part === 'end' || steps[steps.length - 1]!.kind === 'divorced');
  switch (step) {
    case 'romance':
      return ended ? 'Get back together' : 'Romance';
    case 'marriage':
      return married ? 'Remarry' : 'Marry';
    case 'breakup':
      return 'Break up';
    case 'divorce':
      return 'Divorce';
  }
}

/**
 * Why a new couple link of `type` can't be made between these two now, or
 * null when it can: the last step of their story already is one.
 */
export function coupleLinkBlock(edges: readonly Edge[], a: string, b: string, type: 'marriage' | 'romance', secret = false): string | null {
  const story = storiesByPair(edges).get(uKey(a, b));
  const last = story?.[story.length - 1];
  if (!last || last.ending || last.type === 'divorced') return null;
  if (last.type === 'marriage') return 'Married already';
  if (type === 'romance') return secret ? (last.secret ? 'Secret lovers already' : null) : 'In a romance already';
  return null;
}
