import { HH_TAG_BAND, TILE } from './constants.ts';
import { toCore } from './autosave.ts';
import { LAYOUT, layoutBases } from './layout.ts';
import { householdChrome, tileSnapOrigin } from './tiles.ts';
import type { Edge, Group, SimNode, World } from '../types/whiteboard.ts';

export type Box = { l: number; t: number; r: number; b: number };
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
 * put it. With `keepNear`, of places that grow the world alike, the one
 * nearest `near` (a household moving within its world, from there).
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
  keepNear?: boolean;
  /** Room taken by other things on the board (its Free lots boxes): a newcomer goes around it. */
  obstacles?: readonly Box[];
}): Point {
  const { others, groups, world, block, label, near, keepNear, obstacles = [] } = opts;
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
  const beside = [...frames].filter(([w]) => w !== world).map(([, f]) => f);
  const elsewhere = beside.map((f) => grown(f, LAYOUT.worldGapY));
  const clear = [...households, ...obstacles].map((b) => grown(b, LAYOUT.householdGap));
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
      // Running into another world is worse than into the room around it.
      const hits = beside.reduce((s, f) => s + overlapArea(f, frame), 0);
      const intrudes = elsewhere.reduce((s, f) => s + overlapArea(f, frame), 0);
      const growth = own ? area(frame) - area(own) : 0;
      const away = Math.abs(x - near.x) + Math.abs(y - near.y);
      const score = own
        ? [hits, intrudes, growthSide(own, frame), growth, keepNear ? away : 0, y, x]
        : [hits, intrudes, away, y, x];
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

type Rect = { x: number; y: number; w: number; h: number };
const boxOfRect = (n: Rect): Box => ({ l: n.x, t: n.y, r: n.x + n.w, b: n.y + n.h });
const topLeft = (cards: Rect[]): Point => ({
  x: Math.min(...cards.map((n) => n.x)),
  y: Math.min(...cards.map((n) => n.y)),
});

/** How far from the family's spot a new card may land, in tiles. */
const NEAR_TILES = 40;

/**
 * Where cards joining a household go. Nothing already on the board moves
 * for them: the user arranged it. Of the places no card is (a tile clear of
 * every card, and off the household's own name and buttons), best first:
 * - outside other households' boxes, so a baby doesn't seem to live next door;
 * - the family's spot, `spots` in order: beside a partner, beside full siblings;
 * - free room inside the household's own box, as the user fills it by hand
 *   (Tybalt Capp's planned children beside him, not below his grown ones);
 * - on screen (`view`, in board units);
 * - growing the box down, then right, then left or up, as little as it can;
 * - nearest the first spot.
 * The box may grow over its neighbours': the user rearranges from there.
 * `outOfView` when the place is off screen, so the view can glide to it;
 * `crowded` when nothing near was free at all and they sit on other cards;
 * `atSpot` when they took the family's first spot.
 */
export function householdGrowth(opts: {
  /** Every card outside the household and the newcomers, laid out. */
  others: SimNode[];
  groups: Group[];
  /** The household's cards, laid out. */
  home: SimNode[];
  /** The household's label, for the width of its name tag. */
  label?: Group | null;
  /** The cards joining it, with their sizes: they keep their arrangement. */
  block: SimNode[];
  /** Top-left places for the newcomers to try first, best first. */
  spots: Point[];
  /** The part of the board on screen, in board units; null when unknown. */
  view?: Box | null;
  /** Room taken by other things on the board (its Free lots boxes): newcomers go around it. */
  obstacles?: readonly Box[];
}): { at: Point; outOfView: boolean; crowded: boolean; atSpot: boolean } {
  const { others, groups, home, block, spots, view, obstacles = [] } = opts;
  const from = topLeft(block);
  const first = spots[0] ?? from;
  const rel = block.map((n) => ({ dx: n.x - from.x, dy: n.y - from.y, w: n.w, h: n.h }));
  const bw = Math.max(...rel.map((r) => r.dx + r.w));
  const bh = Math.max(...rel.map((r) => r.dy + r.h));
  const reach = NEAR_TILES * TILE;
  const region: Box = { l: first.x - reach - bw, t: first.y - reach - bh, r: first.x + reach + 2 * bw, b: first.y + reach + 2 * bh };
  // Cards keep a tile of air between them, as the layout leaves.
  const cards = [...[...others, ...home].map((n) => grown(boxOfRect(n), TILE)), ...obstacles.map((o) => grown(o, TILE))].filter(
    (c) => overlapArea(c, region) > 0,
  );
  const { households } = boardBoxes(others, groups);
  const nextDoor = households.filter((b) => overlapArea(b, region) > 0);
  const boxesAt = (at: Point) => rel.map((r) => ({ l: at.x + r.dx, t: at.y + r.dy, r: at.x + r.dx + r.w, b: at.y + r.dy + r.h }));
  const free = (at: Point) => boxesAt(at).every((b) => cards.every((c) => overlapArea(c, b) === 0));
  const seen = (at: Point) => !view || boxesAt(at).every((b) => b.l >= view.l && b.t >= view.t && b.r <= view.r && b.b <= view.b);
  const apart = (at: Point) => boxesAt(at).every((b) => nextDoor.every((h) => overlapArea(h, b) === 0));
  // The household's box as it stands. Its name and buttons sit in the band
  // over its first row: a card there or higher would cover them, or push
  // them up a row, so none goes above the first row.
  const chrome = home.length ? householdChrome(home, opts.label) : null;
  const own: Box | null = chrome ? { l: chrome.boxL, t: chrome.boxT, r: chrome.boxR, b: chrome.boxB } : null;
  const firstRow = own ? own.t + HH_TAG_BAND : -Infinity;
  const inside = (at: Point) =>
    !!own && boxesAt(at).every((b) => b.l >= own.l && b.t >= firstRow && b.r <= own.r && b.b <= own.b);
  const above = (at: Point) => boxesAt(at).some((b) => b.t < firstRow);
  const score = (at: Point, spot: number) => {
    const dx = at.x - first.x;
    const dy = at.y - first.y;
    const grew = own ? boxesAt(at).reduce(union, own) : null;
    const side = !own || !grew ? 0 : growthSide(own, grew);
    return [
      apart(at) ? 0 : 1,
      spot >= 0 ? spot : spots.length,
      inside(at) ? 0 : 1,
      seen(at) ? 0 : 1,
      side,
      own && grew ? area(grew) - area(own) : 0,
      Math.hypot(dx, dy),
      // Equally near: below before above, right before left.
      dy < 0 ? 1 : 0,
      dx < 0 ? 1 : 0,
    ];
  };
  let best: { at: Point; score: number[]; spot: number } | null = null;
  const consider = (at: Point, spot: number) => {
    if (!free(at) || above(at)) return;
    const sc = score(at, spot);
    if (!best || lessThan(sc, best.score)) best = { at, score: sc, spot };
  };
  spots.forEach((at, i) => consider(at, i));
  const start = tileSnapOrigin(first.x - reach, first.y - reach);
  for (let y = start.y; y <= first.y + reach; y += TILE) {
    for (let x = start.x; x <= first.x + reach; x += TILE) consider({ x, y }, -1);
  }
  const found = best as { at: Point; score: number[]; spot: number } | null;
  if (!found) return { at: first, outOfView: !seen(first), crowded: true, atSpot: true };
  return { at: found.at, outOfView: !seen(found.at), crowded: false, atSpot: found.spot === 0 };
}

/**
 * The board's core with every card pinned where it is shown (`laid`), and
 * those in `placed` put there instead: an edit moves only the cards it is
 * about. Cards not laid out yet and not placed keep their offsets.
 */
export function pinCards(
  core: SimNode[],
  laid: SimNode[],
  worlds: World[],
  edges: Edge[],
  placed: ReadonlyMap<string, Point>,
): SimNode[] {
  const bases = layoutBases(core, worlds, edges);
  const byId = new Map(laid.map((n) => [n.id, n]));
  return core.map((node) => {
    const base = bases.get(node.id);
    const to = placed.get(node.id) ?? byId.get(node.id);
    if (!base || !to) return node;
    const ox = to.x - base.x;
    const oy = to.y - base.y;
    if (ox === (node.ox ?? 0) && oy === (node.oy ?? 0)) return node;
    return { ...node, ox, oy };
  });
}

/**
 * Cards joining household `gid` (`block`, already in `core` as its members,
 * with their sizes and places among themselves) land where householdGrowth
 * finds room, trying `spots` first; every other card stays where it is
 * shown. `at` is their top-left; `outOfView` when it is off screen,
 * `crowded` when no free place was near, `atSpot` when they took the first
 * spot.
 */
export function growHousehold(opts: {
  core: SimNode[];
  /** The board laid out as it is shown now. */
  laid: SimNode[];
  worlds: World[];
  edges: Edge[];
  groups: Group[];
  gid: string;
  block: SimNode[];
  spots: Point[];
  view?: Box | null;
  obstacles?: readonly Box[];
}): { core: SimNode[]; at: Point; box: Box; outOfView: boolean; crowded: boolean; atSpot: boolean } {
  const { core, laid, worlds, edges, groups, gid, block, spots, view, obstacles } = opts;
  const ids = new Set(block.map((n) => n.id));
  const home = laid.filter((n) => n.gid === gid && !ids.has(n.id));
  const from = topLeft(block);
  const placed = new Map<string, Point>();
  const g = householdGrowth({
    others: laid.filter((n) => n.gid !== gid && !ids.has(n.id)),
    groups,
    home,
    label: groups.find((x) => x.gid === gid) ?? null,
    block,
    spots: spots.length ? spots : [from],
    view,
    ...(obstacles ? { obstacles } : {}),
  });
  for (const n of block) placed.set(n.id, { x: n.x - from.x + g.at.x, y: n.y - from.y + g.at.y });
  const box = {
    l: g.at.x,
    t: g.at.y,
    r: g.at.x + Math.max(...block.map((n) => n.x - from.x + n.w)),
    b: g.at.y + Math.max(...block.map((n) => n.y - from.y + n.h)),
  };
  return { core: pinCards(core, laid, worlds, edges, placed), box, ...g };
}

/**
 * Cards a move sends to household `destGid` (their `patches`) land there as
 * a block, keeping their places among themselves. Joining cards already
 * there, they go in rows under that household where it has room
 * (growHousehold). As a household of their own, they go in free room beside
 * the world's households (freeHouseholdSpot). Either way no other card
 * moves: a hand-arranged board stays as it was. Returns the cards' new
 * core, whether they joined cards already there, and for those, where they
 * went (see growHousehold).
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
  view?: Box | null;
  /** Room taken by other things on the board (its Free lots boxes): the cards land around it. */
  obstacles?: readonly Box[];
}): { core: SimNode[]; joined: boolean; outOfView: boolean; crowded: boolean; box: Box | null } {
  const { core, laid, worlds, edges, groups, patches, destGid, newGroup, view, obstacles } = opts;
  const ids = new Set(patches.keys());
  const byId = new Map(laid.map((n) => [n.id, n]));
  const moved = [...ids].map((id) => byId.get(id)).filter((n): n is SimNode => !!n);
  const nextCore = core.map((x) => {
    const patch = patches.get(x.id);
    return patch ? toCore({ ...x, ...patch, ox: 0, oy: 0 }) : x;
  });
  const joined = laid.filter((n) => n.gid === destGid && !ids.has(n.id));
  if (!moved.length) return { core: nextCore, joined: joined.length > 0, outOfView: false, crowded: false, box: null };
  const allGroups = newGroup ? [...groups, newGroup] : groups;
  if (joined.length) {
    const under = tileSnapOrigin(
      Math.min(...joined.map((n) => n.x)),
      Math.max(...joined.map((n) => n.y + n.h)) + LAYOUT.gapYExtra,
    );
    const r = growHousehold({
      core: nextCore,
      laid,
      worlds,
      edges,
      groups: allGroups,
      gid: destGid,
      block: moved.map((n) => ({ ...n, gid: destGid })),
      spots: [under],
      view,
      ...(obstacles ? { obstacles } : {}),
    });
    return { core: r.core, joined: true, outOfView: r.outOfView, crowded: r.crowded, box: r.box };
  }
  const bases = layoutBases(nextCore, worlds, edges);
  const own = [...ids].map((id) => bases.get(id)).filter((b) => b !== undefined);
  const near = { x: Math.min(...own.map((b) => b!.x)), y: Math.min(...own.map((b) => b!.y)) };
  const world = patches.get(moved[0]!.id)?.world ?? moved[0]!.world;
  const anchor = freeHouseholdSpot({
    others: laid.filter((n) => !ids.has(n.id)),
    groups: allGroups,
    world,
    block: moved,
    label: allGroups.find((g) => g.gid === destGid) ?? null,
    near,
    ...(obstacles ? { obstacles } : {}),
  });
  const from = topLeft(moved);
  const placed = new Map(moved.map((n) => [n.id, { x: n.x - from.x + anchor.x, y: n.y - from.y + anchor.y }]));
  return { core: pinCards(nextCore, laid, worlds, edges, placed), joined: false, outOfView: false, crowded: false, box: null };
}
