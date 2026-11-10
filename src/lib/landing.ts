import { TILE } from './constants.ts';
import { toCore } from './autosave.ts';
import { LAYOUT, layoutBases } from './layout.ts';
import { householdChrome, tileSnapOrigin } from './tiles.ts';
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
}): Point {
  const { others, groups, world, block, label, near, keepNear } = opts;
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

/**
 * Where cards joining a household go, so that it grows without moving
 * anything else: the first of `spots` (top-left places for them, best first)
 * that keeps the household's box a tile clear of every other household and
 * its world out of every other world. Else the best such place around the
 * household, a tile from its cards: in free room inside its box first, then
 * growing it down, right, then left or up, as little as it can, nearest the
 * first spot. When there is no room at all where it is, the household goes
 * whole, the newcomers placed as at the first spot, to free room in its world
 * (freeHouseholdSpot), and `shift` says how far its own cards move. Either
 * way, no other card moves. With no free room in its world either, it grows
 * at the first spot after all, and `crowded` says when that runs it into
 * another household or world.
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
}): { at: Point; shift: Point | null; crowded: boolean } {
  const { others, groups, home, label, block, spots } = opts;
  const from = topLeft(block);
  const first = spots[0] ?? from;
  const placed = (at: Point) => block.map((n) => ({ ...n, x: n.x - from.x + at.x, y: n.y - from.y + at.y }));
  const boxOf = (cards: SimNode[]): Box => {
    const c = householdChrome(cards, label)!;
    return { l: c.boxL, t: c.boxT, r: c.boxR, b: c.boxB };
  };
  const world = home[0]!.world;
  const { households, frames } = boardBoxes(others, groups);
  const clear = households.map((b) => grown(b, LAYOUT.householdGap));
  const rest = world === '—' ? undefined : frames.get(world);
  const beside = [...frames].filter(([w]) => w !== world).map(([, f]) => f);
  const elsewhere = beside.map((f) => grown(f, LAYOUT.worldGapY));
  /**
   * How far a box runs into other households and its world into other
   * worlds, then into the tile of room kept round them; worst first.
   */
  const clash = (box: Box): number[] => {
    const frame = rest ? union(rest, frameAround(box)) : frameAround(box);
    return [
      households.reduce((s, c) => s + overlapArea(c, box), 0),
      beside.reduce((s, f) => s + overlapArea(f, frame), 0),
      clear.reduce((s, c) => s + overlapArea(c, box), 0),
      elsewhere.reduce((s, f) => s + overlapArea(f, frame), 0),
    ];
  };
  const homeBox = boxOf(home);
  // A board arranged by hand may have boxes closer than a tile already:
  // growing is fine so long as it runs into nothing more.
  const was = clash(homeBox);
  const fits = (at: Point): Box | null => {
    const box = boxOf([...home, ...placed(at)]);
    return clash(box).every((v, i) => v <= was[i]!) ? box : null;
  };
  for (const at of spots) if (fits(at)) return { at, shift: null, crowded: false };

  const bw = Math.max(...block.map((n) => n.x + n.w)) - from.x;
  const bh = Math.max(...block.map((n) => n.y + n.h)) - from.y;
  const cards = home.map((n) => grown(boxOfRect(n), TILE));
  const start = tileSnapOrigin(homeBox.l - bw - TILE, homeBox.t - bh - TILE);
  let best: { at: Point; score: number[] } | null = null;
  for (let y = start.y; y <= homeBox.b + TILE; y += TILE) {
    for (let x = start.x; x <= homeBox.r + TILE; x += TILE) {
      const at = { x, y };
      if (placed(at).some((n) => cards.some((c) => overlapArea(c, boxOfRect(n)) > 0))) continue;
      const box = fits(at);
      if (!box) continue;
      const score = [
        growthSide(homeBox, box),
        area(box) - area(homeBox),
        Math.abs(x - first.x) + Math.abs(y - first.y),
        y,
        x,
      ];
      if (!best || lessThan(score, best.score)) best = { at, score };
    }
  }
  if (best) return { at: best.at, shift: null, crowded: false };

  // No room where it is: the household goes whole to free room in its world.
  const whole = [...home, ...placed(first)];
  const was0 = topLeft(whole);
  const to = freeHouseholdSpot({ others, groups, world, block: whole, label, near: was0, keepNear: true });
  const shift = { x: to.x - was0.x, y: to.y - was0.y };
  const crowds = (v: number[]) => v[0]! > was[0]! || v[1]! > was[1]!;
  const stay = clash(boxOf(whole));
  const there = clash(boxOf(whole.map((n) => ({ ...n, x: n.x + shift.x, y: n.y + shift.y }))));
  if ((shift.x || shift.y) && !crowds(there) && lessThan(there, stay)) {
    return { at: { x: first.x + shift.x, y: first.y + shift.y }, shift, crowded: false };
  }
  // Nowhere better, or nowhere free: it grows at the first spot after all,
  // rather than go somewhere it runs into others as much.
  return { at: first, shift: null, crowded: crowds(stay) };
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
 * shown. `moved` when the household had to go whole to free room in its
 * world; `crowded` when there was none, and it runs into its neighbours.
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
}): { core: SimNode[]; moved: boolean; crowded: boolean } {
  const { core, laid, worlds, edges, groups, gid, block, spots } = opts;
  const ids = new Set(block.map((n) => n.id));
  const home = laid.filter((n) => n.gid === gid && !ids.has(n.id));
  const from = topLeft(block);
  const placed = new Map<string, Point>();
  let shift: Point | null = null;
  let crowded = false;
  let at = spots[0] ?? from;
  if (home.length) {
    const g = householdGrowth({
      others: laid.filter((n) => n.gid !== gid && !ids.has(n.id)),
      groups,
      home,
      label: groups.find((x) => x.gid === gid) ?? null,
      block,
      spots,
    });
    at = g.at;
    shift = g.shift;
    crowded = g.crowded;
  }
  for (const n of block) placed.set(n.id, { x: n.x - from.x + at.x, y: n.y - from.y + at.y });
  if (shift) for (const n of home) placed.set(n.id, { x: n.x + shift.x, y: n.y + shift.y });
  return { core: pinCards(core, laid, worlds, edges, placed), moved: !!shift, crowded };
}

/**
 * Cards a move sends to household `destGid` (their `patches`) land there as
 * a block, keeping their places among themselves. Joining cards already
 * there, they go in rows under that household where it has room
 * (growHousehold). As a household of their own, they go in free room beside
 * the world's households (freeHouseholdSpot). Either way no other card
 * moves: a hand-arranged board stays as it was. Returns the cards' new
 * core, whether they joined cards already there, and whether that
 * household had to go whole to free room in its world (`moved`) or found
 * none (`crowded`).
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
}): { core: SimNode[]; joined: boolean; moved: boolean; crowded: boolean } {
  const { core, laid, worlds, edges, groups, patches, destGid, newGroup } = opts;
  const ids = new Set(patches.keys());
  const byId = new Map(laid.map((n) => [n.id, n]));
  const moved = [...ids].map((id) => byId.get(id)).filter((n): n is SimNode => !!n);
  const nextCore = core.map((x) => {
    const patch = patches.get(x.id);
    return patch ? toCore({ ...x, ...patch, ox: 0, oy: 0 }) : x;
  });
  const joined = laid.filter((n) => n.gid === destGid && !ids.has(n.id));
  if (!moved.length) return { core: nextCore, joined: joined.length > 0, moved: false, crowded: false };
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
    });
    return { core: r.core, joined: true, moved: r.moved, crowded: r.crowded };
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
  });
  const from = topLeft(moved);
  const placed = new Map(moved.map((n) => [n.id, { x: n.x - from.x + anchor.x, y: n.y - from.y + anchor.y }]));
  return { core: pinCards(nextCore, laid, worlds, edges, placed), joined: false, moved: false, crowded: false };
}
