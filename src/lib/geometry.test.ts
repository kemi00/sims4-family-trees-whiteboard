import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  TILE,
  WORLD_TAG_NORMAL_ZOOM,
  WORLD_TAG_PILL_H,
  WORLD_TAG_MIN_SCREEN_PX,
  WORLD_TAG_ZOOM_OUT_MAX,
} from './constants.ts';
import {
  separateOverlappingWorldFrames,
  worldFrame,
  worldTagZoomScale,
  zoomViewportAt,
} from './geometry.ts';
import type { Group, SimNode } from '../types/whiteboard.ts';

function card(
  id: string,
  world: string,
  gid: string,
  x: number,
  y: number,
): SimNode {
  return {
    id,
    fn: id,
    ln: '',
    age: 'Young Adult',
    gender: 'Female',
    play: 'Played',
    pack: 'Base Game',
    world,
    gid,
    x,
    y,
    w: TILE * 2,
    h: TILE,
    ox: 0,
    oy: 0,
  };
}

describe('worldTagZoomScale', () => {
  it('is 1 at or above normal zoom (≥ 100%)', () => {
    assert.equal(worldTagZoomScale(WORLD_TAG_NORMAL_ZOOM), 1);
    assert.equal(worldTagZoomScale(1), 1);
    assert.equal(worldTagZoomScale(2), 1);
  });

  it('grows so the pill stays ~MIN_SCREEN_PX tall on screen, capped', () => {
    // screenH = PILL_H * scale * k  ≈ MIN → scale ≈ MIN / (PILL_H * k)
    assert.ok(worldTagZoomScale(0.5) > 1);
    assert.equal(
      worldTagZoomScale(0.1),
      Math.min(
        WORLD_TAG_ZOOM_OUT_MAX,
        WORLD_TAG_MIN_SCREEN_PX / (WORLD_TAG_PILL_H * 0.1),
      ),
    );
    assert.equal(worldTagZoomScale(0.04), WORLD_TAG_ZOOM_OUT_MAX);
  });
});

describe('separateOverlappingWorldFrames', () => {
  it('nudges the lower world down by whole tiles until frames clear', () => {
    const groups: Group[] = [
      { gid: 'a', name: 'A' },
      { gid: 'b', name: 'B' },
    ];
    const nodes = [
      card('n1', 'World A', 'a', 0, 0),
      // Overlaps World A's frame vertically (same column, too close).
      card('n2', 'World B', 'b', 0, TILE * 2),
    ];
    const beforeA = worldFrame('World A', nodes, groups, () => true)!;
    const beforeB = worldFrame('World B', nodes, groups, () => true)!;
    assert.ok(
      beforeA.l < beforeB.r &&
        beforeA.r > beforeB.l &&
        beforeA.t < beforeB.b &&
        beforeA.b > beforeB.t,
      'fixtures must overlap before separation',
    );

    const next = separateOverlappingWorldFrames(nodes, groups);
    const afterA = worldFrame('World A', next, groups, () => true)!;
    const afterB = worldFrame('World B', next, groups, () => true)!;
    const overlap =
      afterA.l < afterB.r &&
      afterA.r > afterB.l &&
      afterA.t < afterB.b &&
      afterA.b > afterB.t;
    assert.equal(overlap, false);

    const moved = next.find((n) => n.id === 'n2')!;
    assert.ok(moved.y > nodes[1]!.y);
    assert.equal(moved.y % TILE, 0);
    // At least one tile of gap between frames.
    assert.ok(afterB.t >= afterA.b + TILE);
  });
});

describe('zoomViewportAt', () => {
  it('keeps the cursor world point stable', () => {
    const svg = { left: 10, top: 20, width: 800, height: 600 } as DOMRect;
    const v = { tx: 40, ty: 50, k: 1 };
    const cx = 210;
    const cy = 120;
    const next = zoomViewportAt(v, 2, cx, cy, svg);
    assert.equal(next.k, 2);
    const mx = cx - svg.left;
    const my = cy - svg.top;
    const worldX = (mx - v.tx) / v.k;
    const worldY = (my - v.ty) / v.k;
    assert.equal((mx - next.tx) / next.k, worldX);
    assert.equal((my - next.ty) / next.k, worldY);
  });
});
