import { AGES_H, CARD_H, CARD_MIN_W, HH_TAG_BAND, TILE } from './constants.ts';
import { tileSnapOrigin } from './tiles.ts';
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
  worldTitle: 32,
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

function buildHHGraph(mem: SimNode[], edges: Edge[]): HHGraph {
  const ids = new Set(mem.map((n) => n.id));
  const byId = new Map(mem.map((n) => [n.id, n]));
  const partner = new Map<string, string>();
  const parents = new Map<string, Set<string>>();

  for (const e of edges) {
    if (!ids.has(e.a) || !ids.has(e.b)) continue;
    if (e.type === 'marriage' || e.type === 'romance' || e.type === 'divorced') {
      partner.set(e.a, e.b);
      partner.set(e.b, e.a);
    }
  }

  for (const e of edges) {
    if (e.type !== 'parent' || !ids.has(e.a) || !ids.has(e.b)) continue;

    const bParentsKidsInHh = edges.some(
      (x) => x.type === 'parent' && x.a === e.b && ids.has(x.b),
    );
    const aParentsThoseKids = edges.some(
      (x) =>
        x.type === 'parent' &&
        x.a === e.a &&
        x.b !== e.b &&
        ids.has(x.b),
    );
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

/** Partner alignment can pull a parent down — re-seat their children on lower rows. */
function propagateGenerationsFromParents(
  mem: SimNode[],
  gen: Map<string, number>,
  parents: Map<string, Set<string>>,
): void {
  const ids = new Set(mem.map((n) => n.id));
  let changed = true;
  while (changed) {
    changed = false;
    for (const n of mem) {
      const ps = [...(parents.get(n.id) ?? [])].filter((p) => ids.has(p));
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
function buildHouseholdLinks(
  mem: SimNode[],
  edges: Edge[],
): Map<string, Set<string>> {
  const idToGid = new Map(mem.map((n) => [n.id, n.gid]));
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
): { placed: PlacedCard[]; w: number; h: number; colSpan: number } {
  const g = buildHHGraph(mem, edges);
  const hhIds = new Set(mem.map((n) => n.id));
  for (const e of edges) {
    if (e.type !== 'parent' || !hhIds.has(e.b)) continue;
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
  const pinned: PlacedCard[] = [];
  for (const row of groupPlacedByRow(placed)) {
    pinned.push(...pinRowToColumn(row, rowX, span));
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
};

/**
 * Other world: linked households cluster tight (40px); everyone else fills
 * 7 vertical tag columns via shortest-column masonry.
 */
function placeOtherWorldGrid(
  households: [string, SimNode[]][],
  edges: Edge[],
): { placed: PlacedCard[]; w: number; h: number } {
  const gridCols = LAYOUT.otherHhCols;
  const hhLinks = buildHouseholdLinks(
    households.flatMap(([, mem]) => mem),
    edges,
  );
  const components = buildHouseholdComponents(households, hhLinks);

  const tiles: OtherTile[] = [];
  for (const comp of components) {
    if (comp.length === 1) {
      const [gid, mem] = comp[0]!;
      const block = layoutOtherHouseholdTile(mem, edges);
      tiles.push({
        placed: block.placed,
        w: block.w,
        h: block.h,
        colSpan: block.colSpan,
        sortKey: mem[0]?.hh ?? gid,
        isCluster: false,
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
      });
    }
  }

  tiles.sort((a, b) => {
    if (a.isCluster !== b.isCluster) return a.isCluster ? -1 : 1;
    return a.sortKey.localeCompare(b.sortKey);
  });

  const colHeights = new Array<number>(gridCols).fill(0);
  const placed: PlacedCard[] = [];

  for (const tile of tiles) {
    const span = Math.min(tile.colSpan, gridCols);
    let bestCol = 0;
    let bestY = Infinity;
    for (let c = 0; c <= gridCols - span; c++) {
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

  return {
    placed,
    w: otherGridWidth(),
    h: Math.max(...colHeights, 0),
  };
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
  for (const e of edges) {
    if (e.type !== 'parent' || !allIds.has(e.b)) continue;
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
): HHTile {
  const block = layoutHousehold(mem, edges, 0, 0);
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
): { placed: PlacedCard[]; w: number; h: number } {
  const components = buildHouseholdComponents(households, hhLinks);
  const clusterTiles: HHTile[] = [];
  const singleTiles: HHTile[] = [];

  for (const comp of components) {
    if (comp.length === 1) {
      const [gid, mem] = comp[0]!;
      singleTiles.push(layoutSingleTile(gid, mem, edges));
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
): HHBlock {
  const g = buildHHGraph(mem, edges);
  const hhIds = new Set(mem.map((n) => n.id));
  /** Parents in linked households still set generation rows for children here. */
  for (const e of edges) {
    if (e.type !== 'parent' || !hhIds.has(e.b)) continue;
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

export const OTHER_WORLD = 'Other';

function layoutOtherWorld(mem: SimNode[], edges: Edge[]): WorldBlock {
  const byGid = new Map<string, SimNode[]>();
  for (const n of mem) {
    if (!byGid.has(n.gid)) byGid.set(n.gid, []);
    byGid.get(n.gid)!.push(n);
  }

  const households = [...byGid.entries()].sort((a, b) =>
    (a[1][0]?.hh ?? a[0]).localeCompare(b[1][0]?.hh ?? b[0]),
  );

  const { placed, w: contentW, h: contentH } = placeOtherWorldGrid(
    households,
    edges,
  );

  return {
    world: OTHER_WORLD,
    w: contentW + LAYOUT.worldMargin * 2,
    h: contentH + LAYOUT.worldTitle + LAYOUT.worldMargin * 2,
    placed,
  };
}

/** Households in a fixed 3-column grid inside the world. */
function layoutWorld(mem: SimNode[], edges: Edge[], world: string): WorldBlock {
  if (world === OTHER_WORLD) return layoutOtherWorld(mem, edges);
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

  const { placed, w: contentW, h: contentH } = placeHouseholdBento(
    households,
    edges,
    hhLinks,
  );

  return {
    world: mem[0]?.world ?? '',
    w: contentW + LAYOUT.worldMargin * 2,
    h: contentH + LAYOUT.worldTitle + LAYOUT.worldMargin * 2,
    placed,
  };
}

/**
 * Packing identity — membership, names, ages, and edges. Visual `ox`/`oy`
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
      n.age,
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
): Map<string, LayoutBase> {
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

  const worldBlocks = worldOrder
    .map((world) => {
      const mem = byWorld.get(world);
      return mem?.length ? layoutWorld(mem, edges, world) : null;
    })
    .filter((b): b is WorldBlock => b !== null);

  const bases = placeWorldColumns(worldBlocks);
  resolveHouseholdBoxOverlaps(nodes, bases, edges);
  return bases;
}

export function layoutBases(
  nodes: SimNode[],
  worlds: World[],
  edges: Edge[],
): Map<string, { x: number; y: number; w: number; h: number }> {
  const signature = packingSignature(nodes, worlds, edges);
  if (layoutBasesCache?.signature === signature) return layoutBasesCache.bases;
  const bases = computeLayoutBases(nodes, worlds, edges);
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
): SimNode[] {
  const bases = layoutBases(nodes, worlds, edges);
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
 * Keep existing cards where they are. Pack brand-new households in a grid
 * under each world's current cards so a save merge does not restack the board.
 */
export function offsetsForNewGids(
  prevById: Record<string, SimNode>,
  nextCore: SimNode[],
  worlds: World[],
  edges: Edge[],
): SimNode[] {
  const bases = layoutBases(nextCore, worlds, edges);
  const newcomers = nextCore.filter((n) => !prevById[n.id]);
  const pack = new Map<string, { x: number; y: number }>();
  const gidsByWorld = new Map<string, string[]>();
  const seenGid = new Set<string>();
  for (const n of newcomers) {
    if (seenGid.has(n.gid)) continue;
    seenGid.add(n.gid);
    const world = n.world || OTHER_WORLD;
    const list = gidsByWorld.get(world) ?? [];
    list.push(n.gid);
    gidsByWorld.set(world, list);
  }

  for (const [world, gids] of gidsByWorld) {
    const old = Object.values(prevById).filter(
      (n) => (n.world || OTHER_WORLD) === world,
    );
    if (!old.length) continue;
    const origin = tileSnapOrigin(
      Math.min(...old.map((n) => n.x)),
      Math.max(...old.map((n) => n.y + (n.h || CARD_H))) + LAYOUT.worldGapY,
    );
    const originX = origin.x;
    const rowMax =
      world === OTHER_WORLD ? LAYOUT.worldRowMaxW * 1.4 : LAYOUT.worldRowMaxW;
    let x = originX;
    let y = origin.y;
    let rowH = 0;
    for (const gid of gids) {
      const members = newcomers.filter((n) => n.gid === gid);
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
