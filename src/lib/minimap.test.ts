import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MINIMAP_PAD, ZOOM_MAX, ZOOM_MIN } from './constants.ts';
import {
  mappedViewRect,
  minimapFit,
  minimapToWorld,
  viewportCenteredOn,
  worldToMinimap,
  zoomTowardWorld,
} from './minimap.ts';

describe('minimap', () => {
  it('fits the board into the map with padding and round-trips coordinates', () => {
    const board = { l: 0, t: 0, r: 2000, b: 1000 };
    const fit = minimapFit(board, 220, 140, MINIMAP_PAD);
    const mid = worldToMinimap(1000, 500, fit);
    const back = minimapToWorld(mid.x, mid.y, fit);
    assert.ok(Math.abs(back.x - 1000) < 1e-9);
    assert.ok(Math.abs(back.y - 500) < 1e-9);
    const corner = worldToMinimap(0, 0, fit);
    assert.ok(corner.x >= MINIMAP_PAD - 1e-9);
    assert.ok(corner.y >= MINIMAP_PAD - 1e-9);
  });

  it('centres the stage on a world point without changing zoom', () => {
    const v = viewportCenteredOn(400, 200, 2, 800, 600);
    assert.equal(v.k, 2);
    assert.equal(v.tx, 800 / 2 - 400 * 2);
    assert.equal(v.ty, 600 / 2 - 200 * 2);
  });

  it('zooms toward a world point and clamps', () => {
    const v = { tx: 10, ty: 20, k: 1 };
    const z = zoomTowardWorld(v, 100, 50, 2);
    assert.equal(z.k, 2);
    assert.equal(z.tx + 100 * z.k, v.tx + 100 * v.k);
    assert.equal(z.ty + 50 * z.k, v.ty + 50 * v.k);
    const hi = zoomTowardWorld(v, 0, 0, 1000);
    assert.equal(hi.k, ZOOM_MAX);
    const lo = zoomTowardWorld({ tx: 0, ty: 0, k: ZOOM_MIN }, 0, 0, 0.1);
    assert.equal(lo.k, ZOOM_MIN);
  });

  it('keeps a zoomed-in view rectangle large enough to see', () => {
    const fit = minimapFit({ l: 0, t: 0, r: 10000, b: 10000 }, 200, 200, 0);
    const tiny = mappedViewRect({ l: 0, t: 0, r: 10, b: 10 }, fit, 12);
    assert.equal(tiny.w, 12);
    assert.equal(tiny.h, 12);
  });
});
