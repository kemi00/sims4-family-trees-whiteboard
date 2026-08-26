import { MINIMAP_VIEW_MIN, ZOOM_MAX, ZOOM_MIN } from './constants.ts';
import type { Viewport } from '../types/whiteboard.ts';

export type MinimapBounds = { l: number; t: number; r: number; b: number };

export type MinimapFit = {
  scale: number;
  ox: number;
  oy: number;
};

/** Fit the board AABB into the minimap, letterboxed, with inner padding. */
export function minimapFit(
  board: MinimapBounds,
  mapW: number,
  mapH: number,
  pad: number,
): MinimapFit {
  const bw = Math.max(board.r - board.l, 1);
  const bh = Math.max(board.b - board.t, 1);
  const innerW = Math.max(mapW - pad * 2, 1);
  const innerH = Math.max(mapH - pad * 2, 1);
  const scale = Math.min(innerW / bw, innerH / bh);
  return {
    scale,
    ox: (mapW - bw * scale) / 2 - board.l * scale,
    oy: (mapH - bh * scale) / 2 - board.t * scale,
  };
}

export function worldToMinimap(
  wx: number,
  wy: number,
  fit: MinimapFit,
): { x: number; y: number } {
  return { x: fit.ox + wx * fit.scale, y: fit.oy + wy * fit.scale };
}

export function minimapToWorld(
  mx: number,
  my: number,
  fit: MinimapFit,
): { x: number; y: number } {
  return {
    x: (mx - fit.ox) / fit.scale,
    y: (my - fit.oy) / fit.scale,
  };
}

/** Keep current zoom; put world (wx, wy) at the stage centre. */
export function viewportCenteredOn(
  wx: number,
  wy: number,
  k: number,
  svgWidth: number,
  svgHeight: number,
): Viewport {
  return {
    k,
    tx: svgWidth / 2 - wx * k,
    ty: svgHeight / 2 - wy * k,
  };
}

/** Zoom while keeping a world point stuck to the same stage pixel. */
export function zoomTowardWorld(
  v: Viewport,
  wx: number,
  wy: number,
  factor: number,
  minK = ZOOM_MIN,
  maxK = ZOOM_MAX,
): Viewport {
  const nk = Math.min(maxK, Math.max(minK, v.k * factor));
  if (nk === v.k) return v;
  const sx = v.tx + wx * v.k;
  const sy = v.ty + wy * v.k;
  return { k: nk, tx: sx - wx * nk, ty: sy - wy * nk };
}

/** Viewport AABB mapped into minimap pixels, expanded to a readable minimum. */
export function mappedViewRect(
  view: MinimapBounds,
  fit: MinimapFit,
  minSize = MINIMAP_VIEW_MIN,
): { x: number; y: number; w: number; h: number } {
  const a = worldToMinimap(view.l, view.t, fit);
  const b = worldToMinimap(view.r, view.b, fit);
  let x = a.x;
  let y = a.y;
  let w = b.x - a.x;
  let h = b.y - a.y;
  if (w < minSize) {
    x -= (minSize - w) / 2;
    w = minSize;
  }
  if (h < minSize) {
    y -= (minSize - h) / 2;
    h = minSize;
  }
  return { x, y, w, h };
}
