import { householdChrome, snapGroupDelta, tileSnapOrigin } from './tiles.ts';
import {
  ALIGN_TH,
  BAND,
  GRID,
  PILL_H,
  PILL_HALF_W,
  PILL_W,
  RGAP,
  SNAP_HYST,
  STUB,
  TILE,
  UNION_MIN_GAP,
  WORLD_TAG_FONT,
  WORLD_TAG_HIT_PAD_SCREEN_PX,
  WORLD_TAG_MIN_SCREEN_PX,
  WORLD_TAG_NORMAL_ZOOM,
  WORLD_TAG_PILL_H,
  WORLD_TAG_ZOOM_OUT_MAX,
  ZOOM_MAX,
  ZOOM_MIN,
} from './constants.ts';
import {
  nodesForGid,
  nodesForWorld,
  type NodeBuckets,
} from './nodeIndex.ts';
import { LAYOUT } from './layout.ts';
import type {
  BuildRectsResult,
  Edge,
  Group,
  Guides,
  HhBox,
  HhBoxDraw,
  Rect,
  ShowToggles,
  SimNode,
  UnionGeom,
  UnionRender,
  Viewport,
} from '../types/whiteboard.ts';

/** Intersection on a sim card border toward (tox, toy). */
export function border(n: SimNode, tox: number, toy: number): [number, number] {
  const cx = n.x + n.w / 2;
  const cy = n.y + n.h / 2;
  const dx = tox - cx;
  const dy = toy - cy;
  if (dx === 0 && dy === 0) return [cx, cy];
  const hw = n.w / 2 + 2;
  const hh = n.h / 2 + 2;
  const sx = dx ? hw / Math.abs(dx) : 1e9;
  const sy = dy ? hh / Math.abs(dy) : 1e9;
  const s = Math.min(sx, sy);
  return [cx + dx * s, cy + dy * s];
}

export function edgeVisible(e: Edge, show: ShowToggles): boolean {
  if (
    e.type === 'marriage' ||
    e.type === 'romance' ||
    e.type === 'divorced' ||
    e.type === 'parent' ||
    e.type === 'sibling'
  ) {
    return show.seed;
  }
  return true;
}

export type SnapSticky = { x: number | null; y: number | null };

function snapAxisSticky(
  v: number,
  edges: number[],
  sticky: number | null,
): { v: number; guide: number | null; sticky: number | null } {
  if (sticky !== null && Math.abs(v - sticky) <= ALIGN_TH + SNAP_HYST) {
    return { v: Math.round(sticky), guide: sticky, sticky };
  }

  let best: number | null = null;
  let bd = ALIGN_TH + 1;
  for (const e of edges) {
    const d = Math.abs(e - v);
    if (d < bd) {
      bd = d;
      best = e;
    }
  }
  if (best !== null) {
    return { v: Math.round(best), guide: best, sticky: best };
  }
  return { v: Math.round(v / GRID) * GRID, guide: null, sticky: null };
}

export function snapAxis(v: number, edges: number[]): number {
  return snapAxisSticky(v, edges, null).v;
}

/** Alignment guides for a rectangle near other nodes (within ALIGN_TH). */
export function guidesForRect(
  x: number,
  y: number,
  w: number,
  h: number,
  nodes: SimNode[],
  excludeId?: string,
  th = ALIGN_TH,
): Guides {
  const gx = new Set<number>();
  const gy = new Set<number>();
  const L = [x, x + w / 2, x + w];
  const T = [y, y + h / 2, y + h];
  for (const o of nodes) {
    if (o.id === excludeId) continue;
    [o.x, o.x + o.w / 2, o.x + o.w].forEach((v) =>
      L.forEach((l) => {
        if (Math.abs(v - l) <= th) gx.add(v);
      }),
    );
    [o.y, o.y + o.h / 2, o.y + o.h].forEach((v) =>
      T.forEach((t) => {
        if (Math.abs(v - t) <= th) gy.add(v);
      }),
    );
  }
  return { gx: [...gx], gy: [...gy] };
}

/** Snap a top-left position onto the 1×2 tile grid. */
export function snapPosition(
  x: number,
  y: number,
  w: number,
  h: number,
  _nodes: SimNode[],
  _excludeId?: string,
  snap = true,
  _sticky: SnapSticky = { x: null, y: null },
): { x: number; y: number; guides: Guides; sticky: SnapSticky } {
  if (!snap) {
    return { x, y, guides: { gx: [], gy: [] }, sticky: { x: null, y: null } };
  }
  const t = tileSnapOrigin(x, y);
  return {
    x: t.x,
    y: t.y,
    guides: {
      gx: [t.x, t.x + w],
      gy: [t.y, t.y + h],
    },
    sticky: { x: t.x, y: t.y },
  };
}

export function snapNode(
  n: SimNode,
  nodes: SimNode[],
  snap = true,
): void {
  const { x, y } = snapPosition(n.x, n.y, n.w, n.h, nodes, n.id, snap);
  n.x = x;
  n.y = y;
}

export function guidesFor(n: SimNode, nodes: SimNode[]): Guides {
  return guidesForRect(n.x, n.y, n.w, n.h, nodes, n.id);
}

/** Node-bounds box for a household (used by snapHousehold). */
export function hhBox(gid: string, nodes: SimNode[]): HhBox | null {
  const m = nodes.filter((n) => n.gid === gid);
  if (!m.length) return null;
  return {
    minx: Math.min(...m.map((n) => n.x)),
    miny: Math.min(...m.map((n) => n.y)),
    maxx: Math.max(...m.map((n) => n.x + n.w)),
    maxy: Math.max(...m.map((n) => n.y + n.h)),
  };
}

/** Drawn household box extent (matches GroupLayer; includes title width). */
export function hhBoxDraw(
  gid: string,
  nodes: SimNode[],
  groups: Group[],
  packVis: (n: SimNode) => boolean,
  buckets?: NodeBuckets,
): HhBoxDraw | null {
  const mem = nodesForGid(gid, nodes, buckets).filter(packVis);
  const chrome = householdChrome(
    mem,
    groups.find((g) => g.gid === gid),
  );
  if (!chrome) return null;
  return {
    l: chrome.boxL,
    t: chrome.boxT,
    r: chrome.boxR,
    b: chrome.boxB,
  };
}

/** Drawn world frame (matches WorldLayer: household union + title/margin). */
export function worldFrame(
  world: string,
  nodes: SimNode[],
  groups: Group[],
  packVis: (n: SimNode) => boolean,
  buckets?: NodeBuckets,
): HhBoxDraw | null {
  const gids = new Set<string>();
  for (const n of nodesForWorld(world, nodes, buckets)) {
    if (!packVis(n)) continue;
    gids.add(n.gid);
  }
  let x0 = 1e9;
  let y0 = 1e9;
  let x1 = -1e9;
  let y1 = -1e9;
  let any = false;
  for (const gid of gids) {
    const bx = hhBoxDraw(gid, nodes, groups, packVis, buckets);
    if (!bx) continue;
    any = true;
    x0 = Math.min(x0, bx.l);
    y0 = Math.min(y0, bx.t);
    x1 = Math.max(x1, bx.r);
    y1 = Math.max(y1, bx.b);
  }
  if (!any) return null;
  const M = LAYOUT.worldMargin;
  const TITLE = LAYOUT.worldTitle;
  return { l: x0 - M, t: y0 - TITLE, r: x1 + M, b: y1 + M };
}

function framesOverlap(a: HhBoxDraw, b: HhBoxDraw): boolean {
  return a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
}

function tileCeil(v: number): number {
  if (v <= 0) return 0;
  return Math.ceil(v / TILE) * TILE;
}

/**
 * World-name pill scale for the current board zoom. Zoomed out → grow in
 * world space so the painted chip stays ~{@link WORLD_TAG_MIN_SCREEN_PX}
 * tall on screen. Zoomed in (≥ {@link WORLD_TAG_NORMAL_ZOOM}) → scale 1.
 */
export function worldTagZoomScale(k: number): number {
  if (!(k > 0)) return 1;
  if (k >= WORLD_TAG_NORMAL_ZOOM) return 1;
  const forScreen = WORLD_TAG_MIN_SCREEN_PX / (WORLD_TAG_PILL_H * k);
  return Math.min(WORLD_TAG_ZOOM_OUT_MAX, Math.max(1, forScreen));
}

export function worldTagMetrics(k: number): {
  scale: number;
  pillH: number;
  fontSize: number;
  handleSize: number;
  /** World-space hit height = pill + screen pad (not a full-frame strip). */
  hitH: number;
  /** World-space pad added beyond the painted pill on each side. */
  hitPad: number;
} {
  const scale = worldTagZoomScale(k);
  const pillH = WORLD_TAG_PILL_H * scale;
  const hitPad = k > 0 ? WORLD_TAG_HIT_PAD_SCREEN_PX / k : 0;
  return {
    scale,
    pillH,
    fontSize: WORLD_TAG_FONT * scale,
    handleSize: 12 * scale,
    hitH: pillH + 2 * hitPad,
    hitPad,
  };
}

/**
 * Nudge whole worlds apart until drawn frames no longer overlap.
 * Prefers pushing the lower/righter world by whole tiles. Mutates a copy.
 */
export function separateOverlappingWorldFrames(
  nodes: SimNode[],
  groups: Group[],
  packVis: (n: SimNode) => boolean = () => true,
  gap: number = TILE,
): SimNode[] {
  const names = [
    ...new Set(
      nodes
        .filter((n) => n.world && n.world !== '—' && packVis(n))
        .map((n) => n.world),
    ),
  ];
  if (names.length < 2) return nodes;

  const next = nodes.map((n) => ({ ...n }));
  for (let pass = 0; pass < 64; pass++) {
    let moved = false;
    const frames: { w: string; f: HhBoxDraw }[] = [];
    for (const w of names) {
      const f = worldFrame(w, next, groups, packVis);
      if (f) frames.push({ w, f });
    }
    for (let i = 0; i < frames.length; i++) {
      for (let j = i + 1; j < frames.length; j++) {
        const A = frames[i]!;
        const B = frames[j]!;
        if (!framesOverlap(A.f, B.f)) continue;
        const aCy = (A.f.t + A.f.b) / 2;
        const bCy = (B.f.t + B.f.b) / 2;
        const aCx = (A.f.l + A.f.r) / 2;
        const bCx = (B.f.l + B.f.r) / 2;
        const moveName =
          bCy > aCy || (bCy === aCy && bCx >= aCx) ? B.w : A.w;
        const stay = moveName === B.w ? A.f : B.f;
        const mov = moveName === B.w ? B.f : A.f;
        const dxNeed = stay.r - mov.l + gap;
        const dyNeed = stay.b - mov.t + gap;
        let dx = 0;
        let dy = 0;
        if (dyNeed > 0 && (dxNeed <= 0 || dyNeed <= dxNeed)) {
          dy = tileCeil(dyNeed);
        } else if (dxNeed > 0) {
          dx = tileCeil(dxNeed);
        }
        if (!dx && !dy) continue;
        for (const n of next) {
          if (n.world !== moveName) continue;
          n.x += dx;
          n.y += dy;
          n.ox = (n.ox ?? 0) + dx;
          n.oy = (n.oy ?? 0) + dy;
        }
        moved = true;
      }
    }
    if (!moved) break;
  }
  return next;
}

/**
 * Apply {@link separateOverlappingWorldFrames} as ox/oy deltas on core nodes
 * so the separation survives the next layout pass.
 */
export function coreOffsetsAfterWorldSeparation(
  core: SimNode[],
  laid: SimNode[],
  groups: Group[],
  packVis: (n: SimNode) => boolean = () => true,
): SimNode[] {
  const separated = separateOverlappingWorldFrames(laid, groups, packVis);
  const before = new Map(laid.map((n) => [n.id, n]));
  const after = new Map(separated.map((n) => [n.id, n]));
  let changed = false;
  const out = core.map((n) => {
    const b = before.get(n.id);
    const a = after.get(n.id);
    if (!b || !a) return n;
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    if (!dx && !dy) return n;
    changed = true;
    return { ...n, ox: (n.ox ?? 0) + dx, oy: (n.oy ?? 0) + dy };
  });
  return changed ? out : core;
}

function rectIntersectionArea(a: HhBoxDraw, b: HhBoxDraw): number {
  const l = Math.max(a.l, b.l);
  const t = Math.max(a.t, b.t);
  const r = Math.min(a.r, b.r);
  const btm = Math.min(a.b, b.b);
  if (r <= l || btm <= t) return 0;
  return (r - l) * (btm - t);
}

function dist2PointToRect(x: number, y: number, r: HhBoxDraw): number {
  const dx = x < r.l ? r.l - x : x > r.r ? x - r.r : 0;
  const dy = y < r.t ? r.t - y : y > r.b ? y - r.b : 0;
  return dx * dx + dy * dy;
}

/** Visible board area in world coordinates. */
export function viewportWorldRect(
  viewport: Viewport,
  svgWidth: number,
  svgHeight: number,
): HhBoxDraw {
  const { tx, ty, k } = viewport;
  return {
    l: -tx / k,
    t: -ty / k,
    r: (svgWidth - tx) / k,
    b: (svgHeight - ty) / k,
  };
}

/** Zoom toward a screen point, keeping that world point under the cursor. */
export function zoomViewportAt(
  v: Viewport,
  f: number,
  cx: number,
  cy: number,
  svgRect: DOMRect,
  zoomMin = ZOOM_MIN,
  zoomMax = ZOOM_MAX,
): Viewport {
  const nk = Math.min(zoomMax, Math.max(zoomMin, v.k * f));
  if (nk === v.k) return v;
  const mx = cx - svgRect.left;
  const my = cy - svgRect.top;
  return {
    k: nk,
    tx: mx - (mx - v.tx) * (nk / v.k),
    ty: my - (my - v.ty) * (nk / v.k),
  };
}

/** Top-left so a card of this size sits centred in the current view. */
export function cardOriginAtViewportCenter(
  viewport: Viewport,
  svgWidth: number,
  svgHeight: number,
  cardW: number,
  cardH: number,
): { x: number; y: number } {
  const view = viewportWorldRect(viewport, svgWidth, svgHeight);
  return {
    x: (view.l + view.r) / 2 - cardW / 2,
    y: (view.t + view.b) / 2 - cardH / 2,
  };
}

/**
 * World whose frame covers the most of the current view. If nothing overlaps
 * (empty gap / zoomed into void), the closest frame to the view centre wins.
 */
export function dominantWorldInViewport(
  nodes: SimNode[],
  groups: Group[],
  packVis: (n: SimNode) => boolean,
  viewport: Viewport,
  svgWidth: number,
  svgHeight: number,
): string | null {
  const view = viewportWorldRect(viewport, svgWidth, svgHeight);
  const cx = (view.l + view.r) / 2;
  const cy = (view.t + view.b) / 2;
  const names = new Set<string>();
  for (const n of nodes) {
    if (!n.world || n.world === '—' || !packVis(n)) continue;
    names.add(n.world);
  }
  let best: string | null = null;
  let bestArea = -1;
  let bestDist = Infinity;
  for (const world of names) {
    const frame = worldFrame(world, nodes, groups, packVis);
    if (!frame) continue;
    const area = rectIntersectionArea(view, frame);
    const dist = dist2PointToRect(cx, cy, frame);
    if (area > bestArea || (area === bestArea && dist < bestDist)) {
      best = world;
      bestArea = area;
      bestDist = dist;
    }
  }
  return best;
}

/**
 * Snap a household or world drag as a rigid tile step.
 * `originX`/`originY` are the group's top-left at drag start.
 */
export function snapHouseholdDelta(
  originX: number,
  originY: number,
  dx: number,
  dy: number,
  snap = true,
): { dx: number; dy: number; guides: Guides } | null {
  if (!snap) return null;
  const d = snapGroupDelta(originX, originY, dx, dy);
  return {
    dx: d.dx,
    dy: d.dy,
    guides: {
      gx: [originX + d.dx],
      gy: [originY + d.dy],
    },
  };
}

/** True when (wx, wy) is on a ⚭ / ❤ / ⚮ pill. */
export function unionAtPoint(
  wx: number,
  wy: number,
  unions: UnionRender[],
): UnionRender | null {
  for (let i = unions.length - 1; i >= 0; i--) {
    const u = unions[i]!;
    const w = PILL_W[u.type];
    if (Math.abs(wx - u.rx) <= w / 2 && Math.abs(wy - u.ry) <= PILL_H / 2)
      return u;
  }
  return null;
}

/**
 * Spouse union geometry. The connector is ALWAYS sideways: it leaves a tag
 * through its left or right edge and enters the relationship pill through the
 * pill's left or right edge. Height differences are absorbed by vertical jogs
 * that stay clear of both tags and of the pill.
 */
export function unionGeom(a: SimNode, b: SimNode): UnionGeom {
  const L = a.x <= b.x ? a : b;
  const R = a.x <= b.x ? b : a;
  const sx = L.x + L.w;
  const sy = L.y + L.h / 2;
  const ex = R.x;
  const ey = R.y + R.h / 2;
  const rx = (sx + ex) / 2;
  const ry = (sy + ey) / 2;
  const gap = ex - sx;
  const sameRow = Math.abs(sy - ey) < 12;

  // Same-generation partners: one straight horizontal between inner edges (∞ sits on midpoint).
  if (sameRow && ex > sx) {
    const pts = `${sx},${ry} ${ex},${ry}`;
    return { sx, sy: ry, ex, ey: ry, rx, ry, pts };
  }

  if (gap >= UNION_MIN_GAP) {
    const S = Math.min(STUB, gap / 2);
    const lx = rx - S;
    const rxx = rx + S;
    const pts = `${sx},${sy} ${lx},${sy} ${lx},${ry} ${rx},${ry} ${rxx},${ry} ${rxx},${ey} ${ex},${ey}`;
    return { sx, sy, ex, ey, rx, ry, pts };
  }

  if (Math.min(L.y + L.h, R.y + R.h) < Math.max(L.y, R.y)) {
    const first = gap < 0 && sy > ey ? R : L;
    const second = first === L ? R : L;
    const fx = first.x + first.w;
    const fy = first.y + first.h / 2;
    const gx = second.x;
    const gy = second.y + second.h / 2;
    const jogR = Math.max(fx, rx + PILL_HALF_W) + STUB;
    const jogL = Math.min(gx, rx - PILL_HALF_W) - STUB;
    const pts = `${fx},${fy} ${jogR},${fy} ${jogR},${ry} ${rx},${ry} ${jogL},${ry} ${jogL},${gy} ${gx},${gy}`;
    return { sx: fx, sy: fy, ex: gx, ey: gy, rx, ry, pts };
  }

  const bx = L.x;
  const bex = Math.max(L.x + L.w, R.x + R.w);
  const outL = bx - STUB;
  const outR = bex + STUB;
  const above = Math.min(L.y, R.y) - RGAP;
  const below = Math.max(L.y + L.h, R.y + R.h) + RGAP;
  const py = ry - above <= below - ry ? above : below;
  const pts = `${bx},${sy} ${outL},${sy} ${outL},${py} ${rx},${py} ${outR},${py} ${outR},${ey} ${bex},${ey}`;
  return { sx: bx, sy, ex: bex, ey, rx, ry: py, pts };
}

export function bbox(
  nodes: SimNode[],
  packVis: (n: SimNode) => boolean,
): [number, number, number, number] {
  let x0 = 1e9;
  let y0 = 1e9;
  let x1 = -1e9;
  let y1 = -1e9;
  let any = false;
  nodes.forEach((n) => {
    if (!packVis(n)) return;
    any = true;
    x0 = Math.min(x0, n.x);
    y0 = Math.min(y0, n.y);
    x1 = Math.max(x1, n.x + n.w);
    y1 = Math.max(y1, n.y + n.h);
  });
  return any ? [x0, y0, x1, y1] : [0, 0, 100, 100];
}

export function buildRects(
  nodes: SimNode[],
  groups: Group[],
  show: ShowToggles,
  packVis: (n: SimNode) => boolean,
): BuildRectsResult {
  const R: Rect[] = [];
  for (const n of nodes) {
    if (!packVis(n)) continue;
    R.push({
      l: n.x - RGAP,
      t: n.y - RGAP,
      r: n.x + n.w + RGAP,
      b: n.y + n.h + RGAP,
      id: n.id,
    });
  }
  if (show.groups) {
    for (const g of groups) {
      const m = nodes.filter((n) => n.gid === g.gid && packVis(n));
      const chrome = householdChrome(m, g);
      if (!chrome) continue;
      R.push({
        l: chrome.headerX - RGAP,
        t: chrome.headerY - RGAP,
        r:
          Math.max(chrome.headerX + chrome.labelW, chrome.ageX + chrome.ageW) +
          RGAP,
        b: chrome.ageY + chrome.pillH + RGAP,
        id: `__t_${g.gid}`,
      });
    }
  }
  if (show.worlds) {
    const seen = new Set<string>();
    for (const n of nodes) {
      const w = n.world;
      if (!w || w === '—' || !packVis(n) || seen.has(w)) continue;
      seen.add(w);
      const frame = worldFrame(w, nodes, groups, packVis);
      if (!frame) continue;
      const lw = w.length * 8.2 + 46;
      R.push({
        l: frame.l - RGAP,
        t: frame.t - RGAP,
        r: frame.l + lw + RGAP,
        b: frame.t + WORLD_TAG_PILL_H + RGAP,
        id: `__w_${w}`,
      });
    }
  }
  const RBANDS: Record<number, Rect[]> = {};
  for (const r of R) {
    const b0 = Math.floor(r.t / BAND);
    const b1 = Math.floor(r.b / BAND);
    for (let bb = b0; bb <= b1; bb++) {
      (RBANDS[bb] = RBANDS[bb] || []).push(r);
    }
  }
  return { rects: R, rbands: RBANDS };
}

export function segHit(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  r: Rect,
): boolean {
  if (Math.abs(x1 - x2) < 1e-6) {
    if (x1 <= r.l || x1 >= r.r) return false;
    const lo = Math.min(y1, y2);
    const hi = Math.max(y1, y2);
    return !(hi <= r.t || lo >= r.b);
  }
  if (Math.abs(y1 - y2) < 1e-6) {
    if (y1 <= r.t || y1 >= r.b) return false;
    const lo = Math.min(x1, x2);
    const hi = Math.max(x1, x2);
    return !(hi <= r.l || lo >= r.r);
  }
  return false;
}

export function segClear(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  rbands: Record<number, Rect[]>,
  ex?: Set<string>,
): boolean {
  const b0 = Math.floor(Math.min(y1, y2) / BAND);
  const b1 = Math.floor(Math.max(y1, y2) / BAND);
  for (let bb = b0; bb <= b1; bb++) {
    const arr = rbands[bb];
    if (!arr) continue;
    for (const r of arr) {
      if (ex?.has(r.id)) continue;
      if (segHit(x1, y1, x2, y2, r)) return false;
    }
  }
  return true;
}

export function ptsClear(
  pts: [number, number][],
  rbands: Record<number, Rect[]>,
  ex?: Set<string>,
): boolean {
  for (let i = 0; i + 1 < pts.length; i++) {
    if (
      !segClear(
        pts[i]![0],
        pts[i]![1],
        pts[i + 1]![0],
        pts[i + 1]![1],
        rbands,
        ex,
      )
    ) {
      return false;
    }
  }
  return true;
}
