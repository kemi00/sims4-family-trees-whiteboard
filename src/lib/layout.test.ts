import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CARD_H, CARD_MIN_W, HH_TAG_BAND, HH_TAG_INSET, HH_TAG_PILL_H, HH_TAG_STACK_GAP, TILE } from './constants.ts';
import {
  computeLayout,
  layoutBases,
  packingSignature,
  LAYOUT,
  OTHER_WORLD,
  rowPitch,
  spawnChildOrigin,
  UNHOUSED_FAMILY_EPOCH,
  unhousedArrangement,
  unhousedEdgeSide,
} from './layout.ts';
import { hhBoxDraw } from './geometry.ts';
import { householdChrome, snapNodesToTiles } from './tiles.ts';
import { migrateWhiteboardData } from './utils.ts';
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

  it('parks Other in its own column to the right, top-aligned with named worlds', () => {
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
    const snapped = snapNodesToTiles(computeLayout(nodes, allWorlds, []));
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

  it('packs Not in any world with outside family first and Unhoused sims last', () => {
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
    const laid2 = computeLayout(nodes2, worlds, [edge('skip', 'dustin', 'parent')]);
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
