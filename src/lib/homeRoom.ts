import { DECEASED_STATE } from './constants.ts';
import { isPlannedSim } from './plan.ts';
import { isPet } from './utils.ts';
import type { GameLot } from './places.ts';
import type { Edge, SimNode } from '../types/whiteboard.ts';

/** The most sims and pets a household can hold in the game. */
export const HOUSEHOLD_MAX = 8;

/** Whether a household's lot fits it, its planned babies included. */
export type HomeRoom = {
  lot: GameLot;
  /** Living sims now, not counting pets. */
  sims: number;
  /** Planned sims not in the game yet. */
  planned: number;
  pets: number;
  /**
   * Bedrooms they need, roughly: one for each couple, one for everyone
   * else, babies too. A guess the player can see the working of.
   */
  rooms: number;
  /** More than the game lets a household hold. */
  overCap: boolean;
  /** More bedrooms needed than the house has (an empty lot has none yet). */
  short: boolean;
  /** Free houses in its world with the bedrooms, fewest spare first; then the biggest empty lots. */
  fits: GameLot[];
};

/**
 * Room for household `gid` on its lot, counting the babies planned: the
 * board knows each lot's bedrooms from the game. Null when it has no lot.
 */
export function homeRoom(opts: {
  gid: string;
  nodes: readonly SimNode[];
  edges: readonly Edge[];
  lot: GameLot | undefined;
  /** Free lots of its world (freeLotsIn). */
  free: readonly GameLot[];
}): HomeRoom | null {
  const { gid, nodes, edges, lot, free } = opts;
  if (!lot) return null;
  const members = nodes.filter((n) => n.gid === gid && n.state !== DECEASED_STATE);
  const people = members.filter((n) => !isPet(n));
  const planned = people.filter(isPlannedSim).length;
  const sims = people.length - planned;
  const pets = members.length - people.length;
  const here = new Set(people.map((n) => n.id));
  const paired = new Set<string>();
  let couples = 0;
  for (const e of edges) {
    if ((e.type !== 'marriage' && e.type !== 'romance') || e.ending) continue;
    if (!here.has(e.a) || !here.has(e.b) || paired.has(e.a) || paired.has(e.b)) continue;
    paired.add(e.a).add(e.b);
    couples += 1;
  }
  const rooms = Math.max(0, people.length - couples);
  const short = lot.kind === 'house' && rooms > lot.beds;
  const houses = free
    .filter((l) => l.kind === 'house' && l.beds >= rooms && !l.unit)
    .sort((a, b) => a.beds - b.beds || a.w * a.d - b.w * b.d || a.name.localeCompare(b.name))
    .slice(0, 3);
  const empty = free
    .filter((l) => l.kind === 'empty')
    .sort((a, b) => b.w * b.d - a.w * a.d || a.name.localeCompare(b.name))
    .slice(0, 2);
  return {
    lot,
    sims,
    planned,
    pets,
    rooms,
    overCap: people.length + pets > HOUSEHOLD_MAX,
    short,
    fits: short || lot.kind === 'empty' ? [...houses, ...empty] : [],
  };
}
