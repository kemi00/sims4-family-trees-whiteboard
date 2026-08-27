import { LAYOUT_EPOCH } from './constants.ts';
import type { Edge, SimNode, World } from '../types/whiteboard.ts';

/**
 * Absolute ox/oy beyond this, on boards with no matching {@link LAYOUT_EPOCH},
 * means offsets are almost certainly from an older packing engine.
 * Never applied when layoutEpoch matches — large dynasties routinely drag
 * sims/worlds farther than this and must keep those placements on reload.
 */
export const LAYOUT_OFFSET_REPACK_ABS = 3500;

function maxOffsetAbs(nodes: SimNode[]): number {
  let maxAbs = 0;
  for (const n of nodes) {
    maxAbs = Math.max(maxAbs, Math.abs(n.ox ?? 0), Math.abs(n.oy ?? 0));
  }
  return maxAbs;
}

/** True when saved drag offsets should be cleared and the board re-packed. */
export function shouldRepackOffsets(
  nodes: SimNode[],
  layoutEpoch: number | null | undefined,
): boolean {
  // Same packing generation as this build — keep the user's saved layout.
  if (layoutEpoch === LAYOUT_EPOCH) return false;
  // Explicit older epoch → packing rules changed; re-pack.
  if (layoutEpoch != null && layoutEpoch !== LAYOUT_EPOCH) return true;
  // Missing epoch (legacy download): only wipe when offsets look like
  // absolute coords from a pre-offset engine, not modest nudges.
  return maxOffsetAbs(nodes) > LAYOUT_OFFSET_REPACK_ABS;
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
 * Matching {@link LAYOUT_EPOCH} always preserves ox/oy. Older or epoch-less
 * boards with extreme skew get a fresh auto-pack.
 */
export function prepareLoadedNodes(
  nodes: SimNode[],
  layoutEpoch: number | null | undefined,
  _worlds: World[] = [],
  _edges: Edge[] = [],
): { nodes: SimNode[]; repacked: boolean } {
  if (!shouldRepackOffsets(nodes, layoutEpoch)) {
    return {
      nodes: nodes.map((n) => asCore(n, n.ox ?? 0, n.oy ?? 0)),
      repacked: false,
    };
  }
  return { nodes: nodesWithClearedOffsets(nodes), repacked: true };
}
