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
  notInWorldArrangement,
  OTHER_WORLD,
  rowsUnderHousehold,
  UNHOUSED_FAMILY_EPOCH,
  unhousedArrangement,
  unhousedEdgeSide,
} from './layout.ts';
import { renameTemplateHouseholds } from './savegame/mergeSave.ts';
import { householdChrome, snapNodesToTiles } from './tiles.ts';
import { isUnhousedGid } from './unhoused.ts';
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
  const targets =
    layoutEpoch! < UNHOUSED_FAMILY_EPOCH
      ? withUnhousedBoxesRelaid(wasOnScreen, core, edges)
      : wasOnScreen;
  return { nodes: pinCoreToTargets(targets, core, worlds, edges), repacked: false };
}

/**
 * Unhoused sims boxes saved as one flat grid, laid out again as family
 * blocks from the same top-left card. Only cards inside those boxes move;
 * the box was the import's own arrangement, not the player's.
 */
function withUnhousedBoxesRelaid(
  wasOnScreen: Map<string, Point>,
  core: SimNode[],
  edges: Edge[],
): Map<string, Point> {
  const boxes = new Map<string, SimNode[]>();
  for (const n of core) {
    if (isUnhousedGid(n.gid)) boxes.set(n.gid, [...(boxes.get(n.gid) ?? []), n]);
  }
  if (!boxes.size) return wasOnScreen;
  const out = new Map(wasOnScreen);
  for (const members of boxes.values()) {
    const was = members.map((n) => wasOnScreen.get(n.id)).filter((p): p is Point => !!p);
    if (was.length !== members.length) continue;
    const ax = Math.min(...was.map((p) => p.x));
    const ay = Math.min(...was.map((p) => p.y));
    const side = unhousedEdgeSide(members, edges, (id) => wasOnScreen.get(id));
    for (const [id, d] of unhousedArrangement(members, edges, side)) {
      out.set(id, { x: ax + d.x, y: ay + d.y });
    }
  }
  return out;
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

function boxesOverlap(
  a: { boxL: number; boxT: number; boxR: number; boxB: number },
  b: { boxL: number; boxT: number; boxR: number; boxB: number },
): boolean {
  return a.boxL < b.boxR && a.boxR > b.boxL && a.boxT < b.boxB && a.boxB > b.boxT;
}

/**
 * The board as {@link offsetsForNewGids} should see it when a merge moved
 * sims into another household's box (see gatherHouseholds in mergeSave). A
 * sim already beside that household — its box can take the card in without
 * running into another box — keeps its spot. The rest leave the board list,
 * so they are placed like newcomers: in rows under the household's cards.
 */
function boardForRejoins(
  boardById: Record<string, SimNode>,
  next: SimNode[],
  groups: Group[],
  rejoined: ReadonlySet<string>,
): Record<string, SimNode> {
  if (!rejoined.size) return boardById;
  const out = { ...boardById };
  const nextById = new Map(next.map((n) => [n.id, n]));
  const byGid = new Map<string, SimNode[]>();
  for (const n of Object.values(boardById)) {
    if (rejoined.has(n.id)) continue;
    byGid.set(n.gid, [...(byGid.get(n.gid) ?? []), n]);
  }
  const groupOf = (gid: string) => groups.find((g) => g.gid === gid);
  for (const id of rejoined) {
    const was = boardById[id];
    const now = nextById.get(id);
    const home = now ? byGid.get(now.gid) : undefined;
    if (!was || !now || !home?.length || was.world !== now.world) {
      delete out[id];
      continue;
    }
    const grown = householdChrome([...home, was], groupOf(now.gid))!;
    const clash = [...byGid].some(([gid, mem]) => {
      if (gid === now.gid) return false;
      const box = householdChrome(mem, groupOf(gid));
      return !!box && boxesOverlap(grown, box);
    });
    if (clash) delete out[id];
    else out[id] = { ...was, gid: now.gid };
  }
  return out;
}

/**
 * Where a new Unhoused sims box goes when it takes in a whole world — every
 * card the world keeps — the top-left of the cards its sims had there, so the
 * world stays where it was, with the side facing their relatives on screen
 * (see unhousedEdgeSide). A box beside households that stay, or whose sims
 * all come from elsewhere, gets no anchor and is packed under the world like
 * any new household, clear of the households already there.
 */
function newBoxAnchors(
  before: Record<string, SimNode>,
  board: Record<string, SimNode>,
  next: SimNode[],
  edges: Edge[],
): Map<string, { x: number; y: number; rel: Map<string, Point> }> {
  const onBoard = new Set(Object.values(board).map((n) => n.gid));
  const shared = new Set(
    next.filter((n) => !isUnhousedGid(n.gid) && before[n.id]).map((n) => n.world),
  );
  const corner = new Map<string, Point>();
  for (const n of next) {
    const was = before[n.id];
    if (!isUnhousedGid(n.gid) || onBoard.has(n.gid) || shared.has(n.world)) continue;
    if (!was || was.world !== n.world) continue;
    const at = corner.get(n.gid);
    corner.set(n.gid, at ? { x: Math.min(at.x, was.x), y: Math.min(at.y, was.y) } : { x: was.x, y: was.y });
  }
  const out = new Map<string, { x: number; y: number; rel: Map<string, Point> }>();
  for (const [gid, at] of corner) {
    const members = next.filter((n) => n.gid === gid);
    // Where the box will be: its members' old spots in this world stand in.
    const spot = (id: string): Point | undefined => {
      const was = before[id];
      if (!was) return undefined;
      return members.some((m) => m.id === id) && was.world !== members[0]!.world ? at : was;
    };
    const side = unhousedEdgeSide(members, edges, spot);
    out.set(gid, { ...at, rel: unhousedArrangement(members, edges, side) });
  }
  return out;
}

/**
 * An Unhoused sims box that sims leave for households of their own (an
 * earlier import put premade sims there) holds the import's arrangement,
 * not the player's, so the cards it held are packed again where it was:
 * their households and what is left of the box, as their world packs them,
 * from the box's top-left card. A card joining a household that has cards
 * outside the old box, or moving to another world, is left to the rest of
 * the merge.
 */
function repackEmptiedBoxes(
  before: Record<string, SimNode>,
  core: SimNode[],
  worlds: World[],
  edges: Edge[],
): SimNode[] {
  const byId = new Map(core.map((n) => [n.id, n]));
  const oldBoxes = new Map<string, SimNode[]>();
  for (const n of Object.values(before)) {
    if (isUnhousedGid(n.gid)) oldBoxes.set(n.gid, [...(oldBoxes.get(n.gid) ?? []), n]);
  }
  const targets = new Map<string, Point>();
  for (const [gid, was] of oldBoxes) {
    if (was.every((n) => byId.get(n.id)?.gid === gid)) continue;
    const held = new Set(was.map((n) => n.id));
    const world = was[0]!.world;
    // Cards moving to another world are placed there, not where the box was.
    const gids = new Set(
      was
        .map((n) => byId.get(n.id))
        .filter((n): n is SimNode => !!n && n.world === world)
        .map((n) => n.gid),
    );
    const whole = new Set(
      [...gids].filter((g) => core.every((n) => n.gid !== g || held.has(n.id))),
    );
    const sub = core.filter((n) => whole.has(n.gid)).map((n) => asCore(n, 0, 0));
    if (!sub.length) continue;
    const ax = Math.min(...was.map((n) => n.x));
    const ay = Math.min(...was.map((n) => n.y));
    if (world === OTHER_WORLD) {
      // Households with family elsewhere go on the side facing it.
      const side = unhousedEdgeSide(sub, edges, (id) => before[id]);
      for (const [id, d] of notInWorldArrangement(sub, edges, side)) {
        targets.set(id, { x: ax + d.x, y: ay + d.y });
      }
      continue;
    }
    const laid = computeLayout(sub, worlds, edges);
    const bx = Math.min(...laid.map((n) => n.x));
    const by = Math.min(...laid.map((n) => n.y));
    for (const n of laid) targets.set(n.id, { x: ax + n.x - bx, y: ay + n.y - by });
  }
  return targets.size ? pinCoreToTargets(targets, core, worlds, edges) : core;
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
  /** Sims the merge moved into another box (see SaveMergeResult.rehomed). */
  rehomed?: ReadonlySet<string>;
}): SimNode[] {
  const { mode, boardById, edges, groups, worlds, snap } = opts;
  const all = opts.nodes.map((n) => asCore(n, n.ox ?? 0, n.oy ?? 0));
  if (mode === 'replace') {
    const laid = snap
      ? snapNodesToTiles(computeLayout(all, worlds, edges))
      : computeLayout(all, worlds, edges);
    return coreOffsetsAfterWorldSeparation(all, laid, groups);
  }
  const rehomed = opts.rehomed ?? new Set<string>();
  const board = boardForRejoins(boardById, all, groups, rehomed);
  // Sims placed again start from their packed spot, not an offset that
  // meant something only in the box they left.
  const placed = all.map((n) =>
    rehomed.has(n.id) && !board[n.id] ? { ...n, ox: 0, oy: 0 } : n,
  );
  const core = offsetsForNewGids(board, placed, worlds, edges, newBoxAnchors(boardById, board, placed, edges));
  return separateLoadOverlaps({
    core: repackEmptiedBoxes(boardById, core, worlds, edges),
    boardById,
    edges,
    groups,
    worlds,
    snap,
  });
}
