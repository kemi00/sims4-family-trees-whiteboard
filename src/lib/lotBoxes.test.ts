import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NOT_IN_WORLD, TILE } from './constants.ts';
import { householdMovePlan, moveDestination } from './householdMove.ts';
import { computeLayout, layoutBases, lotsBaseKey } from './layout.ts';
import { placeLotBoxes } from './lotBoxes.ts';
import { freeLotsIn, householdLots, lotNamed, lotPick } from './places.ts';
import { householdChrome, snapNodesToTiles } from './tiles.ts';
import { migrateWhiteboardData } from './utils.ts';
import type { SimNode, WhiteboardData } from '../types/whiteboard.ts';
import seedRoster from '../data/whiteboard.json' with { type: 'json' };

type Box = { l: number; t: number; r: number; b: number };
const overlaps = (a: Box, b: Box) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;

const seed = migrateWhiteboardData(seedRoster as unknown as WhiteboardData);
const worlds = seed.worlds!;
const groups = seed.groups!;
const lay = (core: SimNode[]) => snapNodesToTiles(computeLayout(core, worlds, seed.edges));

function boxesOf(core: SimNode[]) {
  const laid = lay(core);
  const homes = householdLots(core);
  const free = new Map(
    worlds.filter((w) => w.name !== NOT_IN_WORLD).map((w) => [w.name, freeLotsIn(w.name, homes)] as const).filter(([, l]) => l.length),
  );
  const bases = layoutBases(core, worlds, seed.edges);
  const packed = new Map([...free.keys()].flatMap((w) => (bases.get(lotsBaseKey(w)) ? [[w, bases.get(lotsBaseKey(w))!] as const] : [])));
  return { laid, free, boxes: placeLotBoxes({ laid, groups, free, packed }) };
}

function householdBoxes(laid: SimNode[]): (Box & { world: string })[] {
  const byGid = new Map<string, SimNode[]>();
  for (const n of laid) byGid.set(n.gid, [...(byGid.get(n.gid) ?? []), n]);
  return [...byGid].flatMap(([gid, mem]) => {
    const c = householdChrome(mem, groups.find((g) => g.gid === gid));
    return c ? [{ world: mem[0]!.world, l: c.boxL, t: c.boxT, r: c.boxR, b: c.boxB }] : [];
  });
}

describe('free lots', () => {
  it('lives where the game puts each premade household, and leaves the rest free', () => {
    const homes = householdLots(seed.nodes);
    assert.equal(homes.get('Willow Creek||Goth')?.name, 'Ophelia Villa');
    assert.equal(homes.get('San Myshuno||Rasoya')?.name, '20 Culpepper House');
    const free = freeLotsIn('Willow Creek', homes).map((l) => l.name);
    assert.equal(free.length, 12);
    assert.ok(free.includes('Brook Bungalow') && !free.includes('Ophelia Villa'));
  });

  it('a household that says where it lives is there, and its game lot is free', () => {
    const core = seed.nodes.map((n) => (n.gid === 'Willow Creek||Goth' ? { ...n, lot: 'Umbrage Manor' } : n));
    const homes = householdLots(core);
    assert.equal(homes.get('Willow Creek||Goth')?.name, 'Umbrage Manor');
    const free = freeLotsIn('Willow Creek', homes).map((l) => l.name);
    assert.ok(free.includes('Ophelia Villa') && !free.includes('Umbrage Manor'));
  });

  it('on a new board, each world’s box sits a tile under its households, clear of every household and world', () => {
    const { laid, boxes } = boxesOf(seed.nodes);
    const hh = householdBoxes(laid);
    assert.ok(boxes.size > 20);
    for (const box of boxes.values()) {
      const own = hh.filter((h) => h.world === box.world);
      if (own.length) assert.equal(box.t, Math.ceil(Math.max(...own.map((h) => h.b)) / TILE) * TILE + TILE, box.world);
      for (const h of hh) assert.ok(!overlaps(box, h), `${box.world}'s lots run into a household in ${h.world}`);
      for (const other of boxes.values()) if (other !== box) assert.ok(!overlaps(box, other), `${box.world} and ${other.world}`);
    }
    // Newcrest has no household: its lots are a world of their own.
    assert.equal(boxes.get('Newcrest')?.tiles.length, 15);
  });

  it('a sim who moves into a free lot makes a household there, and the lot leaves the box', () => {
    const lot = lotNamed('Willow Creek', 'Brook Bungalow')!;
    const dest = moveDestination(groups, seed.nodes, worlds, 'Willow Creek', lotPick(lot), 'Goth')!;
    assert.equal(dest.lot, 'Brook Bungalow');
    assert.equal(dest.nb, 'Courtyard Lane');
    // The Goths have a household already: this one's gid says which lot.
    assert.equal(dest.gid, 'Willow Creek||Goth::Brook Bungalow');
    const { patches } = householdMovePlan(seed.nodes, ['Cassandra Goth'], dest);
    const core = seed.nodes.map((n) => (patches.has(n.id) ? { ...n, ...patches.get(n.id)! } : n));
    const homes = householdLots(core);
    assert.equal(homes.get(dest.gid)?.name, 'Brook Bungalow');
    assert.equal(homes.get('Willow Creek||Goth')?.name, 'Ophelia Villa');
    assert.ok(!freeLotsIn('Willow Creek', homes).some((l) => l.name === 'Brook Bungalow'));
  });

  it('a sim who leaves a lot for a household with none takes no lot along', () => {
    const lot = lotNamed('Willow Creek', 'Brook Bungalow')!;
    const core = seed.nodes.map((n) => (n.id === 'Cassandra Goth' ? { ...n, gid: 'Willow Creek||Goth::Brook Bungalow', lot: lot.name } : n));
    const dest = moveDestination(groups, core, worlds, 'Willow Creek', 'Willow Creek||Pancakes')!;
    const { patches } = householdMovePlan(core, ['Cassandra Goth'], dest);
    assert.ok('lot' in patches.get('Cassandra Goth')! && patches.get('Cassandra Goth')!.lot === undefined);
  });
});

describe('a pinned Free lots box', () => {
  it('stays where it stands while households change around it, shrinking or growing in place', () => {
    const { laid, free, boxes } = boxesOf(seed.nodes);
    const box = boxes.get('Willow Creek')!;
    const cols = new Set(box.tiles.map((t) => t.x)).size;
    const pins = { 'Willow Creek': { x: box.l + 4 * TILE, y: box.t + 6 * TILE, cols } };
    // A household moved far down and right: the pinned box doesn't follow.
    const moved = laid.map((n) => (n.world === 'Willow Creek' ? { ...n, y: n.y + 40 * TILE, x: n.x + 30 * TILE } : n));
    const again = placeLotBoxes({ laid: moved, groups, free, pins }).get('Willow Creek')!;
    assert.deepEqual([again.l, again.t], [pins['Willow Creek'].x, pins['Willow Creek'].y]);
    // A lot taken: one tile fewer, the same top-left.
    const fewer = new Map(free).set('Willow Creek', free.get('Willow Creek')!.slice(1));
    const shrunk = placeLotBoxes({ laid, groups, free: fewer, pins }).get('Willow Creek')!;
    assert.deepEqual([shrunk.l, shrunk.t, shrunk.tiles.length], [again.l, again.t, free.get('Willow Creek')!.length - 1]);
  });
});
