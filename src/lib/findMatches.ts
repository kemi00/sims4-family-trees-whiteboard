import { cardName, isPlannedSim } from './plan.ts';
import type { Group, SimNode, World } from '../types/whiteboard.ts';

/** One match of Find: a world by name, a household by gid, a sim by id. */
export type SearchHit = { kind: 'world' | 'household' | 'sim'; key: string; label: string };

/**
 * What Find matches for `query`: worlds, then households, then sims, the
 * biggest first, each in board order. "Goth" finds the Goth household
 * before Bella and Mortimer, "Willow" Willow Creek. Only what is on the
 * board counts: a world or household whose sims are all filtered out is
 * left out, as are those sims.
 */
export function findMatches(
  query: string,
  board: { worlds: World[]; groups: Group[]; visibleNodes: SimNode[] },
): SearchHit[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];
  const has = (s: string) => s.toLowerCase().includes(q);
  const live = new Set(board.visibleNodes.map((n) => n.world));
  const homes = new Set(board.visibleNodes.map((n) => n.gid));
  return [
    ...board.worlds
      .filter((w) => live.has(w.name) && has(w.name))
      .map((w): SearchHit => ({ kind: 'world', key: w.name, label: w.name })),
    ...board.groups
      .filter((g) => homes.has(g.gid) && has(g.hh))
      // Two households can share a name (the Altos of Del Sol Valley and of
      // Ondarion): the world tells them apart.
      .map((g): SearchHit => ({ kind: 'household', key: g.gid, label: `${g.hh}, ${g.world}` })),
    ...board.visibleNodes
      .filter(
        (n) =>
          // The game's married name finds the sim too (Cassandra Vatore),
          // and a planned sim's plan label ("Heir 1").
          [n.sur, n.marriedSur].some((sur) => sur !== undefined && has(`${n.first} ${sur}`)) ||
          (isPlannedSim(n) && has(cardName(n))),
      )
      .map((n): SearchHit => ({ kind: 'sim', key: n.id, label: cardName(n) })),
  ];
}
