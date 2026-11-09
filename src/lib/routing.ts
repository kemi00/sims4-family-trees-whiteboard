import { ARROW_LEN, BAND, MINDROP, PILL_DROP, PILL_H, PILL_W, RGAP, STUB, UNION_MIN_GAP } from './constants.ts';
import {
  buildRects,
  ptsClear,
  segClear,
  unionGeom,
} from './geometry.ts';
import { isUserE, simplify, uKey } from './utils.ts';
import type {
  Arrow,
  BloodPath,
  BloodVert,
  CustomRender,
  Edge,
  EdgeRenderData,
  Group,
  Point,
  Rect,
  SecretMark,
  ShowToggles,
  SimNode,
  UnionRender,
} from '../types/whiteboard.ts';

/** Binary min-heap for A* open set (keyed by priority). */
export class MinHeap {
  private p: number[] = [];
  private v: number[] = [];

  size(): number {
    return this.v.length;
  }

  push(pri: number, val: number): void {
    const p = this.p;
    const v = this.v;
    p.push(pri);
    v.push(val);
    let i = v.length - 1;
    while (i > 0) {
      const par = (i - 1) >> 1;
      if (p[par]! <= p[i]!) break;
      const tp = p[par]!;
      p[par] = p[i]!;
      p[i] = tp;
      const tv = v[par]!;
      v[par] = v[i]!;
      v[i] = tv;
      i = par;
    }
  }

  pop(): number {
    const p = this.p;
    const v = this.v;
    const top = v[0]!;
    const lastP = p.pop()!;
    const lastV = v.pop()!;
    if (v.length) {
      p[0] = lastP;
      v[0] = lastV;
      let i = 0;
      const n = v.length;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < n && p[l]! < p[m]!) m = l;
        if (r < n && p[r]! < p[m]!) m = r;
        if (m === i) break;
        const tp = p[m]!;
        p[m] = p[i]!;
        p[i] = tp;
        const tv = v[m]!;
        v[m] = v[i]!;
        v[i] = tv;
        i = m;
      }
    }
    return top;
  }
}

export interface RoutingContext {
  rects: Rect[];
  rbands: Record<number, Rect[]>;
  fastRoute: boolean;
  /**
   * When set, grows to cover every area an obstacle query looks at, so a
   * cached route knows which obstacle moves could change it.
   */
  probe?: Box;
}

type Box = { l: number; t: number; r: number; b: number };

function seeArea(ctx: RoutingContext, l: number, t: number, r: number, b: number): void {
  const p = ctx.probe;
  if (!p) return;
  if (l < p.l) p.l = l;
  if (t < p.t) p.t = t;
  if (r > p.r) p.r = r;
  if (b > p.b) p.b = b;
}

function clearSeg(
  ctx: RoutingContext,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  ex: Set<string>,
): boolean {
  seeArea(ctx, Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2));
  return segClear(x1, y1, x2, y2, ctx.rbands, ex);
}

function clearPts(ctx: RoutingContext, pts: Point[], ex: Set<string>): boolean {
  for (const [x, y] of pts) seeArea(ctx, x, y, x, y);
  return ptsClear(pts, ctx.rbands, ex);
}

/**
 * Largest search grid A* takes on. Long lines between worlds cross a few
 * hundred cards; a cap that left them out sent them straight through.
 */
const ASTAR_MAX_GRID = 160000;

function astar(
  p0: Point,
  p1: Point,
  ex: Set<string>,
  ctx: RoutingContext,
  clr = 1,
): Point[] | null {
  const { rects: RECTS } = ctx;
  let minx = Math.min(p0[0], p1[0]) - 40;
  let maxx = Math.max(p0[0], p1[0]) + 40;
  let miny = Math.min(p0[1], p1[1]) - 40;
  let maxy = Math.max(p0[1], p1[1]) + 40;
  for (let pass = 0; pass < 4; pass++) {
    let grew = false;
    for (const r of RECTS) {
      if (ex.has(r.id)) continue;
      if (r.r >= minx && r.l <= maxx && r.b >= miny && r.t <= maxy) {
        if (r.l - clr - 12 < minx) {
          minx = r.l - clr - 12;
          grew = true;
        }
        if (r.r + clr + 12 > maxx) {
          maxx = r.r + clr + 12;
          grew = true;
        }
        if (r.t - clr - 12 < miny) {
          miny = r.t - clr - 12;
          grew = true;
        }
        if (r.b + clr + 12 > maxy) {
          maxy = r.b + clr + 12;
          grew = true;
        }
      }
    }
    if (!grew) break;
  }
  // Every obstacle that can change this search touches the final box.
  seeArea(ctx, minx, miny, maxx, maxy);
  const xs = new Set<number>([p0[0], p1[0]]);
  const ys = new Set<number>([p0[1], p1[1]]);
  const near: Rect[] = [];
  for (const r of RECTS) {
    if (ex.has(r.id)) continue;
    if (r.r < minx || r.l > maxx || r.b < miny || r.t > maxy) continue;
    near.push(r);
    [r.l - clr, r.r + clr].forEach((v) => {
      if (v >= minx && v <= maxx) xs.add(v);
    });
    [r.t - clr, r.b + clr].forEach((v) => {
      if (v >= miny && v <= maxy) ys.add(v);
    });
  }
  if (xs.size * ys.size > ASTAR_MAX_GRID) return null;
  const X = [...xs].sort((a, b) => a - b);
  const Y = [...ys].sort((a, b) => a - b);
  const NX = X.length;
  const NY = Y.length;
  const N = NX * NY;
  const xi = new Map(X.map((v, i) => [v, i] as const));
  const yi = new Map(Y.map((v, i) => [v, i] as const));
  // Which grid steps run through an obstacle, worked out once per search
  // instead of testing every nearby rect on every step. Same rule as
  // segHit: a step is blocked when it crosses a rect's open interior.
  // blockH[i * NY + j]: (i, j) → (i + 1, j); blockV[i * NY + j]: (i, j) → (i, j + 1).
  const blockH = new Uint8Array(N);
  const blockV = new Uint8Array(N);
  /** First index whose value is > v (strict) or >= v. */
  const bound = (A: number[], v: number, strict: boolean): number => {
    let lo = 0;
    let hi = A.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (strict ? A[mid]! <= v : A[mid]! < v) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  for (const r of near) {
    // Horizontal steps: row strictly inside (t, b), span overlapping (l, r).
    // A partner line blocks only steps along it, not across.
    const j0 = bound(Y, r.t, true);
    const j1 = r.line === 'v' ? j0 : bound(Y, r.b, false);
    const i0 = Math.max(0, bound(X, r.l, true) - 1);
    const i1 = Math.min(NX - 2, bound(X, r.r, false) - 1);
    for (let j = j0; j < j1; j++) {
      for (let i = i0; i <= i1; i++) blockH[i * NY + j] = 1;
    }
    if (r.line === 'h') continue;
    // Vertical steps: column strictly inside (l, r), span overlapping (t, b).
    const c0 = bound(X, r.l, true);
    const c1 = bound(X, r.r, false);
    const k0 = Math.max(0, bound(Y, r.t, true) - 1);
    const k1 = Math.min(NY - 2, bound(Y, r.b, false) - 1);
    for (let i = c0; i < c1; i++) {
      for (let j = k0; j <= k1; j++) blockV[i * NY + j] = 1;
    }
  }
  const s = xi.get(p0[0])! * NY + yi.get(p0[1])!;
  const gg = xi.get(p1[0])! * NY + yi.get(p1[1])!;
  const TURN = 26;
  const gc = new Float64Array(N).fill(Infinity);
  const came = new Int32Array(N).fill(-1);
  const dir = new Uint8Array(N);
  const done = new Uint8Array(N);
  gc[s] = 0;
  const open = new MinHeap();
  open.push(0, s);
  const relax = (cur: number, k: number, step: number, md: number, nx: number, ny: number) => {
    const turn = dir[cur] && dir[cur] !== md ? TURN : 0;
    const ng = gc[cur]! + step + turn;
    if (ng < gc[k]!) {
      gc[k] = ng;
      came[k] = cur;
      dir[k] = md;
      open.push(ng + Math.abs(nx - p1[0]) + Math.abs(ny - p1[1]), k);
    }
  };
  while (open.size()) {
    const cur = open.pop();
    if (cur === gg) break;
    if (done[cur]) continue;
    done[cur] = 1;
    const i = (cur / NY) | 0;
    const j = cur % NY;
    const cx = X[i]!;
    const cy = Y[j]!;
    // Same neighbour order as before: left, right, up, down.
    if (i > 0 && !blockH[cur - NY]) relax(cur, cur - NY, cx - X[i - 1]!, 1, X[i - 1]!, cy);
    if (i < NX - 1 && !blockH[cur]) relax(cur, cur + NY, X[i + 1]! - cx, 1, X[i + 1]!, cy);
    if (j > 0 && !blockV[cur - 1]) relax(cur, cur - 1, cy - Y[j - 1]!, 2, cx, Y[j - 1]!);
    if (j < NY - 1 && !blockV[cur]) relax(cur, cur + 1, Y[j + 1]! - cy, 2, cx, Y[j + 1]!);
  }
  if (came[gg] === -1 && s !== gg) return null;
  const path: Point[] = [];
  let c = gg;
  while (c !== -1) {
    const i = (c / NY) | 0;
    const j = c % NY;
    path.push([X[i]!, Y[j]!]);
    if (c === s) break;
    c = came[c]!;
  }
  path.reverse();
  return simplify(path);
}

export function orthPath(
  p0: Point,
  p1: Point,
  exIds: string[] | undefined,
  ctx: RoutingContext,
): Point[] {
  const ex = new Set(exIds ?? []);
  const { fastRoute } = ctx;
  const tries: Point[][] = [
    [p0, [p1[0], p0[1]], p1],
    [p0, [p0[0], p1[1]], p1],
    [p0, [(p0[0] + p1[0]) / 2, p0[1]], [(p0[0] + p1[0]) / 2, p1[1]], p1],
    [p0, [p0[0], (p0[1] + p1[1]) / 2], [p1[0], (p0[1] + p1[1]) / 2], p1],
  ];
  for (const t of tries) {
    if (clearPts(ctx, t, ex)) return simplify(t);
  }
  if (fastRoute) return simplify(tries[0]!);
  return (
    astar(p0, p1, ex, ctx, 10) ||
    astar(p0, p1, ex, ctx, 1) ||
    simplify(tries[0]!)
  );
}

/**
 * Child sits low enough to hang from a fork under the parents: its top-stem
 * junction is at or below the lowest point the fork may start (past the
 * parents' card bottoms). A child level with a parent is routed from the side
 * instead; forking under the parents would leave its top stem in mid-air.
 */
function childBelowFork(ay: number, child: SimNode, tagsBottom?: number): boolean {
  return childStemJunctionY(child.y) >= unionStemJunctionY(ay, tagsBottom) - 0.5;
}

/** Y where the horizontal fork must meet before the mandatory top stem. */
export function childStemJunctionY(childTop: number): number {
  return childTop - STUB;
}

/**
 * Y where a horizontal fork may begin below a union/parent anchor.
 *
 * Always at least {@link STUB} below the pill/parent exit. When parent tag
 * bottoms are known, the fork must also clear those bottoms by {@link STUB}
 * so the bus sits in the gap below the cards (not flush with their edges).
 */
export function unionStemJunctionY(exitY: number, tagsBottom?: number): number {
  const belowExit = exitY + STUB;
  if (tagsBottom == null) return belowExit;
  return Math.max(belowExit, tagsBottom + STUB);
}

/**
 * Guarantee the path ends with a vertical stem into the child's top center.
 * Any horizontal fork must meet at or above {@link childStemJunctionY}
 * (never along the card top or through the card body).
 *
 * The final stem segment is never run through {@link simplify}, so a
 * colinear approach cannot erase the junction point.
 */
export function ensureChildTopStem(pts: Point[], child: SimNode): Point[] {
  const cx = child.x + child.w / 2;
  const top = child.y;
  const jy = childStemJunctionY(top);

  let body = pts.slice();
  // Drop trailing points on the stem column from the junction down through
  // the card top — we re-attach a clean stem. Keep approach points that sit
  // strictly above the junction (smaller y).
  while (body.length) {
    const last = body[body.length - 1]!;
    if (Math.abs(last[0] - cx) < 0.5 && last[1] >= jy - 0.5) {
      body.pop();
      continue;
    }
    break;
  }

  if (!body.length) {
    return [
      [cx, jy],
      [cx, top],
    ];
  }

  const last = body[body.length - 1]!;

  // Approach already below the ideal junction (tight under a union stem):
  // keep the horizontal at that height and drop to the top — do not climb
  // back up to jy (that would invent a sideways fork above the union stem).
  if (last[1] > jy + 0.5) {
    const bridge: Point[] = [];
    if (Math.abs(last[0] - cx) > 0.5) bridge.push([cx, last[1]]);
    const prefix = simplify([...body, ...bridge]);
    const end = prefix[prefix.length - 1]!;
    const withCx =
      Math.abs(end[0] - cx) < 0.5
        ? prefix
        : [...prefix, [cx, end[1]] as Point];
    return [...withCx, [cx, top]];
  }

  const meetY = Math.min(last[1], jy);
  const bridge: Point[] = [];
  if (Math.abs(last[1] - meetY) > 0.5) bridge.push([last[0], meetY]);
  let tip = bridge.length ? bridge[bridge.length - 1]! : last;
  if (Math.abs(tip[0] - cx) > 0.5) {
    bridge.push([cx, meetY]);
    tip = bridge[bridge.length - 1]!;
  }
  if (Math.abs(tip[0] - cx) > 0.5 || Math.abs(tip[1] - jy) > 0.5) {
    bridge.push([cx, jy]);
  }

  const prefix = simplify([...body, ...bridge, [cx, jy]]);
  const end = prefix[prefix.length - 1]!;
  const withJunction =
    Math.abs(end[0] - cx) < 0.5 && Math.abs(end[1] - jy) < 0.5
      ? prefix
      : [...prefix, [cx, jy] as Point];
  return [...withJunction, [cx, top]];
}

/** True if an orthogonal polyline crosses the open interior of the card. */
function crossesCard(pts: Point[], card: SimNode): boolean {
  const L = card.x + 1;
  const R = card.x + card.w - 1;
  const T = card.y + 1;
  const B = card.y + card.h - 1;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    if (Math.abs(a[0] - b[0]) < 0.5) {
      const x = a[0];
      if (x > L && x < R) {
        const y1 = Math.min(a[1], b[1]);
        const y2 = Math.max(a[1], b[1]);
        if (y1 < B && y2 > T) return true;
      }
    } else if (Math.abs(a[1] - b[1]) < 0.5) {
      const y = a[1];
      if (y > T && y < B) {
        const x1 = Math.min(a[0], b[0]);
        const x2 = Math.max(a[0], b[0]);
        if (x1 < R && x2 > L) return true;
      }
    }
  }
  return false;
}

/**
 * The child's own household tag. A child in the top row sits right under
 * it, so the line's last stretch into the child may cross it; nothing else
 * may.
 */
function ownTag(child: SimNode): string {
  return `__t_${child.gid}`;
}

/** How far a channel route looks for a clear lane past each end. */
const CHANNEL_REACH = 240;
/** How many open columns a channel route tries, nearest the straight way first. */
const CHANNEL_COLUMNS = 60;

/**
 * A long line the grid search can't take (too many cards in its box): down
 * to a clear lane under the start, across to a clear column, along it to a
 * clear lane by the end, across, and on to the end. Columns are tried by how
 * little they add to the way, nearest the start first; lanes from each end
 * outward. Only the first stretch, leaving the parents, may touch `exStart`;
 * only the last two, into the child, may touch `exEnd`.
 */
function channelRoute(
  ax: number,
  y0: number,
  cx: number,
  jy: number,
  ctx: RoutingContext,
  exStart: string[] = [],
  exEnd: string[] = [],
): Point[] | null {
  const none = new Set<string>();
  const start = new Set(exStart);
  const end = new Set(exEnd);
  const lo = Math.min(y0, jy) - CHANNEL_REACH;
  const hi = Math.max(y0, jy) + CHANNEL_REACH;
  const cols = new Set<number>([ax, cx]);
  for (const r of ctx.rects) {
    if (r.b < lo || r.t > hi) continue;
    cols.add(r.l - 8);
    cols.add(r.r + 8);
  }
  const ranked = [...cols].sort(
    (a, b) =>
      Math.abs(a - ax) + Math.abs(a - cx) - (Math.abs(b - ax) + Math.abs(b - cx)) ||
      Math.abs(a - ax) - Math.abs(b - ax),
  );
  const down = jy >= y0;
  // The stretch of column every choice of lanes runs along: a column blocked
  // there is no use, whatever the lanes.
  const [ia, ib] = down ? [y0 + CHANNEL_REACH, jy - CHANNEL_REACH] : [jy, y0];
  let tried = 0;
  for (const x of ranked) {
    if (tried >= CHANNEL_COLUMNS) break;
    if (ia < ib && !clearSeg(ctx, x, ia, x, ib, none)) continue;
    tried++;
    let y1: number | null = null;
    for (let y = y0; y <= y0 + CHANNEL_REACH; y += 8) {
      if (clearSeg(ctx, ax, y0, ax, y, start) && clearSeg(ctx, ax, y, x, y, none)) {
        y1 = y;
        break;
      }
    }
    if (y1 == null) continue;
    let y2: number | null = null;
    for (let y = jy; y >= jy - CHANNEL_REACH; y -= 8) {
      if (down && y < y1) break;
      if (clearSeg(ctx, x, y, cx, y, end) && clearSeg(ctx, cx, y, cx, jy, end)) {
        y2 = y;
        break;
      }
    }
    if (y2 == null || !clearSeg(ctx, x, y1, x, y2, none)) continue;
    return simplify([
      [ax, y0],
      [ax, y1],
      [x, y1],
      [x, y2],
      [cx, y2],
      [cx, jy],
    ]);
  }
  return null;
}

/**
 * Reach the stem junction above the child without crossing the child's card
 * or the cards the line starts from. The line leaves under its parents, so
 * climbing back up through them would come out on their top, along the
 * line their own parents hang them from: a child level with its mother
 * would read as her sibling.
 */
function routeToChildStemJunction(
  ax: number,
  ay: number,
  child: SimNode,
  from: SimNode[],
  ctx: RoutingContext,
): Point[] {
  const cx = child.x + child.w / 2;
  const jy = childStemJunctionY(child.y);
  // Nothing but the child's household tag may be touched: the parents and
  // their partner line are obstacles once the line has left them, and the
  // stem junction sits clear of the child's own card.
  const ex = new Set([ownTag(child)]);
  const cards = [child, ...from];

  const wingX =
    cx >= ax
      ? Math.max(ax, ...cards.map((n) => n.x + n.w)) + STUB
      : Math.min(ax, ...cards.map((n) => n.x)) - STUB;
  // The child's side facing the parent, when the parent is clear of it.
  const nearX =
    ax > child.x + child.w ? child.x + child.w + STUB : ax < child.x ? child.x - STUB : null;

  // Cheapest first; the routed path (possibly an A* search) is only built
  // when none of the simple shapes is clear.
  const candidates: (() => Point[])[] = [
    // Climb on the parent column to junction height, then across.
    () => [
      [ax, ay],
      [ax, jy],
      [cx, jy],
    ],
    // Across at anchor height only when that height is already above the card.
    () => [
      [ax, ay],
      [cx, ay],
      [cx, jy],
    ],
    // Up the child's near side, then in at junction height: from a parent
    // off to one side, this keeps clear of the cards past the child.
    ...(nearX === null
      ? []
      : [
          (): Point[] => [
            [ax, ay],
            [nearX, ay],
            [nearX, jy],
            [cx, jy],
          ],
        ]),
    // Wing around the far side of the child, then in at junction height.
    () => [
      [ax, ay],
      [wingX, ay],
      [wingX, jy],
      [cx, jy],
    ],
    () => orthPath([ax, ay], [cx, jy], [ownTag(child)], ctx),
  ];

  for (const make of candidates) {
    const cand = make();
    if (cards.some((n) => crossesCard(cand, n))) continue;
    if (!clearPts(ctx, cand, ex)) continue;
    return simplify(cand);
  }
  const channel = channelRoute(ax, ay, cx, jy, ctx, [], [ownTag(child)]);
  if (channel && !cards.some((n) => crossesCard(channel, n))) return channel;

  // Last resort: always wing around (may overlap other obstacles).
  return simplify([
    [ax, ay],
    [wingX, ay],
    [wingX, jy],
    [cx, jy],
  ]);
}

/** Group children by household so buses don't span unrelated distant cards. */
function clusterKidsByHousehold(kids: SimNode[]): SimNode[][] {
  const byGid = new Map<string, SimNode[]>();
  for (const n of kids) {
    if (!byGid.has(n.gid)) byGid.set(n.gid, []);
    byGid.get(n.gid)!.push(n);
  }
  return [...byGid.values()];
}

/** Parent-edge ids for one or more children (stable, deduped). */
function edgeIdsForKids(
  kids: SimNode[],
  pEB: Record<string, string[]>,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const n of kids) {
    for (const id of pEB[n.id] || []) {
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

/** Pedigree fork: trunk ↓, per-household bus, drops into child tops. */
function drawPedigreeFork(
  ax: number,
  ay: number,
  belowK: SimNode[],
  pEB: Record<string, string[]>,
  exBase: string[],
  ctx: RoutingContext,
  blood: BloodPath[],
  tagsBottom: number,
): void {
  if (!belowK.length) return;
  const stemEnd = unionStemJunctionY(ay, tagsBottom);
  // Prefer a clear lane near the children (short top stems), but never fork
  // above the floor that clears the parent tags.
  const bus = laneBus(ax, ay, belowK, exBase, ctx, tagsBottom);
  if (bus == null) {
    // No one lane clears every child: rather than cut through the cards in
    // the way, each child gets its own way down.
    for (const n of belowK) {
      blood.push({ ids: pEB[n.id] || [], pts: belowRoute(ax, ay, n, exBase, ctx, tagsBottom) });
    }
    return;
  }
  const forkY = Math.max(stemEnd, bus);

  // Shared trunk must carry every child's parent-edge ids — otherwise only
  // the short top stem is clickable / highlightable.
  blood.push({
    ids: edgeIdsForKids(belowK, pEB),
    pts: [
      [ax, ay],
      [ax, forkY],
    ],
  });

  for (const cluster of clusterKidsByHousehold(belowK)) {
    if (cluster.length === 1) {
      const n = cluster[0]!;
      const cx = n.x + n.w / 2;
      const approach: Point[] =
        Math.abs(cx - ax) > 0.5
          ? [
              [ax, forkY],
              [cx, forkY],
            ]
          : [[cx, forkY]];
      blood.push({
        ids: pEB[n.id] || [],
        pts: ensureChildTopStem(approach, n),
      });
      continue;
    }

    const cxs = cluster.map((n) => n.x + n.w / 2);
    const minx = Math.min(...cxs);
    const maxx = Math.max(...cxs);
    // One straight bus from the trunk across every kid. Building it from
    // pieces that doubled back let simplify() drop the far end, which left
    // the outermost kid's stem hanging in the air.
    const busL = Math.min(ax, minx);
    const busR = Math.max(ax, maxx);
    if (busR - busL > 0.5) {
      blood.push({
        ids: edgeIdsForKids(cluster, pEB),
        pts: [
          [busL, forkY],
          [busR, forkY],
        ],
      });
    }

    for (const n of cluster) {
      const cx = n.x + n.w / 2;
      blood.push({
        ids: pEB[n.id] || [],
        pts: ensureChildTopStem([[cx, forkY]], n),
      });
    }
  }
}

/** How far past the pair a partner line looks for a clear lane. */
const UNION_LANE_REACH = 240;

/** A partner line and where its pill sits. */
export type UnionPath = { pts: Point[]; rx: number; ry: number };

/** Middle of the longest flat run: where a routed line's pill sits. */
function pillSpot(pts: Point[]): Point {
  let best: Point = pts[Math.floor(pts.length / 2)]!;
  let len = -1;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const run = Math.abs(b[0] - a[0]);
    if (Math.abs(a[1] - b[1]) < 0.5 && run > len) {
      len = run;
      best = [(a[0] + b[0]) / 2, a[1]];
    }
  }
  return best;
}

/**
 * A partner line kept off every other card. The usual shape
 * ({@link unionGeom}) when nothing is in its way; else a lane under the
 * pair, so their children still hang below the pill; else one over them;
 * else a path routed round the cards. The usual shape stays when nothing
 * clear is found.
 */
export function unionRoute(a: SimNode, b: SimNode, ctx: RoutingContext): UnionPath {
  const g = unionGeom(a, b);
  const usual: Point[] = g.pts.split(' ').map((s) => s.split(',').map(Number) as Point);
  const pair = new Set([a.id, b.id]);
  if (clearPts(ctx, usual, pair)) return { pts: usual, rx: g.rx, ry: g.ry };

  const L = a.x <= b.x ? a : b;
  const R = L === a ? b : a;
  const clear = (pts: Point[]): boolean =>
    clearPts(ctx, pts, pair) && !crossesCard(pts, L) && !crossesCard(pts, R);
  // Out of the facing sides, as usual, one stub clear of each card.
  const sx = L.x + L.w;
  const sy = L.y + L.h / 2;
  const ex = R.x;
  const ey = R.y + R.h / 2;
  const lx = sx + STUB;
  const rx = ex - STUB;
  const lane = (y: number): Point[] => [
    [sx, sy],
    [lx, sy],
    [lx, y],
    [rx, y],
    [rx, ey],
    [ex, ey],
  ];
  if (rx - lx >= UNION_MIN_GAP) {
    const under = Math.max(L.y + L.h, R.y + R.h) + RGAP;
    for (let y = under; y <= under + UNION_LANE_REACH; y += 8) {
      if (clear(lane(y))) return { pts: simplify(lane(y)), rx: (lx + rx) / 2, ry: y };
    }
    const over = Math.min(L.y, R.y) - RGAP;
    for (let y = over; y >= over - UNION_LANE_REACH; y -= 8) {
      if (clear(lane(y))) return { pts: simplify(lane(y)), rx: (lx + rx) / 2, ry: y };
    }
    const mid = orthPath([lx, sy], [rx, ey], [], ctx);
    const pts = simplify([[sx, sy], ...mid, [ex, ey]]);
    if (clear(pts)) {
      const [px, py] = pillSpot(pts);
      return { pts, rx: px, ry: py };
    }
  }
  return { pts: usual, rx: g.rx, ry: g.ry };
}

/** Unit step along the longer axis from `a` to `b`. */
function stepDir(a: Point, b: Point): Point {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  return Math.abs(dx) >= Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy)];
}

/** Arrowhead at a line's end, pointing the way its last stretch runs. */
export function endArrow(pts: Point[]): Arrow | null {
  const tip = pts[pts.length - 1];
  for (let i = pts.length - 2; tip && i >= 0; i--) {
    const from = pts[i]!;
    if (Math.abs(from[0] - tip[0]) + Math.abs(from[1] - tip[1]) > 0.5) {
      return { tip, dir: stepDir(from, tip) };
    }
  }
  return null;
}

/** Arrowhead leaving `at` (its base) along `dir`. */
function leaveArrow(at: Point, dir: Point): Arrow {
  return { tip: [at[0] + dir[0] * ARROW_LEN, at[1] + dir[1] * ARROW_LEN], dir };
}

/**
 * Arrowheads on one family's lines: into each child's card; out of the
 * couple's pill (`fromPill`), on the line with the most children; and where
 * a line leaves another down the trunk, pointing the way it turns.
 */
function familyArrows(
  out: BloodPath[],
  ax: number,
  ay: number,
  kids: SimNode[],
  fromPill: boolean,
): BloodPath[] {
  const tops = new Set(kids.map((n) => `${n.x + n.w / 2},${n.y}`));
  const res = out.map((p) => ({ ...p, arrows: [...(p.arrows ?? [])] }));
  for (const p of res) {
    const last = p.pts[p.pts.length - 1]!;
    if (!tops.has(`${last[0]},${last[1]}`)) continue;
    const a = endArrow(p.pts);
    if (a) p.arrows.push(a);
  }
  const fromAnchor = res.filter(
    (p) => Math.abs(p.pts[0]![0] - ax) < 0.5 && Math.abs(p.pts[0]![1] - ay) < 0.5,
  );
  // How far down the anchor's column a line runs before it turns.
  const reach = (p: BloodPath): number => {
    const [a, b] = p.pts;
    return b && Math.abs(a![0] - b[0]) < 0.5 ? b[1] : ay;
  };
  if (fromPill && fromAnchor.length) {
    const trunk = fromAnchor.reduce((m, p) => (p.ids.length > m.ids.length ? p : m));
    trunk.arrows.push(leaveArrow([ax, ay], [0, 1]));
  }
  for (const p of fromAnchor) {
    const y1 = reach(p);
    const turn = p.pts[2];
    if (!turn || y1 <= ay + 0.5) continue;
    if (!fromAnchor.some((q) => q !== p && reach(q) >= y1 - 0.5)) continue;
    p.arrows.push(leaveArrow([ax, y1], stepDir([ax, y1], turn)));
  }
  return res.map((p) => (p.arrows.length ? p : { ids: p.ids, pts: p.pts, ...(p.cross ? { cross: p.cross } : {}) }));
}

/**
 * Arrowhead where a custom link enters `b`'s card: the line runs centre to
 * centre, under both cards.
 */
function customArrow(pts: Point[], b: SimNode): Arrow | null {
  const inside = (p: Point) => p[0] >= b.x && p[0] <= b.x + b.w && p[1] >= b.y && p[1] <= b.y + b.h;
  for (let i = pts.length - 1; i > 0; i--) {
    const a = pts[i - 1]!;
    const c = pts[i]!;
    if (inside(a) || !inside(c)) continue;
    const dir = stepDir(a, c);
    const tip: Point =
      dir[0] === 0
        ? [a[0], a[1] < b.y ? b.y : b.y + b.h]
        : [a[0] < b.x ? b.x : b.x + b.w, a[1]];
    return { tip, dir };
  }
  return null;
}

/** Height of the co-parent join: one stub below the lower parent's card. */
function coParentJoinY(p0: SimNode, p1: SimNode): number {
  return Math.max(p0.y + p0.h, p1.y + p1.h) + STUB;
}

/**
 * Two parents with no partner link between them have no union pill for the
 * child to hang from. Drop a stem from each parent's bottom and join them in
 * the gap below the lower card, so the line visibly starts on both parents.
 * Returns each parent's leg and the point the children's trunk hangs from.
 */
export function coParentJoin(
  p0: SimNode,
  p1: SimNode,
  ctx: RoutingContext,
): { legs: Point[][]; ax: number; ay: number } {
  const ax = (p0.x + p0.w / 2 + p1.x + p1.w / 2) / 2;
  const ay = coParentJoinY(p0, p1);
  // One leg per parent. Joined into a single polyline, the two legs could
  // double back at the join, and simplify() would drop part of one.
  const leg = (p: SimNode): Point[] => {
    const cx = p.x + p.w / 2;
    const bottom = p.y + p.h;
    return simplify([[cx, bottom], ...orthPath([cx, bottom + STUB], [ax, ay], [p.id], ctx)]);
  };
  return { legs: [leg(p0), leg(p1)], ax, ay };
}

/** Pedigree T: trunk → horizontal bus at stem junction → mandatory stem. */
function pedigreeDrop(
  ax: number,
  ay: number,
  child: SimNode,
  tagsBottom?: number,
  forkY?: number,
): Point[] {
  const cx = child.x + child.w / 2;
  const jy = childStemJunctionY(child.y);
  const stemEnd = unionStemJunctionY(ay, tagsBottom);
  // Prefer the child junction when there is room below the union stem;
  // otherwise hold the horizontal at the union stem end.
  const preferred = forkY != null ? Math.min(forkY, jy) : jy;
  const bus = Math.max(stemEnd, preferred);
  return ensureChildTopStem(
    [
      [ax, ay],
      [ax, bus],
      [cx, bus],
    ],
    child,
  );
}

/**
 * One child below its parents, kept off every other card: the T at the
 * first clear lane (from just above the child up to under the parents);
 * else a path routed round the cards in the way; else the plain T.
 * `exIds`: the parents and their partner line, which the trunk leaves.
 */
function belowRoute(
  ax: number,
  ay: number,
  child: SimNode,
  exIds: string[],
  ctx: RoutingContext,
  tagsBottom?: number,
): Point[] {
  const lane = laneBus(ax, ay, [child], exIds, ctx, tagsBottom);
  if (lane != null) return pedigreeDrop(ax, ay, child, tagsBottom, lane);
  const stemEnd = unionStemJunctionY(ay, tagsBottom);
  // The stem junction sits clear of the child's own card, so the child is
  // an obstacle too: the way round never runs through it.
  const cx = child.x + child.w / 2;
  const jy = childStemJunctionY(child.y);
  const around = orthPath([ax, stemEnd], [cx, jy], [ownTag(child)], ctx);
  if (clearPts(ctx, around, new Set([ownTag(child)]))) {
    return ensureChildTopStem([[ax, ay], ...around], child);
  }
  const channel = channelRoute(ax, stemEnd, cx, jy, ctx, exIds, [ownTag(child)]);
  if (channel) return ensureChildTopStem([[ax, ay], ...channel], child);
  return pedigreeDrop(ax, ay, child, tagsBottom);
}

/**
 * One parent line from its anchor under the parents (`from`, their cards)
 * into the child's top. `partnerLine`: the obstacle ids of the parents'
 * own partner line and pill, which the line leaves from.
 */
export function childRoute(
  ax: number,
  ay: number,
  child: SimNode,
  from: SimNode[],
  ctx: RoutingContext,
  tagsBottom?: number,
  partnerLine: string[] = [],
): Point[] {
  if (childBelowFork(ay, child, tagsBottom)) {
    return belowRoute(ax, ay, child, [...from.map((n) => n.id), ...partnerLine], ctx, tagsBottom);
  }

  // Beside or above the union: mandatory bottom stem (past parent tags),
  // then route to the child stem junction, then top stem.
  const stemEnd = unionStemJunctionY(ay, tagsBottom);
  const approach = routeToChildStemJunction(
    ax,
    stemEnd,
    child,
    from,
    ctx,
  );
  return ensureChildTopStem([[ax, ay], ...approach], child);
}

export function laneBus(
  ax: number,
  ay: number,
  kidNodes: SimNode[],
  exIds: string[],
  ctx: RoutingContext,
  tagsBottom?: number,
): number | null {
  const ex = new Set([...exIds, ...kidNodes.map((n) => n.id)]);
  // A child in the top row sits right under its household tag: the bus and
  // drops run along its foot, as they always have.
  const exEnd = new Set([...ex, ...kidNodes.map(ownTag)]);
  const cxs = kidNodes.map((n) => n.x + n.w / 2);
  const minx = Math.min(ax, ...cxs);
  const maxx = Math.max(ax, ...cxs);
  const minTop = Math.min(...kidNodes.map((n) => n.y));
  const topLimit = childStemJunctionY(minTop);
  const stemEnd = unionStemJunctionY(ay, tagsBottom);
  // Search from the child stem junction upward, but never above the
  // floor that clears parent tag bottoms.
  for (let lane = topLimit; lane >= stemEnd; lane -= 8) {
    if (!clearSeg(ctx, ax, ay, ax, lane, ex)) continue;
    if (!clearSeg(ctx, minx, lane, maxx, lane, exEnd)) continue;
    let ok = true;
    for (const n of kidNodes) {
      const cx = n.x + n.w / 2;
      // Drop only needs a clear path to the stem junction, not through the card.
      if (!clearSeg(ctx, cx, lane, cx, childStemJunctionY(n.y), exEnd)) {
        ok = false;
        break;
      }
    }
    if (ok) return lane;
  }
  return null;
}

/** PARENT link geometry (legacy helper; childRoute is used in production). */
export function routeParent(p: SimNode, c: SimNode): string {
  const pcx = p.x + p.w / 2;
  const ccx = c.x + c.w / 2;
  if (c.y > p.y + p.h + 8) {
    const my = (p.y + p.h + c.y) / 2;
    return `${pcx},${p.y + p.h} ${pcx},${my} ${ccx},${my} ${ccx},${c.y}`;
  }
  const goR = ccx >= pcx;
  const sx = goR ? p.x + p.w : p.x;
  const sy = p.y + p.h / 2;
  const ex = goR ? c.x : c.x + c.w;
  const ey = c.y + c.h / 2;
  const mx = (sx + ex) / 2;
  return `${sx},${sy} ${mx},${sy} ${mx},${ey} ${ex},${ey}`;
}

export function bloodVerts(polys: BloodPath[]): BloodVert[] {
  const V: BloodVert[] = [];
  polys.forEach((p, pi) => {
    for (let i = 1; i < p.pts.length; i++) {
      const a = p.pts[i - 1]!;
      const b = p.pts[i]!;
      if (Math.abs(a[0] - b[0]) < 0.5 && Math.abs(a[1] - b[1]) > 1) {
        V.push({
          x: a[0],
          y1: Math.min(a[1], b[1]),
          y2: Math.max(a[1], b[1]),
          pi,
        });
      }
    }
  });
  return V;
}

export function hopD(pts: Point[], verts: BloodVert[], pi: number): string {
  const R = 5;
  if (!pts || pts.length < 1) return '';
  let d = `M ${pts[0]![0]} ${pts[0]![1]}`;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    if (Math.abs(a[1] - b[1]) < 0.5 && Math.abs(a[0] - b[0]) > 1) {
      const y = a[1];
      const dir = b[0] > a[0] ? 1 : -1;
      let xs = verts
        .filter(
          (v) =>
            v.pi !== pi &&
            v.y1 < y - 2 &&
            v.y2 > y + 2 &&
            v.x > Math.min(a[0], b[0]) + R + 1 &&
            v.x < Math.max(a[0], b[0]) - R - 1,
        )
        .map((v) => v.x);
      xs = [...new Set(xs)].sort((m, n) => dir * (m - n));
      for (const x of xs) {
        d += ` L ${x - dir * R} ${y} A ${R} ${R} 0 0 ${dir > 0 ? 1 : 0} ${x + dir * R} ${y}`;
      }
      d += ` L ${b[0]} ${b[1]}`;
    } else {
      d += ` L ${b[0]} ${b[1]}`;
    }
  }
  return d;
}

/** Sibling ⊓: stem up from each top, then a bar or a routed fork. */
/**
 * Sibling connector: one bus above every member, then a mandatory top stem
 * into each card. Never route between staggered cards (that climbs through
 * the upper card and looks like a bottom exit).
 */
function drawSiblingFork(
  members: SimNode[],
  ids: string[],
  ctx: RoutingContext,
): BloodPath[] {
  const ex = new Set(members.map((n) => n.id));
  const cxs = members.map((n) => n.x + n.w / 2);
  const minx = Math.min(...cxs);
  const maxx = Math.max(...cxs);
  // Bus must sit at or above every stem junction (above the highest card).
  const laneTop = Math.min(...members.map((n) => childStemJunctionY(n.y)));

  let barY: number | null = null;
  // Search upward from the junctions; keep looking well above if the first
  // lanes are blocked by household frames / other edges.
  const searchCeil = laneTop - MINDROP * 4;
  for (let y = laneTop; y >= searchCeil; y -= 8) {
    if (!clearSeg(ctx, minx, y, maxx, y, ex)) continue;
    let ok = true;
    for (const n of members) {
      const cx = n.x + n.w / 2;
      if (!clearSeg(ctx, cx, y, cx, childStemJunctionY(n.y), ex)) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    barY = y;
    break;
  }

  // Last resort: still stay above every card — wing the bus above obstacles
  // rather than falling back to a between-card orthPath.
  if (barY == null) {
    barY = laneTop - STUB;
    const wing = simplify([
      [minx, laneTop],
      [minx, barY],
      [maxx, barY],
      [maxx, laneTop],
    ]);
    const out: BloodPath[] = [{ ids, pts: wing }];
    for (const n of members) {
      const cx = n.x + n.w / 2;
      out.push({
        ids,
        pts: ensureChildTopStem([[cx, laneTop]], n),
      });
    }
    return out;
  }

  const out: BloodPath[] = [];
  if (maxx - minx > 0.5) {
    out.push({
      ids,
      pts: [
        [minx, barY],
        [maxx, barY],
      ],
    });
  }
  for (const n of members) {
    const cx = n.x + n.w / 2;
    out.push({
      ids,
      pts: ensureChildTopStem([[cx, barY]], n),
    });
  }
  return out;
}

export const EMPTY_EDGE_DATA: EdgeRenderData = {
  blood: [],
  unions: [],
  customs: [],
  rects: [],
};

export interface ComputeEdgeRenderInput {
  nodes: SimNode[];
  edges: Edge[];
  groups: Group[];
  show: ShowToggles;
  packVis: (n: SimNode) => boolean;
  fastRoute: boolean;
  /** Skip the whole routing pass (edges are hidden during pan/zoom/drag). */
  skipRoute?: boolean;
  /** Reuse routes from the previous pass that this edit cannot have changed. */
  cache?: RouteCache;
}

type CachedRoute = { sig: string; probe: Box; out: unknown };

/**
 * Routes kept between passes. Each family, sibling group and custom link is a
 * unit whose route depends only on its own cards (its signature) and on the
 * obstacles inside the area its queries looked at (its probe). A unit is
 * reused when its signature is unchanged and no obstacle that moved, appeared
 * or vanished since the last pass touches its probe — so dropping one card
 * re-routes only the links near it, not the whole board.
 */
export class RouteCache {
  /** Obstacle boxes of the last pass, keyed by id (plus a count for repeats). */
  rects = new Map<string, Rect>();
  /** The cards and tags alone, which partner lines are routed round. */
  baseRects = new Map<string, Rect>();
  units = new Map<string, CachedRoute>();
  fastRoute = false;
  /** Units routed (not reused) by the last pass — for tests and profiling. */
  lastRouted = 0;
}

function rectKeyMap(rects: Rect[]): Map<string, Rect> {
  const m = new Map<string, Rect>();
  for (const r of rects) {
    let k = r.id;
    for (let i = 1; m.has(k); i++) k = `${r.id}#${i}`;
    m.set(k, r);
  }
  return m;
}

/** Boxes of every obstacle that moved, appeared or vanished between passes. */
function changedObstacles(prev: Map<string, Rect>, next: Map<string, Rect>): Box[] {
  const out: Box[] = [];
  for (const [k, r] of next) {
    const o = prev.get(k);
    if (!o) out.push(r);
    else if (o.l !== r.l || o.t !== r.t || o.r !== r.r || o.b !== r.b) out.push(o, r);
  }
  for (const [k, o] of prev) if (!next.has(k)) out.push(o);
  return out;
}

const nodeSig = (n: SimNode): string => `${n.id}@${n.x},${n.y},${n.w},${n.h},${n.gid}`;

function parentSetKey(parentsOf: Record<string, string[]>, id: string): string {
  return (parentsOf[id] || []).slice().sort().join('|');
}

/** Shared parent set → sibling connector is implied by the parent fork. */
function impliedSiblings(
  members: string[],
  parentsOf: Record<string, string[]>,
): boolean {
  if (members.length < 2) return false;
  const keys = members.map((m) => parentSetKey(parentsOf, m));
  const k0 = keys[0];
  return !!k0 && keys.every((k) => k === k0);
}

/** Child was raised in another household — parent line must still draw. */
/** `{ cross: true }` for a stroke that joins sims in different households, else nothing. */
function across(cross: boolean): { cross?: true } {
  return cross ? { cross: true } : {};
}

function crossHouseholdChild(
  child: SimNode,
  ps: string[],
  byid: Record<string, SimNode>,
): boolean {
  return ps.some((pid) => {
    const p = byid[pid];
    return p && p.gid !== child.gid;
  });
}

/** Pure routing pass — returns geometry instead of mutating the DOM. */
export function computeEdgeRenderData(
  input: ComputeEdgeRenderInput,
): EdgeRenderData {
  if (input.skipRoute) return EMPTY_EDGE_DATA;
  const { nodes, edges, groups, show, packVis, fastRoute } = input;
  const byid: Record<string, SimNode> = {};
  nodes.forEach((n) => {
    byid[n.id] = n;
  });

  const built = buildRects(nodes, groups, show, packVis);
  const RECTS = [...built.rects];
  const RBANDS = { ...built.rbands };

  const ctx: RoutingContext = { rects: RECTS, rbands: RBANDS, fastRoute };
  const cache = input.cache;

  // Which family links show is decided before routing (linksInView).
  const vis = (e: Edge): boolean =>
    !!byid[e.a] &&
    !!byid[e.b] &&
    packVis(byid[e.a]!) &&
    packVis(byid[e.b]!);

  const unions = edges.filter(
    (e) =>
      (e.type === 'marriage' ||
        e.type === 'romance' ||
        e.type === 'divorced') &&
      vis(e),
  );

  const nextUnits = new Map<string, CachedRoute>();
  let routedCount = 0;
  /**
   * Reuse a unit's route from the last pass, or route it now and keep it.
   * `moved`: the obstacles that changed since then, or null to route anew.
   */
  const reuseOrRoute = <T>(moved: Box[] | null, key: string, sig: string, run: () => T): T => {
    const hit = moved ? cache!.units.get(key) : undefined;
    if (
      hit &&
      hit.sig === sig &&
      !moved!.some(
        (m) => m.l <= hit.probe.r && m.r >= hit.probe.l && m.t <= hit.probe.b && m.b >= hit.probe.t,
      )
    ) {
      nextUnits.set(key, hit);
      return hit.out as T;
    }
    const probe: Box = { l: Infinity, t: Infinity, r: -Infinity, b: -Infinity };
    ctx.probe = probe;
    const out = run();
    ctx.probe = undefined;
    routedCount++;
    nextUnits.set(key, { sig, probe, out });
    return out;
  };
  // Partner lines go round cards and tags only, so they are kept or
  // re-routed by what changed among those.
  const nextBase = cache ? rectKeyMap(built.rects) : null;
  const baseMoved =
    cache && nextBase && cache.fastRoute === fastRoute
      ? changedObstacles(cache.baseRects, nextBase)
      : null;

  const uAnchor: Record<string, { rx: number; ry: number }> = {};
  const mObs: Record<string, string[]> = {};

  // Every partner line is placed against the cards and tags alone, before
  // any of them becomes an obstacle, so one couple's line never pushes
  // another's.
  const uPath = new Map<string, UnionPath>();
  for (const e of unions) {
    const a = byid[e.a]!;
    const b = byid[e.b]!;
    uPath.set(
      e.id,
      reuseOrRoute(baseMoved, `u:${e.id}`, `${nodeSig(a)};${nodeSig(b)}`, () => unionRoute(a, b, ctx)),
    );
  }

  unions.forEach((e) => {
    const g0 = uPath.get(e.id)!;
    const key = uKey(e.a, e.b);
    uAnchor[key] = { rx: g0.rx, ry: g0.ry };
    mObs[key] = [];
    const pp = g0.pts;
    // Each stretch of the line, then its pill: other lines may cross the
    // line, but never run along it or through the pill, where they would
    // read as this couple's child.
    const boxes: Rect[] = [];
    for (let i = 0; i + 1 < pp.length; i++) {
      const M = 4;
      const [p, q] = [pp[i]!, pp[i + 1]!];
      boxes.push({
        l: Math.min(p[0], q[0]) - M,
        t: Math.min(p[1], q[1]) - M,
        r: Math.max(p[0], q[0]) + M,
        b: Math.max(p[1], q[1]) + M,
        id: `__m_${i}_${key}`,
        line: Math.abs(p[1] - q[1]) < 0.5 ? 'h' : 'v',
      });
    }
    const pw = PILL_W[e.type as keyof typeof PILL_W] / 2 + 4;
    boxes.push({ l: g0.rx - pw, t: g0.ry - PILL_H / 2 - 4, r: g0.rx + pw, b: g0.ry + PILL_H / 2 + 4, id: `__m_p_${key}` });
    for (const segRect of boxes) {
      const id = segRect.id;
      RECTS.push(segRect);
      mObs[key]!.push(id);
      const b0 = Math.floor(segRect.t / BAND);
      const b1 = Math.floor(segRect.b / BAND);
      for (let bb = b0; bb <= b1; bb++) {
        (RBANDS[bb] = RBANDS[bb] || []).push(segRect);
      }
    }
  });

  ctx.rects = RECTS;
  ctx.rbands = RBANDS;

  const nextRects = cache ? rectKeyMap(RECTS) : null;
  const moved =
    cache && nextRects && cache.fastRoute === fastRoute
      ? changedObstacles(cache.rects, nextRects)
      : null;
  const routed = <T>(key: string, sig: string, run: () => T): T =>
    reuseOrRoute(moved, key, sig, run);

  const pEdges = edges.filter((e) => e.type === 'parent' && vis(e));
  const parentsOf: Record<string, string[]> = {};
  const pEB: Record<string, string[]> = {};

  pEdges.forEach((e) => {
    (parentsOf[e.b] = parentsOf[e.b] || []);
    if (!parentsOf[e.b]!.includes(e.a)) parentsOf[e.b]!.push(e.a);
    (pEB[e.b] = pEB[e.b] || []).push(e.id);
  });

  const fam: Record<
    string,
    { parents: string[]; kids: string[] }
  > = {};
  Object.keys(parentsOf).forEach((c) => {
    const ps = (parentsOf[c] || []).slice().sort();
    const key = ps.join('|');
    (fam[key] = fam[key] || { parents: ps, kids: [] }).kids.push(c);
  });

  const BLOOD: BloodPath[] = [];
  const parentBusKids = new Set<string>();

  Object.values(fam).forEach((f) => {
    const kids = f.kids.filter((c) => byid[c]);
    if (!kids.length) return;
    const ps = f.parents;
    const kn = kids.map((c) => byid[c]!);
    const isCouple = ps.length === 2 && !!uAnchor[uKey(ps[0]!, ps[1]!)];
    const sig = [
      isCouple ? 'u' : '-',
      ...ps.map((pid) => (byid[pid] ? nodeSig(byid[pid]!) : pid)),
      ...kn.map((n) => `${nodeSig(n)}<${(pEB[n.id] || []).join(',')}`),
    ].join(';');
    const key = `f:${ps.join('|')}`;

    if (ps.length > 2) {
      BLOOD.push(
        ...routed(key, sig, () =>
          ps.flatMap((pid) => {
            const p = byid[pid];
            if (!p) return [];
            const lines = kn.map((n) => ({
              ids: pEB[n.id] || [],
              pts: childRoute(p.x + p.w / 2, p.y + p.h, n, [p], ctx, p.y + p.h),
              ...across(p.gid !== n.gid),
            }));
            return familyArrows(lines, p.x + p.w / 2, p.y + p.h, kn, false);
          }),
        ),
      );
      return;
    }

    let ax: number;
    let ay: number;
    let tagsBottom: number;
    let exBase: string[];
    let coParents: [SimNode, SimNode] | null = null;
    if (isCouple) {
      const a = uAnchor[uKey(ps[0]!, ps[1]!)]!;
      const p0 = byid[ps[0]!]!;
      const p1 = byid[ps[1]!]!;
      ax = a.rx;
      ay = a.ry + PILL_DROP;
      tagsBottom = Math.max(p0.y + p0.h, p1.y + p1.h);
      exBase = [ps[0]!, ps[1]!].concat(mObs[uKey(ps[0]!, ps[1]!)] || []);
    } else if (ps.length === 2) {
      // Co-parents with no partner link: join them, then hang the kids from
      // the join. Starting at the bare midpoint left a line to nowhere.
      const p0 = byid[ps[0]!]!;
      const p1 = byid[ps[1]!]!;
      ax = (p0.x + p0.w / 2 + p1.x + p1.w / 2) / 2;
      ay = coParentJoinY(p0, p1);
      tagsBottom = Math.max(p0.y + p0.h, p1.y + p1.h);
      exBase = [ps[0]!, ps[1]!];
      coParents = [p0, p1];
    } else {
      const p = byid[ps[0]!]!;
      ax = p.x + p.w / 2;
      tagsBottom = p.y + p.h;
      ay = tagsBottom;
      exBase = [ps[0]!];
    }
    const parentCards = ps.flatMap((pid) => (byid[pid] ? [byid[pid]!] : []));
    const belowK = kn.filter((n) => childBelowFork(ay, n, tagsBottom));
    const sideK = kn.filter((n) => !childBelowFork(ay, n, tagsBottom));
    for (const n of belowK) parentBusKids.add(n.id);

    BLOOD.push(
      ...routed(key, sig, () => {
        const out: BloodPath[] = [];
        if (coParents) {
          const ids = edgeIdsForKids(kn, pEB);
          const cross = across(coParents[0].gid !== coParents[1].gid);
          for (const pts of coParentJoin(...coParents, ctx).legs) out.push({ ids, pts, ...cross });
        }
        /** Cross-household kids get their own drop — no shared horizontal bus. */
        const inHHBelow = belowK.filter((n) => !crossHouseholdChild(n, ps, byid));
        const crossHHBelow = belowK.filter((n) => crossHouseholdChild(n, ps, byid));
        if (inHHBelow.length) {
          drawPedigreeFork(ax, ay, inHHBelow, pEB, exBase, ctx, out, tagsBottom);
        }
        for (const n of [...crossHHBelow, ...sideK]) {
          out.push({
            ids: pEB[n.id] || [],
            pts: childRoute(ax, ay, n, parentCards, ctx, tagsBottom, exBase),
            ...across(crossHouseholdChild(n, ps, byid)),
          });
        }
        return familyArrows(out, ax, ay, kn, isCouple);
      }),
    );
  });

  const sibEdges = edges.filter((e) => e.type === 'sibling' && vis(e));
  if (sibEdges.length) {
    const adj: Record<string, string[]> = {};
    const comp: Record<string, number> = {};
    sibEdges.forEach((e) => {
      (adj[e.a] = adj[e.a] || []).push(e.b);
      (adj[e.b] = adj[e.b] || []).push(e.a);
    });
    let ci = 0;
    const comps: string[][] = [];
    Object.keys(adj).forEach((s) => {
      if (comp[s] !== undefined) return;
      const st = [s];
      const mm: string[] = [];
      comp[s] = ci;
      while (st.length) {
        const x = st.pop()!;
        mm.push(x);
        (adj[x] || []).forEach((y) => {
          if (comp[y] === undefined) {
            comp[y] = ci;
            st.push(y);
          }
        });
      }
      comps.push(mm);
      ci++;
    });
    comps.forEach((members) => {
      const ms = members.filter((m) => byid[m]);
      if (ms.length < 2) return;
      if (impliedSiblings(ms, parentsOf) || ms.every((m) => parentBusKids.has(m))) {
        return;
      }
      const ids = sibEdges
        .filter((e) => members.includes(e.a) && members.includes(e.b))
        .map((e) => e.id);
      const mn = ms.map((m) => byid[m]!);
      const sig = [...mn.map(nodeSig), ids.join(',')].join(';');
      const cross = across(new Set(mn.map((n) => n.gid)).size > 1);
      BLOOD.push(
        ...routed(`s:${ms.slice().sort().join('|')}`, sig, () =>
          drawSiblingFork(mn, ids, ctx).map((p) => ({ ...p, ...cross })),
        ),
      );
    });
  }

  const unionRenders: UnionRender[] = unions.map((e) => {
    const g0 = uPath.get(e.id)!;
    return {
      edgeId: e.id,
      type: e.type as UnionRender['type'],
      a: e.a,
      b: e.b,
      pts: g0.pts.map((p) => p.join(',')).join(' '),
      rx: g0.rx,
      ry: g0.ry,
      // Into each partner's card, at both ends of the line.
      arrows: [endArrow([...g0.pts].reverse()), endArrow(g0.pts)].filter((a): a is Arrow => !!a),
      isUser: isUserE(e),
      ...(e.type === 'romance' && e.secret ? { secret: true } : {}),
      ...((e.type === 'marriage' || e.type === 'romance') && e.ending ? { ending: true as const } : {}),
      ...across(byid[e.a]!.gid !== byid[e.b]!.gid),
    };
  });

  // A lock on the child's top stem — the one stroke every parent route ends
  // in — marks a secret parent, whichever way the parents are drawn.
  const secretIds = new Map<string, string[]>();
  for (const e of pEdges) {
    if (!e.secret || !byid[e.b]) continue;
    const ids = secretIds.get(e.b) ?? [];
    ids.push(e.id);
    secretIds.set(e.b, ids);
  }
  const secrets: SecretMark[] = [...secretIds].map(([child, ids]) => {
    const n = byid[child]!;
    return { child, at: [n.x + n.w / 2, n.y - STUB / 2], ids };
  });

  const customs: CustomRender[] = edges
    .filter((e) => e.type === 'custom' && vis(e))
    .map((e) => {
      const a = byid[e.a]!;
      const b = byid[e.b]!;
      const pts = routed(`c:${e.id}`, `${nodeSig(a)};${nodeSig(b)}`, () =>
        orthPath([a.x + a.w / 2, a.y + a.h / 2], [b.x + b.w / 2, b.y + b.h / 2], [e.a, e.b], ctx),
      );
      const arrow = customArrow(pts, b);
      return {
        edgeId: e.id,
        a: e.a,
        b: e.b,
        pts,
        isUser: isUserE(e),
        ...(arrow ? { arrows: [arrow] } : {}),
      };
    });

  if (cache) {
    cache.rects = nextRects!;
    cache.baseRects = nextBase!;
    cache.units = nextUnits;
    cache.fastRoute = fastRoute;
    cache.lastRouted = routedCount;
  }

  return {
    blood: BLOOD,
    unions: unionRenders,
    customs,
    ...(secrets.length ? { secrets } : {}),
    rects: RECTS,
  };
}
