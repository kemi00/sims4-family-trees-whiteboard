import type { SimNode } from '../types/whiteboard.ts';

/** Nodes grouped for household/world chrome — avoids scanning the full list per group. */
export type NodeBuckets = {
  byGid: Map<string, SimNode[]>;
  byWorld: Map<string, SimNode[]>;
};

export function bucketNodes(nodes: SimNode[]): NodeBuckets {
  const byGid = new Map<string, SimNode[]>();
  const byWorld = new Map<string, SimNode[]>();
  for (const n of nodes) {
    const gidList = byGid.get(n.gid);
    if (gidList) gidList.push(n);
    else byGid.set(n.gid, [n]);
    const world = n.world;
    if (!world) continue;
    const worldList = byWorld.get(world);
    if (worldList) worldList.push(n);
    else byWorld.set(world, [n]);
  }
  return { byGid, byWorld };
}

export function nodesForGid(
  gid: string,
  nodes: SimNode[],
  buckets?: NodeBuckets,
): SimNode[] {
  if (buckets) return buckets.byGid.get(gid) ?? [];
  return nodes.filter((n) => n.gid === gid);
}

export function nodesForWorld(
  world: string,
  nodes: SimNode[],
  buckets?: NodeBuckets,
): SimNode[] {
  if (buckets) return buckets.byWorld.get(world) ?? [];
  return nodes.filter((n) => n.world === world);
}
