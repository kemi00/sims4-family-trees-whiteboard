import { TILE } from './constants.ts';
import { viewportWorldRect } from './geometry.ts';
import { rectsIntersect, type WorldRect } from './marquee.ts';
import type { Point, SimNode, Viewport } from '../types/whiteboard.ts';

/**
 * Render culling for big boards. Only cards, households and links inside a
 * window around the view are mounted. The window is the visible area plus one
 * screen of overscan on every side, so an ordinary pan never reaches unmounted
 * ground, and it is re-centred mid-gesture once the view nears its edge — the
 * same idea as a virtualised list.
 */

/** Overscan on each side, in screens. */
export const CULL_OVERSCAN = 1;

/** Re-centre once the view is closer than this to the window edge, in screens. */
export const CULL_RECENTER_MARGIN = 0.5;

/**
 * Where to draw the tile grid: the render window, out to whole tiles, so the
 * grid fills the view wherever the board is panned. A fixed square ran out
 * once a board grew past it. Before the first window, a square around the
 * origin.
 */
export function tileGridRect(win: WorldRect | null): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  if (!win) return { x: -20000, y: -20000, width: 40000, height: 40000 };
  const x = Math.floor(win.l / TILE) * TILE;
  const y = Math.floor(win.t / TILE) * TILE;
  return {
    x,
    y,
    width: Math.ceil(win.r / TILE) * TILE - x,
    height: Math.ceil(win.b / TILE) * TILE - y,
  };
}

/** The render window for a viewport on a `w`×`h` stage. */
export function cullWindow(vp: Viewport, w: number, h: number): WorldRect {
  const v = viewportWorldRect(vp, w, h);
  const px = (w * CULL_OVERSCAN) / vp.k;
  const py = (h * CULL_OVERSCAN) / vp.k;
  return { l: v.l - px, t: v.t - py, r: v.r + px, b: v.b + py };
}

/**
 * True when `win` no longer covers the view with room to spare: the view is
 * within the re-centre margin of an edge, or zooming in has left a window far
 * larger than needed (which would mount most of the board for nothing).
 */
export function cullWindowStale(
  win: WorldRect,
  vp: Viewport,
  w: number,
  h: number,
): boolean {
  const v = viewportWorldRect(vp, w, h);
  const mx = (w * CULL_RECENTER_MARGIN) / vp.k;
  const my = (h * CULL_RECENTER_MARGIN) / vp.k;
  if (v.l - mx < win.l || v.t - my < win.t || v.r + mx > win.r || v.b + my > win.b) {
    return true;
  }
  const fresh = cullWindow(vp, w, h);
  const area = (r: WorldRect) => (r.r - r.l) * (r.b - r.t);
  return area(win) > 4 * area(fresh);
}

export function nodeInCull(n: SimNode, win: WorldRect): boolean {
  return rectsIntersect({ l: n.x, t: n.y, r: n.x + n.w, b: n.y + n.h }, win);
}

export function pointsBBox(pts: readonly Point[]): WorldRect | null {
  if (!pts.length) return null;
  let l = Infinity;
  let t = Infinity;
  let r = -Infinity;
  let b = -Infinity;
  for (const [x, y] of pts) {
    if (x < l) l = x;
    if (y < t) t = y;
    if (x > r) r = x;
    if (y > b) b = y;
  }
  return { l, t, r, b };
}

/** Polyline points in SVG `points` syntax ("x,y x,y …"). */
export function parsePointList(pts: string): Point[] {
  const out: Point[] = [];
  for (const pair of pts.trim().split(/\s+/)) {
    const [x, y] = pair.split(',').map(Number);
    if (Number.isFinite(x) && Number.isFinite(y)) out.push([x!, y!]);
  }
  return out;
}

/** True when a path's bounding box touches the window (a straight vertical or horizontal line counts). */
export function pathInCull(pts: readonly Point[], win: WorldRect): boolean {
  const bb = pointsBBox(pts);
  if (!bb) return false;
  return bb.l <= win.r && bb.r >= win.l && bb.t <= win.b && bb.b >= win.t;
}
