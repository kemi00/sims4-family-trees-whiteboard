import { LINK_MARK } from './constants.ts';
import { simName } from './connectionLog.ts';
import type {
  Edge,
  EdgeRenderData,
  EdgeType,
  Point,
  SimNode,
} from '../types/whiteboard.ts';

/** Chip copy — longer / clearer than connection-log labels. */
const CHIP_LABEL: Record<EdgeType, string> = {
  marriage: 'Married',
  romance: 'Romance / partners',
  divorced: 'Divorced',
  parent: 'Parent → child',
  sibling: 'Siblings',
  custom: 'Custom link',
};

export type LinkSelectionInfo = {
  mark: string;
  label: string;
  /**
   * Role-aware name line(s). For parent links this is the full
   * “parents → child” string (also used for aria). Prefer {@link nameFrom}/
   * {@link nameTo} in the chip UI when both are set.
   */
  names: string;
  /** Left side of a directed relation (parents, or empty). */
  nameFrom?: string;
  /** Right side of a directed relation (child/children). */
  nameTo?: string;
  /**
   * Ink polylines of the selected link in world space.
   * Sibling/parent geometry is often several disjoint strokes (bar + stems);
   * keep them separate so placement never invents a diagonal through empty space.
   */
  path: Point[][];
};

export type ViewportBox = {
  tx: number;
  ty: number;
  k: number;
  /** Stage width in CSS pixels. */
  width: number;
  /** Stage height in CSS pixels. */
  height: number;
};

function parsePolyline(pts: string): Point[] {
  const out: Point[] = [];
  for (const pair of pts.trim().split(/\s+/)) {
    if (!pair) continue;
    const [xs, ys] = pair.split(',');
    const x = Number(xs);
    const y = Number(ys);
    if (Number.isFinite(x) && Number.isFinite(y)) out.push([x, y]);
  }
  return out;
}

/** Evenly sample along a polyline (~every `step` world units). */
export function densifyPath(pts: Point[], step: number): Point[] {
  if (pts.length === 0) return [];
  if (pts.length === 1) return [pts[0]!];
  const s = Math.max(step, 1e-6);
  const out: Point[] = [[pts[0]![0], pts[0]![1]]];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    if (len < 1e-9) continue;
    const n = Math.max(1, Math.ceil(len / s));
    for (let j = 1; j <= n; j++) {
      const t = j / n;
      out.push([a[0] + dx * t, a[1] + dy * t]);
    }
  }
  return out;
}

/**
 * Sample only real board ink. Blood routes are orthogonal; a diagonal between
 * vertices is a chunk boundary (or bad merge), not a stroke — skip it.
 */
export function sampleInkPath(pts: Point[], step: number): Point[] {
  if (pts.length === 0) return [];
  if (pts.length === 1) return [pts[0]!];
  const samples: Point[] = [];
  let run: Point[] = [pts[0]!];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const ortho = Math.abs(a[0] - b[0]) < 0.5 || Math.abs(a[1] - b[1]) < 0.5;
    if (!ortho) {
      samples.push(...densifyPath(run, step));
      run = [b];
      continue;
    }
    run.push(b);
  }
  samples.push(...densifyPath(run, step));
  return samples;
}

/** World-space ink chunk(s) for the selected edge id(s). */
export function linkSelectionPath(
  ids: string[],
  edgeData: EdgeRenderData,
  edges: Edge[],
  byid: Record<string, SimNode>,
): Point[][] | null {
  const idSet = new Set(ids.filter(Boolean));
  if (!idSet.size) return null;

  for (const u of edgeData.unions) {
    if (!idSet.has(u.edgeId)) continue;
    const poly = parsePolyline(u.pts);
    if (poly.length >= 2) return [poly];
    // Pill-only fallback: short segment through the glyph.
    return [
      [
        [u.rx - 20, u.ry],
        [u.rx + 20, u.ry],
      ],
    ];
  }
  for (const c of edgeData.customs) {
    if (!idSet.has(c.edgeId)) continue;
    if (c.pts.length >= 2) {
      return [c.pts.map((p) => [p[0], p[1]] as Point)];
    }
  }

  // Parent/sibling geometry is split across trunk/bar + drop stems.
  // Keep each stroke as its own chunk — concatenating them invents diagonals
  // through empty space (where the chip used to float).
  const bloodChunks: Point[][] = [];
  for (const b of edgeData.blood) {
    if (!b.ids.some((id) => idSet.has(id))) continue;
    if (b.pts.length < 2) continue;
    bloodChunks.push(b.pts.map((p) => [p[0], p[1]] as Point));
  }
  if (bloodChunks.length) return bloodChunks;

  const ends = new Set<string>();
  for (const e of edges) {
    if (!idSet.has(e.id)) continue;
    ends.add(e.a);
    ends.add(e.b);
  }
  const nodes = [...ends].map((id) => byid[id]).filter((n): n is SimNode => !!n);
  if (nodes.length < 2) {
    if (nodes.length === 1) {
      const n = nodes[0]!;
      return [[[n.x + n.w / 2, n.y + n.h / 2]]];
    }
    return null;
  }
  const a = nodes[0]!;
  const b = nodes[1]!;
  // Last-resort fallback only — may be diagonal; sampleInkPath will keep ends.
  return [
    [
      [a.x + a.w / 2, a.y + a.h / 2],
      [b.x + b.w / 2, b.y + b.h / 2],
    ],
  ];
}

/**
 * Axis-aligned world rect the chip should avoid (sim cards, household tags).
 */
export type ChipObstacle = {
  l: number;
  t: number;
  r: number;
  b: number;
};

/** Where to draw the chip relative to the path point (screen space). */
export type ChipSide = 'above' | 'below';

export type ChipPlacement = {
  at: Point;
  side: ChipSide;
};

function pointInObstacle(
  x: number,
  y: number,
  o: ChipObstacle,
  pad: number,
): boolean {
  return (
    x >= o.l - pad &&
    x <= o.r + pad &&
    y >= o.t - pad &&
    y <= o.b + pad
  );
}

/** Approx chip height used when keeping the label inside the viewport. */
const CHIP_BODY_H_PX = 48;
const CHIP_GAP_PX = 12;

/**
 * Normalize chip path input: one polyline, or several ink chunks.
 * Point[] → one chunk; Point[][] → keep as chunks.
 */
function asPathChunks(path: Point[] | Point[][]): Point[][] {
  if (!path.length) return [];
  // Point[]: path[0] is [x,y] so path[0][0] is a number.
  // Point[][]: path[0] is a polyline so path[0][0] is [x,y].
  return Array.isArray(path[0]![0]) ? (path as Point[][]) : [path as Point[]];
}

/**
 * Pick a point ON the real ink that sits in the stage viewport, and which
 * side of the stroke to draw the chip so the label stays on-screen.
 */
export function placeChipOnVisiblePath(
  path: Point[] | Point[][],
  vp: ViewportBox,
  padPx: number = 40,
  obstacles: ChipObstacle[] = [],
): ChipPlacement | null {
  if (!(vp.k > 0) || vp.width <= 0 || vp.height <= 0) {
    return null;
  }
  const chunks = asPathChunks(path);
  if (!chunks.length) return null;

  // Sample each ink chunk on its own (~8px in screen space). Never densify
  // across chunk gaps — that drew a phantom diagonal through empty space.
  const step = 8 / vp.k;
  const samples = chunks.flatMap((chunk) => sampleInkPath(chunk, step));
  if (!samples.length) return null;

  const cx = vp.width / 2;
  const cy = vp.height / 2;
  const obsPad = 20 / vp.k;

  const toScreen = (wx: number, wy: number) => ({
    sx: vp.tx + wx * vp.k,
    sy: vp.ty + wy * vp.k,
  });

  const pathInView = (sx: number, sy: number, pad: number) =>
    sx >= pad &&
    sy >= pad &&
    sx <= vp.width - pad &&
    sy <= vp.height - pad;

  const sideFits = (sy: number, side: ChipSide, pad: number) => {
    if (side === 'above') {
      const top = sy - CHIP_BODY_H_PX - CHIP_GAP_PX;
      return top >= pad;
    }
    const bottom = sy + CHIP_BODY_H_PX + CHIP_GAP_PX;
    return bottom <= vp.height - pad;
  };

  const blockedAt = (wx: number, wy: number) =>
    obstacles.some((o) => pointInObstacle(wx, wy, o, obsPad));

  type Cand = { at: Point; side: ChipSide; score: number };

  const findBest = (pad: number, allowBlocked: boolean): Cand | null => {
    let best: Cand | null = null;
    for (const p of samples) {
      const { sx, sy } = toScreen(p[0], p[1]);
      if (!pathInView(sx, sy, pad)) continue;
      const blocked = blockedAt(p[0], p[1]);
      if (blocked && !allowBlocked) continue;

      const sides: ChipSide[] = [];
      if (sideFits(sy, 'above', pad)) sides.push('above');
      if (sideFits(sy, 'below', pad)) sides.push('below');
      if (!sides.length) {
        // Path is visible but neither full chip side fits — still show it,
        // preferring the side with more room.
        sides.push(sy < vp.height / 2 ? 'below' : 'above');
      }

      for (const side of sides) {
        const centerDist = Math.hypot(sx - cx, sy - cy);
        // Mild obstacle penalty — never abandon the visible mid-link.
        const score = centerDist + (blocked ? 800 : 0) + (side === 'below' ? 40 : 0);
        if (!best || score < best.score) {
          best = { at: p, side, score };
        }
      }
    }
    return best;
  };

  const best =
    findBest(padPx, false) ??
    findBest(padPx, true) ??
    findBest(0, false) ??
    findBest(0, true);
  return best ? { at: best.at, side: best.side } : null;
}

/** Unique display names for sim ids, stable order of first appearance. */
function namesForIds(
  ids: string[],
  byid: Record<string, SimNode>,
): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    const n = byid[id];
    if (!n) continue;
    out.push(simName(n));
  }
  return out.join(' · ');
}

/**
 * Build chip name copy so roles are obvious.
 * Parent edges are directed (`a` = parent, `b` = child).
 */
export function formatLinkNames(
  matched: Edge[],
  byid: Record<string, SimNode>,
): Pick<LinkSelectionInfo, 'names' | 'nameFrom' | 'nameTo'> {
  if (!matched.length) return { names: '' };
  const type = matched[0]!.type;

  if (type === 'parent') {
    const nameFrom = namesForIds(
      matched.map((e) => e.a),
      byid,
    );
    const nameTo = namesForIds(
      matched.map((e) => e.b),
      byid,
    );
    if (nameFrom && nameTo) {
      return {
        nameFrom,
        nameTo,
        names: `${nameFrom} → ${nameTo}`,
      };
    }
    return { names: nameFrom || nameTo || '' };
  }

  // Symmetric links: one flat list is enough.
  const names = namesForIds(
    matched.flatMap((e) => [e.a, e.b]),
    byid,
  );
  return { names };
}

export function describeLinkSelection(
  ids: string[],
  edges: Edge[],
  byid: Record<string, SimNode>,
  edgeData: EdgeRenderData,
): LinkSelectionInfo | null {
  const idSet = new Set(ids.filter(Boolean));
  const matched = edges.filter((e) => idSet.has(e.id));
  if (!matched.length) return null;

  const type = matched[0]!.type;
  const mark = LINK_MARK[type] ?? LINK_MARK.custom;
  const label = CHIP_LABEL[type] ?? CHIP_LABEL.custom;
  const { names, nameFrom, nameTo } = formatLinkNames(matched, byid);

  const path = linkSelectionPath(ids, edgeData, edges, byid);
  if (!path?.length) return null;

  return { mark, label, names, nameFrom, nameTo, path };
}

