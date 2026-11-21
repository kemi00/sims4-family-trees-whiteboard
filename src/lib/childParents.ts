import { AGES_H, DECEASED_STATE } from './constants.ts';
import { cardName } from './plan.ts';
import { fold } from './utils.ts';
import type { SimNode } from '../types/whiteboard.ts';

/**
 * A child from a household's ＋: born or adopted, and its parents chosen,
 * never guessed from who is in a romance. Up to two sims, linked or not
 * (woohoo, a science baby, one parent alone, friends adopting together), at
 * any life stage, or none: the child joins with no parents on the board.
 */

/** How a planned child joins: born, or adopted. */
export type ChildArrival = 'born' | 'adopted';

/** The life stages the game lets you adopt at. */
export const ADOPTED_AGES = ['Infant', 'Toddler', 'Child'] as const;

/** A child has two parents at most. */
export const MAX_PARENTS = 2;

/** What the menu hands back: how they arrive, their parents, last name, and an adopted child's stage and gender. */
export type ChildChoice = {
  arrives: ChildArrival;
  parents: string[];
  sur: string;
  age?: string;
  gender?: string;
};

/**
 * Who can be a planned child's parent: any living sim, at any life stage,
 * a baby not born yet too (an heir's heir). A plan is for later: the card
 * says when they're grown (whenLine), never whether the game allows it.
 * Pets and sims who passed away aren't offered: waiting won't change that.
 */
export function canParent(n: SimNode): boolean {
  return !n.species && n.state !== DECEASED_STATE;
}

/** The oldest life stage first: parents read before their teens. */
function byStage(a: SimNode, b: SimNode): number {
  const rank = (n: SimNode) => {
    const i = AGES_H.indexOf(n.age as (typeof AGES_H)[number]);
    return i < 0 ? -1 : i;
  };
  return rank(b) - rank(a) || cardName(a).localeCompare(cardName(b), undefined, { sensitivity: 'base' });
}

/** The household's sims who could be parents, the oldest stage first, then A to Z. */
export function householdParents(nodes: readonly SimNode[], gid: string): SimNode[] {
  return nodes.filter((n) => n.gid === gid && canParent(n)).sort(byStage);
}

/**
 * Anyone else who could be a parent, found by name (accents and case
 * aside): never those in `exclude` (the household's own, listed already).
 * Names that start with the search first, `max` at most.
 */
export function parentSearch(
  nodes: readonly SimNode[],
  query: string,
  exclude: ReadonlySet<string>,
  max = 6,
): SimNode[] {
  const q = fold(query);
  if (!q) return [];
  const hits = nodes.filter((n) => !exclude.has(n.id) && canParent(n) && fold(`${n.first} ${n.sur} ${cardName(n)}`).includes(q));
  const starts = (n: SimNode) => fold(n.first).startsWith(q) || fold(n.sur).startsWith(q);
  return [...hits.filter(starts).sort(byStage), ...hits.filter((n) => !starts(n)).sort(byStage)].slice(0, max);
}

/**
 * The last names a planned child could take: each picked parent's, once,
 * in the order picked. With no parent, the household's own: the one in its
 * name first, in its order ("Watson" for the Watson Family, Moody before
 * McMillan for Moody & McMillan), then the most common there,
 * then A to Z; the household's name when no one there has a last name.
 * More than one is a question to ask.
 */
export function childSurnames(parents: readonly SimNode[], household: readonly SimNode[], hh: string): string[] {
  const key = (x: string) => x.trim().toLocaleLowerCase();
  const once = (list: string[]) => {
    const out: string[] = [];
    for (const s of list.map((x) => x.trim()).filter(Boolean)) {
      if (!out.some((o) => key(o) === key(s))) out.push(s);
    }
    return out;
  };
  const own = once(parents.map((p) => p.sur));
  if (own.length) return own;
  const sims = household.filter((n) => !n.species);
  // Where a last name comes in the household's name: Moody before McMillan in "Moody & McMillan".
  const words = key(hh).split(/\s+/);
  const at = (s: string) => {
    const i = key(s) === key(hh) ? 0 : words.indexOf(key(s));
    return i < 0 ? Infinity : i;
  };
  const count = (s: string) => sims.filter((n) => key(n.sur) === key(s)).length;
  const home = once(sims.map((n) => n.sur)).sort((a, b) => at(a) - at(b) || count(b) - count(a) || a.localeCompare(b));
  return home.length ? home : once([hh]);
}
