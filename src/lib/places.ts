import placesData from '../data/places.json' with { type: 'json' };
import type { SimNode } from '../types/whiteboard.ts';

/**
 * The game's worlds, neighbourhoods and the lots people can live on, from
 * src/data/places.json (scripts/build-places.ts). Lots are the game's, as
 * it ships them: a lot keeps its name whoever lives there.
 */

export type LotKind = 'house' | 'empty';
/** What the lot is: a house, a rental unit (For Rent) or a dorm (Discover University). */
export type LotVenue = 'house' | 'rental' | 'dorm';

export type GameLot = {
  world: string;
  /** Its neighbourhood. */
  nb: string;
  name: string;
  /** The game's id for the lot, as a save stores it; a building's units share it. */
  hash: number;
  /** Size in tiles, width by depth. */
  w: number;
  d: number;
  beds: number;
  baths: number;
  /** A house stands on it; an empty lot has none. */
  kind: LotKind;
  venue: LotVenue;
  /** The premade household the game puts there, by its name on the board. */
  household?: string;
  /** One of the building's units, as apartments and rentals are. */
  unit?: boolean;
};

type WorldPlaces = {
  icon?: string;
  neighbourhoods: Record<string, { icon?: string }>;
  lots: GameLot[];
};

type RawLot = Omit<GameLot, 'world' | 'unit' | 'kind' | 'venue'> & { kind: string; venue: string };
type RawWorld = {
  icon?: string;
  neighbourhoods: Record<string, { icon?: string }>;
  lots: RawLot[];
};

const WORLDS = new Map<string, WorldPlaces>();
for (const [world, raw] of Object.entries(placesData.worlds as unknown as Record<string, RawWorld>)) {
  const perHash = new Map<number, number>();
  for (const l of raw.lots) perHash.set(l.hash, (perHash.get(l.hash) ?? 0) + 1);
  WORLDS.set(world, {
    icon: raw.icon,
    neighbourhoods: raw.neighbourhoods,
    lots: raw.lots.map((l) => ({
      ...l,
      world,
      kind: l.kind as LotKind,
      venue: l.venue as LotVenue,
      ...((perHash.get(l.hash) ?? 0) > 1 ? { unit: true } : {}),
    })),
  });
}

/** Where public/places is served from: the app's base in the browser, `/` in tests. */
function placeUrl(file: string | undefined): string | undefined {
  if (!file) return undefined;
  const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
  return `${base}places/${file}`;
}

/** The world's picture as the game shows it when you choose a world. */
export function worldIconUrl(world: string): string | undefined {
  return placeUrl(WORLDS.get(world)?.icon);
}

/** The neighbourhood's icon, as the game's map shows it. */
export function neighbourhoodIconUrl(world: string, nb: string | undefined): string | undefined {
  if (!nb || nb === '-') return undefined;
  return placeUrl(WORLDS.get(world)?.neighbourhoods[nb]?.icon);
}

/** Worlds that have lots to live on, A to Z. */
export function lotWorlds(): string[] {
  return [...WORLDS.keys()];
}

/** The lots of `world` people can live on, by neighbourhood then name. */
export function lotsIn(world: string): readonly GameLot[] {
  return WORLDS.get(world)?.lots ?? [];
}

export function lotNamed(world: string, name: string | undefined): GameLot | undefined {
  if (!name || name === '-') return undefined;
  return lotsIn(world).find((l) => l.name === name);
}

/** The value a lot has in a household picker. */
export const LOT_PREFIX = '__lot:';

export function lotPick(lot: Pick<GameLot, 'name'>): string {
  return LOT_PREFIX + lot.name;
}

export function lotOfPick(world: string, value: string): GameLot | undefined {
  return value.startsWith(LOT_PREFIX) ? lotNamed(world, value.slice(LOT_PREFIX.length)) : undefined;
}

type HomeCard = Pick<SimNode, 'gid' | 'world' | 'hh'> & { lot?: string };

/**
 * The lot each household on the board lives on, by gid. A household says so
 * itself (`lot`, set by a move into a lot or a save import). One that says
 * nothing, as every household did before lots, lives where the game puts it:
 * a premade household still in its own world and under its own name has its
 * game lot, unless another household holds that lot.
 */
export function householdLots(nodes: readonly HomeCard[]): Map<string, GameLot> {
  const said = new Map<string, string | undefined>();
  const where = new Map<string, HomeCard>();
  for (const n of nodes) {
    if (!where.has(n.gid)) where.set(n.gid, n);
    if (n.lot !== undefined && !said.get(n.gid)) said.set(n.gid, n.lot);
  }
  const out = new Map<string, GameLot>();
  const held = new Set<string>();
  for (const [gid, lotName] of said) {
    const n = where.get(gid)!;
    const lot = lotNamed(n.world, lotName);
    if (!lot || held.has(lotKey(lot))) continue;
    out.set(gid, lot);
    held.add(lotKey(lot));
  }
  for (const [gid, n] of where) {
    if (said.has(gid) || gid !== `${n.world}||${n.hh}`) continue;
    const lot = lotsIn(n.world).find((l) => l.household === n.hh && !held.has(lotKey(l)));
    if (!lot) continue;
    out.set(gid, lot);
    held.add(lotKey(lot));
  }
  return out;
}

export function lotKey(lot: Pick<GameLot, 'world' | 'name'>): string {
  return `${lot.world}||${lot.name}`;
}

/** Lots of `world` no household on the board lives on, in the game's order. */
export function freeLotsIn(world: string, homes: ReadonlyMap<string, GameLot>): GameLot[] {
  const held = new Set([...homes.values()].map(lotKey));
  return lotsIn(world).filter((l) => !held.has(lotKey(l)));
}

/**
 * Where a couple could make a home together: each world's free lots (empty
 * lots and empty houses), the couple's own worlds first, then the board's
 * others in order. Worlds with no free lot are left out.
 */
export function coupleLotChoices(
  worlds: readonly string[],
  homes: ReadonlyMap<string, GameLot>,
  theirs: readonly string[],
): { world: string; lots: GameLot[] }[] {
  return [...new Set([...theirs, ...worlds])]
    .map((world) => ({ world, lots: freeLotsIn(world, homes) }))
    .filter((c) => c.lots.length > 0);
}

/** "Brook Bungalow · Courtyard Lane · 3 bed, 2 bath", a free lot in a picker. */
export function lotOptionLabel(lot: GameLot): string {
  const rooms = lotRoomsLabel(lot);
  return [lot.name, lot.nb, rooms ? rooms.replace(' · ', ', ') : lotKindLabel(lot)].join(' · ');
}

/** Free lots of every world on the board, by world. */
export function freeLotsByWorld(nodes: readonly HomeCard[], worlds: readonly string[]): Map<string, GameLot[]> {
  const homes = householdLots(nodes);
  const out = new Map<string, GameLot[]>();
  for (const w of worlds) {
    const free = freeLotsIn(w, homes);
    if (free.length) out.set(w, free);
  }
  return out;
}

/** "Uninhabited", "Empty lot", "Apartment", "Rental unit" or "Dorm". */
export function lotKindLabel(lot: GameLot): string {
  if (lot.venue === 'dorm') return 'Dorm';
  if (lot.venue === 'rental') return 'Rental unit';
  if (lot.unit) return 'Apartment';
  return lot.kind === 'empty' ? 'Empty lot' : 'Uninhabited';
}

/** "40×30", the lot's size in tiles. A unit shares its building's, so it has none. */
export function lotSizeLabel(lot: GameLot): string | null {
  return lot.unit || !lot.w || !lot.d ? null : `${lot.w}×${lot.d}`;
}

/** "3 bed · 2 bath", or null for an empty lot. */
export function lotRoomsLabel(lot: GameLot): string | null {
  if (lot.kind === 'empty') return null;
  return `${lot.beds} bed · ${lot.baths} bath`;
}

/** One line for a picker: "Brook Bungalow, Courtyard Lane: uninhabited, 40×30, 3 bed, 2 bath". */
export function lotSummary(lot: GameLot): string {
  const parts = [lotKindLabel(lot).toLowerCase(), lotSizeLabel(lot), lotRoomsLabel(lot)?.replace(' · ', ', ')].filter(Boolean);
  return `${lot.name}, ${lot.nb}: ${parts.join(', ')}`;
}
