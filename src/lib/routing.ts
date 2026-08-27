import { BAND, MINDROP, PILL_DROP, STUB } from './constants.ts';
import {
  buildRects,
  edgeVisible,
  ptsClear,
  segClear,
  segHit,
  unionGeom,
} from './geometry.ts';
import { isUserE, simplify, uKey } from './utils.ts';
import type {
  BloodPath,
  BloodVert,
  CustomRender,
  Edge,
  EdgeRenderData,
  Group,
  Point,
  Rect,
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
}

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
  const X = [...xs].sort((a, b) => a - b);
  const Y = [...ys].sort((a, b) => a - b);
  const NY = Y.length;
  if (X.length * NY > 60000) return null;
  const xi = new Map(X.map((v, i) => [v, i] as const));
  const yi = new Map(Y.map((v, i) => [v, i] as const));
  const clrSeg = (x1: number, y1: number, x2: number, y2: number): boolean => {
    for (const r of near) {
      if (segHit(x1, y1, x2, y2, r)) return false;
    }
    return true;
  };
  const s = xi.get(p0[0])! * NY + yi.get(p0[1])!;
  const gg = xi.get(p1[0])! * NY + yi.get(p1[1])!;
  const TURN = 26;
  const gc: Record<number, number> = {};
  const came: Record<number, number | undefined> = {};
  const dir: Record<number, number> = {};
  gc[s] = 0;
  dir[s] = 0;
  const open = new MinHeap();
  open.push(0, s);
  const done = new Set<number>();
  while (open.size()) {
    const cur = open.pop();
    if (cur === gg) break;
    if (done.has(cur)) continue;
    done.add(cur);
    const i = (cur / NY) | 0;
    const j = cur % NY;
    const cx = X[i]!;
    const cy = Y[j]!;
    const nb: [number, number][] = [];
    if (i > 0) nb.push([i - 1, j]);
    if (i < X.length - 1) nb.push([i + 1, j]);
    if (j > 0) nb.push([i, j - 1]);
    if (j < NY - 1) nb.push([i, j + 1]);
    for (const [ni, nj] of nb) {
      const nx = X[ni]!;
      const ny = Y[nj]!;
      if (!clrSeg(cx, cy, nx, ny)) continue;
      const k = ni * NY + nj;
      const md = nx !== cx ? 1 : 2;
      const turn = dir[cur] && dir[cur] !== md ? TURN : 0;
      const ng =
        gc[cur]! + Math.abs(nx - cx) + Math.abs(ny - cy) + turn;
      if (gc[k] === undefined || ng < gc[k]!) {
        gc[k] = ng;
        came[k] = cur;
        dir[k] = md;
        open.push(ng + Math.abs(nx - p1[0]) + Math.abs(ny - p1[1]), k);
      }
    }
  }
  if (came[gg] === undefined && s !== gg) return null;
  const path: Point[] = [];
  let c: number | undefined = gg;
  while (c !== undefined) {
    const i = (c / NY) | 0;
    const j = c % NY;
    path.push([X[i]!, Y[j]!]);
    if (c === s) break;
    c = came[c];
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
  const { rbands, fastRoute } = ctx;
  const tries: Point[][] = [
    [p0, [p1[0], p0[1]], p1],
    [p0, [p0[0], p1[1]], p1],
    [p0, [(p0[0] + p1[0]) / 2, p0[1]], [(p0[0] + p1[0]) / 2, p1[1]], p1],
    [p0, [p0[0], (p0[1] + p1[1]) / 2], [p1[0], (p0[1] + p1[1]) / 2], p1],
  ];
  for (const t of tries) {
    if (ptsClear(t, rbands, ex)) return simplify(t);
  }
  if (fastRoute) return simplify(tries[0]!);
  return (
    astar(p0, p1, ex, ctx, 10) ||
    astar(p0, p1, ex, ctx, 1) ||
    simplify(tries[0]!)
  );
}

/** Child sits in a lower generation row (top at or below the anchor). */
function childBelowAnchor(ay: number, child: SimNode): boolean {
  return child.y >= ay - STUB;
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
function crossesChildInterior(pts: Point[], child: SimNode): boolean {
  const L = child.x + 1;
  const R = child.x + child.w - 1;
  const T = child.y + 1;
  const B = child.y + child.h - 1;
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
 * Reach the stem junction above the child without crossing the card body.
 */
function routeToChildStemJunction(
  ax: number,
  ay: number,
  child: SimNode,
  exIds: string[],
  ctx: RoutingContext,
): Point[] {
  const cx = child.x + child.w / 2;
  const jy = childStemJunctionY(child.y);
  const ex = new Set([...exIds, child.id]);
  const { rbands } = ctx;

  const wingX =
    cx >= ax
      ? Math.max(ax, child.x + child.w) + STUB
      : Math.min(ax, child.x) - STUB;

  const candidates: Point[][] = [
    // Climb on the parent column to junction height, then across.
    [
      [ax, ay],
      [ax, jy],
      [cx, jy],
    ],
    // Across at anchor height only when that height is already above the card.
    [
      [ax, ay],
      [cx, ay],
      [cx, jy],
    ],
    // Wing around the far side of the child, then in at junction height.
    [
      [ax, ay],
      [wingX, ay],
      [wingX, jy],
      [cx, jy],
    ],
    orthPath([ax, ay], [cx, jy], [...exIds, child.id], ctx),
  ];

  for (const cand of candidates) {
    if (crossesChildInterior(cand, child)) continue;
    if (!ptsClear(cand, rbands, ex)) continue;
    return simplify(cand);
  }

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

/** Pedigree fork: trunk ↓, per-household bus, drops into child tops. */
function drawPedigreeFork(
  ax: number,
  ay: number,
  belowK: SimNode[],
  pEB: Record<string, string[]>,
  exBase: string[],
  ctx: RoutingContext,
  blood: BloodPath[],
  parentBusKids: Set<string>,
  tagsBottom: number,
): void {
  if (!belowK.length) return;
  const laneTop = Math.min(...belowK.map((n) => childStemJunctionY(n.y)));
  const stemEnd = unionStemJunctionY(ay, tagsBottom);
  // Prefer a clear lane near the children (short top stems), but never fork
  // above the floor that clears the parent tags.
  const bus = laneBus(ax, ay, belowK, exBase, ctx, tagsBottom);
  const forkY = Math.max(stemEnd, bus ?? laneTop);

  blood.push({
    ids: belowK.length === 1 ? pEB[belowK[0]!.id] || [] : [],
    pts: [
      [ax, ay],
      [ax, forkY],
    ],
  });

  for (const cluster of clusterKidsByHousehold(belowK)) {
    if (cluster.length === 1) {
      const n = cluster[0]!;
      const cx = n.x + n.w / 2;
      parentBusKids.add(n.id);
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
    const busSeg: Point[] = [];
    if (ax < minx - 0.5) busSeg.push([ax, forkY], [minx, forkY]);
    else if (ax > maxx + 0.5) busSeg.push([ax, forkY], [maxx, forkY]);
    if (maxx - minx > 0.5) busSeg.push([minx, forkY], [maxx, forkY]);
    if (busSeg.length) blood.push({ ids: [], pts: simplify(busSeg) });

    for (const n of cluster) {
      const cx = n.x + n.w / 2;
      parentBusKids.add(n.id);
      blood.push({
        ids: pEB[n.id] || [],
        pts: ensureChildTopStem([[cx, forkY]], n),
      });
    }
  }
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

export function childRoute(
  ax: number,
  ay: number,
  child: SimNode,
  exIds: string[],
  ctx: RoutingContext,
  tagsBottom?: number,
): Point[] {
  if (childBelowAnchor(ay, child)) {
    return pedigreeDrop(ax, ay, child, tagsBottom);
  }

  // Beside or above the union: mandatory bottom stem (past parent tags),
  // then route to the child stem junction, then top stem.
  const stemEnd = unionStemJunctionY(ay, tagsBottom);
  const approach = routeToChildStemJunction(
    ax,
    stemEnd,
    child,
    exIds,
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
  const cxs = kidNodes.map((n) => n.x + n.w / 2);
  const minx = Math.min(ax, ...cxs);
  const maxx = Math.max(ax, ...cxs);
  const minTop = Math.min(...kidNodes.map((n) => n.y));
  const topLimit = childStemJunctionY(minTop);
  const stemEnd = unionStemJunctionY(ay, tagsBottom);
  const { rbands } = ctx;
  // Search from the child stem junction upward, but never above the
  // floor that clears parent tag bottoms.
  for (let lane = topLimit; lane >= stemEnd; lane -= 8) {
    if (!segClear(ax, ay, ax, lane, rbands, ex)) continue;
    if (!segClear(minx, lane, maxx, lane, rbands, ex)) continue;
    let ok = true;
    for (const n of kidNodes) {
      const cx = n.x + n.w / 2;
      // Drop only needs a clear path to the stem junction, not through the card.
      if (!segClear(cx, lane, cx, childStemJunctionY(n.y), rbands, ex)) {
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
  const { rbands } = ctx;
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
    if (!segClear(minx, y, maxx, y, rbands, ex)) continue;
    let ok = true;
    for (const n of members) {
      const cx = n.x + n.w / 2;
      if (!segClear(cx, y, cx, childStemJunctionY(n.y), rbands, ex)) {
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

export interface ComputeEdgeRenderInput {
  nodes: SimNode[];
  edges: Edge[];
  groups: Group[];
  show: ShowToggles;
  packVis: (n: SimNode) => boolean;
  fastRoute: boolean;
}

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
  const { nodes, edges, groups, show, packVis, fastRoute } = input;
  const byid: Record<string, SimNode> = {};
  nodes.forEach((n) => {
    byid[n.id] = n;
  });

  const built = buildRects(nodes, groups, show, packVis);
  const RECTS = [...built.rects];
  const RBANDS = { ...built.rbands };

  const ctx: RoutingContext = { rects: RECTS, rbands: RBANDS, fastRoute };

  const vis = (e: Edge): boolean =>
    !!byid[e.a] &&
    !!byid[e.b] &&
    edgeVisible(e, show) &&
    packVis(byid[e.a]!) &&
    packVis(byid[e.b]!);

  const unions = edges.filter(
    (e) =>
      (e.type === 'marriage' ||
        e.type === 'romance' ||
        e.type === 'divorced') &&
      vis(e),
  );

  const uAnchor: Record<string, { rx: number; ry: number }> = {};
  const mObs: Record<string, string[]> = {};

  unions.forEach((e) => {
    const g0 = unionGeom(byid[e.a]!, byid[e.b]!);
    const key = uKey(e.a, e.b);
    uAnchor[key] = { rx: g0.rx, ry: g0.ry };
    mObs[key] = [];
    const pp = g0.pts.split(' ').map((s) => s.split(',').map(Number) as Point);
    for (let i = 0; i + 1 < pp.length; i++) {
      const M = 4;
      const id = `__m_${i}_${key}`;
      const segRect: Rect = {
        l: Math.min(pp[i]![0], pp[i + 1]![0]) - M,
        t: Math.min(pp[i]![1], pp[i + 1]![1]) - M,
        r: Math.max(pp[i]![0], pp[i + 1]![0]) + M,
        b: Math.max(pp[i]![1], pp[i + 1]![1]) + M,
        id,
      };
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
    const isCouple = ps.length === 2 && uAnchor[uKey(ps[0]!, ps[1]!)];
    let ax: number;
    let ay: number;
    let tagsBottom: number;
    let exBase: string[];
    if (isCouple) {
      const a = uAnchor[uKey(ps[0]!, ps[1]!)]!;
      const p0 = byid[ps[0]!]!;
      const p1 = byid[ps[1]!]!;
      ax = a.rx;
      ay = a.ry + PILL_DROP;
      tagsBottom = Math.max(p0.y + p0.h, p1.y + p1.h);
      exBase = [ps[0]!, ps[1]!].concat(mObs[uKey(ps[0]!, ps[1]!)] || []);
    } else if (ps.length === 2 && byid[ps[0]!] && byid[ps[1]!]) {
      const p0 = byid[ps[0]!]!;
      const p1 = byid[ps[1]!]!;
      ax = (p0.x + p0.w / 2 + p1.x + p1.w / 2) / 2;
      tagsBottom = Math.max(p0.y + p0.h, p1.y + p1.h);
      ay = tagsBottom;
      exBase = [ps[0]!, ps[1]!];
    } else if (ps.length === 1 && byid[ps[0]!]) {
      const p = byid[ps[0]!]!;
      ax = p.x + p.w / 2;
      tagsBottom = p.y + p.h;
      ay = tagsBottom;
      exBase = [ps[0]!];
    } else {
      ps.forEach((pid) => {
        const p = byid[pid];
        if (!p) return;
        kids.forEach((c) => {
          const n = byid[c];
          if (!n) return;
          BLOOD.push({
            ids: pEB[c] || [],
            pts: childRoute(
              p.x + p.w / 2,
              p.y + p.h,
              n,
              [pid, c],
              ctx,
              p.y + p.h,
            ),
          });
        });
      });
      return;
    }
    const kn = kids.map((c) => byid[c]!);
    if (!kn.length) return;
    const belowK = kn.filter((n) => childBelowAnchor(ay, n));
    const sideK = kn.filter((n) => !childBelowAnchor(ay, n));
    /** Cross-household kids get their own drop — no shared horizontal bus. */
    const inHHBelow = belowK.filter((n) => !crossHouseholdChild(n, ps, byid));
    const crossHHBelow = belowK.filter((n) => crossHouseholdChild(n, ps, byid));
    if (inHHBelow.length) {
      drawPedigreeFork(
        ax,
        ay,
        inHHBelow,
        pEB,
        exBase,
        ctx,
        BLOOD,
        parentBusKids,
        tagsBottom,
      );
    }
    crossHHBelow.forEach((n) => {
      parentBusKids.add(n.id);
      BLOOD.push({
        ids: pEB[n.id] || [],
        pts: childRoute(ax, ay, n, exBase.concat([n.id]), ctx, tagsBottom),
      });
    });
    sideK.forEach((n) => {
      BLOOD.push({
        ids: pEB[n.id] || [],
        pts: childRoute(ax, ay, n, exBase.concat([n.id]), ctx, tagsBottom),
      });
    });
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
      drawSiblingFork(ms.map((m) => byid[m]!), ids, ctx).forEach((p) => {
        BLOOD.push(p);
      });
    });
  }

  const unionRenders: UnionRender[] = unions.map((e) => {
    const g0 = unionGeom(byid[e.a]!, byid[e.b]!);
    return {
      edgeId: e.id,
      type: e.type as UnionRender['type'],
      a: e.a,
      b: e.b,
      pts: g0.pts,
      rx: g0.rx,
      ry: g0.ry,
      isUser: isUserE(e),
    };
  });

  const customs: CustomRender[] = edges
    .filter((e) => e.type === 'custom' && vis(e))
    .map((e) => {
      const a = byid[e.a]!;
      const b = byid[e.b]!;
      return {
        edgeId: e.id,
        a: e.a,
        b: e.b,
        pts: orthPath(
          [a.x + a.w / 2, a.y + a.h / 2],
          [b.x + b.w / 2, b.y + b.h / 2],
          [e.a, e.b],
          ctx,
        ),
        isUser: isUserE(e),
      };
    });

  return {
    blood: BLOOD,
    unions: unionRenders,
    customs,
    rects: RECTS,
  };
}
