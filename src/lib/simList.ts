import { DECEASED_STATE, DYNASTY_ROLES, NOT_IN_WORLD } from './constants.ts';
import { cardName } from './plan.ts';
import { isUnhousedGid } from './unhoused.ts';
import { dynastyStanding, isPet } from './utils.ts';
import type { Group, SimNode, World } from '../types/whiteboard.ts';

/** One sim in a list: who, and a line on what they are. */
export type SimListRow = { id: string; name: string; detail: string };
/** A household's sims in a list, in the order its cards stand on the board. */
export type SimListHome = { gid: string; label: string; rows: SimListRow[] };
/** A world's sims in a list, household by household. */
export type SimListWorld = { world: string; count: number; homes: SimListHome[] };

/**
 * The sims a highlight lights, as a list beside the board: by world and
 * household as the board has them, and A to Z with where each lives.
 * `hidden`: picked sims the filters hide, so not listed, as on the board.
 */
export type SimList = {
  worlds: SimListWorld[];
  az: (SimListRow & { where: string })[];
  count: number;
  hidden: number;
};

/** A household's heading in a list: "Darong household", "Unhoused sims". */
export function homeLabel(gid: string, hh: string | undefined): string {
  if (isUnhousedGid(gid)) return 'Unhoused sims';
  const name = (hh ?? '').trim() || 'Their';
  return /^the\s/i.test(name) ? `${name[0]!.toUpperCase()}${name.slice(1)} household` : `${name} household`;
}

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
  groups: Group[];
  worlds: World[];
  detail: (n: SimNode) => string;
}): SimList {
  const { nodes, pick, shown, groups, worlds, detail } = opts;
  const picked = nodes.filter(pick);
  const listed = picked.filter(shown);
  const label = new Map(groups.map((g) => [g.gid, g.hh]));
  const order = new Map(worlds.map((w, i) => [w.name, i]));
  const rank = (w: string) => (w === NOT_IN_WORLD ? Number.MAX_SAFE_INTEGER : (order.get(w) ?? worlds.length));
  const row = (n: SimNode): SimListRow => ({ id: n.id, name: cardName(n), detail: detail(n) });

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
        .map(([gid, sims]) => ({ gid, label: homeLabel(gid, label.get(gid) ?? sims[0]!.hh), rows: [...sims].sort(byPlace).map(row) }));
      return { world, count: list.reduce((s, h) => s + h.rows.length, 0), homes: list };
    });

  const az = listed
    .map((n) => ({ ...row(n), where: `${homeLabel(n.gid, label.get(n.gid) ?? n.hh)} · ${n.world}` }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  return { worlds: result, az, count: listed.length, hidden: picked.length - listed.length };
}

/** Life stage, or species for a pet; a planned baby is "Not born yet". Nothing when the age is unknown. */
export function stageWord(n: SimNode, unborn: boolean): string {
  if (unborn) return 'Not born yet';
  if (isPet(n)) return n.species ?? 'Pet';
  return n.age && n.age !== 'Unknown' ? n.age : '';
}

const passed = (n: SimNode) => (n.state === DECEASED_STATE ? ['passed away'] : []);

/** A highlighted sim: life stage, and their dynasty when they're in one. */
export function highlightDetail(n: SimNode, unborn: boolean): string {
  const dynasty = !isPet(n) && n.dynasty && n.dynastyPlan !== 'none' ? [`${n.dynasty} dynasty`] : [];
  return [stageWord(n, unborn), ...dynasty].filter(Boolean).join(' · ');
}

/** A dynasty member: their role in it, life stage, and a passing. */
export function dynastyDetail(n: SimNode, unborn: boolean): string {
  const standing = dynastyStanding(n);
  const role = standing && standing !== 'member' ? DYNASTY_ROLES[standing].noun : 'Member';
  return [role, stageWord(n, unborn), ...passed(n)].filter(Boolean).join(' · ');
}

/** A relative: what they are to the sim ("Grandparent", "Aunt"), life stage, and a passing. */
export function familyDetail(n: SimNode, role: string, unborn: boolean): string {
  const word = role ? `${role[0]!.toUpperCase()}${role.slice(1)}` : '';
  return [word, stageWord(n, unborn), ...passed(n)].filter(Boolean).join(' · ');
}
