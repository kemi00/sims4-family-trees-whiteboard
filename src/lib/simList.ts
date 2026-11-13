import { DYNASTY_ROLES, NOT_IN_WORLD } from './constants.ts';
import { cardName } from './plan.ts';
import { dynastyStanding, isPet } from './utils.ts';
import type { SimNode, World } from '../types/whiteboard.ts';

/** One sim in a list, and what they are, first on their card's grey line. */
export type SimListRow = { sim: SimNode; what: string };
/** A household's sims in a list, in the order its cards stand on the board. */
export type SimListHome = { gid: string; rows: SimListRow[] };
/** A world's sims in a list, household by household. */
export type SimListWorld = { world: string; count: number; homes: SimListHome[] };

/**
 * The sims a highlight lights, as a list beside the board: by world and
 * household as the board has them, and A to Z.
 * `hidden`: picked sims the filters hide, so not listed, as on the board.
 */
export type SimList = {
  worlds: SimListWorld[];
  az: SimListRow[];
  count: number;
  hidden: number;
};

/** Board order: top to bottom, then left to right. */
const byPlace = (a: SimNode, b: SimNode) => a.y - b.y || a.x - b.x;

/**
 * The picked sims as a list. Worlds in the board's order (Not in any world
 * last), households in the order they stand in their world, sims in the
 * order their cards stand: reading the list reads the board.
 */
export function simList(opts: {
  nodes: SimNode[];
  pick: (n: SimNode) => boolean;
  /** The filters: what the board shows. */
  shown: (n: SimNode) => boolean;
  worlds: World[];
  what: (n: SimNode) => string;
}): SimList {
  const { nodes, pick, shown, worlds, what } = opts;
  const picked = nodes.filter(pick);
  const listed = picked.filter(shown);
  const order = new Map(worlds.map((w, i) => [w.name, i]));
  const rank = (w: string) => (w === NOT_IN_WORLD ? Number.MAX_SAFE_INTEGER : (order.get(w) ?? worlds.length));
  const row = (n: SimNode): SimListRow => ({ sim: n, what: what(n) });

  const byWorld = new Map<string, Map<string, SimNode[]>>();
  for (const n of listed) {
    const homes = byWorld.get(n.world) ?? new Map<string, SimNode[]>();
    homes.set(n.gid, [...(homes.get(n.gid) ?? []), n]);
    byWorld.set(n.world, homes);
  }
  const top = (sims: SimNode[]) => sims.reduce((a, b) => (byPlace(a, b) <= 0 ? a : b));
  const result: SimListWorld[] = [...byWorld]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
    .map(([world, homes]) => {
      const list = [...homes]
        .sort(([, a], [, b]) => byPlace(top(a), top(b)))
        .map(([gid, sims]) => ({ gid, rows: [...sims].sort(byPlace).map(row) }));
      return { world, count: list.reduce((s, h) => s + h.rows.length, 0), homes: list };
    });

  const az = listed
    .map(row)
    .sort((a, b) => cardName(a.sim).localeCompare(cardName(b.sim), undefined, { sensitivity: 'base' }));
  return { worlds: result, az, count: listed.length, hidden: picked.length - listed.length };
}

/** Life stage, or species for a pet; a planned baby is "Not born yet". Nothing when the age is unknown. */
export function stageWord(n: SimNode, unborn: boolean): string {
  if (unborn) return 'Not born yet';
  if (isPet(n)) return n.species ?? 'Pet';
  return n.age && n.age !== 'Unknown' ? n.age : '';
}

/** A dynasty member: their role when it's more than member, and life stage. */
export function dynastyWhat(n: SimNode, unborn: boolean): string {
  const standing = dynastyStanding(n);
  const role = standing && standing !== 'member' ? DYNASTY_ROLES[standing].noun : '';
  return [role, stageWord(n, unborn)].filter(Boolean).join(' · ');
}

/** A relative: what they are to the sim ("Grandparent", "Aunt"), and life stage. */
export function familyWhat(n: SimNode, role: string, unborn: boolean): string {
  const word = role ? `${role[0]!.toUpperCase()}${role.slice(1)}` : '';
  return [word, stageWord(n, unborn)].filter(Boolean).join(' · ');
}
