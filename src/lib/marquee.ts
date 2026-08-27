import { worldFrame, worldTagMetrics } from './geometry.ts';
import { householdChrome } from './tiles.ts';
import type { Group, SimNode, World } from '../types/whiteboard.ts';
import type { BoardMultiSel } from '../types/whiteboard.ts';

export type WorldRect = { l: number; t: number; r: number; b: number };

export function normalizeRect(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): WorldRect {
  return {
    l: Math.min(x0, x1),
    t: Math.min(y0, y1),
    r: Math.max(x0, x1),
    b: Math.max(y0, y1),
  };
}

export function rectsIntersect(a: WorldRect, b: WorldRect): boolean {
  return a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
}

/** World name-chip hit box (matches WorldLayer handles — not the full frame). */
export function worldChipHitRect(
  world: string,
  frame: WorldRect,
  zoom: number,
): WorldRect {
  const tag = worldTagMetrics(zoom);
  const pillW = (world.length * 8.2 + 46) * tag.scale;
  const bw = frame.r - frame.l;
  const bh = frame.b - frame.t;
  const l = frame.l - tag.hitPad;
  const t = frame.t - tag.hitPad;
  const hw = Math.min(bw + tag.hitPad, pillW + 2 * tag.hitPad);
  const hh = Math.min(bh + tag.hitPad, tag.hitH);
  return { l, t, r: l + hw, b: t + hh };
}

export function householdTagHitRect(
  mem: SimNode[],
  group: Group | undefined,
): WorldRect | null {
  const chrome = householdChrome(mem, group);
  if (!chrome) return null;
  return {
    l: chrome.headerX,
    t: chrome.headerY,
    r: chrome.headerX + chrome.labelW,
    b: chrome.headerY + chrome.pillH,
  };
}

export function nodeHitRect(n: SimNode): WorldRect {
  return { l: n.x, t: n.y, r: n.x + n.w, b: n.y + (n.h || 0) };
}

/**
 * Resolve a marquee to one selection kind.
 *
 * - Touches **2+ world frames** → those whole worlds (drag moves every sim in them).
 * - Otherwise household tags, then sim cards.
 * - A **single** world is only selected if its name chip is in the box
 *   (so a box inside one world can still grab tags/cards).
 */
export function resolveMarqueeSelection(
  marquee: WorldRect,
  opts: {
    nodes: SimNode[];
    groups: Group[];
    worlds: World[];
    zoom: number;
    packVis: (n: SimNode) => boolean;
    showWorlds: boolean;
    showGroups: boolean;
  },
): BoardMultiSel | null {
  const { nodes, groups, zoom, packVis, showWorlds, showGroups } = opts;

  const frameHits: { world: string; frame: WorldRect }[] = [];
  if (showWorlds) {
    const seen = new Set<string>();
    for (const n of nodes) {
      const w = n.world;
      if (!w || w === '—' || !packVis(n) || seen.has(w)) continue;
      seen.add(w);
      const frame = worldFrame(w, nodes, groups, packVis);
      if (!frame) continue;
      if (rectsIntersect(marquee, frame)) frameHits.push({ world: w, frame });
    }
    if (frameHits.length >= 2) {
      return { kind: 'worlds', worlds: frameHits.map((h) => h.world) };
    }
  }

  if (showGroups) {
    const hitGids: string[] = [];
    for (const g of groups) {
      const mem = nodes.filter((n) => n.gid === g.gid && packVis(n));
      const tag = householdTagHitRect(mem, g);
      if (tag && rectsIntersect(marquee, tag)) hitGids.push(g.gid);
    }
    if (hitGids.length) return { kind: 'households', gids: hitGids };
  }

  const hitIds: string[] = [];
  for (const n of nodes) {
    if (!packVis(n)) continue;
    if (rectsIntersect(marquee, nodeHitRect(n))) hitIds.push(n.id);
  }
  if (hitIds.length) return { kind: 'nodes', ids: hitIds };

  // Explicit single-world grab via the name chip only.
  if (showWorlds && frameHits.length === 1) {
    const only = frameHits[0]!;
    const chip = worldChipHitRect(only.world, only.frame, zoom);
    if (rectsIntersect(marquee, chip)) {
      return { kind: 'worlds', worlds: [only.world] };
    }
  }

  return null;
}

export function multiSelContainsWorld(
  sel: BoardMultiSel | null,
  world: string,
): boolean {
  return sel?.kind === 'worlds' && sel.worlds.includes(world);
}

export function multiSelContainsGid(
  sel: BoardMultiSel | null,
  gid: string,
): boolean {
  return sel?.kind === 'households' && sel.gids.includes(gid);
}

export function multiSelContainsNode(
  sel: BoardMultiSel | null,
  id: string,
): boolean {
  return sel?.kind === 'nodes' && sel.ids.includes(id);
}

/** Node ids moved by a multi-selection drag. */
export function idsForMultiSel(
  sel: BoardMultiSel,
  nodes: SimNode[],
): string[] {
  if (sel.kind === 'nodes') return [...sel.ids];
  if (sel.kind === 'households') {
    const gids = new Set(sel.gids);
    return nodes.filter((n) => gids.has(n.gid)).map((n) => n.id);
  }
  const worlds = new Set(sel.worlds);
  return nodes.filter((n) => n.world && worlds.has(n.world)).map((n) => n.id);
}
