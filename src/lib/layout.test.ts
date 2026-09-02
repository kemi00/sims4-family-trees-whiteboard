import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CARD_H, CARD_MIN_W, HH_TAG_BAND, HH_TAG_INSET, HH_TAG_PILL_H, HH_TAG_STACK_GAP, TILE } from './constants.ts';
import { computeLayout, layoutBases, packingSignature, LAYOUT, OTHER_WORLD, rowPitch, spawnChildOrigin } from './layout.ts';
import { householdChrome, snapNodesToTiles } from './tiles.ts';
import type { Edge, SimNode } from '../types/whiteboard.ts';

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
        gid: 'Other||Father Winter',
        world: OTHER_WORLD,
        gender: 'Male',
      }),
      sim({
        id: 'Grim Reaper',
        first: 'Grim',
        hh: 'Grim Reaper',
        gid: 'Other||Grim Reaper',
        world: OTHER_WORLD,
        gender: 'Male',
      }),
      sim({
        id: 'Guidry',
        first: 'Guidry',
        hh: 'Guidry',
        gid: 'Other||Guidry',
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
