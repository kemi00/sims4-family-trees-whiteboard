import type { Group, HouseholdMove, SimNode, World } from '../types/whiteboard.ts';
import { ADDED_HOUSEHOLD, DECEASED_STATE, NOT_IN_WORLD } from './constants.ts';
import { isPlannedSim } from './plan.ts';
import { fold as foldName, joinNotes, worldColor } from './utils.ts';

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

type MovePlaces = Pick<HouseholdMove, 'fromHh' | 'fromWorld' | 'toHh' | 'toWorld'>;

/** The move takes a sim to another world. */
export function changesWorld(m: Pick<HouseholdMove, 'fromWorld' | 'toWorld'>): boolean {
  return fold(m.fromWorld) !== fold(m.toWorld);
}

/**
 * The household itself changes worlds: same name, another world, as when
 * the game moves a household to a lot elsewhere. A sim who comes into
 * existence on the board isn't moving a household.
 */
export function movesHousehold(m: MovePlaces): boolean {
  return m.fromHh !== ADDED_HOUSEHOLD && fold(m.fromHh) === fold(m.toHh) && changesWorld(m);
}

/** The household moves recorded together: same time, same households. */
export function householdMoveKey(m: Pick<HouseholdMove, 'createdAt' | 'fromGid' | 'toGid'>): string {
  return `${m.createdAt}|${m.fromGid}|${m.toGid}`;
}

/**
 * Who a household's world move records a move for: the sims in your game.
 * The deceased and sims only planned go along on the board, with nothing
 * for a save to show done.
 */
export function movesInGame(n: SimNode): boolean {
  return n.state !== DECEASED_STATE && !isPlannedSim(n);
}

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

/**
 * Moves a save shows done: the sim lives in the household they were moved
 * to, matched by their sim id and the household's name, and, for a move to
 * another world, in that world (Dreamer in Ondarion, not the Dreamer
 * household still in Not in any world). A sim's earlier moves are settled
 * with their last one.
 */
export function movesDoneBySave(
  moves: HouseholdMove[],
  nodes: Pick<SimNode, 'id' | 'saveSimId'>[],
  sims: { saveSimId: string; household: string; world?: string; unhoused?: true }[],
): Set<string> {
  const home = new Map(sims.map((s) => [s.saveSimId, s]));
  const saveId = new Map(nodes.map((n) => [n.id, n.saveSimId]));
  const last = new Map<string, HouseholdMove>();
  for (const m of moves) {
    if (m.done) continue;
    const prev = last.get(m.simId);
    if (!prev || prev.createdAt <= m.createdAt) last.set(m.simId, m);
  }
  const doneSims = new Set<string>();
  for (const m of last.values()) {
    const sid = saveId.get(m.simId);
    const s = sid ? home.get(sid) : undefined;
    if (!s || fold(s.household) !== fold(m.toHh)) continue;
    // A save that doesn't say where the household lives can't tell worlds apart.
    const world = s.unhoused ? NOT_IN_WORLD : s.world?.trim();
    if (changesWorld({ fromWorld: m.fromWorld, toWorld: m.toWorld }) && world && foldName(world) !== foldName(m.toWorld)) continue;
    doneSims.add(m.simId);
  }
  return new Set(moves.filter((m) => !m.done && doneSims.has(m.simId)).map((m) => m.id));
}

/**
 * The plan's moves netted out, as the Plan is what's left to do in the
 * game, not every step taken on the board. A sim's moves still planned are
 * one move from where the game has them (the first one's start) to where
 * the board has them (the last one's end), keeping the last one's id and
 * time and every note: Bjergsen → Bro → Le Chien is Bjergsen → Le Chien.
 * Moves that bring a sim back where the game has them cancel out and go:
 * Darong → Dreamer → Darong is nothing to do. Moves a save showed done stay.
 */
export function settleMoves(moves: HouseholdMove[]): HouseholdMove[] {
  const chains = new Map<string, HouseholdMove[]>();
  for (const m of moves) if (!m.done) chains.set(m.simId, [...(chains.get(m.simId) ?? []), m]);
  const keep = new Map<string, HouseholdMove | null>();
  let changed = false;
  for (const list of chains.values()) {
    const chain = [...list].sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
    const first = chain[0]!;
    const last = chain[chain.length - 1]!;
    for (const m of chain) keep.set(m.id, null);
    if (first.fromGid === last.toGid) {
      changed = true;
      continue;
    }
    if (chain.length === 1) {
      keep.set(first.id, first);
      continue;
    }
    changed = true;
    const { note: _notes, ...rest } = last;
    const note = joinNotes(...chain.map((m) => m.note));
    keep.set(last.id, {
      ...rest,
      fromGid: first.fromGid,
      fromHh: first.fromHh,
      fromWorld: first.fromWorld,
      fromNb: first.fromNb,
      ...(note ? { note } : {}),
    });
  }
  if (!changed) return moves;
  const out: HouseholdMove[] = [];
  for (const m of moves) {
    if (m.done || !keep.has(m.id)) out.push(m);
    else {
      const k = keep.get(m.id);
      if (k) out.push(k);
    }
  }
  return out;
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
