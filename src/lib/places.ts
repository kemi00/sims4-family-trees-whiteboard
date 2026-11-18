import placesData from '../data/places.json' with { type: 'json' };
import type { SaveLotZone, SimNode } from '../types/whiteboard.ts';

/**
 * The game's worlds, neighbourhoods and the lots people can live on, from
 * src/data/places.json (scripts/build-places.ts). Lots are the game's, as
 * it ships them: a lot keeps its name whoever lives there.
 */

export type LotKind = 'house' | 'empty';
/** What the lot is: a house, a rental unit (For Rent) or a dorm (Discover University). */
export type LotVenue = 'house' | 'rental' | 'dorm';

export const RESIDENTIAL_RENTAL_VENUE = 341299;

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
  /** Exact zone of this home in the imported save. */
  zone?: string;
  /** The shared lot name for residential rental units. */
  building?: string;
  occupied?: true;
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

export type LotCatalog = ReadonlyMap<string, readonly GameLot[]>;

/** Overlay the save's current venue and rental units on the shipped map. */
export function saveLotCatalog(zones: readonly SaveLotZone[] | undefined): LotCatalog {
  const byWorld = new Map<string, Map<number, SaveLotZone[]>>();
  for (const zone of zones ?? []) {
    const world = byWorld.get(zone.world) ?? new Map<number, SaveLotZone[]>();
    if (!byWorld.has(zone.world)) byWorld.set(zone.world, world);
    const building = world.get(zone.hash) ?? [];
    building.push(zone);
    world.set(zone.hash, building);
  }
  const catalog = new Map<string, GameLot[]>();
  for (const [world, buildings] of byWorld) {
    const stock = new Map<number, GameLot[]>();
    for (const lot of lotsIn(world)) {
      const entries = stock.get(lot.hash) ?? [];
      entries.push(lot);
      stock.set(lot.hash, entries);
    }
    const lots: GameLot[] = [];
    for (const hash of new Set([...stock.keys(), ...buildings.keys()])) {
      const defaults = stock.get(hash) ?? [];
      const saved = buildings.get(hash);
      if (!saved) {
        lots.push(...defaults);
        continue;
      }
      const base = defaults[0];
      const dimensions = { world, hash, nb: base?.nb ?? '-', w: base?.w ?? 0, d: base?.d ?? 0 };
      const rentals = saved.filter((l) => l.venue === RESIDENTIAL_RENTAL_VENUE);
      if (rentals.length) {
        const shared = rentals.find((l) => l.unit === 0);
        const units = rentals.filter((l) => l.unit !== undefined && l.unit > 0).sort((a, b) => a.unit! - b.unit!);
        if (!shared && !units.length) {
          lots.push(...defaults.filter((l) => l.venue === 'rental'));
          continue;
        }
        const building = shared?.name ?? (base?.venue !== 'rental' ? base?.name : undefined);
        for (const unit of units) {
          const original = defaults.find((l) => l.name === unit.name);
          const repeated = units.some((l) => l !== unit && l.name === unit.name);
          const name = unit.name && !repeated ? unit.name : [unit.name ?? building, `Unit ${unit.unit}`].filter(Boolean).join(' · ');
          lots.push({
            ...dimensions,
            name,
            zone: unit.zone,
            building,
            beds: unit.beds ?? original?.beds ?? 0,
            baths: unit.baths ?? original?.baths ?? 0,
            kind: 'house',
            venue: 'rental',
            unit: true,
            occupied: unit.occupied,
          });
        }
        continue;
      }
      // The save can repurpose a residential lot or make a community lot residential.
      const homes = saved.filter((l) => l.venue === 28614 || l.venue === 208182);
      for (const lot of homes) {
        const original = defaults.length === 1 ? base : defaults.find((l) => l.name === lot.name);
        const name = original?.name ?? lot.name;
        if (!name) continue;
        lots.push({
          ...dimensions,
          ...original,
          name,
          zone: lot.zone,
          unit: original?.unit ?? homes.length > 1,
          beds: lot.beds ?? original?.beds ?? 0,
          baths: lot.baths ?? original?.baths ?? 0,
          kind: original?.kind === 'empty' && !lot.beds && !lot.baths ? 'empty' : 'house',
          venue: lot.venue === 208182 ? 'dorm' : 'house',
          occupied: lot.occupied,
        });
      }
    }
    catalog.set(world, lots);
  }
  return catalog;
}

/** The lots people can live on, with the save's inventory when available. */
export function lotsIn(world: string, catalog?: LotCatalog): readonly GameLot[] {
  return catalog?.get(world) ?? WORLDS.get(world)?.lots ?? [];
}

export function lotNamed(world: string, name: string | undefined): GameLot | undefined {
  if (!name || name === '-') return undefined;
  return lotsIn(world).find((l) => l.name === name);
}

/** The value a lot has in a household picker. */
export const LOT_PREFIX = '__lot:';

function lotRef(lot: Pick<GameLot, 'name' | 'zone' | 'venue'>): string {
  return lot.zone && lot.venue === 'rental' ? `zone:${lot.zone}` : lot.name;
}

export function lotPick(lot: GameLot): string {
  return LOT_PREFIX + lotRef(lot);
}

export function homeLotFields(lot: GameLot) {
  return { lot: lot.name, lotZone: lot.venue === 'rental' ? lot.zone : undefined, nb: lot.nb };
}

type HomeCard = Pick<SimNode, 'gid' | 'world' | 'hh' | 'lot' | 'lotZone'>;

/**
 * The lot each household on the board lives on, by gid. A household says so
 * itself (`lot`, set by a move into a lot or a save import). One that says
 * nothing, as every household did before lots, lives where the game puts it:
 * a premade household still in its own world and under its own name has its
 * game lot, unless another household holds that lot.
 */
export function householdLots(nodes: readonly HomeCard[], catalog?: LotCatalog): Map<string, GameLot> {
  const said = new Map<string, HomeCard>();
  const where = new Map<string, HomeCard>();
  for (const n of nodes) {
    if (!where.has(n.gid)) where.set(n.gid, n);
    if (n.lot !== undefined && !said.has(n.gid)) said.set(n.gid, n);
  }
  const out = new Map<string, GameLot>();
  const held = new Set<string>();
  for (const [gid, n] of said) {
    const zone = catalog?.has(n.world) ? n.lotZone : undefined;
    const lot = lotsIn(n.world, catalog).find((l) => zone ? l.zone === zone : l.name === n.lot);
    if (!lot || held.has(lotKey(lot))) continue;
    out.set(gid, lot);
    held.add(lotKey(lot));
  }
  for (const [gid, n] of where) {
    if (said.has(gid) || gid !== `${n.world}||${n.hh}`) continue;
    const lot = lotsIn(n.world, catalog).find((l) => l.household === n.hh && !held.has(lotKey(l)));
    if (!lot) continue;
    out.set(gid, lot);
    held.add(lotKey(lot));
  }
  return out;
}

export function lotKey(lot: GameLot): string {
  return `${lot.world}||${lotRef(lot)}`;
}

/** Lots and units available in both the save and the board's plans. */
export function freeLotsIn(world: string, homes: ReadonlyMap<string, GameLot>, catalog?: LotCatalog): GameLot[] {
  const held = new Set([...homes.values()].map(lotKey));
  return lotsIn(world, catalog).filter((l) => !l.occupied && !held.has(lotKey(l)));
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
  catalog?: LotCatalog,
): { world: string; lots: GameLot[] }[] {
  return [...new Set([...theirs, ...worlds])]
    .map((world) => ({ world, lots: freeLotsIn(world, homes, catalog) }))
    .filter((c) => c.lots.length > 0);
}

/** "Brook Bungalow · Courtyard Lane · 3 bed, 2 bath", a free lot in a picker. */
export function lotOptionLabel(lot: GameLot): string {
  const rooms = lotRoomsLabel(lot);
  return [lot.name, lot.nb, rooms ? rooms.replace(' · ', ', ') : lotKindLabel(lot)].join(' · ');
}

/** Free lots of every world on the board, by world. */
export function freeLotsByWorld(nodes: readonly HomeCard[], worlds: readonly string[], catalog?: LotCatalog): Map<string, GameLot[]> {
  const homes = householdLots(nodes, catalog);
  const out = new Map<string, GameLot[]>();
  for (const w of worlds) {
    const free = freeLotsIn(w, homes, catalog);
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
