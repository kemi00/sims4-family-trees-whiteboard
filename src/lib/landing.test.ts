import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CARD_H, CARD_MIN_W, TILE } from './constants.ts';
import { hhBoxDraw, worldFrame } from './geometry.ts';
import { householdMovePlan, moveDestination, NEW_HOUSEHOLD } from './householdMove.ts';
import { freeHouseholdSpot, growHousehold, householdGrowth, landMovedCards } from './landing.ts';
import { computeLayout } from './layout.ts';
import { householdChrome, snapNodesToTiles } from './tiles.ts';
import { migrateWhiteboardData } from './utils.ts';
import type { Group, HhBoxDraw, SimNode, WhiteboardData } from '../types/whiteboard.ts';
import seedRoster from '../data/whiteboard.json' with { type: 'json' };

const overlaps = (a: HhBoxDraw, b: HhBoxDraw) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
const all = () => true;

describe('a household moving to another world', () => {
  const seed = migrateWhiteboardData(seedRoster as unknown as WhiteboardData);
  const worlds = seed.worlds!;
  const groups = seed.groups!;
  const lay = (core: SimNode[]) => snapNodesToTiles(computeLayout(core, worlds, seed.edges));
  // A hand-arranged board: Willow Creek dragged far from where the layout packs it.
  const core = seed.nodes.map((n) => (n.world === 'Willow Creek' ? { ...n, ox: (n.ox ?? 0) + 3000, oy: (n.oy ?? 0) + 6000 } : n));

  const move = (gid: string, world: string) => {
    const laid = lay(core);
    const g = groups.find((x) => x.gid === gid)!;
    const dest = moveDestination(groups, laid, worlds, world, NEW_HOUSEHOLD, g.hh)!;
    const ids = laid.filter((n) => n.gid === gid).map((n) => n.id);
    const { patches } = householdMovePlan(laid, ids, dest);
    const newGroup: Group | null = dest.isNew
      ? { gid: dest.gid, hh: dest.hh, world: dest.world, nb: dest.nb, color: dest.color, x: 0, y: 0, w: 0, h: 0 }
      : null;
    const r = landMovedCards({ core, laid, worlds, edges: seed.edges, groups, patches, destGid: dest.gid, newGroup });
    return { laid, after: lay(r.core), ids: new Set(ids), dest, groups: newGroup ? [...groups, newGroup] : groups, joined: r.joined };
  };

  it('lands beside the world’s households as they are shown, and moves no other card', () => {
    const gid = groups.find((g) => g.world === 'Oasis Springs' && seed.nodes.some((n) => n.gid === g.gid))!.gid;
    const { laid, after, ids, dest, groups: gs, joined } = move(gid, 'Willow Creek');
    assert.equal(joined, false);
    const was = new Map(laid.map((n) => [n.id, n]));
    const moved = after.filter((n) => !ids.has(n.id) && (was.get(n.id)!.x !== n.x || was.get(n.id)!.y !== n.y));
    assert.deepEqual(moved.map((n) => n.id), []);
    // Inside or right by Willow Creek where it was dragged, not where the layout packs it.
    const frameBefore = worldFrame('Willow Creek', laid, gs, all)!;
    const box = hhBoxDraw(dest.gid, after, gs, all)!;
    assert.ok(box.l >= frameBefore.l - CARD_MIN_W && box.r <= frameBefore.r + 3 * CARD_MIN_W, `x ${box.l}–${box.r}`);
    assert.ok(box.t >= frameBefore.t && box.t <= frameBefore.b + CARD_H, `y ${box.t}`);
    // Clear of every other household, and the frame runs into no other world.
    for (const g of new Set(after.map((n) => n.gid))) {
      if (g === dest.gid) continue;
      const other = hhBoxDraw(g, after, gs, all);
      assert.ok(!other || !overlaps(other, box), `overlaps ${g}`);
    }
    const frame = worldFrame('Willow Creek', after, gs, all)!;
    for (const w of new Set(after.map((n) => n.world))) {
      if (w === 'Willow Creek') continue;
      const other = worldFrame(w, after, gs, all);
      assert.ok(!other || !overlaps(other, frame), `Willow Creek runs into ${w}`);
    }
  });

  it('joins a household already there without moving any other card', () => {
    const laid = lay(core);
    const from = groups.find((g) => g.world === 'Oasis Springs' && laid.some((n) => n.gid === g.gid))!;
    for (const to of groups.filter((g) => g.world === 'Willow Creek' && laid.some((n) => n.gid === g.gid))) {
      const dest = moveDestination(groups, laid, worlds, 'Willow Creek', to.gid)!;
      const ids = laid.filter((n) => n.gid === from.gid).map((n) => n.id);
      const { patches } = householdMovePlan(laid, ids, dest);
      const r = landMovedCards({ core, laid, worlds, edges: seed.edges, groups, patches, destGid: to.gid, newGroup: null });
      assert.equal(r.joined, true);
      const after = new Map(lay(r.core).map((n) => [n.id, n]));
      for (const n of laid) {
        if (ids.includes(n.id) || (r.moved && n.gid === to.gid)) continue;
        const now = after.get(n.id)!;
        assert.ok(now.x === n.x && now.y === n.y, `joining ${to.gid}: ${n.id} moved`);
      }
    }
  });
});

describe('free room for a household', () => {
  const card = (id: string, gid: string, world: string, x: number, y: number): SimNode =>
    ({ id, gid, world, hh: gid, first: id, sur: '', age: 'Adult', gender: 'Female', state: 'Sim', nb: '-', color: '#999', x, y, w: CARD_MIN_W, h: CARD_H }) as SimNode;
  // Two households side by side in W, and world V a tile and a half to its right.
  const others = [
    card('a', 'W||A', 'W', 1000, 1000),
    card('b', 'W||B', 'W', 1300, 1000),
    card('b2', 'W||B', 'W', 1300, 1200),
    card('v', 'V||V', 'V', 1850, 1000),
  ];
  const block = [card('m', 'W||M', 'X', 5000, 5000)];

  it('takes free room inside the world’s frame first', () => {
    // B runs three rows deep, so under A there is room inside W: nothing grows.
    const deep = [...others, card('b3', 'W||B', 'W', 1300, 1400)];
    assert.deepEqual(freeHouseholdSpot({ others: deep, groups: [], world: 'W', block, near: { x: 9000, y: 9000 } }), { x: 1000, y: 1300 });
  });

  it('grows the world down rather than into the world beside it', () => {
    const full = [...others, card('a2', 'W||A', 'W', 1000, 1200)];
    const at = freeHouseholdSpot({ others: full, groups: [], world: 'W', block, near: { x: 9000, y: 9000 } });
    assert.deepEqual(at, { x: 1000, y: 1500 });
  });
});

describe('a household growing', () => {
  const card = (id: string, gid: string, x: number, y: number, world = 'W'): SimNode =>
    ({ id, gid, world, hh: gid, first: id, sur: '', age: 'Adult', gender: 'Female', state: 'Sim', nb: '-', color: '#999', x, y, w: CARD_MIN_W, h: CARD_H }) as SimNode;
  const baby = card('new', 'W||A', 0, 0);
  // Household A: two cards in a row. Cards are 2 tiles by 1; a box has a
  // tile of name tag above its cards, and boxes keep a tile apart.
  const a = [card('a1', 'W||A', 1000, 1000), card('a2', 'W||A', 1300, 1000)];
  const under = { x: 1000, y: 1200 };

  /** No card of `placed` within a tile of any card in `cards`. */
  const clearOf = (placed: { x: number; y: number }, cards: SimNode[]) =>
    cards.every(
      (c) =>
        placed.x + CARD_MIN_W + TILE <= c.x ||
        c.x + c.w + TILE <= placed.x ||
        placed.y + CARD_H + TILE <= c.y ||
        c.y + c.h + TILE <= placed.y,
    );

  it('takes the spot asked for when no card is there', () => {
    const others = [card('c', 'W||C', 2000, 1000)];
    assert.deepEqual(householdGrowth({ others, groups: [], home: a, block: [baby], spots: [under] }), {
      at: under,
      outOfView: false,
      crowded: false,
      atSpot: true,
    });
  });

  it('takes the spot even when the household box then runs into its neighbour', () => {
    // B's box starts a tile under A's new row: boxes may touch, cards may not.
    const others = [card('b', 'W||B', 1000, 1500)];
    const g = householdGrowth({ others, groups: [], home: a, block: [baby], spots: [under] });
    assert.deepEqual(g.at, under);
  });

  it('takes the nearest free spot when a card is in the way, and moves nothing', () => {
    const others = [card('b', 'W||B', 1000, 1300)];
    const g = householdGrowth({ others, groups: [], home: a, block: [baby], spots: [under] });
    assert.equal(g.atSpot, false);
    assert.equal(g.crowded, false);
    assert.ok(clearOf(g.at, [...a, ...others]), `lands on a card at ${JSON.stringify(g.at)}`);
    assert.ok(Math.hypot(g.at.x - under.x, g.at.y - under.y) <= 300, `too far: ${JSON.stringify(g.at)}`);
  });

  it('boxed in on every side, still moves no one: the nearest free spot', () => {
    const others = [
      card('b', 'W||B', 1000, 1400),
      card('c', 'W||C', 1800, 1000),
      card('d', 'W||D', 500, 1000),
      card('e', 'W||E', 1000, 600),
    ];
    const g = householdGrowth({ others, groups: [], home: a, block: [baby], spots: [under] });
    assert.equal(g.crowded, false);
    assert.ok(clearOf(g.at, [...a, ...others]));
    assert.ok(!('shift' in g));
  });

  it('prefers a free spot on screen to a nearer one off it', () => {
    const others = [card('b', 'W||B', 1000, 1300)];
    // The screen ends right under A: only spots beside it are on it.
    const view = { l: 0, t: 0, r: 3000, b: 1150 };
    const g = householdGrowth({ others, groups: [], home: a, block: [baby], spots: [under], view });
    assert.equal(g.outOfView, false);
    assert.ok(g.at.y + CARD_H <= view.b && clearOf(g.at, [...a, ...others]), JSON.stringify(g.at));
  });

  it('says when nothing on screen was free, for the view to glide there', () => {
    const view = { l: 900, t: 900, r: 1700, b: 1150 };
    const g = householdGrowth({ others: [], groups: [], home: a, block: [baby], spots: [under], view });
    assert.equal(g.outOfView, true);
    assert.deepEqual(g.at, under);
  });

  it('prefers a spot outside another household’s box', () => {
    // C's box has room in its middle, right beside A: no card is there, but
    // a sim there would look like C's. Under A is free and in no box.
    const others = [card('c', 'W||C', 1600, 700), card('c2', 'W||C', 1600, 1300)];
    const g = householdGrowth({ others, groups: [], home: a, block: [baby], spots: [{ x: 1600, y: 1000 }, under] });
    assert.deepEqual(g.at, under);
  });

  describe('on the starter board', () => {
    const seed = migrateWhiteboardData(seedRoster as unknown as WhiteboardData);
    const worlds = seed.worlds!;
    const groups = seed.groups!;
    const lay = (core: SimNode[]) => snapNodesToTiles(computeLayout(core, worlds, seed.edges));
    const core = seed.nodes;
    const laid = lay(core);

    it('adds a sim to every household without moving a single card', () => {
      let checked = 0;
      for (const g of groups) {
        const home = laid.filter((n) => n.gid === g.gid);
        if (!home.length || g.world === '—') continue;
        const n = { ...home[0]!, id: 'added', first: 'New', ox: 0, oy: 0 };
        const chrome = householdChrome(home, g)!;
        const spot = { x: chrome.boxL, y: chrome.boxB + TILE };
        const r = growHousehold({ core: [...core, n], laid, worlds, edges: seed.edges, groups, gid: g.gid, block: [{ ...n, ...spot }], spots: [spot] });
        const after = new Map(lay(r.core).map((x) => [x.id, x]));
        // Not even the household's own cards move.
        for (const o of laid) {
          const now = after.get(o.id)!;
          assert.ok(now.x === o.x && now.y === o.y, `${g.gid}: ${o.id} moved`);
        }
        checked++;
      }
      assert.ok(checked > 20, `checked ${checked}`);
    });
  });
});
