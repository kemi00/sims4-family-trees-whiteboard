import { NOT_IN_WORLD, hasDied } from './constants.ts';
import { isPlannedSim } from './plan.ts';
import { isUnhousedGid } from './unhoused.ts';
import type { SimNode } from '../types/whiteboard.ts';

/** The life stages a world's population is counted by, youngest first. */
export const STAT_STAGES = ['Infant', 'Toddler', 'Child', 'Teen', 'Young Adult', 'Adult', 'Elder'] as const;

export type WorldStats = {
  world: string;
  /** Living sims in the game (not pets, not planned ones). */
  sims: number;
  byStage: Record<string, number>;
  /** "Female", "Male", "Non-Binary", or '' for a gender not set. */
  byGender: Record<string, number>;
  pets: number;
  /** Sims who passed away, kept on the board. */
  remembered: number;
  /** Planned sims, not in the game yet. */
  planned: number;
  /** Households with a living sim or pet in the game; a world's Unhoused sims aside. */
  households: number;
  /** Lots free to move into (the board's Free lots box). */
  freeLots: number;
};

function empty(world: string): WorldStats {
  return { world, sims: 0, byStage: {}, byGender: {}, pets: 0, remembered: 0, planned: 0, households: 0, freeLots: 0 };
}

/**
 * Each world's numbers, for the cards the board shows (filters apply): its
 * population by life stage and gender, pets, the dead it remembers, plans,
 * households and free lots. In `order` (the Legend's), then any other world
 * with a card; Not in any world last, which has no lots.
 */
export function worldStats(
  nodes: readonly SimNode[],
  freeLots: ReadonlyMap<string, readonly unknown[]>,
  order: readonly string[] = [],
): WorldStats[] {
  const by = new Map<string, WorldStats>();
  const homes = new Map<string, Set<string>>();
  const of = (w: string) => {
    let s = by.get(w);
    if (!s) {
      s = empty(w);
      by.set(w, s);
    }
    return s;
  };
  for (const n of nodes) {
    const s = of(n.world || NOT_IN_WORLD);
    if (isPlannedSim(n)) {
      s.planned += 1;
      continue;
    }
    if (hasDied(n.state)) {
      s.remembered += 1;
      continue;
    }
    if (!isUnhousedGid(n.gid)) {
      const set = homes.get(s.world) ?? new Set<string>();
      set.add(n.gid);
      homes.set(s.world, set);
    }
    if (n.species) {
      s.pets += 1;
      continue;
    }
    s.sims += 1;
    s.byStage[n.age] = (s.byStage[n.age] ?? 0) + 1;
    const g = n.gender && n.gender !== '-' ? n.gender : '';
    s.byGender[g] = (s.byGender[g] ?? 0) + 1;
  }
  for (const [w, set] of homes) of(w).households = set.size;
  for (const [w, lots] of freeLots) if (by.has(w)) of(w).freeLots = lots.length;
  const rank = new Map(order.map((w, i) => [w, i]));
  return [...by.values()].sort(
    (a, b) =>
      Number(a.world === NOT_IN_WORLD) - Number(b.world === NOT_IN_WORLD) ||
      (rank.get(a.world) ?? Infinity) - (rank.get(b.world) ?? Infinity) ||
      a.world.localeCompare(b.world),
  );
}

/** Every world's numbers added up: the whole board. */
export function boardStats(list: readonly WorldStats[]): WorldStats {
  const all = empty('');
  for (const s of list) {
    all.sims += s.sims;
    all.pets += s.pets;
    all.remembered += s.remembered;
    all.planned += s.planned;
    all.households += s.households;
    all.freeLots += s.freeLots;
    for (const [k, v] of Object.entries(s.byStage)) all.byStage[k] = (all.byStage[k] ?? 0) + v;
    for (const [k, v] of Object.entries(s.byGender)) all.byGender[k] = (all.byGender[k] ?? 0) + v;
  }
  return all;
}
