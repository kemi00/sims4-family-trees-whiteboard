import { TILE } from './constants.ts';
import { LAYOUT } from './layout.ts';
import { LOT_HEAD, LOT_MAX_COLS, LOT_PAD, LOT_PITCH_X, LOT_PITCH_Y, LOT_TILE_H, LOT_TILE_W, lotBoxSize, lotCols } from './lotGrid.ts';
import type { GameLot } from './places.ts';
import { householdChrome } from './tiles.ts';
import type { Group, SimNode } from '../types/whiteboard.ts';

export type LotTile = { lot: GameLot; x: number; y: number; w: number; h: number };

/** A world's Free lots box as drawn, with its tiles. */
export type LotBox = {
  world: string;
  l: number;
  t: number;
  r: number;
  b: number;
  tiles: LotTile[];
};

type Box = { l: number; t: number; r: number; b: number };

const grown = (b: Box, by: number): Box => ({ l: b.l - by, t: b.t - by, r: b.r + by, b: b.b + by });
const union = (a: Box, b: Box): Box => ({
  l: Math.min(a.l, b.l),
  t: Math.min(a.t, b.t),
  r: Math.max(a.r, b.r),
  b: Math.max(a.b, b.b),
});
const overlapArea = (a: Box, b: Box) =>
  Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t));
const area = (b: Box) => (b.r - b.l) * (b.b - b.t);
/** A world's frame around a box in it, as WorldLayer draws it. */
const frameAround = (b: Box): Box => ({
  l: b.l - LAYOUT.worldMargin,
  t: b.t - LAYOUT.worldTitle,
  r: b.r + LAYOUT.worldMargin,
  b: b.b + LAYOUT.worldMargin,
});
const ceilTile = (v: number) => Math.ceil(v / TILE) * TILE;
const floorTile = (v: number) => Math.floor(v / TILE) * TILE;

function lessThan(a: number[], b: number[]): boolean {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i]! < b[i]!;
  return false;
}

/** The tiles of a box at `l, t`, row by row. */
function tilesAt(lots: readonly GameLot[], cols: number, l: number, t: number): LotTile[] {
  return lots.map((lot, i) => ({
    lot,
    x: l + LOT_PAD + (i % cols) * LOT_PITCH_X,
    y: t + LOT_HEAD + Math.floor(i / cols) * LOT_PITCH_Y,
    w: LOT_TILE_W,
    h: LOT_TILE_H,
  }));
}

/**
 * Where each world's Free lots box is drawn. It belongs to its world as the
 * world's last row: a tile under its lowest household, from its left edge,
 * as wide as its households allow. Packing leaves that room on a new board.
 * A board arranged by hand may not have it; then the box takes the free room
 * in or around its world that makes the world grow least and runs into no
 * other world, as a household moving in would. It is placed afresh from the
 * households every time and moves nothing else: a household that grows into
 * it pushes it on, never the other way.
 *
 * `free`: each world's free lots, in the board's world order. `packed`: where
 * packing put the box of a world with no household on the board.
 */
export function placeLotBoxes(opts: {
  laid: readonly SimNode[];
  groups: readonly Group[];
  free: ReadonlyMap<string, readonly GameLot[]>;
  packed?: ReadonlyMap<string, { x: number; y: number }>;
}): Map<string, LotBox> {
  const { laid, groups, free, packed } = opts;
  const label = new Map(groups.map((g) => [g.gid, g]));
  const byGid = new Map<string, SimNode[]>();
  for (const n of laid) {
    const list = byGid.get(n.gid);
    if (list) list.push(n);
    else byGid.set(n.gid, [n]);
  }
  const households: Box[] = [];
  /** Each world's households' extent, its cards' width, and its frame. */
  const own = new Map<string, Box>();
  const cards = new Map<string, { l: number; r: number }>();
  const frames = new Map<string, Box>();
  for (const n of laid) {
    if (!n.world || n.world === '—') continue;
    const c = cards.get(n.world);
    cards.set(n.world, c ? { l: Math.min(c.l, n.x), r: Math.max(c.r, n.x + n.w) } : { l: n.x, r: n.x + n.w });
  }
  for (const [gid, mem] of byGid) {
    const c = householdChrome(mem, label.get(gid));
    if (!c) continue;
    const box = { l: c.boxL, t: c.boxT, r: c.boxR, b: c.boxB };
    households.push(box);
    const world = mem[0]!.world;
    if (!world || world === '—') continue;
    own.set(world, own.has(world) ? union(own.get(world)!, box) : box);
  }
  for (const [world, b] of own) frames.set(world, frameAround(b));

  const out = new Map<string, LotBox>();
  const placed: Box[] = [];
  for (const [world, lots] of free) {
    if (!lots.length) continue;
    const mine = own.get(world);
    const start = mine ?? (packed?.get(world) ? { l: packed.get(world)!.x, t: packed.get(world)!.y, r: 0, b: 0 } : null);
    if (!start) continue;
    const span = cards.get(world);
    const cols = lotCols(lots.length, span ? span.r - span.l : 0);
    const want = mine ? { x: floorTile(mine.l), y: ceilTile(mine.b) + TILE } : { x: start.l, y: start.t };
    const others = [...frames].filter(([w2]) => w2 !== world).map(([, f]) => grown(f, LAYOUT.worldGapY));
    const clear = [...households.map((b) => grown(b, TILE)), ...placed.map((b) => grown(b, TILE))];
    const frameOf = (b: Box) => (mine ? union(frames.get(world)!, frameAround(b)) : frameAround(b));
    /** What a box there runs into: another world's frame, and households or boxes. */
    const cost = (b: Box, near: Box[] = others, crowd: Box[] = clear) => {
      const f = frameOf(b);
      return [near.reduce((s, o) => s + overlapArea(o, f), 0), crowd.reduce((s, o) => s + overlapArea(o, b), 0)];
    };
    const sized = (c: number) => {
      const { w, h } = lotBoxSize(lots.length, c);
      return { cols: c, w, h };
    };
    let shape = sized(cols);
    let at: Box = { l: want.x, t: want.y, r: want.x + shape.w, b: want.y + shape.h };
    const first = cost(at);
    if (first[0] || first[1]) {
      // No room in its usual place, as on a board arranged by hand: in the
      // world's frame or beside it, in its usual shape or narrower or wider.
      // Never over a household if anywhere else will do; then into no other
      // world; then the least growth, down before right before left or up,
      // nearest its usual shape and place.
      const base = mine ? frames.get(world)! : null;
      const shapes = [...new Set([cols, ...Array.from({ length: LOT_MAX_COLS - 1 }, (_, i) => i + 2)])]
        .filter((c) => c <= lots.length)
        .map(sized);
      let score: number[] | null = null;
      for (const sh of shapes) {
        const area0 = base ?? frameAround({ l: want.x, t: want.y, r: want.x + sh.w, b: want.y + sh.h });
        const region = { l: area0.l - sh.w - TILE, t: area0.t - TILE, r: area0.r + sh.w + TILE, b: area0.b + sh.h + 3 * TILE };
        const near = others.filter((o) => overlapArea(o, grown(region, LAYOUT.worldMargin + LAYOUT.worldGapY)) > 0);
        const crowd = clear.filter((o) => overlapArea(o, region) > 0);
        for (let y = floorTile(area0.t); y <= area0.b + sh.h + 2 * TILE; y += TILE) {
          for (let x = floorTile(area0.l - sh.w); x <= area0.r + TILE; x += TILE) {
            const b = { l: x, t: y, r: x + sh.w, b: y + sh.h };
            const [hits, crowded] = cost(b, near, crowd);
            const f = frameOf(b);
            const side = !base ? 0 : f.l < base.l || f.t < base.t ? 3 : f.r > base.r ? 2 : f.b > base.b ? 1 : 0;
            const growth = base ? area(f) - area(base) : 0;
            const s = [crowded! > 0 ? 1 : 0, hits!, crowded!, side, growth, Math.abs(sh.cols - cols), Math.abs(y - want.y) + Math.abs(x - want.x)];
            if (!score || lessThan(s, score)) {
              score = s;
              at = b;
              shape = sh;
            }
          }
        }
      }
    }
    placed.push(at);
    out.set(world, { world, ...at, tiles: tilesAt(lots, shape.cols, at.l, at.t) });
    // The world's frame now takes in its box, for the worlds placed after it.
    frames.set(world, frameOf(at));
  }
  return out;
}

/** A world's frame with its Free lots box in it, or the box's alone. */
export function frameWithLots(frame: Box | null, box: LotBox | undefined): Box | null {
  if (!box) return frame;
  const f = frameAround(box);
  return frame ? union(frame, f) : f;
}
