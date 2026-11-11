import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CARD_H, CARD_MIN_W, HH_TAG_BAND, HH_TAG_INSET, HH_TAG_PILL_H, HH_TAG_STACK_GAP, TILE } from './constants.ts';
import {
  ANIMAL_LANE_EPOCH,
  computeLayout,
  HOUSEHOLD_ROWS_EPOCH,
  householdAddSpot,
  laneStrip,
  partnerSpot,
  rowsUnderHousehold,
  layoutBases,
  packingKey,
  packingSignature,
  LAYOUT,
  OTHER_WORLD,
  rowPitch,
  spawnChildOrigin,
  TIGHT_HOUSEHOLDS_EPOCH,
  UNHOUSED_FAMILY_EPOCH,
  unhousedArrangement,
  unhousedEdgeSide,
  WORLD_COLUMNS_EPOCH,
} from './layout.ts';
import { hhBoxDraw } from './geometry.ts';
import { householdChrome, snapNodesToTiles } from './tiles.ts';
import { migrateWhiteboardData } from './utils.ts';
import { prepareLoadedNodes } from './loadLayout.ts';
import type { Edge, Group, SimNode, WhiteboardData } from '../types/whiteboard.ts';
import seedRoster from '../data/whiteboard.json' with { type: 'json' };

const worlds = [{ name: 'Willow Creek', color: '#4e79a7' }];

function sim(
  partial: Partial<SimNode> & Pick<SimNode, 'id' | 'first' | 'hh' | 'gid'>,
): SimNode {
  return {
    sur: partial.hh,
    age: 'Adult',
    state: 'Sim',
    gender: 'Female',
    world: 'Willow Creek',
    nb: '-',
    color: '#4e79a7',
    townie: false,
    oworld: 'Willow Creek',
    onb: '-',
    ohh: partial.hh,
    oplay: 'Resident',
    pack: '',
    x: 0,
    y: 0,
    w: 0,
    h: 0,
    ox: 0,
    oy: 0,
    ...partial,
  };
}

function edge(a: string, b: string, type: Edge['type']): Edge {
  return { id: `${type}:${a}:${b}`, a, b, type, source: 'seed' };
}

describe('tile-native household packing', () => {
  it('keeps packing gutters on the tile grid and reserves the tag band', () => {
    assert.equal(LAYOUT.partnerGap, TILE);
    assert.equal(LAYOUT.gapX, TILE);
    assert.equal(LAYOUT.gapYExtra, TILE);
    assert.equal(LAYOUT.hhGap, TILE);
    assert.equal(LAYOUT.householdGap, TILE);
    assert.equal(LAYOUT.worldGapX, TILE);
    assert.equal(LAYOUT.worldGapY, TILE);
    assert.equal(LAYOUT.hhPad, 0);
    assert.equal(LAYOUT.hhHeader, HH_TAG_BAND);
    assert.equal(rowPitch(), TILE * 2);
  });

  it('lays out Goth as a 2×2 with a tile aisle, then one tile before Pancakes', () => {
    const nodes = [
      sim({ id: 'Bella Goth', first: 'Bella', hh: 'Goth', gid: 'Willow Creek||Goth' }),
      sim({
        id: 'Mortimer Goth',
        first: 'Mortimer',
        hh: 'Goth',
        gid: 'Willow Creek||Goth',
        gender: 'Male',
      }),
      sim({
        id: 'Alexander Goth',
        first: 'Alexander',
        hh: 'Goth',
        gid: 'Willow Creek||Goth',
        gender: 'Male',
        age: 'Child',
      }),
      sim({
        id: 'Cassandra Goth',
        first: 'Cassandra',
        hh: 'Goth',
        gid: 'Willow Creek||Goth',
        age: 'Child',
      }),
      sim({
        id: 'Bob Pancakes',
        first: 'Bob',
        hh: 'Pancakes',
        gid: 'Willow Creek||Pancakes',
        gender: 'Male',
      }),
      sim({
        id: 'Eliza Pancakes',
        first: 'Eliza',
        hh: 'Pancakes',
        gid: 'Willow Creek||Pancakes',
      }),
    ];
    const edges: Edge[] = [
      edge('Bella Goth', 'Mortimer Goth', 'marriage'),
      edge('Bella Goth', 'Alexander Goth', 'parent'),
      edge('Mortimer Goth', 'Alexander Goth', 'parent'),
      edge('Bella Goth', 'Cassandra Goth', 'parent'),
      edge('Mortimer Goth', 'Cassandra Goth', 'parent'),
      edge('Bob Pancakes', 'Eliza Pancakes', 'marriage'),
    ];
    const snapped = snapNodesToTiles(computeLayout(nodes, worlds, edges));
    const byId = new Map(snapped.map((n) => [n.id, n]));
    const bella = byId.get('Bella Goth')!;
    const mortimer = byId.get('Mortimer Goth')!;
    const alexander = byId.get('Alexander Goth')!;
    const cassandra = byId.get('Cassandra Goth')!;
    const bob = byId.get('Bob Pancakes')!;

    assert.equal(mortimer.x - bella.x, TILE * 3);
    assert.equal(mortimer.y, bella.y);
    assert.equal(alexander.x, bella.x);
    assert.equal(alexander.y - bella.y, TILE * 2);
    assert.equal(cassandra.x, mortimer.x);
    assert.equal(cassandra.y, alexander.y);

    const gothRight = Math.max(
      ...snapped.filter((n) => n.gid === bella.gid).map((n) => n.x + n.w),
    );
    const panLeft = Math.min(
      ...snapped.filter((n) => n.gid === bob.gid).map((n) => n.x),
    );
    assert.equal(panLeft - gothRight, TILE);

    const gothChrome = householdChrome(
      snapped.filter((n) => n.gid === bella.gid),
      { hh: 'Goth', nb: 'Pendula View', world: 'Willow Creek' },
    )!;
    assert.equal(gothChrome.boxT, bella.y - HH_TAG_BAND);
    assert.equal(gothChrome.headerY, gothChrome.boxT + HH_TAG_INSET);
    assert.equal(
      gothChrome.ageY,
      gothChrome.headerY + HH_TAG_PILL_H + HH_TAG_STACK_GAP,
    );
    assert.ok(gothChrome.ageY + gothChrome.pillH <= bella.y);
    assert.ok(gothChrome.boxR - gothChrome.boxL >= CARD_MIN_W * 2 + TILE);
  });

  it('leaves a tile of air between stacked household boxes', () => {
    const nodes = ['A', 'B', 'C', 'D'].map((hh) =>
      sim({
        id: `${hh} Sim`,
        first: hh,
        hh,
        gid: `Willow Creek||${hh}`,
      }),
    );
    const snapped = snapNodesToTiles(computeLayout(nodes, worlds, []));
    const boxes = ['A', 'B', 'C', 'D']
      .map((hh) => {
        const mem = snapped.filter((n) => n.hh === hh);
        return householdChrome(mem, {
          hh,
          nb: '-',
          world: 'Willow Creek',
        });
      })
      .filter((c) => c !== null);
    const stacked = [];
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]!;
        const b = boxes[j]!;
        const sameCol = a.boxL === b.boxL;
        if (!sameCol) continue;
        const [upper, lower] = a.boxB <= b.boxT ? [a, b] : [b, a];
        stacked.push(lower.boxT - upper.boxB);
      }
    }
    assert.ok(stacked.length >= 1);
    for (const gap of stacked) assert.equal(gap, TILE);
  });

  it('parked Other in its own column to the right before world columns', () => {
    const allWorlds = [
      { name: 'Willow Creek', color: '#4e79a7' },
      { name: 'Oasis Springs', color: '#a55194' },
      { name: OTHER_WORLD, color: '#9aa0a6' },
    ];
    const nodes = [
      sim({
        id: 'Bella Goth',
        first: 'Bella',
        hh: 'Goth',
        gid: 'Willow Creek||Goth',
      }),
      sim({
        id: 'Bob Pancakes',
        first: 'Bob',
        hh: 'Pancakes',
        gid: 'Willow Creek||Pancakes',
        world: 'Willow Creek',
        gender: 'Male',
      }),
      sim({
        id: 'Johnny Zest',
        first: 'Johnny',
        hh: 'Zest',
        gid: 'Oasis Springs||Zest',
        world: 'Oasis Springs',
        gender: 'Male',
      }),
      sim({
        id: 'Father Winter',
        first: 'Father',
        hh: 'Father Winter',
        gid: 'Not in any world||Father Winter',
        world: OTHER_WORLD,
        gender: 'Male',
      }),
      sim({
        id: 'Grim Reaper',
        first: 'Grim',
        hh: 'Grim Reaper',
        gid: 'Not in any world||Grim Reaper',
        world: OTHER_WORLD,
        gender: 'Male',
      }),
      sim({
        id: 'Guidry',
        first: 'Guidry',
        hh: 'Guidry',
        gid: 'Not in any world||Guidry',
        world: OTHER_WORLD,
        gender: 'Male',
      }),
    ];
    const snapped = snapNodesToTiles(
      computeLayout(nodes, allWorlds, [], WORLD_COLUMNS_EPOCH - 1),
    );
    const named = snapped.filter((n) => n.world !== OTHER_WORLD);
    const other = snapped.filter((n) => n.world === OTHER_WORLD);
    const namedRight = Math.max(...named.map((n) => n.x + n.w));
    const namedTop = Math.min(...named.map((n) => n.y));
    const otherLeft = Math.min(...other.map((n) => n.x));
    const otherTop = Math.min(...other.map((n) => n.y));
    assert.equal(otherLeft - namedRight, TILE);
    assert.equal(otherTop, namedTop);
  });

  it('spawns a first child on the tile row under the parents', () => {
    const parents = [
      { x: 0, y: 500, w: CARD_MIN_W, h: CARD_H },
      { x: 300, y: 500, w: CARD_MIN_W, h: CARD_H },
    ];
    const p = spawnChildOrigin(500, 250, CARD_MIN_W, [], parents);
    assert.equal(p.y, 500 + CARD_H);
    assert.equal(p.y - (500 + CARD_H), 0);
  });

  it('spawns a later child on the sibling row, one tile to the right', () => {
    const sibling = { x: 0, y: 600, w: CARD_MIN_W, h: CARD_H };
    const p = spawnChildOrigin(500, 250, CARD_MIN_W, [sibling], [sibling]);
    assert.equal(p.y, sibling.y);
    assert.equal(p.x, sibling.x + CARD_MIN_W + TILE);
  });

  const card = (x: number, y = 600) => ({ x, y, w: CARD_MIN_W, h: CARD_H });
  const step = CARD_MIN_W + TILE;

  it('keeps a later child beside its siblings, on the left when the right is taken', () => {
    const sibling = card(1000);
    const p = spawnChildOrigin(500, 1100, CARD_MIN_W, [sibling], [sibling, card(1000 + step)]);
    assert.deepEqual(p, { x: 1000 - step, y: 600 });
  });

  it('looks further along the siblings’ row before leaving it', () => {
    const sibling = card(1000);
    const taken = [sibling, card(1000 + step), card(1000 - step)];
    const p = spawnChildOrigin(500, 1100, CARD_MIN_W, [sibling], taken);
    assert.deepEqual(p, { x: 1000 + 2 * step, y: 600 });
  });

  it('drops below the row only when there is no room along it', () => {
    const sibling = card(1000);
    const row = [-4, -3, -2, -1, 1, 2, 3, 4].map((i) => card(1000 + i * step));
    const p = spawnChildOrigin(500, 1100, CARD_MIN_W, [sibling], [sibling, ...row]);
    assert.deepEqual(p, { x: 1000 + step, y: 600 + CARD_H });
  });
});

describe('naming a planned child', () => {
  const romeo = (id: string, extra: Partial<SimNode> = {}) =>
    sim({ id, first: id, hh: 'Romeo', gid: 'Willow Creek||Romeo', ...extra });
  const kid = (id: string) => romeo(id, { first: '', sur: 'Romeo', age: 'Not born yet' });
  const nodes = [romeo('Sergio', { gender: 'Male' }), romeo('Siobhan'), kid('k1'), kid('k2')];
  const edges = ['k1', 'k2'].flatMap((k) => [edge('Sergio', k, 'parent'), edge('Siobhan', k, 'parent')]);
  edges.push(edge('Sergio', 'Siobhan', 'marriage'));
  const named = nodes.map((n) => (n.id === 'k1' ? { ...n, first: 'Heir' } : n));

  it('reorders the siblings, so the editor must pin the board first', () => {
    const before = layoutBases(nodes, worlds, edges);
    const after = layoutBases(named, worlds, edges);
    // Siblings are sorted by name: "Heir Romeo" now comes after the unnamed one.
    assert.ok(before.get('k1')!.x < before.get('k2')!.x);
    assert.ok(after.get('k1')!.x > after.get('k2')!.x);
    assert.notEqual(packingKey(nodes[2]!), packingKey(named[2]!));
  });

  it('leaves every card where it was once pinned to its current place', () => {
    const shown = computeLayout(nodes, worlds, edges);
    const bases = layoutBases(named, worlds, edges);
    const pinned = named.map((n) => {
      const was = shown.find((s) => s.id === n.id)!;
      const base = bases.get(n.id)!;
      return { ...n, ox: was.x - base.x, oy: was.y - base.y };
    });
    const now = computeLayout(pinned, worlds, edges);
    assert.deepEqual(
      now.map((n) => [n.id, n.x, n.y]),
      shown.map((n) => [n.id, n.x, n.y]),
    );
  });
});

describe('layoutBases cache', () => {
  it('reuses packed bases when only ox/oy change', () => {
    const nodes = [
      sim({ id: 'Bella Goth', first: 'Bella', hh: 'Goth', gid: 'Willow Creek||Goth' }),
      sim({
        id: 'Mortimer Goth',
        first: 'Mortimer',
        hh: 'Goth',
        gid: 'Willow Creek||Goth',
        gender: 'Male',
      }),
    ];
    const edges: Edge[] = [edge('Bella Goth', 'Mortimer Goth', 'marriage')];
    const first = layoutBases(nodes, worlds, edges);
    const shifted = nodes.map((n) =>
      n.id === 'Bella Goth' ? { ...n, ox: 96, oy: 48 } : n,
    );
    assert.equal(packingSignature(nodes, worlds, edges), packingSignature(shifted, worlds, edges));
    const second = layoutBases(shifted, worlds, edges);
    assert.equal(second, first);
    const laid = computeLayout(shifted, worlds, edges);
    const bella = laid.find((n) => n.id === 'Bella Goth')!;
    const base = first.get('Bella Goth')!;
    assert.equal(bella.x, base.x + 96);
    assert.equal(bella.y, base.y + 48);
  });
});

describe('household name tags', () => {
  const groupsOf = (nodes: SimNode[]): Group[] =>
    [...new Map(nodes.map((n) => [n.gid, n])).values()].map((n) => ({
      gid: n.gid,
      hh: n.hh,
      world: n.world,
      nb: n.nb,
      color: n.color,
      x: 0,
      y: 0,
      w: 0,
      h: 0,
    }));

  function overlappingHouseholds(laid: SimNode[], groups: Group[]): string[] {
    const gids = [...new Set(laid.map((n) => n.gid))];
    const boxes = gids.map((gid) => [gid, hhBoxDraw(gid, laid, groups, () => true)!] as const);
    const out: string[] = [];
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const [ga, a] = boxes[i]!;
        const [gb, b] = boxes[j]!;
        if (a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t) out.push(`${ga} / ${gb}`);
      }
    }
    return out;
  }

  it('keeps a household out from under the long name tag beside it', () => {
    // One card is narrower than "Aster  ·  Sixteen Saltwater Shores  ·  Willow Creek".
    const nodes = [
      sim({ id: 'a', first: 'Ana', hh: 'Aster', gid: 'Willow Creek||Aster', nb: 'Sixteen Saltwater Shores' }),
      sim({ id: 'b', first: 'Bo', hh: 'Birch', gid: 'Willow Creek||Birch' }),
      sim({ id: 'c', first: 'Cy', hh: 'Cedar', gid: 'Willow Creek||Cedar' }),
    ];
    const laid = snapNodesToTiles(computeLayout(nodes, worlds, []));
    const groups = groupsOf(nodes);
    const aster = hhBoxDraw('Willow Creek||Aster', laid, groups, () => true)!;
    assert.ok(aster.r > laid.find((n) => n.id === 'a')!.x + CARD_MIN_W, 'fixture: the tag overhangs');
    assert.deepEqual(overlappingHouseholds(laid, groups), []);
  });

  it('packs the built-in board with no household boxes overlapping', () => {
    const seed = migrateWhiteboardData(seedRoster as unknown as WhiteboardData);
    const laid = snapNodesToTiles(computeLayout(seed.nodes, seed.worlds!, seed.edges));
    assert.deepEqual(overlappingHouseholds(laid, seed.groups!), []);
  });

  it('repacks when a neighbourhood name changes the tag', () => {
    const nodes = [sim({ id: 'a', first: 'Ana', hh: 'Aster', gid: 'Willow Creek||Aster' })];
    const renamed = [{ ...nodes[0]!, nb: 'Sixteen Saltwater Shores' }];
    assert.notEqual(packingSignature(nodes, worlds, []), packingSignature(renamed, worlds, []));
  });
});

describe('parent-link cycles', () => {
  const placedAll = (nodes: SimNode[], edges: Edge[], ws = worlds) => {
    const laid = computeLayout(nodes, ws, edges);
    for (const n of laid) {
      assert.ok(Number.isFinite(n.x) && Number.isFinite(n.y), `${n.id} unplaced`);
    }
    return new Map(laid.map((n) => [n.id, n]));
  };
  const goth = 'Willow Creek||Goth';

  it('lays out a sim drawn as its own parent', () => {
    placedAll(
      [sim({ id: 'Bella Goth', first: 'Bella', hh: 'Goth', gid: goth })],
      [edge('Bella Goth', 'Bella Goth', 'parent')],
    );
  });

  it('lays out two sims who are each other’s parent, kids still a row below', () => {
    const nodes = [
      sim({ id: 'Bella Goth', first: 'Bella', hh: 'Goth', gid: goth }),
      sim({ id: 'Mortimer Goth', first: 'Mortimer', hh: 'Goth', gid: goth }),
      sim({ id: 'Cassandra Goth', first: 'Cassandra', hh: 'Goth', gid: goth, age: 'Child' }),
    ];
    const byId = placedAll(nodes, [
      edge('Bella Goth', 'Mortimer Goth', 'parent'),
      edge('Mortimer Goth', 'Bella Goth', 'parent'),
      edge('Bella Goth', 'Cassandra Goth', 'parent'),
    ]);
    assert.ok(byId.get('Cassandra Goth')!.y > byId.get('Bella Goth')!.y);
  });

  it('lays out a three-sim cycle spanning linked households', () => {
    const nodes = ['Goth', 'Pancakes', 'Landgraab'].map((hh) =>
      sim({ id: `${hh} Sim`, first: hh, hh, gid: `Willow Creek||${hh}` }),
    );
    placedAll(nodes, [
      edge('Goth Sim', 'Pancakes Sim', 'parent'),
      edge('Pancakes Sim', 'Landgraab Sim', 'parent'),
      edge('Landgraab Sim', 'Goth Sim', 'parent'),
    ]);
  });

  it('lays out a cycle in the Other world', () => {
    const nodes = ['Bonehilda', 'Clement'].map((first) =>
      sim({
        id: first,
        first,
        hh: first,
        gid: `${OTHER_WORLD}||${first}`,
        world: OTHER_WORLD,
        oworld: OTHER_WORLD,
      }),
    );
    placedAll(nodes, [
      edge('Bonehilda', 'Clement', 'parent'),
      edge('Clement', 'Bonehilda', 'parent'),
    ]);
  });
});

describe('Unhoused sims box', () => {
  const box = 'Not in any world||Unhoused sims';
  const loose = (id: string, ohh: string, age = 'Adult') =>
    sim({ id, first: id, hh: 'Unhoused sims', ohh, gid: box, world: OTHER_WORLD, age });
  const nodes = [
    sim({ id: 'skip', first: 'Skip', hh: 'Broke', gid: 'Willow Creek||Broke' }),
    loose('myra', 'Durham', 'Young Adult'),
    loose('kristin', 'Durham', 'Teen'),
    loose('jazlyn', 'Durham', 'Child'),
    loose('dustin', 'Broke'),
    ...['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id) => loose(id, `Single ${id}`)),
  ];
  const edges = [
    edge('myra', 'kristin', 'parent'),
    edge('myra', 'jazlyn', 'parent'),
    edge('skip', 'dustin', 'parent'),
  ];
  const laid = computeLayout(nodes, worlds, edges);
  const at = (id: string) => laid.find((n) => n.id === id)!;
  const inBox = laid.filter((n) => n.gid === box);

  it('stacks a family in generation rows, children under their parent', () => {
    for (const kid of ['kristin', 'jazlyn']) {
      assert.equal(at(kid).y, at('myra').y + rowPitch(), kid);
    }
  });

  it('puts a sim with a relative outside the box on its edge', () => {
    assert.equal(at('dustin').x, Math.min(...inBox.map((n) => n.x)));
  });

  it('can face that edge right instead, for relatives placed right of the box', () => {
    const right = unhousedArrangement(inBox, edges, 'right');
    const xs = [...right.values()].map((p) => p.x);
    assert.equal(right.get('dustin')!.x, Math.max(...xs));
    assert.ok(right.get('kristin')!.y > right.get('myra')!.y);
  });

  it('picks the side its relatives are on', () => {
    const spot = (id: string) => (id === 'skip' ? { x: 99999, y: 0 } : at(id));
    assert.equal(unhousedEdgeSide(inBox, edges, spot), 'right');
    assert.equal(unhousedEdgeSide(inBox, edges, (id) => at(id)), 'left');
  });

  it('packed Not in any world with outside family first and Unhoused sims last', () => {
    const N = OTHER_WORLD;
    const home = (id: string, hh: string, extra: Partial<SimNode> = {}) =>
      sim({ id, first: id, hh, gid: `${N}||${hh}`, world: N, ...extra });
    const nodes2 = [
      sim({ id: 'skip', first: 'Skip', hh: 'Broke', gid: 'Willow Creek||Broke' }),
      home('abe', 'Abbot'),
      home('bea', 'Baker'),
      home('dustin', 'Zed'),
      { ...home('t1', 'Unhoused sims'), gid: `${N}||Unhoused sims` },
    ];
    const laid2 = computeLayout(
      nodes2,
      worlds,
      [edge('skip', 'dustin', 'parent')],
      WORLD_COLUMNS_EPOCH - 1,
    );
    const spot = (id: string) => laid2.find((n) => n.id === id)!;
    // Packed in that order, one tag column each: Zed before Abbot and Baker.
    assert.ok(spot('dustin').x < spot('abe').x, 'his father lives in another world');
    assert.ok(spot('abe').x < spot('bea').x);
    assert.ok(spot('t1').x > spot('bea').x, 'Unhoused sims after every household');
  });

  it('keeps the old flat grid for boards saved before family blocks', () => {
    const old = computeLayout(nodes, worlds, edges, UNHOUSED_FAMILY_EPOCH - 1);
    const y = (id: string) => old.find((n) => n.id === id)!.y;
    assert.equal(y('kristin'), y('myra'), 'one flat row');
  });
});

describe('world columns', () => {
  const allWorlds = ['Willow Creek', 'Oasis Springs', 'Ondarion', 'Sulani', OTHER_WORLD].map(
    (name) => ({ name, color: '#000' }),
  );
  /** `count` one-sim households in `world`, its sims from `pack`. */
  const town = (world: string, count: number, pack: string, sims = 1) =>
    Array.from({ length: count }, (_, h) =>
      Array.from({ length: sims }, (_, i) =>
        sim({
          id: `${world} ${h} ${i}`,
          first: `${world[0]}${h}${i}`,
          hh: `${world} House ${h}`,
          gid: `${world}||${world} House ${h}`,
          world,
          oworld: world,
          pack,
        }),
      ),
    ).flat();
  const nowhere = (id: string, hh: string, pack: string) =>
    sim({ id, first: id, hh, gid: `${OTHER_WORLD}||${hh}`, world: OTHER_WORLD, pack });
  const nodes = [
    ...town('Willow Creek', 2, 'Base Game'),
    ...town('Oasis Springs', 1, 'Base Game', 2),
    ...town('Ondarion', 3, 'Royalty & Legacy'),
    ...town('Sulani', 1, 'Island Living'),
    nowhere('fia', 'Acosta', 'Royalty & Legacy'),
    nowhere('lone', 'Seasonal', 'Seasons'),
    { ...nowhere('t1', 'Unhoused sims', 'Base Game'), gid: `${OTHER_WORLD}||Unhoused sims` },
  ];
  const laid = snapNodesToTiles(computeLayout(nodes, allWorlds, []));
  const cards = (world: string) => laid.filter((n) => n.world === world);
  const left = (world: string) => Math.min(...cards(world).map((n) => n.x));
  const right = (world: string) => Math.max(...cards(world).map((n) => n.x + n.w));
  const top = (world: string) => Math.min(...cards(world).map((n) => n.y));
  const at = (id: string) => laid.find((n) => n.id === id)!;

  it('goes left to right by households, top to bottom by sims', () => {
    // One household: Sulani (1 sim) over Oasis Springs (2), left-aligned.
    assert.equal(left('Sulani'), left('Oasis Springs'));
    assert.ok(top('Sulani') < top('Oasis Springs'));
    assert.ok(left('Willow Creek') > right('Oasis Springs'), 'two households, next column');
    assert.ok(left('Ondarion') > right('Willow Creek'), 'three households, next column');
    assert.equal(top('Willow Creek'), top('Sulani'), 'columns start level');
  });

  it('splits a long run of same-size worlds into even columns', () => {
    const many = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((name) => ({ name, color: '#000' }));
    const run = many.flatMap((w) => town(w.name, 1, ''));
    const out = computeLayout(run, many, []);
    const xs = [...new Set(many.map((w) => out.find((n) => n.world === w.name)!.x))];
    assert.equal(xs.length, 2);
    const inFirst = many.filter((w) => out.find((n) => n.world === w.name)!.x === Math.min(...xs));
    assert.equal(inFirst.length, 4);
  });

  it("puts Not in any world over its game's world, the rest at the end", () => {
    const fia = at('fia');
    assert.ok(fia.x >= left('Ondarion') && fia.x + fia.w <= right('Ondarion') + TILE * 3);
    assert.ok(at('lone').x > right('Ondarion'), 'a game with no world goes after the worlds');
    assert.ok(at('t1').x > right('Ondarion'), 'so does Unhoused sims');
    const worldsTop = Math.min(...laid.filter((n) => n.world !== OTHER_WORLD).map((n) => n.y));
    for (const n of cards(OTHER_WORLD)) assert.ok(n.y + n.h < worldsTop, n.id);
  });

  it('sits each share of Not in any world right on its column', () => {
    // Shares are bottom-aligned, so the band's lowest row is the same for all.
    const bottoms = new Set([at('fia'), at('lone')].map((n) => n.y + n.h));
    assert.equal(bottoms.size, 1);
  });
});

describe('householdAddSpot', () => {
  const card = (x: number, y: number) => ({ x, y, w: CARD_MIN_W, h: CARD_H });
  // Two parents on the top row, one child under them.
  const home = [card(0, 0), card(3 * TILE, 0), card(0, 2 * TILE)];

  it("goes a tile right of the bottom row's last card while the box has room", () => {
    assert.deepEqual(householdAddSpot(home, home, 6 * TILE), { x: 3 * TILE, y: 2 * TILE });
  });

  it('starts a new row under the cards when the box has no room', () => {
    assert.deepEqual(householdAddSpot(home, home, 4 * TILE), { x: 0, y: 2 * TILE + rowPitch() });
  });

  it('moves down past a card already in the spot', () => {
    const other = card(0, 2 * TILE + rowPitch());
    assert.deepEqual(householdAddSpot(home, [...home, other], 4 * TILE), {
      x: 0,
      y: 2 * TILE + 2 * rowPitch(),
    });
  });
});

describe('partnerSpot', () => {
  const card = (x: number, y: number) => ({ x, y, w: CARD_MIN_W, h: CARD_H });
  const host = card(5 * TILE, 0);
  const right = { x: 5 * TILE + CARD_MIN_W + TILE, y: 0 };
  const left = { x: 5 * TILE - TILE - CARD_MIN_W, y: 0 };

  it('sits beside the partner on the side picked, as a couple does', () => {
    assert.deepEqual(partnerSpot(host, [host], 'right'), right);
    assert.deepEqual(partnerSpot(host, [host], 'left'), left);
  });

  it('takes the other side when a card is in the way, and none when both are', () => {
    const r = card(right.x, 0);
    assert.deepEqual(partnerSpot(host, [host, r], 'right'), left);
    assert.equal(partnerSpot(host, [host, r, card(left.x, 0)], 'right'), null);
  });
});

describe('a household whose parents live elsewhere', () => {
  // Kids in Willow Creek whose parents live in Oasis Springs, beside a
  // household with no parents anywhere.
  const both = [...worlds, { name: 'Oasis Springs', color: '#f28e2b' }];
  const away = { world: 'Oasis Springs', oworld: 'Oasis Springs' };
  const nodes = [
    sim({ id: 'mum', first: 'Mum', hh: 'Parents', gid: 'Oasis Springs||Parents', ...away }),
    sim({ id: 'dad', first: 'Dad', hh: 'Parents', gid: 'Oasis Springs||Parents', ...away }),
    sim({ id: 'k1', first: 'Kit', hh: 'Kids', gid: 'Willow Creek||Kids', age: 'Child' }),
    sim({ id: 'k2', first: 'Kay', hh: 'Kids', gid: 'Willow Creek||Kids', age: 'Child' }),
    sim({ id: 'b1', first: 'Bee', hh: 'Bee', gid: 'Willow Creek||Bee' }),
  ];
  const edges = ['k1', 'k2'].flatMap((k) => [edge('mum', k, 'parent'), edge('dad', k, 'parent')]);
  const top = (laid: SimNode[], gid: string) =>
    Math.min(...laid.filter((n) => n.gid === gid).map((n) => n.y));

  it('starts at the top of its slot, level with its neighbour, with no empty row', () => {
    const laid = computeLayout(nodes, both, edges, TIGHT_HOUSEHOLDS_EPOCH);
    assert.equal(top(laid, 'Willow Creek||Kids'), top(laid, 'Willow Creek||Bee'));
  });

  it('kept a generation of empty space above it before', () => {
    const laid = computeLayout(nodes, both, edges, TIGHT_HOUSEHOLDS_EPOCH - 1);
    assert.equal(top(laid, 'Willow Creek||Kids') - top(laid, 'Willow Creek||Bee'), rowPitch());
  });
});

describe('rows built household first', () => {
  // The Darongs, Dreamers and Ananous of Ondarion as a save brings them: the
  // family tree adds deceased ancestors whose age the save doesn't keep.
  const H = (hh: string) => `Willow Creek||${hh}`;
  const dead = { age: 'Unknown', state: 'Deceased' };
  const nodes = [
    sim({ id: 'unknown', first: 'Unknown', hh: 'Darong', gid: H('Darong'), ...dead }),
    sim({ id: 'ade', first: 'Ade', hh: 'Darong', gid: H('Darong'), ...dead }),
    sim({ id: 'eniola', first: 'Eniola', hh: 'Darong', gid: H('Darong'), ...dead }),
    sim({ id: 'adekoya', first: 'Adekoya', hh: 'Darong', gid: H('Darong'), age: 'Elder' }),
    sim({ id: 'imani', first: 'Imani', hh: 'Darong', gid: H('Darong'), ...dead }),
    sim({ id: 'jawara', first: 'Jawara', hh: 'Darong', gid: H('Darong'), age: 'Young Adult' }),
    sim({ id: 'obi', first: 'Obi', hh: 'Darong', gid: H('Darong'), age: 'Child' }),
    sim({ id: 'darren', first: 'Darren', hh: 'Dreamer', gid: H('Dreamer'), ...dead }),
    sim({ id: 'darleen', first: 'Darleen', hh: 'Dreamer', gid: H('Dreamer'), ...dead }),
    sim({ id: 'dirk', first: 'Dirk', hh: 'Dreamer', gid: H('Dreamer'), age: 'Young Adult' }),
    sim({ id: 'amarachi', first: 'Amarachi', sur: 'Darong', hh: 'Dreamer', gid: H('Dreamer'), age: 'Young Adult' }),
    sim({ id: 'amara', first: 'Amara', hh: 'Dreamer', gid: H('Dreamer'), age: 'Infant' }),
    sim({ id: 'ikenna', first: 'Ikenna', hh: 'Dreamer', gid: H('Dreamer'), age: 'Infant' }),
    sim({ id: 'ekene', first: 'Ekene', hh: 'Ananou', gid: H('Ananou'), age: 'Elder' }),
    sim({ id: 'aghata', first: 'Aghata', hh: 'Ananou', gid: H('Ananou'), ...dead }),
    sim({ id: 'afua', first: 'Afua', hh: 'Ananou', gid: H('Ananou'), age: 'Child' }),
  ];
  const edges = [
    edge('unknown', 'ade', 'parent'),
    edge('ade', 'eniola', 'marriage'),
    edge('ade', 'adekoya', 'parent'),
    edge('eniola', 'adekoya', 'parent'),
    edge('adekoya', 'imani', 'marriage'),
    edge('adekoya', 'jawara', 'parent'),
    edge('imani', 'jawara', 'parent'),
    edge('jawara', 'obi', 'parent'),
    edge('jawara', 'amarachi', 'parent'),
    edge('darren', 'darleen', 'marriage'),
    edge('darren', 'dirk', 'parent'),
    edge('darleen', 'dirk', 'parent'),
    edge('dirk', 'amarachi', 'marriage'),
    edge('dirk', 'amara', 'parent'),
    edge('amarachi', 'amara', 'parent'),
    edge('dirk', 'ikenna', 'parent'),
    edge('amarachi', 'ikenna', 'parent'),
    edge('ekene', 'aghata', 'parent'),
    edge('aghata', 'afua', 'parent'),
    edge('adekoya', 'afua', 'parent'),
  ];
  const yOf = (laid: SimNode[]) => new Map(laid.map((n) => [n.id, n.y]));
  const pitch = rowPitch();

  it('sits a couple side by side, with their children in the row right under', () => {
    const y = yOf(computeLayout(nodes, worlds, edges));
    assert.equal(y.get('adekoya'), y.get('imani'), 'Adekoya beside his late wife');
    assert.equal(y.get('ade'), y.get('eniola'));
    assert.equal(y.get('adekoya')! - y.get('ade')!, pitch, 'his parents right above him, not his spouses');
    assert.equal(y.get('jawara')! - y.get('adekoya')!, pitch);
    assert.equal(y.get('dirk'), y.get('amarachi'), 'Amarachi beside Dirk');
    assert.equal(y.get('amara')! - y.get('dirk')!, pitch, 'the babies right under them');
    assert.equal(y.get('ikenna'), y.get('amara'));
  });

  it('moves linked households whole to line family up across them', () => {
    const y = yOf(computeLayout(nodes, worlds, edges));
    assert.equal(y.get('amarachi')! - y.get('jawara')!, pitch, 'Amarachi a row under her mother');
    assert.equal(y.get('obi'), y.get('amarachi'), 'level with his sister');
    assert.equal(y.get('aghata'), y.get('adekoya'), 'Afua’s parents level');
    assert.equal(y.get('afua')! - y.get('aghata')!, pitch, 'Afua right under her mother');
    assert.equal(y.get('aghata')! - y.get('ekene')!, pitch, 'the Ananous keep their own rows');
  });

  it('kept the old rows before, and keeps a board saved then where it was', () => {
    const old = HOUSEHOLD_ROWS_EPOCH - 1;
    const was = snapNodesToTiles(computeLayout(nodes, worlds, edges, old));
    const y = yOf(was);
    assert.notEqual(y.get('dirk'), y.get('amarachi'));
    const { nodes: pinned, repacked } = prepareLoadedNodes(nodes, old, worlds, edges);
    assert.equal(repacked, false);
    const now = new Map(snapNodesToTiles(computeLayout(pinned, worlds, edges)).map((n) => [n.id, n]));
    for (const n of was) assert.deepEqual([now.get(n.id)!.x, now.get(n.id)!.y], [n.x, n.y], n.first);
  });
});

describe('a household’s animals in a lane of their own', () => {
  // The Groves of Chestnut Ridge as a save brings them: Tallulah is Umber's
  // late mother, Luna the mare is Starbrite's.
  const H = 'Willow Creek||Grove';
  const horse = { state: 'Pet', species: 'Horse' };
  const nodes = [
    sim({ id: 'tallulah', first: 'Tallulah', hh: 'Grove', gid: H, age: 'Unknown', state: 'Deceased' }),
    sim({ id: 'umber', first: 'Umber', hh: 'Grove', gid: H, gender: 'Male' }),
    sim({ id: 'juniper', first: 'Juniper', hh: 'Grove', gid: H }),
    sim({ id: 'wren', first: 'Wren', hh: 'Grove', gid: H, age: 'Child', gender: 'Male' }),
    sim({ id: 'luna', first: 'Luna', sur: '', hh: 'Grove', gid: H, ...horse }),
    sim({ id: 'starbrite', first: 'Starbrite', sur: '', hh: 'Grove', gid: H, age: 'Child', ...horse }),
  ];
  const edges = [
    edge('tallulah', 'umber', 'parent'),
    edge('umber', 'juniper', 'marriage'),
    edge('umber', 'wren', 'parent'),
    edge('juniper', 'wren', 'parent'),
    edge('luna', 'starbrite', 'parent'),
  ];
  const at = (laid: SimNode[]) => new Map(laid.map((n) => [n.id, n]));
  const pitch = rowPitch();
  const animals = new Set(['luna', 'starbrite']);

  it('stands the animals right of every sim, one empty column between', () => {
    const laid = snapNodesToTiles(computeLayout(nodes, worlds, edges));
    const simsRight = Math.max(...laid.filter((n) => !animals.has(n.id)).map((n) => n.x + n.w));
    for (const n of laid.filter((x) => animals.has(x.id))) {
      assert.equal(n.x - simsRight, CARD_MIN_W + 2 * LAYOUT.gapX, n.first);
    }
  });

  it('keeps the animals’ own family in the lane: the mare above her foal', () => {
    const c = at(snapNodesToTiles(computeLayout(nodes, worlds, edges)));
    assert.equal(c.get('luna')!.y, c.get('tallulah')!.y, 'the lane starts at the top row');
    assert.equal(c.get('starbrite')!.x, c.get('luna')!.x, 'Starbrite straight under Luna');
    assert.equal(c.get('starbrite')!.y - c.get('luna')!.y, pitch);
  });

  it('leaves the family tree to the sims: Tallulah right above her son', () => {
    const c = at(snapNodesToTiles(computeLayout(nodes, worlds, edges)));
    assert.equal(c.get('tallulah')!.x, c.get('umber')!.x);
    assert.equal(c.get('umber')!.y - c.get('tallulah')!.y, pitch);
    assert.equal(c.get('juniper')!.y, c.get('umber')!.y);
    assert.equal(c.get('wren')!.y - c.get('umber')!.y, pitch);
  });

  it('mixed them into the rows before, and keeps a board saved then where it was', () => {
    const old = ANIMAL_LANE_EPOCH - 1;
    const was = snapNodesToTiles(computeLayout(nodes, worlds, edges, old));
    const c = at(was);
    assert.equal(c.get('starbrite')!.y, c.get('umber')!.y, 'Starbrite stood in Umber’s row');
    const { nodes: pinned, repacked } = prepareLoadedNodes(nodes, old, worlds, edges);
    assert.equal(repacked, false);
    const now = at(snapNodesToTiles(computeLayout(pinned, worlds, edges)));
    for (const n of was) assert.deepEqual([now.get(n.id)!.x, now.get(n.id)!.y], [n.x, n.y], n.first);
  });

  it('gives a household of only animals no lane', () => {
    const pets = nodes.filter((n) => animals.has(n.id)).map((n) => ({ ...n, gid: 'Willow Creek||Stable', hh: 'Stable' }));
    const c = at(snapNodesToTiles(computeLayout(pets, worlds, edges)));
    assert.equal(c.get('starbrite')!.x, c.get('luna')!.x);
    assert.equal(c.get('starbrite')!.y - c.get('luna')!.y, pitch);
  });

  // The Lynxes of Brindleton Bay: one sim, three cats and Josie's kitten, so
  // the lane runs a row below the sims.
  const L = 'Willow Creek||Lynx';
  const cat = { state: 'Pet', species: 'Cat' };
  const lynx = [
    sim({ id: 'catarina', first: 'Catarina', hh: 'Lynx', gid: L }),
    sim({ id: 'doc', first: 'Doc', sur: '', hh: 'Lynx', gid: L, ...cat }),
    sim({ id: 'josie', first: 'Josie', sur: '', hh: 'Lynx', gid: L, ...cat }),
    sim({ id: 'cleo', first: 'Cleo', sur: '', hh: 'Lynx', gid: L, ...cat }),
    sim({ id: 'bart', first: 'Bartholomew', sur: '', hh: 'Lynx', gid: L, age: 'Child', ...cat }),
  ];
  const lynxEdges = [edge('josie', 'bart', 'parent')];

  it('adds a sim among the sims, never in the lane or its empty column', () => {
    const home = snapNodesToTiles(computeLayout(lynx, worlds, lynxEdges));
    const c = at(home);
    const boxRight = Math.max(...home.map((n) => n.x + n.w));
    const spot = householdAddSpot(home, home, boxRight);
    assert.equal(spot.x, c.get('catarina')!.x, 'under Catarina, from the left');
    assert.ok(spot.y > c.get('catarina')!.y);
    const strip = laneStrip(home)!;
    assert.equal(strip.x, c.get('catarina')!.x + CARD_MIN_W);
    assert.equal(strip.w, CARD_MIN_W + 2 * LAYOUT.gapX);
  });

  it('puts newcomers from a save under the sims or under the lane', () => {
    const home = snapNodesToTiles(computeLayout(lynx, worlds, lynxEdges));
    const c = at(home);
    const joiners = [
      sim({ id: 'kit', first: 'Kit', hh: 'Lynx', gid: L, age: 'Child' }),
      sim({ id: 'tom', first: 'Tom', sur: '', hh: 'Lynx', gid: L, ...cat }),
    ];
    const spots = rowsUnderHousehold(home, joiners);
    assert.equal(spots.get('kit')!.x, c.get('catarina')!.x);
    assert.equal(spots.get('kit')!.y, c.get('catarina')!.y + pitch);
    assert.equal(spots.get('tom')!.x, Math.min(...['doc', 'josie', 'cleo'].map((id) => c.get(id)!.x)), 'from the lane’s left');
    assert.equal(spots.get('tom')!.y, c.get('bart')!.y + pitch);
  });
});

describe('a row of children in the order of their parents', () => {
  // Two single parents in one household; by name alone Ash would stand
  // under Ava and Noah under Lucha, and their lines would cross.
  const H = 'Willow Creek||Harjo';
  const nodes = [
    sim({ id: 'ava', first: 'Ava', hh: 'Harjo', gid: H }),
    sim({ id: 'lucha', first: 'Lucha', hh: 'Harjo', gid: H }),
    sim({ id: 'ash', first: 'Ash', hh: 'Harjo', gid: H, age: 'Child' }),
    sim({ id: 'noah', first: 'Noah', sur: 'Kane', hh: 'Harjo', gid: H, age: 'Child' }),
  ];
  const edges = [edge('ava', 'noah', 'parent'), edge('lucha', 'ash', 'parent')];
  const x = (laid: SimNode[]) => new Map(laid.map((n) => [n.id, n.x]));

  it('stands each child under their own parent', () => {
    const c = x(snapNodesToTiles(computeLayout(nodes, worlds, edges)));
    assert.equal(c.get('noah'), c.get('ava'));
    assert.equal(c.get('ash'), c.get('lucha'));
  });

  it('went by name before', () => {
    const c = x(snapNodesToTiles(computeLayout(nodes, worlds, edges, ANIMAL_LANE_EPOCH - 1)));
    assert.equal(c.get('ash'), c.get('ava'));
  });
});
