import type { Group, HouseholdMove, SimNode, World } from '../types/whiteboard.ts';
import { worldColor } from './utils.ts';

/** The household picker's value for "Create a new household…". */
export const NEW_HOUSEHOLD = '__new';

/** Where a move sends sims: a household on the board, or one it creates. */
export type MoveDestination = {
  gid: string;
  hh: string;
  world: string;
  nb: string;
  color: string;
  /** No household on the board has this gid yet: the move adds its group. */
  isNew: boolean;
};

export type HouseholdOption = { gid: string; hh: string; count: number };

const fold = (s: string) => s.trim().toLocaleLowerCase();

/**
 * Households in `world` that have sims, A to Z, with how many each holds.
 * `exclude` leaves out the one every moving sim already lives in.
 */
export function householdOptions(
  groups: Group[],
  nodes: SimNode[],
  world: string,
  exclude?: string,
): HouseholdOption[] {
  const counts = new Map<string, number>();
  for (const n of nodes) counts.set(n.gid, (counts.get(n.gid) ?? 0) + 1);
  const seen = new Set<string>();
  const opts: HouseholdOption[] = [];
  for (const g of groups) {
    const count = counts.get(g.gid) ?? 0;
    if (g.world !== world || g.gid === exclude || seen.has(g.gid) || !count) continue;
    seen.add(g.gid);
    opts.push({ gid: g.gid, hh: g.hh, count });
  }
  return opts.sort((a, b) => a.hh.localeCompare(b.hh, undefined, { sensitivity: 'base' }));
}

/** A household in `world` already called `name` (any case), which a new one by that name would join. */
export function householdNamed(
  groups: Group[],
  nodes: SimNode[],
  world: string,
  name: string,
): Group | undefined {
  const want = fold(name);
  if (!want) return undefined;
  return groups.find(
    (g) => g.world === world && fold(g.hh) === want && nodes.some((n) => n.gid === g.gid),
  );
}

/** The household a move goes to, or null when there is none (no name for a new one, a stale pick). */
export function moveDestination(
  groups: Group[],
  nodes: SimNode[],
  worlds: World[],
  world: string,
  houseGid: string,
  newName = '',
): MoveDestination | null {
  if (houseGid === NEW_HOUSEHOLD) {
    const name = newName.trim();
    if (!name) return null;
    // A name the world already has joins that household rather than making a twin.
    const same = householdNamed(groups, nodes, world, name);
    if (same) return { ...pick(same), isNew: false };
    const gid = world + '||' + name;
    const existing = groups.find((g) => g.gid === gid);
    if (existing) return { ...pick(existing), isNew: false };
    return { gid, hh: name, world, nb: '-', color: worldColor(world, worlds), isNew: true };
  }
  const g = groups.find((x) => x.gid === houseGid);
  return g ? { ...pick(g), isNew: false } : null;
}

const pick = (g: Group) => ({ gid: g.gid, hh: g.hh, world: g.world, nb: g.nb, color: g.color });

/**
 * What moving `ids` to `dest` changes: each sim's new household fields, and
 * the move to record. Sims already there are left out. A sim added on the
 * board also takes the household as its original one, so it reads as a
 * resident there.
 */
export function householdMovePlan(
  nodes: SimNode[],
  ids: string[],
  dest: MoveDestination,
): { patches: Map<string, Partial<SimNode>>; moves: Omit<HouseholdMove, 'id' | 'createdAt'>[] } {
  const want = new Set(ids);
  const movers = nodes.filter((n) => want.has(n.id) && n.gid !== dest.gid);
  const moving = new Set(movers.map((n) => n.id));
  const destOnb = nodes.find(
    (x) => x.gid === dest.gid && !moving.has(x.id) && x.onb && x.onb !== '-',
  )?.onb;
  const patches = new Map<string, Partial<SimNode>>();
  const moves: Omit<HouseholdMove, 'id' | 'createdAt'>[] = [];
  for (const n of movers) {
    const patch: Partial<SimNode> = {
      gid: dest.gid,
      hh: dest.hh,
      world: dest.world,
      color: dest.color,
    };
    if (n.added) {
      patch.oworld = dest.world;
      patch.ohh = dest.hh;
      patch.oplay = 'Resident';
      patch.townie = false;
      if (dest.isNew) patch.onb = '-';
      else if (destOnb) patch.onb = destOnb;
    }
    patches.set(n.id, patch);
    moves.push({
      simId: n.id,
      fromGid: n.gid,
      fromHh: n.hh,
      fromWorld: n.world,
      fromNb: n.nb,
      toGid: dest.gid,
      toHh: dest.hh,
      toWorld: dest.world,
      toNb: dest.nb,
    });
  }
  return { patches, moves };
}

/**
 * The last names a sim joining household `hh` could take, the likeliest
 * first. A baby takes a parent's (`parents`, in order), never a roommate's;
 * anyone else takes one of the household's. The household's own name wins
 * when it is one of them (the Munch household: Munch); then the one more of
 * its `members` share. More than one back means a tie the board can't settle,
 * like Munch and Fyres in a household called Love Nest: ask, as the game
 * does at a birth. Empty when no one has a last name.
 */
export function householdSurnames(
  members: Pick<SimNode, 'sur'>[],
  hh: string,
  parents: string[] = [],
): string[] {
  const names = (list: string[]) => [...new Set(list.map((s) => s.trim()).filter(Boolean))];
  const pool = names(parents).length ? names(parents) : names(members.map((m) => m.sur));
  const own = pool.find((s) => s.toLowerCase() === hh.trim().toLowerCase());
  if (own || pool.length < 2) return own ? [own] : pool;
  const count = (s: string) => members.filter((m) => m.sur.trim() === s).length;
  const most = Math.max(...pool.map(count));
  return pool.filter((s) => count(s) === most);
}

/** The world most of these sims live in, for the picker to start on. */
export function commonWorld(sims: SimNode[], worlds: World[]): string {
  const counts = new Map<string, number>();
  for (const n of sims) {
    const w = n.oworld || n.world;
    if (w) counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  let best = '';
  let most = 0;
  for (const w of worlds) {
    const c = counts.get(w.name) ?? 0;
    if (c > most) {
      best = w.name;
      most = c;
    }
  }
  return best || worlds[0]?.name || '';
}
