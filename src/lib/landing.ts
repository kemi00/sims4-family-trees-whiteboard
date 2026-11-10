import { TILE } from './constants.ts';
import { toCore } from './autosave.ts';
import { coreOffsetsAfterImportSeparation } from './geometry.ts';
import { LAYOUT, computeLayout, layoutBases } from './layout.ts';
import { householdChrome, snapNodesToTiles, tileSnapOrigin } from './tiles.ts';
import type { Edge, Group, SimNode, World } from '../types/whiteboard.ts';

type Box = { l: number; t: number; r: number; b: number };
type Point = { x: number; y: number };

const overlapArea = (a: Box, b: Box) =>
  Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t));
const grown = (b: Box, by: number): Box => ({ l: b.l - by, t: b.t - by, r: b.r + by, b: b.b + by });
const union = (a: Box, b: Box): Box => ({
  l: Math.min(a.l, b.l),
  t: Math.min(a.t, b.t),
  r: Math.max(a.r, b.r),
  b: Math.max(a.b, b.b),
});
const area = (b: Box) => (b.r - b.l) * (b.b - b.t);
/** A world's frame around a household box in it, as worldFrames draws it. */
const frameAround = (b: Box): Box => ({
  l: b.l - LAYOUT.worldMargin,
  t: b.t - LAYOUT.worldTitle,
  r: b.r + LAYOUT.worldMargin,
  b: b.b + LAYOUT.worldMargin,
});

/** Every household's drawn box, and each world's frame around its households. */
function boardBoxes(laid: SimNode[], groups: Group[]): { households: Box[]; frames: Map<string, Box> } {
  const byGid = new Map<string, SimNode[]>();
  for (const n of laid) byGid.set(n.gid, [...(byGid.get(n.gid) ?? []), n]);
  const label = new Map(groups.map((g) => [g.gid, g]));
  const households: Box[] = [];
  const frames = new Map<string, Box>();
  for (const [gid, mem] of byGid) {
    const c = householdChrome(mem, label.get(gid));
    if (!c) continue;
    const box = { l: c.boxL, t: c.boxT, r: c.boxR, b: c.boxB };
    households.push(box);
    const world = mem[0]!.world;
    if (world === '—') continue;
    const f = frames.get(world);
    frames.set(world, f ? union(f, frameAround(box)) : frameAround(box));
  }
  return { households, frames };
}

/**
 * Where a household new to `world` lands: the top-left of its cards, which
 * keep their own arrangement. It goes in free room beside the world's other
 * households, as the board shows them: clear of every household by a tile,
 * and into no other world. Inside the world's frame if there is room, else
 * growing it down, then right, then left or up, as little as it can; the
 * first such place in reading order. Nothing else has to move for it. With
 * no room at all, the place that overlaps other worlds least. A world with
 * nothing on the board yet is searched around `near`, where the layout would
 * put it.
 */
export function freeHouseholdSpot(opts: {
  /** Every other card on the board, laid out. */
  others: SimNode[];
  groups: Group[];
  world: string;
  /** The household's cards, laid out where they were. */
  block: SimNode[];
  /** The household's own label, for the width of its name tag. */
  label?: Group | null;
  near: Point;
}): Point {
  const { others, groups, world, block, label, near } = opts;
  const x0 = Math.min(...block.map((n) => n.x));
  const y0 = Math.min(...block.map((n) => n.y));
  const boxAt = (at: Point): Box => {
    const c = householdChrome(
      block.map((n) => ({ ...n, x: n.x - x0 + at.x, y: n.y - y0 + at.y })),
      label,
    )!;
    return { l: c.boxL, t: c.boxT, r: c.boxR, b: c.boxB };
  };
  const { households, frames } = boardBoxes(others, groups);
  const own = frames.get(world);
  const elsewhere = [...frames].filter(([w]) => w !== world).map(([, f]) => grown(f, LAYOUT.worldGapY));
  const clear = households.map((b) => grown(b, LAYOUT.householdGap));
  const probe = boxAt(tileSnapOrigin(near.x, near.y));
  const bw = probe.r - probe.l;
  const bh = probe.b - probe.t;
  // Around the frame, by the household's size and a tile, so it can sit
  // beside it on any side; around `near` when the world has no frame yet.
  const area0 = own ?? frameAround(probe);
  const reach = own ? TILE : 20 * TILE;
  const from = tileSnapOrigin(area0.l - bw - reach, area0.t - bh - reach);
  const to = { x: area0.r + reach, y: area0.b + bh + reach };
  let best: { at: Point; score: number[] } | null = null;
  for (let y = from.y; y <= to.y; y += TILE) {
    for (let x = from.x; x <= to.x; x += TILE) {
      const at = { x, y };
      const box = boxAt(at);
      if (clear.some((c) => overlapArea(c, box) > 0)) continue;
      const frame = own ? union(own, frameAround(box)) : frameAround(box);
      const intrudes = elsewhere.reduce((s, f) => s + overlapArea(f, frame), 0);
      const growth = own ? area(frame) - area(own) : 0;
      const score = own
        ? [intrudes, growthSide(own, frame), growth, y, x]
        : [intrudes, Math.abs(x - near.x) + Math.abs(y - near.y), y, x];
      if (!best || lessThan(score, best.score)) best = { at, score };
    }
  }
  return best?.at ?? tileSnapOrigin(near.x, near.y);
}

/**
 * How a frame grows, best first: not at all, only down (its column keeps
 * its width), right and down, then left or up into the room between worlds.
 */
function growthSide(was: Box, now: Box): number {
  if (now.l < was.l || now.t < was.t) return 3;
  if (now.r > was.r) return 2;
  return now.b > was.b ? 1 : 0;
}

function lessThan(a: number[], b: number[]): boolean {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i]! < b[i]!;
  return false;
}

/**
 * Cards a move sends to household `destGid` (their `patches`) land there as
 * a block, keeping their places among themselves. Joining cards already
 * there, they go in rows under that household, which may push what sits
 * under it down. As a household of their own, they go in free room beside
 * the world's households (freeHouseholdSpot), and no other card moves:
 * a hand-arranged board stays as it was. Returns the cards' new core, and
 * whether they joined cards already there.
 */
export function landMovedCards(opts: {
  core: SimNode[];
  /** The board laid out as it is shown now. */
  laid: SimNode[];
  worlds: World[];
  edges: Edge[];
  groups: Group[];
  patches: Map<string, Partial<SimNode>>;
  destGid: string;
  newGroup: Group | null;
  snap: boolean;
}): { core: SimNode[]; joined: boolean } {
  const { core, laid, worlds, edges, groups, patches, destGid, newGroup, snap } = opts;
  const ids = new Set(patches.keys());
  const byId = new Map(laid.map((n) => [n.id, n]));
  const moved = [...ids].map((id) => byId.get(id)).filter((n): n is SimNode => !!n);
  const nextCore = core.map((x) => {
    const patch = patches.get(x.id);
    return patch ? toCore({ ...x, ...patch, ox: 0, oy: 0 }) : x;
  });
  const joined = laid.filter((n) => n.gid === destGid && !ids.has(n.id));
  if (!moved.length) return { core: nextCore, joined: joined.length > 0 };
  const allGroups = newGroup ? [...groups, newGroup] : groups;
  const bases = layoutBases(nextCore, worlds, edges);
  const x0 = Math.min(...moved.map((n) => n.x));
  const y0 = Math.min(...moved.map((n) => n.y));
  let anchor: Point;
  if (joined.length) {
    anchor = tileSnapOrigin(
      Math.min(...joined.map((n) => n.x)),
      Math.max(...joined.map((n) => n.y + n.h)) + LAYOUT.gapYExtra,
    );
  } else {
    const own = [...ids].map((id) => bases.get(id)).filter((b) => b !== undefined);
    const near = { x: Math.min(...own.map((b) => b!.x)), y: Math.min(...own.map((b) => b!.y)) };
    const world = patches.get(moved[0]!.id)?.world ?? moved[0]!.world;
    anchor = freeHouseholdSpot({
      others: laid.filter((n) => !ids.has(n.id)),
      groups: allGroups,
      world,
      block: moved,
      label: allGroups.find((g) => g.gid === destGid) ?? null,
      near,
    });
  }
  const pinned = nextCore.map((node) => {
    const base = bases.get(node.id);
    const vis = byId.get(node.id);
    if (!vis || !base) return node;
    if (ids.has(node.id)) {
      return { ...node, ox: vis.x - x0 + anchor.x - base.x, oy: vis.y - y0 + anchor.y - base.y };
    }
    const ox = vis.x - base.x;
    const oy = vis.y - base.y;
    if (ox === (node.ox ?? 0) && oy === (node.oy ?? 0)) return node;
    return { ...node, ox, oy };
  });
  // In free room, nothing overlaps: every other card stays exactly where it is.
  if (!joined.length) return { core: pinned, joined: false };
  const next = computeLayout(pinned, worlds, edges);
  return {
    core: coreOffsetsAfterImportSeparation(pinned, snap ? snapNodesToTiles(next) : next, allGroups, laid),
    joined: true,
  };
}
