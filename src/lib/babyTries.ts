import { pairKey } from './calendar.ts';
import type { BabyTry } from '../types/whiteboard.ts';

/** The tries for a couple's next baby: those not yet led to one. */
export function openTries(tries: readonly BabyTry[] | undefined): BabyTry[] {
  return (tries ?? []).filter((t) => !t.for?.length);
}

/**
 * The tries that led to a baby, as their card says it: how many, from the
 * first try's day to the last. Null for a baby with none logged.
 */
export function triesFor(
  all: Record<string, BabyTry[]> | undefined,
  babyId: string,
): { count: number; first: number; last: number } | null {
  for (const tries of Object.values(all ?? {})) {
    const led = tries.filter((t) => t.for?.includes(babyId));
    if (!led.length) continue;
    const days = led.map((t) => t.day);
    return { count: led.length, first: Math.min(...days), last: Math.max(...days) };
  }
  return null;
}

/**
 * Babies an upload found born: each couple's open tries now led to them,
 * twins and more sharing them. The board's tries unchanged (the same
 * object) when no newborn had tries logged.
 */
export function triesToBirths(
  all: Record<string, BabyTry[]> | undefined,
  born: readonly { id: string; parentIds?: readonly string[] }[],
): Record<string, BabyTry[]> | undefined {
  if (!all) return all;
  const babies = new Map<string, string[]>();
  for (const b of born) {
    if (b.parentIds?.length !== 2) continue;
    const key = pairKey(b.parentIds[0]!, b.parentIds[1]!);
    if (!openTries(all[key]).length) continue;
    babies.set(key, [...(babies.get(key) ?? []), b.id]);
  }
  if (!babies.size) return all;
  const next = { ...all };
  for (const [key, ids] of babies) next[key] = next[key]!.map((t) => (t.for?.length ? t : { ...t, for: ids }));
  return next;
}

/** The couple's last baby their tries led to, and how many it took: "Liam came after 4 tries". */
export function lastBabyOf(tries: readonly BabyTry[] | undefined): { ids: string[]; count: number } | null {
  const led = (tries ?? []).filter((t) => t.for?.length);
  if (!led.length) return null;
  const ids = led[led.length - 1]!.for!;
  return { ids, count: led.filter((t) => t.for!.join() === ids.join()).length };
}
