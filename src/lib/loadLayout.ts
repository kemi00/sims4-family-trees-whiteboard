import { LAYOUT_EPOCH } from './constants.ts';
import type { Edge, SimNode, World } from '../types/whiteboard.ts';

/**
 * True when saved drag offsets should be cleared and the board re-packed.
 *
 * `ox`/`oy` are offsets from a packed base position, so they only mean
 * anything against the packing rules that produced them. Only a file stamped
 * with this exact {@link LAYOUT_EPOCH} can be trusted to restore placements.
 *
 * Files with no stamp at all predate the epoch (downloaded before 2026-08-27)
 * and are re-packed too. They used to be let through whenever their offsets
 * looked like ordinary nudges, which was wrong in the quiet way: tile packing
 * had already moved every base position under them, so the board loaded with
 * no warning and every hand-placed card in the wrong spot.
 */
export function shouldRepackOffsets(
  layoutEpoch: number | null | undefined,
): boolean {
  return layoutEpoch !== LAYOUT_EPOCH;
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
 * Matching {@link LAYOUT_EPOCH} preserves ox/oy. Anything else, including a
 * file with no stamp, gets a fresh auto-pack.
 */
export function prepareLoadedNodes(
  nodes: SimNode[],
  layoutEpoch: number | null | undefined,
  _worlds: World[] = [],
  _edges: Edge[] = [],
): { nodes: SimNode[]; repacked: boolean } {
  if (!shouldRepackOffsets(layoutEpoch)) {
    return {
      nodes: nodes.map((n) => asCore(n, n.ox ?? 0, n.oy ?? 0)),
      repacked: false,
    };
  }
  return { nodes: nodesWithClearedOffsets(nodes), repacked: true };
}
