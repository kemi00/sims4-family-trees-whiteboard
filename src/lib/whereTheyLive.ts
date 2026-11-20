import { ADDED_HOUSEHOLD, HOUSEHOLD_LIMIT, NOT_IN_WORLD } from './constants.ts';
import type { GameLot } from './places.ts';
import { isUnhousedGid } from './unhoused.ts';
import { fold } from './utils.ts';
import type { Group } from '../types/whiteboard.ts';

/**
 * Where a sim lives, and the decisions the board waits on without blocking
 * any plan: a home still to choose ("Needs a home", the board's box for
 * sims with a world but no household), and households past the household
 * limit (the game's 8, a mod's number, or none).
 */

/** Where a new or homeless sim goes: a household, a free lot, only a world, or not decided yet. */
export type HomeChoice =
  | { kind: 'household'; gid: string; world: string }
  | { kind: 'lot'; lot: GameLot }
  | { kind: 'world'; world: string }
  | { kind: 'none' };

/** The board's box for sims who have a world, or not even that, but no home yet. */
export function needsHome(gid: string): boolean {
  return gid.endsWith(`||${ADDED_HOUSEHOLD}`);
}

/** The world a choice puts them in: Not in any world when it isn't decided. */
export function choiceWorld(to: HomeChoice): string {
  if (to.kind === 'household' || to.kind === 'world') return to.world;
  if (to.kind === 'lot') return to.lot.world;
  return NOT_IN_WORLD;
}

// ── The household limit ────────────────────────────────────────────────

export const HOUSEHOLD_LIMIT_KEY = 'sims4-family-trees:household-limit:v1';
/** The most a mod sets (MCCC goes to 25); a limit past it is no limit. */
export const HOUSEHOLD_LIMIT_MAX = 50;

type Store = Pick<Storage, 'getItem' | 'setItem'>;
function store(): Store | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** The limit kept in this browser: the game's 8 unless changed, null for none. */
export function readHouseholdLimit(s: Store | null = store()): number | null {
  let raw: string | null = null;
  try {
    raw = s?.getItem(HOUSEHOLD_LIMIT_KEY) ?? null;
  } catch {
    raw = null;
  }
  if (raw === 'off') return null;
  const n = Number(raw);
  return raw !== null && Number.isInteger(n) && n >= 1 && n <= HOUSEHOLD_LIMIT_MAX ? n : HOUSEHOLD_LIMIT;
}

export function writeHouseholdLimit(n: number | null, s: Store | null = store()): void {
  try {
    s?.setItem(HOUSEHOLD_LIMIT_KEY, n === null ? 'off' : String(n));
  } catch {
    // Blocked storage: the limit holds until the page reloads.
  }
}

/** Households past `limit`, with how many live there: never the Unhoused or Needs a home boxes, which are no home. */
export function householdsOverLimit(sizes: ReadonlyMap<string, number>, limit: number | null): Map<string, number> {
  const out = new Map<string, number>();
  if (limit === null) return out;
  for (const [gid, size] of sizes) {
    if (size > limit && !isUnhousedGid(gid) && !needsHome(gid)) out.set(gid, size);
  }
  return out;
}

/** "9 of 8", or "9" with no limit. */
export function sizeOfLimit(size: number, limit: number | null): string {
  return limit === null ? String(size) : `${size} of ${limit}`;
}

// ── Where they could live: the picker's places ──────────────────────────

export type HomePlace =
  | { kind: 'household'; gid: string; hh: string; nb: string; world: string; size: number }
  | { kind: 'lot'; lot: GameLot }
  | { kind: 'world'; world: string };

/**
 * Every place a sim could go, for the picker: the households (not the
 * Unhoused or Needs a home boxes), the free lots, and each world. Households
 * by name, lots by name, worlds as listed.
 */
export function homePlaces(opts: {
  groups: readonly Group[];
  sizes: ReadonlyMap<string, number>;
  freeLots: ReadonlyMap<string, readonly GameLot[]>;
  worlds: readonly string[];
}): HomePlace[] {
  const households: HomePlace[] = opts.groups
    .filter((g) => !isUnhousedGid(g.gid) && !needsHome(g.gid) && g.world !== NOT_IN_WORLD)
    .map((g) => ({ kind: 'household' as const, gid: g.gid, hh: g.hh, nb: g.nb, world: g.world, size: opts.sizes.get(g.gid) ?? 0 }))
    .sort((a, b) => a.hh.localeCompare(b.hh));
  const lots: HomePlace[] = [...opts.freeLots.values()]
    .flat()
    .map((lot) => ({ kind: 'lot' as const, lot }))
    .sort((a, b) => a.lot.name.localeCompare(b.lot.name));
  const worlds: HomePlace[] = opts.worlds.filter((w) => w !== NOT_IN_WORLD).map((world) => ({ kind: 'world' as const, world }));
  return [...households, ...lots, ...worlds];
}

const placeWorld = (p: HomePlace) => (p.kind === 'lot' ? p.lot.world : p.world);

/** The places in `world`: its households, its free lots, then the world itself. */
export function placesIn(places: readonly HomePlace[], world: string): HomePlace[] {
  return places.filter((p) => placeWorld(p) === world);
}

/**
 * The places a search finds: a household by its name, a lot by its name or
 * neighbourhood, a world by its name; accents and case aside. Households
 * first, then lots, then worlds, `max` at most.
 */
export function searchPlaces(places: readonly HomePlace[], query: string, max = 12): HomePlace[] {
  const q = fold(query);
  if (!q) return [];
  const words = (p: HomePlace): string[] =>
    p.kind === 'household' ? [p.hh, p.nb, p.world] : p.kind === 'lot' ? [p.lot.name, p.lot.nb, p.lot.world] : [p.world];
  // Its own name first: "Goth" finds the Goths before every household in a world called Goth-something.
  const own = (p: HomePlace) => fold(words(p)[0]!).includes(q);
  const any = (p: HomePlace) => words(p).some((w) => fold(w).includes(q));
  return [...places.filter(own), ...places.filter((p) => !own(p) && any(p))].slice(0, max);
}
