import { LAYOUT_EPOCH, OLDEST_PINNABLE_EPOCH } from './constants.ts';
import {
  coreOffsetsAfterImportSeparation,
  coreOffsetsAfterWorldSeparation,
} from './geometry.ts';
import {
  computeLayout,
  layoutBases,
  measureCard,
  offsetsForNewGids,
  rowsUnderHousehold,
} from './layout.ts';
import { renameTemplateHouseholds } from './savegame/mergeSave.ts';
import { snapNodesToTiles } from './tiles.ts';
import type { Edge, Group, SimNode, World } from '../types/whiteboard.ts';

/**
 * True when saved drag offsets should be cleared and the board re-packed.
 *
 * `ox`/`oy` are offsets from a packed base position, so they only mean
 * anything against the packing rules that produced them. A file stamped with
 * {@link LAYOUT_EPOCH}, or an older epoch whose rules are still implemented
 * (back to {@link OLDEST_PINNABLE_EPOCH}), restores every placement.
 *
 * Files with no stamp at all predate the epoch (downloaded before 2026-08-27)
 * and are re-packed. They used to be let through whenever their offsets
 * looked like ordinary nudges, which was wrong in the quiet way: tile packing
 * had already moved every base position under them, so the board loaded with
 * no warning and every hand-placed card in the wrong spot.
 */
export function shouldRepackOffsets(
  layoutEpoch: number | null | undefined,
): boolean {
  return !(
    typeof layoutEpoch === 'number' &&
    layoutEpoch >= OLDEST_PINNABLE_EPOCH &&
    layoutEpoch <= LAYOUT_EPOCH
  );
}

function asCore(n: SimNode, ox: number, oy: number): SimNode {
  const { x: _x, y: _y, w: _w, h: _h, ...rest } = n;
  return { ...rest, ox, oy, x: 0, y: 0, w: 0, h: 0 };
}

/** Core nodes with ox/oy cleared so computeLayout places them from scratch. */
export function nodesWithClearedOffsets(nodes: SimNode[]): SimNode[] {
  return nodes.map((n) => asCore(n, 0, 0));
}

/**
 * Prepare loaded nodes for the current layout engine.
 * Matching {@link LAYOUT_EPOCH} preserves ox/oy. A board saved under an
 * older, still-implemented epoch is laid out by that epoch's rules and every
 * card pinned to where it sat, so a packing change never moves a saved board;
 * only new and reset boards get the new packing. Anything older, including a
 * file with no stamp, gets a fresh auto-pack.
 *
 * `worlds` and `edges` must be the ones the board is laid out with, or the
 * old positions are computed against a different packing.
 */
export function prepareLoadedNodes(
  nodes: SimNode[],
  layoutEpoch: number | null | undefined,
  worlds: World[] = [],
  edges: Edge[] = [],
): { nodes: SimNode[]; repacked: boolean } {
  if (shouldRepackOffsets(layoutEpoch)) {
    return { nodes: nodesWithClearedOffsets(nodes), repacked: true };
  }
  const core = nodes.map((n) => asCore(n, n.ox ?? 0, n.oy ?? 0));
  if (layoutEpoch === LAYOUT_EPOCH) return { nodes: core, repacked: false };
  const wasOnScreen = visualPositionsFromCore(core, worlds, edges, layoutEpoch!);
  return { nodes: pinCoreToTargets(wasOnScreen, core, worlds, edges), repacked: false };
}

type Point = { x: number; y: number };

/** Screen top-left of every sim after layout + ox/oy on this node/edge set. */
export function visualPositionsFromCore(
  core: SimNode[],
  worlds: World[],
  edges: Edge[],
  epoch: number = LAYOUT_EPOCH,
): Map<string, Point> {
  const m = new Map<string, Point>();
  for (const n of computeLayout(core, worlds, edges, epoch)) m.set(n.id, { x: n.x, y: n.y });
  return m;
}

/** Rewrite ox/oy so each targeted sim lands on its target under this layout. */
export function pinCoreToTargets(
  targets: Map<string, Point>,
  core: SimNode[],
  worlds: World[],
  edges: Edge[],
): SimNode[] {
  const bases = layoutBases(core, worlds, edges);
  return core.map((n) => {
    const target = targets.get(n.id);
    const base = bases.get(n.id);
    if (!target || !base) return n;
    return { ...n, ox: target.x - base.x, oy: target.y - base.y };
  });
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

function cardsOverlap(a: Point, b: Point): boolean {
  const { w, h } = measureCard();
  return a.x < b.x + w && a.x + w > b.x && a.y < b.y + h && a.y + h > b.y;
}

/**
 * Screen spots for file cards the board does not have yet, when the board
 * keeps its own positions. The board and the file can be laid out differently
 * (the file's worlds pushed down by a save merge, a household dragged on the
 * board), so the file's own coordinates would drop a newcomer wherever that
 * spot happens to be on this board. Instead each one keeps its place relative
 * to its household as the file shows it, or to its world for a household new
 * to the board, moved as far as the board has moved those cards.
 */
function newcomerTargets(
  fileCore: SimNode[],
  filePos: Map<string, Point>,
  board: Record<string, Point>,
): Map<string, Point> {
  const out = new Map<string, Point>();
  const byGid = new Map<string, SimNode[]>();
  const byWorld = new Map<string, SimNode[]>();
  for (const n of fileCore) {
    byGid.set(n.gid, [...(byGid.get(n.gid) ?? []), n]);
    byWorld.set(n.world, [...(byWorld.get(n.world) ?? []), n]);
  }
  const kept = (mem: SimNode[]) => mem.filter((n) => board[n.id] && filePos.has(n.id));
  const shiftOf = (mem: SimNode[]): Point | null => {
    const both = kept(mem);
    if (!both.length) return null;
    return {
      x: median(both.map((n) => board[n.id]!.x - filePos.get(n.id)!.x)),
      y: median(both.map((n) => board[n.id]!.y - filePos.get(n.id)!.y)),
    };
  };
  const hhShift = new Map<string, Point | null>();
  const worldShift = new Map<string, Point | null>();

  for (const n of fileCore) {
    const p = filePos.get(n.id);
    if (board[n.id] || !p) continue;
    if (!hhShift.has(n.gid)) hhShift.set(n.gid, shiftOf(byGid.get(n.gid)!));
    if (!worldShift.has(n.world)) worldShift.set(n.world, shiftOf(byWorld.get(n.world)!));
    const d = hhShift.get(n.gid) ?? worldShift.get(n.world) ?? { x: 0, y: 0 };
    out.set(n.id, { x: p.x + d.x, y: p.y + d.y });
  }

  // A household arranged differently on the board can put a newcomer on one
  // of its own kept cards. Those newcomers go in rows under it instead.
  for (const mem of byGid.values()) {
    const home = kept(mem).map((n) => board[n.id]!);
    const joiners = mem.filter((n) => out.has(n.id));
    if (!home.length || !joiners.length) continue;
    const lands = joiners.some((n) => home.some((h) => cardsOverlap(out.get(n.id)!, h)));
    if (!lands) continue;
    for (const [id, at] of rowsUnderHousehold(home, joiners)) out.set(id, at);
  }
  return out;
}

/**
 * Where each card should sit after a JSON merge or replace. Loading can add
 * sims and links, which moves layout bases, so raw ox/oy alone would make
 * cards jump. When the board's positions win, sims already on the board stay
 * where they are on screen and sims new to it move with their household or
 * world (see {@link newcomerTargets}). With the file's positions, every card
 * in the file goes where the file shows it.
 */
export function jsonLoadTargets(opts: {
  keepBoardPositions: boolean;
  boardVisualById: Record<string, Point>;
  fileCore: SimNode[];
  fileEdges: Edge[];
  worlds: World[];
}): Map<string, Point> {
  const targets = new Map<string, Point>();
  for (const [id, v] of Object.entries(opts.boardVisualById)) {
    targets.set(id, { x: v.x, y: v.y });
  }
  const filePos = visualPositionsFromCore(opts.fileCore, opts.worlds, opts.fileEdges);
  const extra = opts.keepBoardPositions
    ? newcomerTargets(opts.fileCore, filePos, opts.boardVisualById)
    : filePos;
  for (const [id, p] of extra) targets.set(id, p);
  return targets;
}

/**
 * Give households named with a premade template id readable names, without
 * moving anything: a household's name tag is part of packing (a long one
 * pushes its neighbour down), so every card is pinned to where it was.
 */
export function withReadableHouseholdNames(opts: {
  core: SimNode[];
  groups: Group[];
  worlds: World[];
  edges: Edge[];
}): { core: SimNode[]; groups: Group[] } {
  const { core, groups, worlds, edges } = opts;
  const renamed = renameTemplateHouseholds(core, groups);
  if (renamed.nodes === core) return { core, groups: renamed.groups };
  const wasOnScreen = visualPositionsFromCore(core, worlds, edges);
  return {
    core: pinCoreToTargets(wasOnScreen, renamed.nodes, worlds, edges),
    groups: renamed.groups,
  };
}

/**
 * Push apart the households and worlds a load made overlap, as core ox/oy.
 * `boardById` is the board as it was on screen before the load; whatever
 * already overlapped there stays as it is.
 */
export function separateLoadOverlaps(opts: {
  core: SimNode[];
  boardById: Record<string, SimNode>;
  edges: Edge[];
  groups: Group[];
  worlds: World[];
  snap: boolean;
}): SimNode[] {
  const { core, edges, groups, worlds, snap } = opts;
  const ids = new Set(core.map((n) => n.id));
  const before = Object.values(opts.boardById).filter((n) => ids.has(n.id));
  const laid = snap
    ? snapNodesToTiles(computeLayout(core, worlds, edges))
    : computeLayout(core, worlds, edges);
  return coreOffsetsAfterImportSeparation(core, laid, groups, before);
}

/**
 * Core nodes after a .save import. Replace packs the save from scratch and
 * pushes worlds apart. Merge keeps every card already on the board where it
 * is on screen, finds room for the sims the save brings, then clears only the
 * overlaps the import itself made — never ones the user had already stacked.
 */
export function saveImportCore(opts: {
  mode: 'merge' | 'replace';
  /** Board cards before the import, as laid out on screen. */
  boardById: Record<string, SimNode>;
  nodes: SimNode[];
  edges: Edge[];
  groups: Group[];
  worlds: World[];
  snap: boolean;
}): SimNode[] {
  const { mode, boardById, edges, groups, worlds, snap } = opts;
  const all = opts.nodes.map((n) => asCore(n, n.ox ?? 0, n.oy ?? 0));
  if (mode === 'replace') {
    const laid = snap
      ? snapNodesToTiles(computeLayout(all, worlds, edges))
      : computeLayout(all, worlds, edges);
    return coreOffsetsAfterWorldSeparation(all, laid, groups);
  }
  return separateLoadOverlaps({
    core: offsetsForNewGids(boardById, all, worlds, edges),
    boardById,
    edges,
    groups,
    worlds,
    snap,
  });
}
