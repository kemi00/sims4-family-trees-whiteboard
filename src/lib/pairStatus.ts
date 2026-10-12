import { uKey } from './utils.ts';
import type { PairStatus, PairTag } from '../types/whiteboard.ts';

/** Statuses by sim pair (uKey), for label lookups. */
export type PairIndex = ReadonlyMap<string, readonly PairTag[]>;

export function indexPairStatus(list: readonly PairStatus[]): Map<string, PairTag[]> {
  const m = new Map<string, PairTag[]>();
  for (const p of list) m.set(uKey(p.a, p.b), p.tags);
  return m;
}

/** A loaded file's statuses win for the pairs it lists; the board keeps the rest. */
export function mergePairStatus(
  board: readonly PairStatus[],
  incoming: readonly PairStatus[],
): PairStatus[] {
  const theirs = new Set(incoming.map((p) => uKey(p.a, p.b)));
  return [
    ...board.filter((p) => !theirs.has(uKey(p.a, p.b))),
    ...incoming.map((p) => ({ ...p, tags: [...p.tags] })),
  ];
}

/** The game's own words, as a player sees them in the relationship panel. */
const WORD: Record<PairTag, string> = {
  married: 'Married',
  engaged: 'Engaged',
  partners: 'Partners',
  secretLovers: 'Secret lovers',
  divorced: 'Divorced',
  exes: 'Exes',
  bestFriends: 'Best friends',
  goodFriends: 'Good friends',
  friends: 'Friends',
  disliked: 'Dislike each other',
  despised: 'Despise each other',
  enemies: 'Enemies',
};

const ROMANCE: readonly PairTag[] = ['married', 'engaged', 'partners', 'secretLovers'];

export function pairTagWord(tag: PairTag): string {
  return WORD[tag];
}

/** Engaged / Partners for a romance link, when the save says which. */
export function romanceWord(tags: readonly PairTag[] | undefined): string | null {
  if (tags?.includes('engaged')) return WORD.engaged;
  if (tags?.includes('partners')) return WORD.partners;
  return null;
}

/**
 * What a child's two parents are to each other when the board has no
 * partner line between them: "Not a couple · Best friends". A romance the
 * save knows but the board lacks says so rather than "Not a couple".
 */
export function coParentNote(tags: readonly PairTag[] | undefined): string {
  const romance = tags?.find((t) => ROMANCE.includes(t));
  const rest = (tags ?? []).filter((t) => !ROMANCE.includes(t)).map(pairTagWord);
  const head = romance ? `${WORD[romance]} in your save` : 'Not a couple';
  return [head, ...rest].join(' · ');
}
