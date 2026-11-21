import { DYNASTY_ROLES, NOT_IN_WORLD } from './constants.ts';
import type { Bloodline } from './bloodline.ts';
import { cardName, shortName } from './plan.ts';
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

/** A generation in a bloodline's list; `me` is the sim's own place between ancestors and descendants. */
export type SimListGroup = { key: string; label: string; rows: SimListRow[]; me?: true };

/**
 * A bloodline's list, generation by generation: ancestors oldest first,
 * the sim (with ancestors too), then children, grandchildren and down.
 * In a generation, siblings sit together, in the order of the parent
 * they come through; then as their cards stand on the board.
 */
export function generationGroups(list: SimList, line: Bloodline, name: string, label: (gen: number) => string): SimListGroup[] {
  const byGen = new Map<number, SimListRow[]>();
  for (const r of list.az) {
    const gen = line.generation.get(r.sim.id);
    if (gen === undefined) continue;
    byGen.set(gen, [...(byGen.get(gen) ?? []), r]);
  }
  const order = new Map<string, number>([[line.id, 0]]);
  const sortGen = (gen: number) => {
    const rank = (r: SimListRow) => Math.min(...(line.via.get(r.sim.id) ?? []).map((v) => order.get(v) ?? Infinity));
    const rows = [...(byGen.get(gen) ?? [])].sort((a, b) => rank(a) - rank(b) || byPlace(a.sim, b.sim));
    rows.forEach((r, i) => order.set(r.sim.id, i));
    return rows;
  };
  const gens = [...byGen.keys()];
  const reach = (dir: 1 | -1) => {
    const out: SimListGroup[] = [];
    const deepest = Math.max(0, ...gens.map((g) => g * dir));
    for (let d = 1; d <= deepest; d++) {
      const rows = sortGen(d * dir);
      if (rows.length) out.push({ key: `gen${d * dir}`, label: label(d * dir), rows });
    }
    return out;
  };
  const down = reach(1);
  if (line.reach !== 'both') return down;
  const up = reach(-1).reverse();
  return [...up, { key: 'me', label: name, rows: [], me: true }, ...down];
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

/**
 * Someone in a sim's line: whose child they are from grandchildren down
 * ("Child of Tybalt", "Adopted by Tybalt"), "Adopted" for an adopted child,
 * whose parent an ancestor is from grandparents up ("Parent of
 * Andromache"); then life stage. Children and parents need no name: the
 * sim is theirs.
 */
export function bloodlineWhat(n: SimNode, line: Bloodline, byid: Record<string, SimNode>, unborn: boolean): string {
  const gen = line.generation.get(n.id) ?? 0;
  const adopted = line.adopted.has(n.id);
  const names = (line.via.get(n.id) ?? []).map((id) => byid[id]).filter((s): s is SimNode => !!s).map(shortName);
  const who = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : (names[0] ?? '');
  let tie = '';
  if (gen === 1) tie = adopted ? 'Adopted' : '';
  else if (gen > 1 && who) tie = adopted ? `Adopted by ${who}` : `Child of ${who}`;
  else if (gen === -1) tie = adopted ? 'Adoptive parent' : '';
  else if (gen < -1 && who) tie = adopted ? `Adoptive parent of ${who}` : `Parent of ${who}`;
  return [tie, stageWord(n, unborn)].filter(Boolean).join(' · ');
}

/** A relative: what they are to the sim ("Grandparent", "Aunt"), and life stage. */
export function familyWhat(n: SimNode, role: string, unborn: boolean): string {
  const word = role ? `${role[0]!.toUpperCase()}${role.slice(1)}` : '';
  return [word, stageWord(n, unborn)].filter(Boolean).join(' · ');
}
