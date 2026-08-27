import { toCore } from './autosave.ts';
import { sanitizeEdges, uKey } from './utils.ts';
import type { Edge, EdgeType, Group, SimNode } from '../types/whiteboard.ts';

const UNION_TYPES = new Set<EdgeType>(['marriage', 'romance', 'divorced']);

export type JsonMergeSummary = {
  nodesUpdated: number;
  nodesAdded: number;
  edgesAdded: number;
  /** Partner-type edges where the JSON replaced a different board relationship. */
  relationshipsOverwritten: number;
  boardOnlyEdgesKept: number;
};

export type JsonMergeResult = {
  nodes: SimNode[];
  edges: Edge[];
  groups: Group[];
  summary: JsonMergeSummary;
};

function isUnion(type: EdgeType): boolean {
  return UNION_TYPES.has(type);
}

function edgePairKey(e: Edge): string {
  if (isUnion(e.type)) return `union:${uKey(e.a, e.b)}`;
  return `${e.type}:${e.a}\0${e.b}`;
}

/**
 * Merge an incoming whiteboard JSON into the current board.
 *
 * Conflict policy — incoming JSON wins for the same sim pair's partner
 * relationship (marriage / romance / divorced). Example: board married +
 * JSON divorced → divorced. Board-only links that the JSON does not
 * contradict are kept. Matched cards keep board ox/oy and fromSave marks.
 */
export function mergeJsonIntoBoard(input: {
  boardNodes: SimNode[];
  boardEdges: Edge[];
  boardGroups: Group[];
  incomingNodes: SimNode[];
  incomingEdges: Edge[];
  incomingGroups: Group[];
}): JsonMergeResult {
  const boardById = new Map(input.boardNodes.map((n) => [n.id, n]));
  const incomingById = new Map(input.incomingNodes.map((n) => [n.id, n]));

  let nodesUpdated = 0;
  let nodesAdded = 0;
  const nodes: SimNode[] = [];

  for (const board of input.boardNodes) {
    const inc = incomingById.get(board.id);
    if (!inc) {
      nodes.push(toCore(board));
      continue;
    }
    nodesUpdated += 1;
    const core = toCore(inc);
    nodes.push({
      ...core,
      // Keep hand placement and save-merge marks from the live board.
      ox: board.ox ?? 0,
      oy: board.oy ?? 0,
      fromSave: board.fromSave || core.fromSave,
      saveSimId: board.saveSimId ?? core.saveSimId,
      added: board.added && !core.fromSave ? board.added : core.added,
    });
  }
  for (const inc of input.incomingNodes) {
    if (boardById.has(inc.id)) continue;
    nodesAdded += 1;
    nodes.push(toCore(inc));
  }

  const groupByGid = new Map(input.boardGroups.map((g) => [g.gid, g]));
  for (const g of input.incomingGroups) {
    if (!groupByGid.has(g.gid)) groupByGid.set(g.gid, { ...g });
  }
  // Refresh names/colors for existing gids from incoming when present.
  for (const g of input.incomingGroups) {
    const cur = groupByGid.get(g.gid);
    if (!cur) continue;
    groupByGid.set(g.gid, {
      ...cur,
      hh: g.hh || cur.hh,
      world: g.world || cur.world,
      nb: g.nb || cur.nb,
      color: g.color || cur.color,
    });
  }
  const groups = [...groupByGid.values()];

  const boardEdges = input.boardEdges.map((e) => ({ ...e }));
  const incomingEdges = sanitizeEdges(
    input.incomingEdges.map((e) => ({
      ...e,
      source:
        e.source ?? (String(e.id).charAt(0) === 'u' ? 'planned' : 'seed'),
    })),
  );

  const incomingByPair = new Map<string, Edge>();
  for (const e of incomingEdges) {
    incomingByPair.set(edgePairKey(e), e);
  }

  const incomingUnionPairs = new Set<string>();
  for (const e of incomingEdges) {
    if (isUnion(e.type)) incomingUnionPairs.add(uKey(e.a, e.b));
  }

  let relationshipsOverwritten = 0;
  let boardOnlyEdgesKept = 0;
  const kept: Edge[] = [];
  const consumedIncoming = new Set<string>();

  for (const be of boardEdges) {
    const key = edgePairKey(be);
    const inc = incomingByPair.get(key);

    if (isUnion(be.type)) {
      const pair = uKey(be.a, be.b);
      if (incomingUnionPairs.has(pair)) {
        // JSON asserts a partner state for this pair — drop board unions;
        // incoming edge(s) are added in the next pass.
        if (!inc || inc.type !== be.type || inc.source !== be.source) {
          // Count once per board union we discard in favor of JSON.
          relationshipsOverwritten += 1;
        }
        continue;
      }
      kept.push(be);
      boardOnlyEdgesKept += 1;
      continue;
    }

    if (inc) {
      // Same typed link exists in JSON — keep board edge identity/source,
      // allow type already matches; nothing to overwrite for parent/sibling.
      kept.push(be);
      consumedIncoming.add(key);
      continue;
    }
    kept.push(be);
    boardOnlyEdgesKept += 1;
  }

  let edgesAdded = 0;
  for (const inc of incomingEdges) {
    const key = edgePairKey(inc);
    if (consumedIncoming.has(key)) continue;
    if (!isUnion(inc.type)) {
      // Non-union already handled if board had the same key.
      if (kept.some((e) => edgePairKey(e) === key)) continue;
    } else {
      // Only add one incoming union per pair (first wins after sanitize order).
      if (kept.some((e) => isUnion(e.type) && uKey(e.a, e.b) === uKey(inc.a, inc.b))) {
        continue;
      }
    }
    kept.push({ ...inc });
    edgesAdded += 1;
    if (isUnion(inc.type)) consumedIncoming.add(key);
  }

  // Deduplicate unions: if multiple slipped in, keep the last from incoming preference.
  const unionSeen = new Set<string>();
  const deduped: Edge[] = [];
  for (let i = kept.length - 1; i >= 0; i--) {
    const e = kept[i]!;
    if (isUnion(e.type)) {
      const p = uKey(e.a, e.b);
      if (unionSeen.has(p)) continue;
      unionSeen.add(p);
    }
    deduped.push(e);
  }
  deduped.reverse();

  return {
    nodes,
    edges: sanitizeEdges(deduped),
    groups,
    summary: {
      nodesUpdated,
      nodesAdded,
      edgesAdded,
      relationshipsOverwritten,
      boardOnlyEdgesKept,
    },
  };
}
