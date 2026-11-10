import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CARD_H, CARD_MIN_W } from './constants.ts';
import { hhBoxDraw, worldFrame } from './geometry.ts';
import { householdMovePlan, moveDestination, NEW_HOUSEHOLD } from './householdMove.ts';
import { freeHouseholdSpot, landMovedCards } from './landing.ts';
import { computeLayout } from './layout.ts';
import { snapNodesToTiles } from './tiles.ts';
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
    const r = landMovedCards({ core, laid, worlds, edges: seed.edges, groups, patches, destGid: dest.gid, newGroup, snap: true });
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
