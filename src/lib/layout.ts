import {
  AGES_H,
  CARD_H,
  CARD_MIN_W,
  HH_TAG_BAND,
  HH_TAG_INSET,
  LAYOUT_EPOCH,
  LEGACY_NOT_IN_WORLD,
  NOT_IN_WORLD,
  TILE,
  WORLD_TITLE_BAND,
} from './constants.ts';
import { householdTagWidth, tileSnapOrigin } from './tiles.ts';
import { isUnhousedGid } from './unhoused.ts';
import { worldCounts, worldTagReserve } from './worldTag.ts';
import type { Edge, SimNode, World } from '../types/whiteboard.ts';

/**
 * Tile-native packing. Couple aisle, generation pitch, and household
 * gutters are one tile so snap cannot collapse them to flush cards.
 * `hhHeader` must stay equal to `HH_TAG_BAND` (name + Age up in one tile).
 */
export const LAYOUT = {
  gapX: TILE,
  partnerGap: TILE,
  gapYExtra: TILE,
  hhPad: 0,
  hhHeader: HH_TAG_BAND,
  hhGap: TILE,
  /** Side-by-side household slots — one tile of air between dashed boxes. */
  householdGap: TILE,
  hhPerRow: 3,
  /** Household columns inside the catch-all Other world container. */
  otherHhCols: 7,
  worldRowMaxW: 1600,
  worldCols: 4,
  worldGapX: TILE,
  worldGapY: TILE,
  originX: 48,
  originY: 96,
  worldTitle: WORLD_TITLE_BAND,
  worldMargin: 20,
} as const;

export function rowPitch(): number {
  return CARD_H + LAYOUT.gapYExtra;
}

export function cardDetailLine(n: SimNode): string {
  return [n.breed, n.oplay]
    .map((s) => String(s || '').trim())
    .filter((s) => s && s !== '-')
    .join(' · ');
}

export function measureCard(_n?: SimNode): { w: number; h: number } {
  return { w: CARD_MIN_W, h: CARD_H };
}

type SpawnRect = { x: number; y: number; w: number; h: number };

function rectsOverlap(a: SpawnRect, b: SpawnRect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/**
 * Where a new infant card should land. First child sits on the tile row
 * immediately under the parents; later children share that row, one tile
 * to the right of the rightmost sibling. Nudges down by a tile if the
 * slot is already occupied.
 */
export function spawnChildOrigin(
  parentY: number,
  pillX: number,
  cardW: number,
  siblings: SpawnRect[],
  occupied: SpawnRect[],
  snap = true,
): { x: number; y: number } {
  const size = { w: cardW, h: CARD_H };
  let x = pillX - cardW / 2;
  let y = parentY + CARD_H;
  if (siblings.length) {
    x = Math.max(...siblings.map((s) => s.x + s.w)) + TILE;
    y = Math.min(...siblings.map((s) => s.y));
  }
  for (let i = 0; i < occupied.length + 1; i++) {
    const next = { x, y, ...size };
    if (!occupied.some((o) => rectsOverlap(next, o))) break;
    y += TILE;
  }
  return snap ? tileSnapOrigin(x, y) : { x, y };
}

type PlacedCard = { id: string; x: number; y: number; w: number; h: number };

type HHGraph = {
  partner: Map<string, string>;
  parents: Map<string, Set<string>>;
};

function ageRank(age: string): number {
  const i = AGES_H.indexOf(age as (typeof AGES_H)[number]);
  return i >= 0 ? i : 4;
}

/**
 * Edge lookups for one layout pass, so per-household work touches only the
 * household's own links instead of rescanning every edge on the board.
 */
type LinkIndex = {
  edges: Edge[];
  /** Positions of edges by `a`, ascending. */
  fromA: Map<string, number[]>;
  /** Positions of parent edges by child `b`, ascending. */
  parentTo: Map<string, number[]>;
  /** Parent edges by parent `a`. */
  parentFrom: Map<string, Edge[]>;
};

const linkIndexes = new WeakMap<Edge[], LinkIndex>();

function buildLinkIndex(edges: Edge[]): LinkIndex {
  const fromA = new Map<string, number[]>();
  const parentTo = new Map<string, number[]>();
  const parentFrom = new Map<string, Edge[]>();
  const push = <T>(m: Map<string, T[]>, k: string, v: T) => {
    const list = m.get(k);
    if (list) list.push(v);
    else m.set(k, [v]);
  };
  edges.forEach((e, i) => {
    push(fromA, e.a, i);
    if (e.type !== 'parent') return;
    push(parentTo, e.b, i);
    push(parentFrom, e.a, e);
  });
  const index = { edges, fromA, parentTo, parentFrom };
  linkIndexes.set(edges, index);
  return index;
}

/** computeLayoutBases rebuilds this per pass, so in-place edge edits never go stale. */
function linkIndex(edges: Edge[]): LinkIndex {
  return linkIndexes.get(edges) ?? buildLinkIndex(edges);
}

/** Edges at the positions `by` lists for `ids`, in original board order. */
function edgesAt(
  index: LinkIndex,
  by: Map<string, number[]>,
  ids: Set<string>,
): Edge[] {
  const at: number[] = [];
  for (const id of ids) {
    const list = by.get(id);
    if (list) at.push(...list);
  }
  at.sort((a, b) => a - b);
  return at.map((i) => index.edges[i]!);
}

/** Parent links into these sims, including parents in other households. */
function parentEdgesInto(edges: Edge[], ids: Set<string>): Edge[] {
  const index = linkIndex(edges);
  return edgesAt(index, index.parentTo, ids);
}

function buildHHGraph(mem: SimNode[], edges: Edge[]): HHGraph {
  const ids = new Set(mem.map((n) => n.id));
  const byId = new Map(mem.map((n) => [n.id, n]));
  const partner = new Map<string, string>();
  const parents = new Map<string, Set<string>>();
  const index = linkIndex(edges);
  const inner = edgesAt(index, index.fromA, ids).filter((e) => ids.has(e.b));
  const parentsKidHere = (p: string, except?: string) =>
    (index.parentFrom.get(p) ?? []).some(
      (x) => x.b !== except && ids.has(x.b),
    );

  for (const e of inner) {
    if (e.type === 'marriage' || e.type === 'romance' || e.type === 'divorced') {
      partner.set(e.a, e.b);
      partner.set(e.b, e.a);
    }
  }

  for (const e of inner) {
    if (e.type !== 'parent') continue;

    const bParentsKidsInHh = parentsKidHere(e.b);
    const aParentsThoseKids = parentsKidHere(e.a, e.b);
    const na = byId.get(e.a)!;
    const nb = byId.get(e.b)!;
    const ageGap = Math.abs(ageRank(na.age) - ageRank(nb.age));

    /** Spouse mislabeled as parent (e.g. Adekoya→Jawara while Jawara parents the kids). */
    if (
      bParentsKidsInHh &&
      !aParentsThoseKids &&
      ageGap >= 2 &&
      ageRank(na.age) <= ageRank(nb.age)
    ) {
      partner.set(e.a, e.b);
      partner.set(e.b, e.a);
      continue;
    }

    if (!parents.has(e.b)) parents.set(e.b, new Set());
    parents.get(e.b)!.add(e.a);
  }
  return { partner, parents };
}

function householdMinGen(hhMem: SimNode[], edges: Edge[]): number {
  const g = buildHHGraph(hhMem, edges);
  const gen = generationRows(hhMem, g.parents);
  alignPartnerGenerationsFromGraph(hhMem, gen, g.partner);
  propagateGenerationsFromParents(hhMem, gen, g.parents);
  return Math.min(...hhMem.map((n) => gen.get(n.id) ?? 0));
}

/** Spouses share a generation row — use the higher of the two assigned rows. */
function alignPartnerGenerationsFromGraph(
  mem: SimNode[],
  gen: Map<string, number>,
  partner: Map<string, string>,
): void {
  const ids = new Set(mem.map((n) => n.id));
  let changed = true;
  while (changed) {
    changed = false;
    for (const n of mem) {
      const p = partner.get(n.id);
      if (!p || !ids.has(p)) continue;
      const g = Math.max(gen.get(n.id) ?? 0, gen.get(p) ?? 0);
      if ((gen.get(n.id) ?? 0) !== g) {
        gen.set(n.id, g);
        changed = true;
      }
      if ((gen.get(p) ?? 0) !== g) {
        gen.set(p, g);
        changed = true;
      }
    }
  }
}

/**
 * Strongly connected component per sim over in-block parent links (Tarjan).
 * Sims sharing a component sit on a parent cycle — bad save data, or a link
 * drawn the wrong way — so no generation order exists between them.
 */
function parentCycleGroups(
  mem: SimNode[],
  parents: Map<string, Set<string>>,
): Map<string, number> {
  const ids = new Set(mem.map((n) => n.id));
  const order = new Map<string, number>();
  const low = new Map<string, number>();
  const group = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  let groups = 0;
  const visit = (id: string) => {
    order.set(id, order.size);
    low.set(id, order.get(id)!);
    stack.push(id);
    onStack.add(id);
    for (const p of parents.get(id) ?? []) {
      if (!ids.has(p)) continue;
      if (!order.has(p)) {
        visit(p);
        low.set(id, Math.min(low.get(id)!, low.get(p)!));
      } else if (onStack.has(p)) {
        low.set(id, Math.min(low.get(id)!, order.get(p)!));
      }
    }
    if (low.get(id) !== order.get(id)) return;
    let x: string;
    do {
      x = stack.pop()!;
      onStack.delete(x);
      group.set(x, groups);
    } while (x !== id);
    groups++;
  };
  for (const n of mem) if (!order.has(n.id)) visit(n.id);
  return group;
}

/** Partner alignment can pull a parent down — re-seat their children on lower rows. */
function propagateGenerationsFromParents(
  mem: SimNode[],
  gen: Map<string, number>,
  parents: Map<string, Set<string>>,
): void {
  const ids = new Set(mem.map((n) => n.id));
  const group = parentCycleGroups(mem, parents);
  let changed = true;
  while (changed) {
    changed = false;
    for (const n of mem) {
      /** A parent on a cycle with this sim would push both down forever. */
      const ps = [...(parents.get(n.id) ?? [])].filter(
        (p) => ids.has(p) && group.get(p) !== group.get(n.id),
      );
      if (!ps.length) continue;
      const need = Math.max(...ps.map((p) => (gen.get(p) ?? 0) + 1));
      const cur = gen.get(n.id) ?? 0;
      if (cur < need) {
        gen.set(n.id, need);
        changed = true;
      }
    }
  }
}

/** Assign generation rows: parents on top, children below. */
function generationRows(
  mem: SimNode[],
  parents: Map<string, Set<string>>,
): Map<string, number> {
  const ids = new Set(mem.map((n) => n.id));
  const gen = new Map<string, number>();

  const hasParents = (id: string) => {
    const ps = parents.get(id);
    return ps ? ps.size > 0 : false;
  };

  /** Parents in linked households count as generation 0 when not in this block. */
  const parentGen = (pid: string) => (ids.has(pid) ? gen.get(pid)! : 0);

  for (const n of mem) {
    if (!hasParents(n.id)) gen.set(n.id, 0);
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const n of mem) {
      if (gen.has(n.id)) continue;
      const ps = [...(parents.get(n.id) ?? [])];
      if (ps.length > 0 && ps.every((p) => !ids.has(p) || gen.has(p))) {
        gen.set(n.id, Math.max(...ps.map(parentGen)) + 1);
        changed = true;
      }
    }
  }
  for (const n of mem) {
    if (!gen.has(n.id)) gen.set(n.id, 0);
  }
  return gen;
}

const byName = (a: SimNode, b: SimNode) =>
  `${a.first} ${a.sur}`.localeCompare(`${b.first} ${b.sur}`);

/** Sorted in-household parent ids for a child, or '' when none. */
function sharedParentKey(
  n: SimNode,
  g: HHGraph,
  hhIds: Set<string>,
): string {
  return [...(g.parents.get(n.id) ?? [])]
    .filter((p) => hhIds.has(p))
    .sort()
    .join('|');
}

/** Sibling cluster centered under parent couple (or single parent). */
function layoutSiblingCluster(
  members: SimNode[],
  parentIds: string[],
  placedById: Map<string, PlacedCard>,
  originY: number,
  columnMinX?: number,
): PlacedCard[] {
  const sorted = [...members].sort(byName);
  const cards = sorted.map((n) => ({ n, ...measureCard(n) }));
  const totalW =
    cards.reduce((s, c) => s + c.w, 0) +
    Math.max(0, cards.length - 1) * LAYOUT.gapX;

  const parentCards = parentIds
    .map((id) => placedById.get(id))
    .filter((p): p is PlacedCard => !!p);

  let anchorX: number;
  if (parentCards.length >= 2) {
    anchorX =
      (parentCards[0]!.x +
        parentCards[0]!.w / 2 +
        parentCards[1]!.x +
        parentCards[1]!.w / 2) /
      2;
  } else if (parentCards.length === 1) {
    anchorX = parentCards[0]!.x + parentCards[0]!.w / 2;
  } else {
    anchorX = totalW / 2;
  }

  if (
    columnMinX !== undefined &&
    parentCards.some((p) => p.x < columnMinX - 1)
  ) {
    anchorX = columnMinX + totalW / 2;
  }

  let x = anchorX - totalW / 2;
  if (columnMinX !== undefined) x = Math.max(x, columnMinX);
  const placed: PlacedCard[] = [];
  for (const c of cards) {
    placed.push({
      id: c.n.id,
      x: Math.round(x),
      y: Math.round(originY),
      w: c.w,
      h: c.h,
    });
    x += c.w + LAYOUT.gapX;
  }
  return placed;
}

/** Generation 0: partners & singles in a row. Child rows: siblings clustered under parents. */
function layoutGenerationRow(
  rowMem: SimNode[],
  g: HHGraph,
  placedById: Map<string, PlacedCard>,
  hhIds: Set<string>,
  originX: number,
  originY: number,
  genIndex: number,
  clusterCtx?: ClusterRowCtx,
): { placed: PlacedCard[]; w: number } {
  if (genIndex === 0) {
    return layoutCardsRow(rowMem, g, hhIds, originX, originY, clusterCtx);
  }

  const keys = rowMem.map((n) => sharedParentKey(n, g, hhIds));
  const k0 = keys[0];
  /** Only cluster when every sim in the row shares the same parent set (actual siblings). */
  const allSiblings = !!k0 && keys.every((k) => k === k0);

  if (allSiblings) {
    const parentIds = k0.split('|').filter(Boolean);
    const placed = layoutSiblingCluster(
      rowMem,
      parentIds,
      placedById,
      originY,
      originX,
    );
    if (!placed.length) return { placed, w: LAYOUT.hhPad * 2 };
    const maxX = Math.max(...placed.map((p) => p.x + p.w));
    return { placed, w: maxX - originX + LAYOUT.hhPad };
  }

  const row = layoutCardsRow(rowMem, g, hhIds, originX, originY, clusterCtx);
  return centerRowUnderParents(row, rowMem, g, placedById, hhIds, originX);
}

/** Shift a child/spouse row so it sits under the parent couple, not flush-left. */
function centerRowUnderParents(
  row: { placed: PlacedCard[]; w: number },
  rowMem: SimNode[],
  g: HHGraph,
  placedById: Map<string, PlacedCard>,
  hhIds: Set<string>,
  columnMinX?: number,
): { placed: PlacedCard[]; w: number } {
  const parentCards: PlacedCard[] = [];
  const seen = new Set<string>();
  for (const n of rowMem) {
    for (const pid of g.parents.get(n.id) ?? []) {
      if (seen.has(pid)) continue;
      seen.add(pid);
      const mate = g.partner.get(pid);
      if (mate && (hhIds.has(mate) || placedById.has(mate))) seen.add(mate);
    }
  }
  for (const id of seen) {
    const card = placedById.get(id);
    if (card) parentCards.push(card);
  }
  if (!parentCards.length || !row.placed.length) return row;

  let anchorX: number;
  if (parentCards.length >= 2) {
    anchorX =
      (parentCards[0]!.x +
        parentCards[0]!.w / 2 +
        parentCards[1]!.x +
        parentCards[1]!.w / 2) /
      2;
  } else {
    anchorX = parentCards[0]!.x + parentCards[0]!.w / 2;
  }

  /** Parents live in an earlier cluster column — stay flush-left here. */
  if (columnMinX !== undefined && parentCards.some((p) => p.x < columnMinX - 1)) {
    return row;
  }

  const minX = Math.min(...row.placed.map((p) => p.x));
  const maxX = Math.max(...row.placed.map((p) => p.x + p.w));
  let shift = anchorX - (minX + maxX) / 2;
  if (columnMinX !== undefined) {
    shift = Math.max(shift, columnMinX - minX);
  }
  if (Math.abs(shift) < 1) return row;

  const placed = row.placed.map((p) => ({
    ...p,
    x: Math.round(p.x + shift),
  }));
  const newMax = Math.max(...placed.map((p) => p.x + p.w));
  const baseX = columnMinX ?? minX;
  return { placed, w: newMax - baseX + LAYOUT.hhPad };
}

/** Parent-set key for a sim id (used when grouping row units). */
function parentKeyFor(
  id: string,
  g: HHGraph,
  hhIds: Set<string>,
): string {
  return [...(g.parents.get(id) ?? [])]
    .filter((p) => hhIds.has(p))
    .sort()
    .join('|');
}

/** Thi before Liên+Alon — sibling adjacent to partnered sibling, not after the spouse. */
function attachSiblingsToPartnerUnits(
  units: string[][],
  g: HHGraph,
  hhIds: Set<string>,
): string[][] {
  const isCouple = (u: string[]) =>
    u.length === 2 && g.partner.get(u[0]!) === u[1];
  const singles = units.filter((u) => u.length === 1);
  const consumed = new Set<string>();
  const out: string[][] = [];

  for (const unit of units) {
    if (!isCouple(unit)) {
      if (unit.length === 1) {
        if (!consumed.has(unit[0]!)) out.push(unit);
      } else {
        out.push(unit);
      }
      continue;
    }
    const key = parentKeyFor(unit[0]!, g, hhIds);
    const attached = singles
      .filter(
        (u) =>
          !consumed.has(u[0]!) &&
          key &&
          parentKeyFor(u[0]!, g, hhIds) === key &&
          u[0] !== unit[0] &&
          u[0] !== unit[1],
      )
      .map((u) => u[0]!)
      .sort();
    attached.forEach((id) => consumed.add(id));
    out.push(attached.length ? [...attached, ...unit] : unit);
  }
  return out;
}

type ClusterRowCtx = {
  colIndex: number;
  orderedGids: string[];
  idToGid: Map<string, string>;
};

/** Sort row units so cross-household partners face each other — no card blocks the line. */
function sortUnitsByConnectionBias(
  units: string[][],
  g: HHGraph,
  ctx: ClusterRowCtx,
): string[][] {
  const bias = (unit: string[]) => {
    let sum = 0;
    let n = 0;
    for (const id of unit) {
      const p = g.partner.get(id);
      if (!p) continue;
      const partnerGid = ctx.idToGid.get(p);
      const myGid = ctx.idToGid.get(id);
      if (!partnerGid || partnerGid === myGid) continue;
      const partnerCol = ctx.orderedGids.indexOf(partnerGid);
      if (partnerCol < 0) continue;
      n++;
      if (partnerCol < ctx.colIndex) sum += 0;
      else if (partnerCol > ctx.colIndex) sum += 1;
    }
    if (!n) return 0.5;
    return sum / n;
  };
  return [...units].sort((a, b) => {
    const d = bias(a) - bias(b);
    if (Math.abs(d) > 0.01) return d;
    return a[0]!.localeCompare(b[0]!);
  });
}

/** Place one generation band — cards only, no household title (drawn once by GroupLayer). */
function layoutCardsRow(
  rowMembers: SimNode[],
  g: HHGraph,
  hhIds: Set<string>,
  originX: number,
  originY: number,
  clusterCtx?: ClusterRowCtx,
): { placed: PlacedCard[]; w: number } {
  const ids = new Set(rowMembers.map((n) => n.id));
  const placed = new Set<string>();
  const units: string[][] = [];

  for (const n of [...rowMembers].sort(byName)) {
    if (placed.has(n.id)) continue;
    const p = g.partner.get(n.id);
    if (p && ids.has(p) && !placed.has(p)) {
      units.push(
        [n.id, p].sort((a, b) => {
          const aParents = g.parents.get(a)?.size ?? 0;
          const bParents = g.parents.get(b)?.size ?? 0;
          if (aParents !== bParents) return bParents - aParents;
          return a.localeCompare(b);
        }),
      );
      placed.add(n.id);
      placed.add(p);
    }
  }

  const byParentKey = new Map<string, string[]>();
  for (const n of rowMembers) {
    if (placed.has(n.id)) continue;
    const key = sharedParentKey(n, g, hhIds);
    if (!byParentKey.has(key)) byParentKey.set(key, []);
    byParentKey.get(key)!.push(n.id);
  }
  for (const [key, group] of byParentKey) {
    if (group.length > 1 && key) {
      units.push(group.sort((a, b) => a.localeCompare(b)));
      group.forEach((id) => placed.add(id));
    }
  }

  for (const n of rowMembers) {
    if (!placed.has(n.id)) units.push([n.id]);
  }

  const merged = attachSiblingsToPartnerUnits(units, g, hhIds);
  const ordered = clusterCtx
    ? sortUnitsByConnectionBias(merged, g, clusterCtx)
    : [...merged].sort((a, b) => a[0]!.localeCompare(b[0]!));

  const byId = new Map(rowMembers.map((n) => [n.id, n]));
  let x = originX;
  const placedCards: PlacedCard[] = [];

  for (let u = 0; u < ordered.length; u++) {
    const unit = ordered[u]!;
    if (u > 0) x += LAYOUT.gapX;
    for (let i = 0; i < unit.length; i++) {
      const id = unit[i]!;
      const n = byId.get(id)!;
      const { w, h } = measureCard(n);
      placedCards.push({ id, x: Math.round(x), y: Math.round(originY), w, h });
      const gapAfter =
        i < unit.length - 1
          ? g.partner.has(id) && g.partner.get(id) === unit[i + 1]
            ? LAYOUT.partnerGap
            : LAYOUT.gapX
          : 0;
      x += w + gapAfter;
    }
  }

  const w = placedCards.length
    ? x - LAYOUT.gapX + LAYOUT.hhPad
    : LAYOUT.hhPad * 2;
  return { placed: placedCards, w };
}

type HHBlock = { gid: string; w: number; h: number; placed: PlacedCard[] };

/** Cross-household adjacency from any relationship edge in this world. */
/**
 * A world's unhoused sims are not a family, so their box is a grid `cols`
 * wide instead of generation rows, which would run them all into one line.
 * Sims from the same game household (`ohh`) stay side by side, eldest first.
 */
function layoutUnhousedGrid(mem: SimNode[], cols: number): PlacedCard[] {
  const order = [...mem].sort(
    (a, b) =>
      (a.ohh || '').localeCompare(b.ohh || '') ||
      ageRank(b.age) - ageRank(a.age) ||
      byName(a, b),
  );
  const pitchX = CARD_MIN_W + LAYOUT.gapX;
  return order.map((n, i) => {
    const { w, h } = measureCard(n);
    return {
      id: n.id,
      x: LAYOUT.hhPad + (i % cols) * pitchX,
      y: LAYOUT.hhHeader + LAYOUT.hhPad + Math.floor(i / cols) * rowPitch(),
      w,
      h,
    };
  });
}

/** Columns of a world's Unhoused sims grid (see layoutUnhousedGrid). */
export const UNHOUSED_COLS = 4;

/**
 * Columns of the Unhoused sims box in Not in any world: about square, so a
 * few sims make a compact block rather than a band across the whole world
 * that every line from elsewhere has to cross. Before NOT_IN_WORLD_EPOCH it
 * took the world's full width.
 */
function unhousedCols(count: number, epoch: number): number {
  if (epoch < NOT_IN_WORLD_EPOCH) return LAYOUT.otherHhCols;
  return Math.min(LAYOUT.otherHhCols, Math.max(1, Math.ceil(Math.sqrt(count))));
}

/**
 * First layout epoch that packs an Unhoused sims box as family blocks
 * ({@link layoutUnhousedFamilies}) instead of one flat grid.
 */
export const UNHOUSED_FAMILY_EPOCH = 3;

const FAMILY_LINKS = new Set(['parent', 'marriage', 'romance', 'divorced']);

/**
 * An Unhoused sims box as family blocks. Sims linked to each other in the
 * box form a family laid out in generation rows like any household, parents
 * above children and partners side by side, so its lines are short drops.
 * Blocks with a relative outside the box line one side of it — the side
 * facing those relatives — so their lines stop at the edge instead of
 * crossing the box. Packing assumes the left (Other packs right of every
 * world); placing a box on the board picks the side from where the relatives
 * really are (see {@link unhousedArrangement}). The rest fill the shortest
 * of up to `maxCols` columns, by family name.
 */
function layoutUnhousedFamilies(
  mem: SimNode[],
  edges: Edge[],
  maxCols: number,
  side: 'left' | 'right' = 'left',
): PlacedCard[] {
  const ids = new Set(mem.map((n) => n.id));
  const root = new Map(mem.map((n) => [n.id, n.id]));
  const find = (id: string): string => {
    const r = root.get(id)!;
    if (r === id) return id;
    const top = find(r);
    root.set(id, top);
    return top;
  };
  const outside = new Set<string>();
  for (const e of edges) {
    if (!FAMILY_LINKS.has(e.type)) continue;
    const a = ids.has(e.a);
    const b = ids.has(e.b);
    if (a && b) root.set(find(e.a), find(e.b));
    else if (a) outside.add(e.a);
    else if (b) outside.add(e.b);
  }
  const families = new Map<string, SimNode[]>();
  for (const n of mem) {
    const key = find(n.id);
    families.set(key, [...(families.get(key) ?? []), n]);
  }

  const pitchX = CARD_MIN_W + LAYOUT.gapX;
  const tiles = [...families.values()].map((fam) => {
    const { placed } = pedigreeTile(fam, edges);
    const x0 = Math.min(...placed.map((p) => p.x));
    const y0 = Math.min(...placed.map((p) => p.y));
    const w = Math.max(...placed.map((p) => p.x + p.w)) - x0;
    const h = Math.max(...placed.map((p) => p.y + p.h)) - y0;
    const eldest = [...fam].sort((a, b) => ageRank(b.age) - ageRank(a.age) || byName(a, b))[0]!;
    return {
      cards: placed.map((p) => ({ ...p, x: p.x - x0, y: p.y - y0 })),
      h,
      span: Math.max(1, Math.round((w + LAYOUT.gapX) / pitchX)),
      edge: fam.some((n) => outside.has(n.id)),
      key: `${eldest.ohh || eldest.sur} ${eldest.first}`,
    };
  });
  // A family wider than the box widens it rather than spill out.
  const cols = Math.max(Math.min(maxCols, mem.length), ...tiles.map((t) => t.span));
  const byKey = (a: { key: string }, b: { key: string }) => a.key.localeCompare(b.key);
  const edgeTiles = tiles.filter((t) => t.edge).sort(byKey);
  const restTiles = tiles.filter((t) => !t.edge).sort(byKey);

  const pitchY = rowPitch();
  const colH = new Array<number>(cols).fill(0);
  const fullH = Math.ceil(mem.length / cols) * pitchY;
  const out: PlacedCard[] = [];
  const put = (t: (typeof tiles)[number], c: number) => {
    const span = Math.min(t.span, cols);
    const y = Math.max(...colH.slice(c, c + span));
    for (const p of t.cards) {
      out.push({ ...p, x: LAYOUT.hhPad + c * pitchX + p.x, y: LAYOUT.hhHeader + LAYOUT.hhPad + y + p.y });
    }
    for (let i = c; i < c + span; i++) colH[i] = y + t.h + LAYOUT.gapYExtra;
  };
  // The edge first, a column at a time, moving inward once one is as tall
  // as the box will be.
  const right = side === 'right';
  let edgeCol = 0;
  for (const t of edgeTiles) {
    const span = Math.min(t.span, cols);
    const at = (k: number) => (right ? cols - span - k : k);
    while (edgeCol + span < cols && colH[right ? cols - 1 - edgeCol : edgeCol]! >= fullH) {
      edgeCol += 1;
    }
    put(t, Math.max(0, Math.min(at(edgeCol), cols - span)));
  }
  for (const t of restTiles) {
    const span = Math.min(t.span, cols);
    let best = 0;
    let bestY = Infinity;
    for (let c = 0; c + span <= cols; c++) {
      const y = Math.max(...colH.slice(c, c + span));
      if (y < bestY) {
        bestY = y;
        best = c;
      }
    }
    put(t, best);
  }
  return out;
}

/**
 * Card spots in a world's Unhoused sims box, from its top-left card, with
 * its relatives' side of the box on `side`. Packing always lays the box out
 * for the left; this is how a box is placed when its relatives sit right.
 */
export function unhousedArrangement(
  mem: SimNode[],
  edges: Edge[],
  side: 'left' | 'right',
): Map<string, { x: number; y: number }> {
  const world = mem[0]?.world || OTHER_WORLD;
  const placed = layoutUnhousedFamilies(
    mem,
    edges,
    world === OTHER_WORLD ? unhousedCols(mem.length, LAYOUT_EPOCH) : UNHOUSED_COLS,
    side,
  );
  const x0 = Math.min(...placed.map((p) => p.x));
  const y0 = Math.min(...placed.map((p) => p.y));
  return new Map(placed.map((p) => [p.id, { x: p.x - x0, y: p.y - y0 }]));
}

/**
 * Card spots for these Not in any world households (and Unhoused sims box),
 * packed as that world packs, from the top-left card, with the households
 * that have family elsewhere starting from `side`. Packing assumes the left
 * (the world packs right of every other); this is for placing them where
 * their relatives really are.
 */
export function notInWorldArrangement(
  mem: SimNode[],
  edges: Edge[],
  side: 'left' | 'right',
): Map<string, { x: number; y: number }> {
  const { placed } = layoutOtherWorld(mem, edges, LAYOUT_EPOCH, side);
  const x0 = Math.min(...placed.map((p) => p.x));
  const y0 = Math.min(...placed.map((p) => p.y));
  return new Map(placed.map((p) => [p.id, { x: p.x - x0, y: p.y - y0 }]));
}

/**
 * Which side of an Unhoused sims box faces its sims' relatives elsewhere on
 * screen: the side more of those links lead to. `at` gives screen spots;
 * relatives without one are not counted. Ties stay left.
 */
export function unhousedEdgeSide(
  mem: SimNode[],
  edges: Edge[],
  at: (id: string) => { x: number; y: number } | undefined,
): 'left' | 'right' {
  const ids = new Set(mem.map((n) => n.id));
  const xs = mem.map((n) => at(n.id)?.x).filter((x): x is number => x !== undefined);
  if (!xs.length) return 'left';
  const mid = (Math.min(...xs) + Math.max(...xs) + CARD_MIN_W) / 2;
  let vote = 0;
  for (const e of edges) {
    if (!FAMILY_LINKS.has(e.type) || ids.has(e.a) === ids.has(e.b)) continue;
    const other = at(ids.has(e.a) ? e.b : e.a);
    if (other) vote += other.x + CARD_MIN_W / 2 > mid ? 1 : -1;
  }
  return vote > 0 ? 'right' : 'left';
}

/**
 * Households linked by an edge, for clustering. An Unhoused sims box is not
 * a household, so it is never clustered with the families its sims belong to.
 */
function buildHouseholdLinks(
  mem: SimNode[],
  edges: Edge[],
): Map<string, Set<string>> {
  const idToGid = new Map(
    mem.filter((n) => !isUnhousedGid(n.gid)).map((n) => [n.id, n.gid]),
  );
  const links = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    if (a === b) return;
    if (!links.has(a)) links.set(a, new Set());
    if (!links.has(b)) links.set(b, new Set());
    links.get(a)!.add(b);
    links.get(b)!.add(a);
  };
  for (const e of edges) {
    const ga = idToGid.get(e.a);
    const gb = idToGid.get(e.b);
    if (!ga || !gb || ga === gb) continue;
    link(ga, gb);
  }
  return links;
}

/** Place linked households next to each other; unlinked clusters keep generation order. */
function orderHouseholdsByLinks(
  households: [string, SimNode[]][],
  hhLinks: Map<string, Set<string>>,
  minGen: (hhMem: SimNode[]) => number,
): [string, SimNode[]][] {
  const byGid = new Map(households);
  const gidSet = new Set(households.map(([gid]) => gid));
  const visited = new Set<string>();
  const ordered: [string, SimNode[]][] = [];

  const seeds = [...households].sort((a, b) => {
    const ga = minGen(a[1]);
    const gb = minGen(b[1]);
    if (ga !== gb) return ga - gb;
    return (a[1][0]?.hh ?? '').localeCompare(b[1][0]?.hh ?? '');
  });

  for (const [gid] of seeds) {
    if (visited.has(gid)) continue;
    const queue = [gid];
    visited.add(gid);
    while (queue.length) {
      const cur = queue.shift()!;
      ordered.push([cur, byGid.get(cur)!]);
      const neighbors = [...(hhLinks.get(cur) ?? [])]
        .filter((n) => gidSet.has(n) && !visited.has(n))
        .sort((a, b) => {
          const ha = byGid.get(a)!;
          const hb = byGid.get(b)!;
          const ga = minGen(ha);
          const gb = minGen(hb);
          if (ga !== gb) return ga - gb;
          return (ha[0]?.hh ?? '').localeCompare(hb[0]?.hh ?? '');
        });
      for (const n of neighbors) {
        visited.add(n);
        queue.push(n);
      }
    }
  }
  return ordered;
}

/** Shift cards to origin and return tight pixel bounds. */
function finalizeHouseholdBlock(
  placed: PlacedCard[],
  originX: number,
  originY: number,
): { placed: PlacedCard[]; w: number; h: number } {
  if (!placed.length) {
    return {
      placed,
      w: LAYOUT.hhPad * 2,
      h: LAYOUT.hhHeader + LAYOUT.hhPad * 2,
    };
  }
  const minX = Math.min(...placed.map((p) => p.x));
  const maxX = Math.max(...placed.map((p) => p.x + p.w));
  const minY = Math.min(...placed.map((p) => p.y));
  const maxY = Math.max(...placed.map((p) => p.y + p.h));
  const baseX = originX + LAYOUT.hhPad;
  const baseY = originY + LAYOUT.hhHeader + LAYOUT.hhPad;
  const dx = baseX - minX;
  /** Keep intentional generation padding — only nudge upward when content sits too high. */
  const dy = minY < baseY ? baseY - minY : 0;
  const normalized =
    dx || dy
      ? placed.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy }))
      : placed;
  const topY = minY + dy;
  return {
    placed: normalized,
    w: maxX - minX + LAYOUT.hhPad * 2,
    h: maxY - topY + LAYOUT.hhHeader + LAYOUT.hhPad,
  };
}

/** Connected household groups within one world. */
function buildHouseholdComponents(
  households: [string, SimNode[]][],
  hhLinks: Map<string, Set<string>>,
): [string, SimNode[]][][] {
  const byGid = new Map(households);
  const visited = new Set<string>();
  const components: [string, SimNode[]][][] = [];

  for (const [gid] of households) {
    if (visited.has(gid)) continue;
    const component: [string, SimNode[]][] = [];
    const queue = [gid];
    visited.add(gid);
    while (queue.length) {
      const cur = queue.shift()!;
      component.push([cur, byGid.get(cur)!]);
      for (const n of hhLinks.get(cur) ?? []) {
        if (byGid.has(n) && !visited.has(n)) {
          visited.add(n);
          queue.push(n);
        }
      }
    }
    components.push(component);
  }
  return components;
}

type HHTile = {
  w: number;
  h: number;
  placed: PlacedCard[];
  isCluster: boolean;
  sortKey: string;
  colSpan?: number;
};

/** Widest generation row → how many tag columns this household occupies. */
function colSpanFromPlaced(placed: PlacedCard[]): number {
  if (!placed.length) return 1;
  const byRow = new Map<number, number>();
  for (const p of placed) {
    byRow.set(p.y, (byRow.get(p.y) ?? 0) + 1);
  }
  return Math.max(1, ...byRow.values());
}

/** Pixel width of N tag columns (cards side-by-side). */
function gridColumnWidth(span: number): number {
  if (span <= 1) return CARD_MIN_W;
  return span * CARD_MIN_W + (span - 1) * LAYOUT.gapX;
}

/** Keep a generation row inside its allocated tag-column band. */
function pinRowToColumn(
  placed: PlacedCard[],
  rowX: number,
  span: number,
): PlacedCard[] {
  if (!placed.length) return placed;
  const maxW = gridColumnWidth(span);
  const minX = Math.min(...placed.map((p) => p.x));
  let dx = rowX - minX;
  const maxX = Math.max(...placed.map((p) => p.x + p.w));
  if (maxX + dx > rowX + maxW) dx = rowX + maxW - maxX;
  if (Math.abs(dx) < 0.5) return placed;
  return placed.map((p) => ({ ...p, x: Math.round(p.x + dx) }));
}

/** Parent edges missing — stack by life-stage tier instead of one flat row. */
function ageTierGenerations(mem: SimNode[]): Map<string, number> {
  const tiers = [...new Set(mem.map((n) => ageRank(n.age)))].sort(
    (a, b) => b - a,
  );
  const tierToGen = new Map(tiers.map((rank, i) => [rank, i]));
  const gen = new Map<string, number>();
  for (const n of mem) gen.set(n.id, tierToGen.get(ageRank(n.age))!);
  return gen;
}

function needsAgeGenerations(
  mem: SimNode[],
  gen: Map<string, number>,
): boolean {
  const vals = mem.map((n) => gen.get(n.id) ?? 0);
  return mem.length > 1 && Math.min(...vals) === Math.max(...vals);
}

/** Four same-row sims with no partner pair → 2×2 (span 2, not 4). */
function splitQuadOtherHouseholds(
  mem: SimNode[],
  gen: Map<string, number>,
  g: HHGraph,
): Map<string, number> {
  const out = new Map(gen);
  const byGen = new Map<number, SimNode[]>();
  for (const n of mem) {
    const gi = out.get(n.id) ?? 0;
    if (!byGen.has(gi)) byGen.set(gi, []);
    byGen.get(gi)!.push(n);
  }
  for (const [gi, group] of byGen) {
    if (group.length !== 4) continue;
    const ids = new Set(group.map((n) => n.id));
    const hasPartner = group.some((n) => {
      const p = g.partner.get(n.id);
      return p && ids.has(p);
    });
    if (hasPartner) continue;
    const sorted = [...group].sort(byName);
    for (const n of sorted.slice(2)) out.set(n.id, gi + 1);
  }
  return out;
}

function groupPlacedByRow(placed: PlacedCard[]): PlacedCard[][] {
  const byY = new Map<number, PlacedCard[]>();
  for (const p of placed) {
    if (!byY.has(p.y)) byY.set(p.y, []);
    byY.get(p.y)!.push(p);
  }
  return [...byY.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, row]) => row);
}

/**
 * Other-world household: pedigree rows inside, column span from widest row.
 * Rows are pinned to the allocated tag-column band before grid packing.
 */
function layoutOtherHouseholdTile(
  mem: SimNode[],
  edges: Edge[],
  epoch: number = LAYOUT_EPOCH,
): { placed: PlacedCard[]; w: number; h: number; colSpan: number } {
  if (isUnhousedGid(mem[0]!.gid)) {
    if (epoch < UNHOUSED_FAMILY_EPOCH) {
      const cols = Math.min(mem.length, LAYOUT.otherHhCols);
      const { placed, w, h } = finalizeHouseholdBlock(layoutUnhousedGrid(mem, cols), 0, 0);
      return { placed, w, h, colSpan: cols };
    }
    const grid = layoutUnhousedFamilies(mem, edges, unhousedCols(mem.length, epoch));
    const { placed, w, h } = finalizeHouseholdBlock(grid, 0, 0);
    return { placed, w, h, colSpan: otherTileColSpan(placed, w) };
  }
  return pedigreeTile(mem, edges, epoch);
}

/**
 * One household (or family) in generation rows: column span from its widest
 * row, rows pinned to that tag-column band.
 */
function pedigreeTile(
  mem: SimNode[],
  edges: Edge[],
  epoch: number = LAYOUT_EPOCH,
): { placed: PlacedCard[]; w: number; h: number; colSpan: number } {
  const g = buildHHGraph(mem, edges);
  const hhIds = new Set(mem.map((n) => n.id));
  for (const e of parentEdgesInto(edges, hhIds)) {
    if (!g.parents.has(e.b)) g.parents.set(e.b, new Set());
    g.parents.get(e.b)!.add(e.a);
  }

  let gen = generationRows(mem, g.parents);
  alignPartnerGenerationsFromGraph(mem, gen, g.partner);
  propagateGenerationsFromParents(mem, gen, g.parents);
  if (needsAgeGenerations(mem, gen)) gen = ageTierGenerations(mem);
  alignPartnerGenerationsFromGraph(mem, gen, g.partner);
  propagateGenerationsFromParents(mem, gen, g.parents);
  gen = splitQuadOtherHouseholds(mem, gen, g);

  const minGen = Math.min(...mem.map((n) => gen.get(n.id) ?? 0));
  const maxGen = Math.max(...mem.map((n) => gen.get(n.id) ?? 0));
  const pitchY = rowPitch();
  const rowX = LAYOUT.hhPad;

  const placed: PlacedCard[] = [];
  const placedById = new Map<string, PlacedCard>();
  let cardY = LAYOUT.hhHeader + LAYOUT.hhPad + minGen * pitchY;

  for (let gi = minGen; gi <= maxGen; gi++) {
    const rowMem = mem.filter((n) => (gen.get(n.id) ?? 0) === gi);
    if (!rowMem.length) continue;
    const row = layoutGenerationRow(
      rowMem,
      g,
      placedById,
      hhIds,
      rowX,
      cardY,
      gi,
    );
    for (const p of row.placed) placedById.set(p.id, p);
    placed.push(...row.placed);
    cardY += pitchY;
  }

  const span = colSpanFromPlaced(placed);
  let pinned: PlacedCard[] = [];
  for (const row of groupPlacedByRow(placed)) {
    pinned.push(...pinRowToColumn(row, rowX, span));
  }
  // A household whose parents live elsewhere starts a generation down, and
  // the tile's height left that empty row out, so the tile under it in the
  // column overlapped it. Its first row goes to the top instead.
  if (epoch >= NOT_IN_WORLD_EPOCH && pinned.length) {
    const lift = Math.min(...pinned.map((p) => p.y)) - (LAYOUT.hhHeader + LAYOUT.hhPad);
    if (lift > 0) pinned = pinned.map((p) => ({ ...p, y: p.y - lift }));
  }

  const { placed: normalized, w, h } = finalizeHouseholdBlock(pinned, 0, 0);
  return {
    placed: normalized,
    w,
    h,
    colSpan: Math.min(span, LAYOUT.otherHhCols),
  };
}

/** X origin of tag column C in the Other-world grid. */
function otherTagColX(col: number): number {
  return col * (CARD_MIN_W + LAYOUT.gapX);
}

/** Total pixel width of the 7 tag-column grid (incl. box padding). */
function otherGridWidth(): number {
  const cols = LAYOUT.otherHhCols;
  return (
    cols * CARD_MIN_W +
    (cols - 1) * LAYOUT.gapX +
    LAYOUT.hhPad * 2
  );
}

/** Tag columns a tile needs in the Other-world masonry grid. */
function otherTileColSpan(placed: PlacedCard[], w: number): number {
  const rowSpan = colSpanFromPlaced(placed);
  const widthSpan = Math.max(
    1,
    Math.ceil((w - LAYOUT.hhPad * 2 + LAYOUT.gapX) / (CARD_MIN_W + LAYOUT.gapX)),
  );
  return Math.min(LAYOUT.otherHhCols, Math.max(rowSpan, widthSpan));
}

type OtherTile = {
  placed: PlacedCard[];
  w: number;
  h: number;
  colSpan: number;
  sortKey: string;
  isCluster: boolean;
  /** Has family in another world (see placeOtherWorldGrid). */
  external?: boolean;
  /** The Unhoused sims box. */
  unhoused?: boolean;
  /** Households in the tile, for their name tags. */
  households: [string, SimNode[]][];
};

/**
 * Other world: linked households cluster tight (40px); everyone else fills
 * 7 vertical tag columns via shortest-column masonry.
 */
function placeOtherWorldGrid(
  households: [string, SimNode[]][],
  edges: Edge[],
  epoch: number = LAYOUT_EPOCH,
  /** Side the households with family elsewhere start from (see unhousedEdgeSide). */
  side: 'left' | 'right' = 'left',
): { placed: PlacedCard[]; w: number; h: number } {
  const tiles = otherWorldTiles(households, edges, epoch);
  const { placed, h } = packOtherTiles(tiles, LAYOUT.otherHhCols, side);
  return { placed, w: otherGridWidth(), h };
}

/** Not in any world's households as tiles, in packing order. */
function otherWorldTiles(
  households: [string, SimNode[]][],
  edges: Edge[],
  epoch: number,
): OtherTile[] {
  const hhLinks = buildHouseholdLinks(
    households.flatMap(([, mem]) => mem),
    edges,
  );
  const components = buildHouseholdComponents(households, hhLinks);
  const here = new Set(households.flatMap(([, mem]) => mem.map((n) => n.id)));
  const linkedOut = new Set<string>();
  for (const e of edges) {
    if (!FAMILY_LINKS.has(e.type) || here.has(e.a) === here.has(e.b)) continue;
    linkedOut.add(here.has(e.a) ? e.a : e.b);
  }

  const tiles: OtherTile[] = [];
  for (const comp of components) {
    if (comp.length === 1) {
      const [gid, mem] = comp[0]!;
      const block = layoutOtherHouseholdTile(mem, edges, epoch);
      const unhoused = isUnhousedGid(gid);
      tiles.push({
        placed: block.placed,
        w: block.w,
        h: block.h,
        colSpan: block.colSpan,
        sortKey: mem[0]?.hh ?? gid,
        isCluster: false,
        unhoused,
        external: !unhoused && mem.some((n) => linkedOut.has(n.id)),
        households: comp,
      });
    } else {
      const cluster = layoutClusterTile(comp, edges, hhLinks);
      tiles.push({
        placed: cluster.placed,
        w: cluster.w,
        h: cluster.h,
        colSpan: otherTileColSpan(cluster.placed, cluster.w),
        sortKey: cluster.sortKey,
        isCluster: true,
        households: comp,
      });
    }
  }

  // From NOT_IN_WORLD_EPOCH, households with family in another world go
  // first, so their lines meet the world at its near corner instead of
  // crossing it, and the Unhoused sims box goes last, under the households.
  const rank = (t: OtherTile) =>
    epoch < NOT_IN_WORLD_EPOCH ? 0 : t.unhoused ? 2 : t.external ? -1 : 0;
  tiles.sort((a, b) => {
    if (a.isCluster !== b.isCluster) return a.isCluster ? -1 : 1;
    return rank(a) - rank(b) || a.sortKey.localeCompare(b.sortKey);
  });
  return tiles;
}

/** Shortest-column masonry of tiles over `gridCols` tag columns. */
function packOtherTiles(
  tiles: OtherTile[],
  gridCols: number,
  side: 'left' | 'right' = 'left',
): { placed: PlacedCard[]; h: number } {
  const colHeights = new Array<number>(gridCols).fill(0);
  const placed: PlacedCard[] = [];

  for (const tile of tiles) {
    const span = Math.min(tile.colSpan, gridCols);
    const fromRight = side === 'right' && tile.external;
    let bestCol = 0;
    let bestY = Infinity;
    for (let i = 0; i <= gridCols - span; i++) {
      const c = fromRight ? gridCols - span - i : i;
      const y = Math.max(...colHeights.slice(c, c + span));
      if (y < bestY) {
        bestY = y;
        bestCol = c;
      }
    }
    const oy = bestY > 0 ? bestY + LAYOUT.hhGap : 0;
    const ox = otherTagColX(bestCol);
    for (const p of tile.placed) {
      placed.push({ ...p, x: p.x + ox, y: p.y + oy });
    }
    const nextY = oy + tile.h;
    for (let c = bestCol; c < bestCol + span; c++) colHeights[c] = nextY;
  }

  return { placed, h: Math.max(...colHeights, 0) };
}

/**
 * Pack linked households in side-by-side columns with synced generation rows.
 * Cards never interleave across gid boundaries, so household boxes stay apart.
 */
function layoutClusterTile(
  component: [string, SimNode[]][],
  edges: Edge[],
  hhLinks: Map<string, Set<string>>,
): HHTile {
  const minGenFn = (hhMem: SimNode[]) => householdMinGen(hhMem, edges);
  const ordered = orderHouseholdsByLinks(component, hhLinks, minGenFn);
  const allMem = ordered.flatMap(([, mem]) => mem);
  const allIds = new Set(allMem.map((n) => n.id));

  const g = buildHHGraph(allMem, edges);
  for (const e of parentEdgesInto(edges, allIds)) {
    if (!g.parents.has(e.b)) g.parents.set(e.b, new Set());
    g.parents.get(e.b)!.add(e.a);
  }
  const gen = generationRows(allMem, g.parents);
  alignPartnerGenerationsFromGraph(allMem, gen, g.partner);
  propagateGenerationsFromParents(allMem, gen, g.parents);
  const minGen = Math.min(...allMem.map((n) => gen.get(n.id) ?? 0));
  const maxGen = Math.max(...allMem.map((n) => gen.get(n.id) ?? 0));
  const pitchY = rowPitch();

  const placed: PlacedCard[] = [];
  const placedById = new Map<string, PlacedCard>();
  const orderedGids = ordered.map(([gid]) => gid);
  const idToGid = new Map(allMem.map((n) => [n.id, n.gid]));
  /** Fixed X band per linked household — columns stay aligned across generation rows. */
  const colStart = new Map<string, number>();
  const colSpan = new Map<string, number>();
  let colX = LAYOUT.hhPad;
  for (const [gid, hhMem] of ordered) {
    colStart.set(gid, colX);
    const block = layoutHousehold(hhMem, edges, 0, 0);
    const span = colSpanFromPlaced(block.placed);
    colSpan.set(gid, span);
    colX += gridColumnWidth(span) + LAYOUT.householdGap;
  }
  let cardY = LAYOUT.hhHeader + LAYOUT.hhPad + minGen * pitchY;

  for (let gi = minGen; gi <= maxGen; gi++) {
    for (let colIndex = 0; colIndex < ordered.length; colIndex++) {
      const [gid, hhMem] = ordered[colIndex]!;
      const hhIds = new Set(hhMem.map((n) => n.id));
      const rowMem = hhMem.filter((n) => (gen.get(n.id) ?? 0) === gi);
      if (!rowMem.length) continue;
      const rowX = colStart.get(gid)!;
      const span = colSpan.get(gid)!;
      const row = layoutGenerationRow(
        rowMem,
        g,
        placedById,
        hhIds,
        rowX,
        cardY,
        gi,
        { colIndex, orderedGids, idToGid },
      );
      const pinned = pinRowToColumn(row.placed, rowX, span);
      for (const p of pinned) placedById.set(p.id, p);
      placed.push(...pinned);
    }
    cardY += pitchY;
  }

  const { placed: normalized, w, h } = finalizeHouseholdBlock(placed, 0, 0);
  const sortKey = ordered.map(([, mem]) => mem[0]?.hh ?? '').sort().join('|');
  return { w, h, placed: normalized, isCluster: true, sortKey };
}

function layoutSingleTile(
  gid: string,
  mem: SimNode[],
  edges: Edge[],
  epoch: number = LAYOUT_EPOCH,
): HHTile {
  const block = layoutHousehold(mem, edges, 0, 0, epoch);
  return {
    w: block.w,
    h: block.h,
    placed: block.placed,
    isCluster: false,
    sortKey: mem[0]?.hh ?? gid,
  };
}

function columnOffsets(colWidths: number[]): number[] {
  const x: number[] = [0];
  for (let c = 1; c < colWidths.length; c++) {
    x[c] = x[c - 1]! + colWidths[c - 1]! + LAYOUT.hhGap;
  }
  return x;
}

/** Two-pass column pack: assign columns first, then place using final column widths. */
function packTilesInColumns(
  assignments: { tile: HHTile; col: number }[],
  cols: number,
  colWidths: number[],
): { placed: PlacedCard[]; w: number; h: number } {
  const colX = columnOffsets(colWidths);
  const colHeights = new Array<number>(cols).fill(0);
  const placed: PlacedCard[] = [];

  for (const { tile, col } of assignments) {
    const ox = colX[col]!;
    const oy = colHeights[col]!;
    for (const p of tile.placed) {
      placed.push({ ...p, x: p.x + ox, y: p.y + oy });
    }
    colHeights[col] = oy + tile.h + LAYOUT.hhGap;
  }

  const contentW =
    cols > 0 ? colX[cols - 1]! + colWidths[cols - 1]! : 0;
  const contentH = Math.max(0, Math.max(...colHeights) - LAYOUT.hhGap);
  return { placed, w: contentW, h: contentH };
}

function assignTilesToColumns(
  tiles: HHTile[],
  colStart: number,
  colCount: number,
  colHeights: number[],
  colWidths: number[],
  out: { tile: HHTile; col: number }[],
): void {
  for (const tile of tiles) {
    let col = colStart;
    for (let c = colStart + 1; c < colStart + colCount; c++) {
      if (colHeights[c]! < colHeights[col]!) col = c;
    }
    out.push({ tile, col });
    colHeights[col] = colHeights[col]! + tile.h + LAYOUT.hhGap;
    colWidths[col] = Math.max(colWidths[col]!, tile.w);
  }
}

/**
 * Bento-style packer: linked households cluster on the right; unconnected
 * singles stack in regular columns on the left.
 */
function placeHouseholdBento(
  households: [string, SimNode[]][],
  edges: Edge[],
  hhLinks: Map<string, Set<string>>,
  cols: number = LAYOUT.hhPerRow,
  epoch: number = LAYOUT_EPOCH,
): { placed: PlacedCard[]; w: number; h: number } {
  const components = buildHouseholdComponents(households, hhLinks);
  const clusterTiles: HHTile[] = [];
  const singleTiles: HHTile[] = [];

  for (const comp of components) {
    if (comp.length === 1) {
      const [gid, mem] = comp[0]!;
      singleTiles.push(layoutSingleTile(gid, mem, edges, epoch));
    } else {
      clusterTiles.push(layoutClusterTile(comp, edges, hhLinks));
    }
  }

  clusterTiles.sort((a, b) => b.w * b.h - a.w * a.h);
  singleTiles.sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  const colHeights = new Array<number>(cols).fill(0);
  const colWidths = new Array<number>(cols).fill(0);
  const assignments: { tile: HHTile; col: number }[] = [];

  if (!clusterTiles.length) {
    assignTilesToColumns(singleTiles, 0, cols, colHeights, colWidths, assignments);
  } else {
    const singleCols = Math.min(cols - 1, singleTiles.length > 4 ? 2 : 1);
    assignTilesToColumns(
      singleTiles,
      0,
      singleCols,
      colHeights,
      colWidths,
      assignments,
    );
    assignTilesToColumns(
      clusterTiles,
      singleCols,
      cols - singleCols,
      colHeights,
      colWidths,
      assignments,
    );
  }

  return packTilesInColumns(assignments, cols, colWidths);
}

/** Masonry: named worlds fill worldCols; Other sits in its own column to the right. */
function placeWorldColumns(
  worldBlocks: WorldBlock[],
): Map<string, { x: number; y: number; w: number; h: number }> {
  const otherBlocks = worldBlocks.filter((b) => b.world === OTHER_WORLD);
  const mainBlocks = worldBlocks.filter((b) => b.world !== OTHER_WORLD);
  const bases = packWorldMasonry(mainBlocks, LAYOUT.worldCols);
  if (!otherBlocks.length) return bases;

  let namedRight = -Infinity;
  let namedTop = Infinity;
  for (const b of bases.values()) {
    namedRight = Math.max(namedRight, b.x + b.w);
    namedTop = Math.min(namedTop, b.y);
  }
  const hasNamed = Number.isFinite(namedRight);

  for (const block of otherBlocks) {
    const minPx = Math.min(...block.placed.map((p) => p.x));
    const minPy = Math.min(...block.placed.map((p) => p.y));
    const origin = tileSnapOrigin(
      hasNamed
        ? namedRight + LAYOUT.worldGapX
        : LAYOUT.originX + LAYOUT.worldMargin,
      hasNamed ? namedTop : LAYOUT.originY + LAYOUT.worldTitle,
    );
    const ox = origin.x - minPx;
    const oy = origin.y - minPy;
    for (const p of block.placed) {
      bases.set(p.id, { x: ox + p.x, y: oy + p.y, w: p.w, h: p.h });
    }
  }
  return bases;
}

/** Shortest-column pack for named worlds. */
function packWorldMasonry(
  worldBlocks: WorldBlock[],
  cols: number,
): Map<string, { x: number; y: number; w: number; h: number }> {
  const colHeights = new Array<number>(cols).fill(LAYOUT.originY);
  const colWidths = new Array<number>(cols).fill(0);
  const assignments: { block: WorldBlock; col: number }[] = [];

  for (const block of worldBlocks) {
    let col = 0;
    for (let c = 1; c < cols; c++) {
      if (colHeights[c]! < colHeights[col]!) col = c;
    }
    assignments.push({ block, col });
    colHeights[col] = colHeights[col]! + block.h + LAYOUT.worldGapY;
    colWidths[col] = Math.max(colWidths[col]!, block.w);
  }

  const colX: number[] = [LAYOUT.originX];
  for (let c = 1; c < cols; c++) {
    colX[c] = colX[c - 1]! + colWidths[c - 1]! + LAYOUT.worldGapX;
  }

  const bases = new Map<string, { x: number; y: number; w: number; h: number }>();
  colHeights.fill(LAYOUT.originY);
  for (const { block, col } of assignments) {
    const y = colHeights[col]!;
    const ox = colX[col]! + LAYOUT.worldMargin;
    const oy = y + LAYOUT.worldTitle;
    for (const p of block.placed) {
      bases.set(p.id, { x: ox + p.x, y: oy + p.y, w: p.w, h: p.h });
    }
    colHeights[col] = y + block.h + LAYOUT.worldGapY;
  }
  return bases;
}

function layoutHousehold(
  mem: SimNode[],
  edges: Edge[],
  originX: number,
  originY: number,
  epoch: number = LAYOUT_EPOCH,
): HHBlock {
  if (isUnhousedGid(mem[0]!.gid)) {
    const grid =
      epoch >= UNHOUSED_FAMILY_EPOCH
        ? layoutUnhousedFamilies(mem, edges, UNHOUSED_COLS)
        : layoutUnhousedGrid(mem, UNHOUSED_COLS);
    const { placed, w, h } = finalizeHouseholdBlock(
      grid.map((p) => ({ ...p, x: p.x + originX, y: p.y + originY })),
      originX,
      originY,
    );
    return { gid: mem[0]!.gid, w, h, placed };
  }
  const g = buildHHGraph(mem, edges);
  const hhIds = new Set(mem.map((n) => n.id));
  /** Parents in linked households still set generation rows for children here. */
  for (const e of parentEdgesInto(edges, hhIds)) {
    if (!g.parents.has(e.b)) g.parents.set(e.b, new Set());
    g.parents.get(e.b)!.add(e.a);
  }
  const gen = generationRows(mem, g.parents);
  alignPartnerGenerationsFromGraph(mem, gen, g.partner);
  propagateGenerationsFromParents(mem, gen, g.parents);
  const minGen = Math.min(...mem.map((n) => gen.get(n.id) ?? 0));
  const maxGen = Math.max(...mem.map((n) => gen.get(n.id) ?? 0));
  const pitchY = rowPitch();

  const placed: PlacedCard[] = [];
  const placedById = new Map<string, PlacedCard>();
  /** Offset so gen 1 in this block aligns with gen 1 in linked neighbor blocks. */
  let cardY =
    originY + LAYOUT.hhHeader + LAYOUT.hhPad + minGen * pitchY;

  for (let gi = minGen; gi <= maxGen; gi++) {
    const rowMem = mem.filter((n) => (gen.get(n.id) ?? 0) === gi);
    if (!rowMem.length) continue;
    const row = layoutGenerationRow(
      rowMem,
      g,
      placedById,
      hhIds,
      originX + LAYOUT.hhPad,
      cardY,
      gi,
    );
    for (const p of row.placed) placedById.set(p.id, p);
    placed.push(...row.placed);
    cardY += pitchY;
  }

  const { placed: normalized, w, h } = finalizeHouseholdBlock(
    placed,
    originX,
    originY,
  );
  return { gid: mem[0]!.gid, w, h, placed: normalized };
}

type WorldBlock = { world: string; w: number; h: number; placed: PlacedCard[] };

type TitleBox = { gid: string; l: number; t: number; r: number; b: number; cardsR: number };

/**
 * First layout epoch whose packing moves households out from under a
 * neighbour's name tag. Older epochs are still packed without it, so a board
 * saved under them can be pinned to where it was (see prepareLoadedNodes).
 */
export const TITLE_OVERHANG_EPOCH = 2;

/**
 * Move households out from under a neighbour's name tag, inside one world.
 *
 * A household's drawn box widens to fit its "Name · Neighbourhood · World"
 * tag (householdChrome), so a narrow household with a long title reaches past
 * its cards into the next column. Columns are sized by cards, which let a
 * neighbour sit under that overhang. Going top to bottom, a household whose
 * box meets an earlier one's only because of a title moves straight down
 * below it. Nothing else in the world moves, and a world without such a clash
 * packs exactly as before; one that grows taller can still shift the worlds
 * packed after it. Returns the new content height.
 */
function clearTitleOverhangs(
  placed: PlacedCard[],
  households: [string, SimNode[]][],
  contentH: number,
  epoch: number,
): number {
  const gidOf = new Map<string, string>();
  const label = new Map<string, number>();
  for (const [gid, mem] of households) {
    for (const n of mem) gidOf.set(n.id, gid);
    const first = mem[0];
    if (first) {
      const tag =
        epoch < NOT_IN_WORLD_EPOCH && first.world === OTHER_WORLD
          ? { ...first, world: LEGACY_NOT_IN_WORLD[0] }
          : first;
      label.set(gid, HH_TAG_INSET * 2 + householdTagWidth(tag));
    }
  }
  const cards = new Map<string, PlacedCard[]>();
  for (const p of placed) {
    const gid = gidOf.get(p.id);
    if (!gid) continue;
    cards.set(gid, [...(cards.get(gid) ?? []), p]);
  }
  const boxes: TitleBox[] = [];
  for (const [gid, mem] of cards) {
    const l = Math.min(...mem.map((p) => p.x));
    const cardsR = Math.max(...mem.map((p) => p.x + p.w));
    boxes.push({
      gid,
      l,
      t: Math.min(...mem.map((p) => p.y)) - LAYOUT.hhHeader,
      r: Math.max(cardsR, l + (label.get(gid) ?? 0)),
      b: Math.max(...mem.map((p) => p.y + p.h)),
      cardsR,
    });
  }
  if (!boxes.some((b) => b.r > b.cardsR)) return contentH;

  const meet = (a: TitleBox, b: TitleBox, ar: number, br: number) =>
    a.l < br && ar > b.l && a.t < b.b && a.b > b.t;
  boxes.sort((a, b) => a.t - b.t || a.l - b.l);
  const settled: TitleBox[] = [];
  /** Boxes this pass pushed down; their cards may now land on others'. */
  const pushed = new Set<string>();
  let bottom = contentH;
  for (const box of boxes) {
    let dy = 0;
    for (;;) {
      const over = settled.find(
        (s) =>
          meet(box, s, box.r, s.r) &&
          (!meet(box, s, box.cardsR, s.cardsR) ||
            // Before NOT_IN_WORLD_EPOCH a pushed box could settle on another's
            // cards; kept so older boards still pin to where they were.
            (epoch >= NOT_IN_WORLD_EPOCH && (dy > 0 || pushed.has(s.gid)))),
      );
      if (!over) break;
      const step = Math.ceil((over.b + LAYOUT.hhGap - box.t) / TILE) * TILE;
      box.t += step;
      box.b += step;
      dy += step;
    }
    if (dy) {
      for (const p of cards.get(box.gid)!) p.y += dy;
      bottom = Math.max(bottom, box.b);
      pushed.add(box.gid);
    }
    settled.push(box);
  }
  return bottom;
}

/** Not in any world (see NOT_IN_WORLD); packed as its own grid, right of the rest. */
export const OTHER_WORLD = NOT_IN_WORLD;

/**
 * First layout epoch with Other renamed Not in any world. The name is part
 * of each household tag there, and packing leaves room for tags, so older
 * epochs measure those tags with the old, shorter name.
 */
export const NOT_IN_WORLD_EPOCH = 4;

function layoutOtherWorld(
  mem: SimNode[],
  edges: Edge[],
  epoch: number,
  side: 'left' | 'right' = 'left',
): WorldBlock {
  const byGid = new Map<string, SimNode[]>();
  for (const n of mem) {
    if (!byGid.has(n.gid)) byGid.set(n.gid, []);
    byGid.get(n.gid)!.push(n);
  }

  const households = [...byGid.entries()].sort((a, b) =>
    (a[1][0]?.hh ?? a[0]).localeCompare(b[1][0]?.hh ?? b[0]),
  );

  const { placed, w: contentW, h: gridH } = placeOtherWorldGrid(
    households,
    edges,
    epoch,
    side,
  );
  const contentH =
    epoch >= TITLE_OVERHANG_EPOCH ? clearTitleOverhangs(placed, households, gridH, epoch) : gridH;

  return {
    world: OTHER_WORLD,
    w: contentW + LAYOUT.worldMargin * 2,
    h: contentH + LAYOUT.worldTitle + LAYOUT.worldMargin * 2,
    placed,
  };
}

/** Households in a fixed 3-column grid inside the world. */
function layoutWorld(
  mem: SimNode[],
  edges: Edge[],
  world: string,
  epoch: number,
): WorldBlock {
  if (world === OTHER_WORLD) return layoutOtherWorld(mem, edges, epoch);
  const hhLinks = buildHouseholdLinks(mem, edges);
  const byGid = new Map<string, SimNode[]>();
  for (const n of mem) {
    if (!byGid.has(n.gid)) byGid.set(n.gid, []);
    byGid.get(n.gid)!.push(n);
  }

  const minGen = (hhMem: SimNode[]) => householdMinGen(hhMem, edges);

  const households = orderHouseholdsByLinks(
    [...byGid.entries()],
    hhLinks,
    minGen,
  );

  const { placed, w: contentW, h: bentoH } = placeHouseholdBento(
    households,
    edges,
    hhLinks,
    LAYOUT.hhPerRow,
    epoch,
  );
  const contentH =
    epoch >= TITLE_OVERHANG_EPOCH ? clearTitleOverhangs(placed, households, bentoH, epoch) : bentoH;

  return {
    world: mem[0]?.world ?? '',
    w: contentW + LAYOUT.worldMargin * 2,
    h: contentH + LAYOUT.worldTitle + LAYOUT.worldMargin * 2,
    placed,
  };
}

/**
 * First layout epoch that lines worlds up in columns by how many households
 * they have (see placeWorldsInColumns). Older epochs pack worlds in the
 * shortest-column masonry, so boards saved under them pin to where they were.
 */
export const WORLD_COLUMNS_EPOCH = 5;

/** A column holds at most this many worlds; a longer run splits evenly. */
const COLUMN_MAX_WORLDS = 6;
/** Air between world columns, wider than between worlds stacked in one. */
const COLUMN_GAP = 3 * TILE;
/** From one stacked world's content to the next one's (frame gap ~1.5 tiles). */
const COLUMN_STACK_GAP = 2 * TILE;
/** Not in any world tag columns a world column may widen to (see packNotInWorldColumns). */
const NOT_IN_WORLD_MAX_COLS = 12;

/** Cards of a block from their own top-left, with the room their tags take. */
type Extent = { minX: number; minY: number; w: number; h: number };

function tileCeil(v: number): number {
  return Math.ceil(v / TILE) * TILE;
}

/**
 * Where a block's cards start and how far its boxes reach, name tags
 * included: a tag can run past the cards, and the next column must clear it.
 * `h` runs from the top of the tag band over the first card row.
 */
function blockExtent(placed: PlacedCard[], households: [string, SimNode[]][]): Extent {
  if (!placed.length) return { minX: 0, minY: 0, w: 0, h: 0 };
  const minX = Math.min(...placed.map((p) => p.x));
  const minY = Math.min(...placed.map((p) => p.y));
  let r = Math.max(...placed.map((p) => p.x + p.w));
  const b = Math.max(...placed.map((p) => p.y + p.h));
  const at = new Map(placed.map((p) => [p.id, p]));
  for (const [, mem] of households) {
    const cards = mem.map((n) => at.get(n.id)).filter((p): p is PlacedCard => !!p);
    if (!cards.length) continue;
    const l = Math.min(...cards.map((p) => p.x));
    r = Math.max(r, l + HH_TAG_INSET * 2 + householdTagWidth(mem[0]));
  }
  return { minX, minY, w: r - minX, h: b - minY + HH_TAG_BAND };
}

/** Most common non-empty value of `key` among `nodes`; ties go to the name first in order. */
function mostCommon(nodes: SimNode[], key: (n: SimNode) => string): string {
  const counts = new Map<string, number>();
  for (const n of nodes) {
    const v = key(n);
    if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  let best = '';
  let nBest = 0;
  for (const [v, c] of counts) {
    if (c > nBest || (c === nBest && v.localeCompare(best) < 0)) {
      best = v;
      nBest = c;
    }
  }
  return best;
}

/**
 * The world each game introduced, read off the board: a world's game is the
 * one most of its cards come from, and a game with two worlds (the base game)
 * goes with the one holding more of its cards.
 */
function worldOfPack(byWorld: Map<string, SimNode[]>): Map<string, string> {
  const best = new Map<string, { world: string; n: number }>();
  for (const [world, mem] of byWorld) {
    if (world === OTHER_WORLD) continue;
    const pack = mostCommon(mem, (n) => n.pack);
    if (!pack) continue;
    const n = mem.filter((m) => m.pack === pack).length;
    const prev = best.get(pack);
    if (!prev || n > prev.n || (n === prev.n && world.localeCompare(prev.world) < 0)) {
      best.set(pack, { world, n });
    }
  }
  return new Map([...best].map(([pack, { world }]) => [pack, world]));
}

type ColumnWorld = {
  block: WorldBlock;
  extent: Extent;
  households: number;
  sims: number;
};

/**
 * Worlds left to right by how many households they have, and top to bottom
 * by how many sims, as the world tags count them. Each household count gets
 * its own column; more than {@link COLUMN_MAX_WORLDS} worlds with the same
 * count split into even columns, fewest sims first.
 */
function worldColumns(worlds: ColumnWorld[]): ColumnWorld[][] {
  const sorted = [...worlds].sort(
    (a, b) =>
      a.households - b.households ||
      a.sims - b.sims ||
      a.block.world.localeCompare(b.block.world),
  );
  const cols: ColumnWorld[][] = [];
  for (let i = 0; i < sorted.length; ) {
    let j = i;
    while (j < sorted.length && sorted[j]!.households === sorted[i]!.households) j++;
    const run = sorted.slice(i, j);
    const size = Math.ceil(run.length / Math.ceil(run.length / COLUMN_MAX_WORLDS));
    for (let k = 0; k < run.length; k += size) cols.push(run.slice(k, k + size));
    i = j;
  }
  return cols;
}

/** One world column's share of Not in any world, packed and measured. */
type NotInWorldPart = { placed: PlacedCard[]; extent: Extent };

function packNotInWorldPart(
  tiles: OtherTile[],
  gridCols: number,
  epoch: number,
): NotInWorldPart {
  const { placed } = packOtherTiles(tiles, gridCols);
  const households = tiles.flatMap((t) => t.households);
  clearTitleOverhangs(placed, households, 0, epoch);
  return { placed, extent: blockExtent(placed, households) };
}

/**
 * Not in any world, spread over the world columns: each household sits over
 * the column of the world its game brought (Fia Acosta, from Royalty &
 * Legacy, over Ondarion's). Households whose game has no world, and the
 * Unhoused sims box, take one more column at the end. A column's share
 * starts as wide as its worlds; a crowded one widens until it is about as
 * tall as the shares would be spread evenly, so one game cannot tower over
 * the rest.
 */
function packNotInWorldColumns(
  mem: SimNode[],
  edges: Edge[],
  epoch: number,
  columnOfPack: (pack: string) => number | undefined,
  colWidths: number[],
): NotInWorldPart[] {
  const byGid = new Map<string, SimNode[]>();
  for (const n of mem) {
    if (!byGid.has(n.gid)) byGid.set(n.gid, []);
    byGid.get(n.gid)!.push(n);
  }
  const households = [...byGid.entries()].sort((a, b) =>
    (a[1][0]?.hh ?? a[0]).localeCompare(b[1][0]?.hh ?? b[0]),
  );
  const tiles = otherWorldTiles(households, edges, epoch);
  const extra = colWidths.length;
  const byCol: OtherTile[][] = Array.from({ length: extra + 1 }, () => []);
  for (const tile of tiles) {
    const col = tile.unhoused
      ? undefined
      : columnOfPack(mostCommon(tile.households.flatMap(([, m]) => m), (n) => n.pack));
    byCol[col ?? extra]!.push(tile);
  }

  const pitch = CARD_MIN_W + LAYOUT.gapX;
  const minCols = byCol.map((col, c) =>
    Math.max(
      1,
      ...col.map((t) => t.colSpan),
      c < extra ? Math.floor((colWidths[c]! + LAYOUT.gapX) / pitch) : 1,
    ),
  );
  const area = tiles.reduce((s, t) => s + t.colSpan * (t.h + LAYOUT.hhGap), 0);
  const usedCols = minCols.reduce((s, k, c) => s + (byCol[c]!.length ? k : 0), 0);
  const target = Math.max(
    ...tiles.map((t) => t.h),
    usedCols ? area / usedCols : 0,
  );
  return byCol.map((col, c) => {
    if (!col.length) return { placed: [], extent: { minX: 0, minY: 0, w: 0, h: 0 } };
    let k = minCols[c]!;
    let part = packNotInWorldPart(col, k, epoch);
    while (part.extent.h - HH_TAG_BAND > target && k < NOT_IN_WORLD_MAX_COLS) {
      k += 1;
      part = packNotInWorldPart(col, k, epoch);
    }
    return part;
  });
}

/**
 * Worlds in columns by household count (see worldColumns), left-aligned and
 * evenly spaced, under one band of Not in any world whose households sit
 * over their game's world (see packNotInWorldColumns). Null when there is no
 * world but Not in any world to line up.
 */
function placeWorldsInColumns(
  byWorld: Map<string, SimNode[]>,
  worldOrder: string[],
  edges: Edge[],
  epoch: number,
): Map<string, LayoutBase> | null {
  const named: ColumnWorld[] = [];
  for (const world of worldOrder) {
    const mem = byWorld.get(world);
    if (world === OTHER_WORLD || !mem?.length) continue;
    const block = layoutWorld(mem, edges, world, epoch);
    const byGid = new Map<string, SimNode[]>();
    for (const n of mem) byGid.set(n.gid, [...(byGid.get(n.gid) ?? []), n]);
    const counts = worldCounts(mem, () => true);
    named.push({
      block,
      extent: blockExtent(block.placed, [...byGid.entries()]),
      households: counts.households,
      sims: counts.sims,
    });
  }
  if (!named.length) return null;

  const cols = worldColumns(named);
  const colOfWorld = new Map<string, number>();
  cols.forEach((col, c) => col.forEach((w) => colOfWorld.set(w.block.world, c)));
  const packWorld = worldOfPack(byWorld);
  const worldWidths = cols.map((col) => Math.max(...col.map((w) => w.extent.w)));
  const other = byWorld.get(OTHER_WORLD) ?? [];
  const parts = other.length
    ? packNotInWorldColumns(
        other,
        edges,
        epoch,
        (pack) => colOfWorld.get(packWorld.get(pack) ?? ''),
        worldWidths,
      )
    : [];

  const bases = new Map<string, LayoutBase>();
  const put = (placed: PlacedCard[], extent: Extent, x: number, top: number) => {
    for (const p of placed) {
      bases.set(p.id, {
        x: x + p.x - extent.minX,
        y: top + HH_TAG_BAND + p.y - extent.minY,
        w: p.w,
        h: p.h,
      });
    }
  };

  const left = tileCeil(LAYOUT.originX + LAYOUT.worldMargin);
  const bandTop = tileCeil(LAYOUT.originY + LAYOUT.worldTitle);
  const bandH = Math.max(0, ...parts.map((p) => p.extent.h));
  const worldsTop = bandH ? tileCeil(bandTop + bandH + COLUMN_GAP) : bandTop;
  let x = left;
  for (let c = 0; c < Math.max(cols.length, parts.length); c++) {
    const col = cols[c] ?? [];
    const part = parts[c];
    if (!col.length && !part?.placed.length) continue;
    if (part?.placed.length) {
      put(part.placed, part.extent, x, bandTop + bandH - part.extent.h);
    }
    let top = worldsTop;
    for (const w of col) {
      put(w.block.placed, w.extent, x, top);
      top = tileCeil(top + w.extent.h + COLUMN_STACK_GAP);
    }
    // Room for the column's world tags as they grow zoomed out, too.
    const width = Math.max(
      part?.extent.w ?? 0,
      ...col.map((w) => Math.max(w.extent.w, worldTagReserve(w.block.world) + TILE - COLUMN_GAP)),
    );
    x = tileCeil(x + width + COLUMN_GAP);
  }
  return bases;
}

/**
 * Packing identity — membership, names, neighbourhoods, ages, and edges. Visual `ox`/`oy`
 * (and derived x/y/w/h) do not change packed bases.
 */
export function packingSignature(
  nodes: SimNode[],
  worlds: World[],
  edges: Edge[],
): string {
  const parts: string[] = [];
  for (const w of worlds) parts.push('w', w.name);
  for (const n of nodes) {
    parts.push(
      n.id,
      n.gid,
      n.world || '',
      n.hh,
      // Part of the household's name tag, which packing leaves room for.
      n.nb,
      n.age,
      // Living sims are counted to order the world columns.
      n.state,
      n.first,
      n.sur,
      n.gender,
    );
  }
  for (const e of edges) parts.push(e.id, e.a, e.b, e.type);
  return parts.join('\0');
}

type LayoutBase = { x: number; y: number; w: number; h: number };

let layoutBasesCache: { signature: string; bases: Map<string, LayoutBase> } | null =
  null;

function computeLayoutBases(
  nodes: SimNode[],
  worlds: World[],
  edges: Edge[],
  epoch: number,
): Map<string, LayoutBase> {
  buildLinkIndex(edges);
  const byWorld = new Map<string, SimNode[]>();
  for (const n of nodes) {
    const w = n.world || OTHER_WORLD;
    if (!byWorld.has(w)) byWorld.set(w, []);
    byWorld.get(w)!.push(n);
  }

  const worldOrder = [
    ...worlds.map((w) => w.name).filter((w) => byWorld.has(w)),
    ...[...byWorld.keys()].filter((w) => !worlds.some((o) => o.name === w)),
  ];

  if (epoch >= WORLD_COLUMNS_EPOCH) {
    const bases = placeWorldsInColumns(byWorld, worldOrder, edges, epoch);
    if (bases) {
      resolveHouseholdBoxOverlaps(nodes, bases, edges);
      return bases;
    }
  }

  const worldBlocks = worldOrder
    .map((world) => {
      const mem = byWorld.get(world);
      return mem?.length ? layoutWorld(mem, edges, world, epoch) : null;
    })
    .filter((b): b is WorldBlock => b !== null);

  const bases = placeWorldColumns(worldBlocks);
  resolveHouseholdBoxOverlaps(nodes, bases, edges);
  return bases;
}

/**
 * Packed base position of every card. `epoch` picks the packing rules; only
 * loading a board saved under an older {@link LAYOUT_EPOCH} asks for anything
 * but the current ones.
 */
export function layoutBases(
  nodes: SimNode[],
  worlds: World[],
  edges: Edge[],
  epoch: number = LAYOUT_EPOCH,
): Map<string, { x: number; y: number; w: number; h: number }> {
  const signature = `${epoch}\0${packingSignature(nodes, worlds, edges)}`;
  if (layoutBasesCache?.signature === signature) return layoutBasesCache.bases;
  const bases = computeLayoutBases(nodes, worlds, edges, epoch);
  layoutBasesCache = { signature, bases };
  return bases;
}

/** Union-find cluster id per gid from cross-household edges. */
function linkedClusterByGid(
  worldNodes: SimNode[],
  edges: Edge[],
): Map<string, string> {
  const idToGid = new Map(worldNodes.map((n) => [n.id, n.gid]));
  const parent = new Map<string, string>();
  const find = (g: string): string => {
    if (!parent.has(g)) parent.set(g, g);
    if (parent.get(g) !== g) parent.set(g, find(parent.get(g)!));
    return parent.get(g)!;
  };
  for (const n of worldNodes) find(n.gid);
  for (const e of edges) {
    const ga = idToGid.get(e.a);
    const gb = idToGid.get(e.b);
    if (ga && gb && ga !== gb) {
      const ra = find(ga);
      const rb = find(gb);
      if (ra !== rb) parent.set(ra, rb);
    }
  }
  const out = new Map<string, string>();
  for (const n of worldNodes) out.set(n.gid, find(n.gid));
  return out;
}

type HHBox = { l: number; t: number; r: number; b: number };

function householdBox(
  gid: string,
  world: string,
  nodes: SimNode[],
  bases: Map<string, { x: number; y: number; w: number; h: number }>,
): HHBox | null {
  const pad = LAYOUT.hhPad;
  const hdr = LAYOUT.hhHeader;
  let x0 = 1e9;
  let y0 = 1e9;
  let x1 = -1e9;
  let y1 = -1e9;
  let any = false;
  for (const n of nodes) {
    if (n.gid !== gid || (n.world || OTHER_WORLD) !== world) continue;
    const b = bases.get(n.id);
    if (!b) continue;
    any = true;
    x0 = Math.min(x0, b.x);
    y0 = Math.min(y0, b.y);
    x1 = Math.max(x1, b.x + b.w);
    y1 = Math.max(y1, b.y + b.h);
  }
  if (!any) return null;
  return { l: x0 - pad, t: y0 - pad - hdr, r: x1 + pad, b: y1 + pad };
}

function boxesOverlap(a: HHBox, b: HHBox): boolean {
  return a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
}

function shiftHouseholdX(
  gid: string,
  world: string,
  dx: number,
  nodes: SimNode[],
  bases: Map<string, { x: number; y: number; w: number; h: number }>,
): void {
  for (const n of nodes) {
    if (n.gid !== gid || (n.world || OTHER_WORLD) !== world) continue;
    const b = bases.get(n.id);
    if (b) b.x += dx;
  }
}

function shiftHouseholdY(
  gid: string,
  world: string,
  dy: number,
  nodes: SimNode[],
  bases: Map<string, { x: number; y: number; w: number; h: number }>,
): void {
  for (const n of nodes) {
    if (n.gid !== gid || (n.world || OTHER_WORLD) !== world) continue;
    const b = bases.get(n.id);
    if (b) b.y += dy;
  }
}

/** Guarantee dashed household boxes never overlap in the initial layout. */
function resolveHouseholdBoxOverlaps(
  nodes: SimNode[],
  bases: Map<string, { x: number; y: number; w: number; h: number }>,
  edges: Edge[],
): void {
  const gap = LAYOUT.householdGap;
  const worlds = [...new Set(nodes.map((n) => n.world || OTHER_WORLD))];
  for (const world of worlds) {
    if (world === OTHER_WORLD) continue;
    const worldNodes = nodes.filter(
      (n) => (n.world || OTHER_WORLD) === world,
    );
    const cluster = linkedClusterByGid(worldNodes, edges);
    const gids = [...new Set(worldNodes.map((n) => n.gid))];
    for (let pass = 0; pass < 48; pass++) {
      let moved = false;
      for (let i = 0; i < gids.length; i++) {
        for (let j = i + 1; j < gids.length; j++) {
          const ga = gids[i]!;
          const gb = gids[j]!;
          if (cluster.get(ga) === cluster.get(gb)) continue;
          const a = householdBox(ga, world, nodes, bases);
          const b = householdBox(gb, world, nodes, bases);
          if (!a || !b || !boxesOverlap(a, b)) continue;
          const dx = a.r - b.l + gap;
          const dy = a.b - b.t + gap;
          if (dx > 0 && dx >= dy) {
            shiftHouseholdX(gb, world, dx, nodes, bases);
            moved = true;
          } else if (dy > 0) {
            shiftHouseholdY(gb, world, dy, nodes, bases);
            moved = true;
          }
        }
      }
      if (!moved) break;
    }
  }
}

export function computeLayout(
  nodes: SimNode[],
  worlds: World[],
  edges: Edge[],
  epoch: number = LAYOUT_EPOCH,
): SimNode[] {
  const bases = layoutBases(nodes, worlds, edges, epoch);
  return nodes.map((n) => {
    const base = bases.get(n.id);
    const size = measureCard(n);
    if (!base) {
      return {
        ...n,
        w: size.w,
        h: size.h,
        x: LAYOUT.originX + (n.ox ?? 0),
        y: LAYOUT.originY + (n.oy ?? 0),
      };
    }
    return {
      ...n,
      w: size.w,
      h: size.h,
      x: base.x + (n.ox ?? 0),
      y: base.y + (n.oy ?? 0),
    };
  });
}

/**
 * Spots for sims joining a household, in rows under its current cards and no
 * wider than they are, so the household box grows straight down.
 */
export function rowsUnderHousehold(
  home: { x: number; y: number; w?: number; h?: number }[],
  joiners: SimNode[],
): Map<string, { x: number; y: number }> {
  const out = new Map<string, { x: number; y: number }>();
  if (!home.length) return out;
  const left = Math.min(...home.map((n) => n.x));
  const right = Math.max(...home.map((n) => n.x + (n.w || CARD_MIN_W)));
  const bottom = Math.max(...home.map((n) => n.y + (n.h || CARD_H)));
  const rowW = right - left;
  let x = left;
  let y = bottom + LAYOUT.gapYExtra;
  for (const n of joiners) {
    const size = measureCard(n);
    if (x > left && x + size.w > left + rowW) {
      x = left;
      y += rowPitch();
    }
    out.set(n.id, tileSnapOrigin(x, y));
    x += size.w + LAYOUT.partnerGap;
  }
  return out;
}

/**
 * Where a sim added with a household's + goes: on its bottom row, a tile
 * right of the last card, while that stays inside the household's box (its
 * name tag can make the box wider than its cards); otherwise in a new row
 * under the cards, from the left, a row further down past any card there.
 */
export function householdAddSpot(
  home: SpawnRect[],
  occupied: SpawnRect[],
  boxRight: number,
): { x: number; y: number } {
  const size = { w: CARD_MIN_W, h: CARD_H };
  const free = (x: number, y: number) =>
    !occupied.some((o) => rectsOverlap({ x, y, ...size }, o));
  const rowY = Math.max(...home.map((n) => n.y));
  const rowRight = Math.max(...home.filter((n) => n.y === rowY).map((n) => n.x + n.w));
  const besideX = rowRight + LAYOUT.partnerGap;
  if (besideX + size.w <= boxRight && free(besideX, rowY)) {
    return tileSnapOrigin(besideX, rowY);
  }
  const left = Math.min(...home.map((n) => n.x));
  let y = Math.max(...home.map((n) => n.y + n.h)) + LAYOUT.gapYExtra;
  for (let i = 0; i <= occupied.length && !free(left, y); i++) y += rowPitch();
  return tileSnapOrigin(left, y);
}

/**
 * Keep existing cards where they are. A sim who joins a household already on
 * the board goes in rows under that household's cards, so its box grows in
 * place instead of stretching down to wherever the newcomer lands. Pack
 * brand-new households in a grid under each world's current cards, no wider
 * than the world already is, so a save merge does not restack the board.
 *
 * Growing a household or world can still run it into whatever sits below;
 * {@link separateImportOverlaps} pushes those apart afterwards.
 */
export function offsetsForNewGids(
  prevById: Record<string, SimNode>,
  nextCore: SimNode[],
  worlds: World[],
  edges: Edge[],
  /**
   * Top-left card spot for a new box, and its cards' spots from there
   * (`rel`); without `rel`, the layout's own arrangement of the box.
   */
  anchors: ReadonlyMap<string, { x: number; y: number; rel?: ReadonlyMap<string, { x: number; y: number }> }> = new Map(),
): SimNode[] {
  const bases = layoutBases(nextCore, worlds, edges);
  const newcomers = nextCore.filter((n) => !prevById[n.id]);
  /** Each card's spot inside its box as the layout packs it, from the box's top-left card. */
  const inBox = (members: SimNode[]) => {
    const at = members.map((m) => bases.get(m.id) ?? { x: 0, y: 0, w: CARD_MIN_W, h: CARD_H });
    const x0 = Math.min(...at.map((b) => b.x));
    const y0 = Math.min(...at.map((b) => b.y));
    return {
      rel: new Map(members.map((m, i) => [m.id, { x: at[i]!.x - x0, y: at[i]!.y - y0 }])),
      w: Math.max(...at.map((b) => b.x + b.w)) - x0,
      h: Math.max(...at.map((b) => b.y + b.h)) - y0,
    };
  };
  const prevByGid = new Map<string, SimNode[]>();
  for (const n of Object.values(prevById)) {
    const list = prevByGid.get(n.gid) ?? [];
    list.push(n);
    prevByGid.set(n.gid, list);
  }
  const pack = new Map<string, { x: number; y: number }>();
  /** Cards each world already has, plus joiners placed below. */
  const footprint = new Map<string, { x: number; y: number; w: number; h: number }[]>();
  for (const n of Object.values(prevById)) {
    const world = n.world || OTHER_WORLD;
    const list = footprint.get(world) ?? [];
    list.push({ x: n.x, y: n.y, w: n.w || CARD_MIN_W, h: n.h || CARD_H });
    footprint.set(world, list);
  }

  const joinersByGid = new Map<string, SimNode[]>();
  const gidsByWorld = new Map<string, string[]>();
  const seenGid = new Set<string>();
  for (const n of newcomers) {
    if (prevByGid.has(n.gid)) {
      const list = joinersByGid.get(n.gid) ?? [];
      list.push(n);
      joinersByGid.set(n.gid, list);
      continue;
    }
    if (seenGid.has(n.gid)) continue;
    const anchor = anchors.get(n.gid);
    if (anchor) {
      seenGid.add(n.gid);
      const rel = anchor.rel ?? inBox(newcomers.filter((m) => m.gid === n.gid)).rel;
      for (const [id, d] of rel) pack.set(id, tileSnapOrigin(anchor.x + d.x, anchor.y + d.y));
      continue;
    }
    seenGid.add(n.gid);
    const world = n.world || OTHER_WORLD;
    const list = gidsByWorld.get(world) ?? [];
    list.push(n.gid);
    gidsByWorld.set(world, list);
  }

  for (const [gid, joiners] of joinersByGid) {
    const home = prevByGid.get(gid)!;
    const placed = footprint.get(home[0]!.world || OTHER_WORLD) ?? [];
    for (const [id, at] of rowsUnderHousehold(home, joiners)) {
      pack.set(id, at);
      placed.push({ ...at, ...measureCard() });
    }
  }

  for (const [world, gids] of gidsByWorld) {
    const old = footprint.get(world) ?? [];
    if (!old.length) continue;
    const origin = tileSnapOrigin(
      Math.min(...old.map((n) => n.x)),
      Math.max(...old.map((n) => n.y + n.h)) + LAYOUT.worldGapY,
    );
    const originX = origin.x;
    const rowMax = Math.min(
      world === OTHER_WORLD ? LAYOUT.worldRowMaxW * 1.4 : LAYOUT.worldRowMaxW,
      Math.max(...old.map((n) => n.x + n.w)) - originX,
    );
    let x = originX;
    let y = origin.y;
    let rowH = 0;
    for (const gid of gids) {
      const members = newcomers.filter((n) => n.gid === gid);
      if (isUnhousedGid(gid)) {
        // A grid, not a row: keep the layout's arrangement of the box.
        const box = inBox(members);
        const blockH = LAYOUT.hhHeader + box.h;
        if (x > originX && x + box.w > originX + rowMax) {
          x = originX;
          y += rowH + LAYOUT.hhGap;
          rowH = 0;
        }
        for (const [id, d] of box.rel) {
          pack.set(id, tileSnapOrigin(x + d.x, y + LAYOUT.hhHeader + d.y));
        }
        x += box.w + LAYOUT.householdGap;
        rowH = Math.max(rowH, blockH);
        continue;
      }
      const sizes = members.map((m) => measureCard(m));
      const blockW =
        sizes.reduce((s, z) => s + z.w, 0) +
        LAYOUT.partnerGap * Math.max(0, members.length - 1);
      const blockH = LAYOUT.hhHeader + Math.max(...sizes.map((z) => z.h), CARD_H);
      if (x > originX && x + blockW > originX + rowMax) {
        x = originX;
        y += rowH + LAYOUT.hhGap;
        rowH = 0;
      }
      let cx = x;
      for (let i = 0; i < members.length; i++) {
        pack.set(members[i]!.id, tileSnapOrigin(cx, y + LAYOUT.hhHeader));
        cx += sizes[i]!.w + LAYOUT.partnerGap;
      }
      x += blockW + LAYOUT.householdGap;
      rowH = Math.max(rowH, blockH);
    }
  }

  return nextCore.map((n) => {
    const base = bases.get(n.id);
    const prev = prevById[n.id];
    if (prev && base) {
      return { ...n, ox: prev.x - base.x, oy: prev.y - base.y };
    }
    const p = pack.get(n.id);
    if (p && base) {
      return { ...n, ox: p.x - base.x, oy: p.y - base.y };
    }
    return n;
  });
}
