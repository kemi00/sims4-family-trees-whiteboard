import type { BabyTry, Edge, SimNode } from '../types/whiteboard.ts';

/** A pregnancy lasts 100 sim hours (the game's PREGNANCY_RATE to 100): a try that worked is due about four days on. */
export const DAYS_TO_DUE = 4;

/** A baby's tries summed up: how many, from the first try's day to the last. Null with none. */
export function triesSummary(tries: readonly BabyTry[] | undefined): { count: number; first: number; last: number } | null {
  if (!tries?.length) return null;
  const days = tries.map((t) => t.day);
  return { count: tries.length, first: Math.min(...days), last: Math.max(...days) };
}

/** The day a baby is due about, from its last try when that one worked; null otherwise. */
export function dueFromTries(tries: readonly BabyTry[] | undefined): number | null {
  const last = tries?.[tries.length - 1];
  return last?.pregnant ? last.day + DAYS_TO_DUE : null;
}

/** A baby's parents on the board: the cards its parent links come from. */
export function parentsOf(id: string, edges: readonly Edge[], byId: ReadonlyMap<string, SimNode> | Record<string, SimNode>): SimNode[] {
  const get = (x: string) => (byId instanceof Map ? byId.get(x) : (byId as Record<string, SimNode>)[x]);
  return edges.filter((e) => e.type === 'parent' && e.b === id).flatMap((e) => get(e.a) ?? []);
}

/**
 * The pregnancy the save has for a baby's parents: the parent carrying it,
 * by the other parent (or by no one the save names). None when they aren't
 * expecting by the last save.
 */
export function parentsExpecting(parents: readonly SimNode[]): SimNode | undefined {
  return parents.find((p) => p.pregnancy && (!p.pregnancy.with || parents.some((o) => o.id === p.pregnancy!.with)));
}
