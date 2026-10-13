import { memo, type PointerEvent as ReactPointerEvent } from 'react';
import { House, User } from '../icons.ts';
import { worldFrame, worldTagMetrics } from '../lib/geometry.ts';
import { nodesForWorld, type NodeBuckets } from '../lib/nodeIndex.ts';
import { worldColor } from '../lib/utils.ts';
import {
  worldCounts,
  worldCountsText,
  worldTagLayout,
  type WorldCounts,
  type WorldTagLayout,
} from '../lib/worldTag.ts';
import type { Group, SimNode, World } from '../types/whiteboard.ts';

type Props = {
  nodes: SimNode[];
  groups: Group[];
  worlds: World[];
  show: boolean;
  /** Board zoom `k` — world names grow when zoomed out. */
  zoom: number;
  packVis: (n: SimNode) => boolean;
  /** `frames` = tinted boxes (under households); `handles` = chips on top. */
  mode: 'frames' | 'handles';
  /** World names currently in a multi-selection. */
  selectedWorlds?: ReadonlySet<string>;
  buckets?: NodeBuckets;
  onWorldDragStart?: (
    world: string,
    wx: number,
    wy: number,
    base: Record<string, { ox: number; oy: number }>,
    ev: ReactPointerEvent,
  ) => void;
};

type ChipHit = {
  w: string;
  x: number;
  y: number;
  hw: number;
  hh: number;
  pill: WorldTagLayout;
  counts: WorldCounts;
  paintX: number;
  paintY: number;
  col: string;
};

function worldNamesFrom(
  nodes: SimNode[],
  packVis: (n: SimNode) => boolean,
  buckets?: NodeBuckets,
): string[] {
  if (buckets) {
    const worldNames: string[] = [];
    for (const [w, list] of buckets.byWorld) {
      if (!w || w === '—') continue;
      if (!list.some(packVis)) continue;
      worldNames.push(w);
    }
    return worldNames;
  }
  const worldNames: string[] = [];
  const seen = new Set<string>();
  for (const n of nodes) {
    const w = n.world;
    if (!w || w === '—' || !packVis(n) || seen.has(w)) continue;
    seen.add(w);
    worldNames.push(w);
  }
  return worldNames;
}

function distToRect(
  wx: number,
  wy: number,
  x: number,
  y: number,
  hw: number,
  hh: number,
): number {
  const dx = wx < x ? x - wx : wx > x + hw ? wx - (x + hw) : 0;
  const dy = wy < y ? y - wy : wy > y + hh ? wy - (y + hh) : 0;
  return Math.hypot(dx, dy);
}

/** Among chips that contain the point (or are nearest), prefer closest center. */
function pickClosestChip(wx: number, wy: number, chips: ChipHit[]): ChipHit | null {
  let best: ChipHit | null = null;
  let bestScore = Infinity;
  for (const c of chips) {
    const d = distToRect(wx, wy, c.x, c.y, c.hw, c.hh);
    if (d > 0) continue; // only chips whose hit rect contains the point
    const cx = c.x + c.hw / 2;
    const cy = c.y + c.hh / 2;
    const score = Math.hypot(wx - cx, wy - cy);
    if (score < bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

function pointerToWorld(ev: ReactPointerEvent): { wx: number; wy: number } | null {
  const svg = (ev.target as Element).closest('svg');
  if (!svg) return null;
  const scene = svg.querySelector('#scene');
  if (!scene) return null;
  const r = svg.getBoundingClientRect();
  const { tx, ty, k } = JSON.parse(scene.getAttribute('data-vp') || '{}') as {
    tx: number;
    ty: number;
    k: number;
  };
  if (!(k > 0)) return null;
  return {
    wx: (ev.clientX - r.left - tx) / k,
    wy: (ev.clientY - r.top - ty) / k,
  };
}

export const WorldLayer = memo(function WorldLayer({
  nodes,
  groups,
  worlds,
  show,
  zoom,
  packVis,
  mode,
  selectedWorlds,
  buckets,
  onWorldDragStart,
}: Props) {
  if (!show) return null;

  const worldNames = worldNamesFrom(nodes, packVis, buckets);
  const tag = worldTagMetrics(zoom);

  if (mode === 'frames') {
    return (
      <g id="lWorlds">
        {worldNames.map((w) => {
          const frame = worldFrame(w, nodes, groups, packVis, buckets);
          if (!frame) return null;
          const col = worldColor(w, worlds);
          const selected = !!selectedWorlds?.has(w);
          return (
            <g
              key={w}
              data-world={w}
              className={selected ? 'world-frame world-frame--sel' : 'world-frame'}
            >
              <rect
                x={frame.l}
                y={frame.t}
                width={frame.r - frame.l}
                height={frame.b - frame.t}
                rx={22}
                fill={selected ? '#1b6cd628' : col + '0c'}
                stroke={selected ? '#1b6cd6' : col + '66'}
                strokeWidth={selected ? 3.5 : 2}
                vectorEffect={selected ? 'non-scaling-stroke' : undefined}
                style={{ pointerEvents: 'none' }}
              />
              {selected && (
                <rect
                  x={frame.l}
                  y={frame.t}
                  width={frame.r - frame.l}
                  height={frame.b - frame.t}
                  rx={22}
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth={1.5}
                  strokeOpacity={0.85}
                  vectorEffect="non-scaling-stroke"
                  style={{ pointerEvents: 'none' }}
                />
              )}
            </g>
          );
        })}
      </g>
    );
  }

  const frames = new Map(
    worldNames.map((w) => [w, worldFrame(w, nodes, groups, packVis, buckets)] as const),
  );
  const chips: ChipHit[] = [];
  for (const w of worldNames) {
    const frame = frames.get(w);
    if (!frame) continue;
    const counts = worldCounts(nodesForWorld(w, nodes, buckets), packVis);
    const grown = worldTagLayout(w, counts, zoom);
    // The nearest world to the right level with the tag: a narrow world's
    // tag, grown for a far zoom, would cover that one's.
    let room = Infinity;
    for (const [other, f] of frames) {
      if (other === w || !f || f.l <= frame.l) continue;
      if (f.t >= frame.t + grown.h || f.b <= frame.t) continue;
      room = Math.min(room, f.l - frame.l - (zoom > 0 ? 12 / zoom : 0));
    }
    const pill = room < grown.w ? worldTagLayout(w, counts, zoom, room) : grown;
    const bw = frame.r - frame.l;
    const bh = frame.b - frame.t;
    chips.push({
      w,
      // Hit expands around the painted chip; paint stays at frame top-left.
      x: frame.l - tag.hitPad,
      y: frame.t - tag.hitPad,
      hw: Math.min(bw + tag.hitPad, pill.w + 2 * tag.hitPad),
      hh: Math.min(bh + tag.hitPad, pill.h + 2 * tag.hitPad),
      pill,
      counts,
      paintX: frame.l,
      paintY: frame.t,
      col: worldColor(w, worlds),
    });
  }

  const beginDrag = (ev: ReactPointerEvent) => {
    if (!onWorldDragStart) return;
    const pt = pointerToWorld(ev);
    if (!pt) return;
    const chip = pickClosestChip(pt.wx, pt.wy, chips);
    if (!chip) return;
    ev.stopPropagation();
    const base: Record<string, { ox: number; oy: number }> = {};
    for (const n of nodesForWorld(chip.w, nodes, buckets)) {
      base[n.id] = { ox: n.ox ?? 0, oy: n.oy ?? 0 };
    }
    onWorldDragStart(chip.w, pt.wx, pt.wy, base, ev);
  };

  return (
    <g id="lWorldHandles">
      {chips.map((c) => {
        const selected = !!selectedWorlds?.has(c.w);
        const { pill } = c;
        const n = pill.counts;
        const s = pill.scale;
        return (
          <g
            key={c.w}
            data-world={c.w}
            className={selected ? 'whandle whandle--sel' : 'whandle'}
            style={{ cursor: 'grab' }}
            onPointerDown={beginDrag}
          >
            <title>{worldCountsText(c.w, c.counts)}</title>
            {/* Hit target = chip + modest pad only (never a full-frame strip). */}
            <rect
              x={c.x}
              y={c.y}
              width={c.hw}
              height={c.hh}
              fill="transparent"
              stroke="none"
            />
            <rect
              x={c.paintX}
              y={c.paintY}
              width={pill.w}
              height={pill.h}
              rx={13 * s}
              fill={c.col}
              stroke={selected ? '#ffffff' : c.col}
              strokeWidth={selected ? 2.5 : 1}
              vectorEffect={selected ? 'non-scaling-stroke' : undefined}
              style={{ pointerEvents: 'none' }}
            />
            {selected && (
              <rect
                x={c.paintX - 3 * s}
                y={c.paintY - 3 * s}
                width={pill.w + 6 * s}
                height={pill.h + 6 * s}
                rx={15 * s}
                fill="none"
                stroke="#1b6cd6"
                strokeWidth={3}
                vectorEffect="non-scaling-stroke"
                style={{ pointerEvents: 'none' }}
              />
            )}
            <text
              x={c.paintX + pill.handleX}
              y={c.paintY + pill.nameY}
              dominantBaseline="middle"
              fontSize={tag.handleSize}
              fill="#ffffffbb"
              style={{ pointerEvents: 'none' }}
            >
              ⠿
            </text>
            <text
              x={c.paintX + pill.nameX}
              y={c.paintY + pill.nameY}
              dominantBaseline="middle"
              fontSize={pill.fontSize}
              fontWeight={800}
              fill="#fff"
              style={{ pointerEvents: 'none' }}
            >
              {c.w}
            </text>
            {n && (
              <g
                className="whandle__counts"
                fill="#fff"
                aria-hidden="true"
                style={{ pointerEvents: 'none' }}
              >
                {n.dividerX !== null && (
                  <line
                    x1={c.paintX + n.dividerX}
                    x2={c.paintX + n.dividerX}
                    y1={c.paintY + n.y - 6 * s}
                    y2={c.paintY + n.y + 6 * s}
                    stroke="#ffffff"
                    strokeOpacity={0.45}
                    strokeWidth={1.2 * s}
                  />
                )}
                <User
                  x={c.paintX + n.simIconX}
                  y={c.paintY + n.y - n.iconSize / 2}
                  size={n.iconSize}
                  weight="fill"
                  color="#fff"
                />
                <text
                  x={c.paintX + n.simTextX}
                  y={c.paintY + n.y}
                  dominantBaseline="middle"
                  fontSize={n.fontSize}
                  fontWeight={600}
                >
                  {c.counts.sims}
                </text>
                <House
                  x={c.paintX + n.homeIconX}
                  y={c.paintY + n.y - n.iconSize / 2}
                  size={n.iconSize}
                  weight="fill"
                  color="#fff"
                />
                <text
                  x={c.paintX + n.homeTextX}
                  y={c.paintY + n.y}
                  dominantBaseline="middle"
                  fontSize={n.fontSize}
                  fontWeight={600}
                >
                  {c.counts.households}
                </text>
              </g>
            )}
          </g>
        );
      })}
    </g>
  );
});
