import type { PointerEvent as ReactPointerEvent } from 'react';
import { worldFrame, worldTagMetrics } from '../lib/geometry.ts';
import { worldColor } from '../lib/utils.ts';
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
  pillW: number;
  paintX: number;
  paintY: number;
  col: string;
};

function worldNamesFrom(
  nodes: SimNode[],
  packVis: (n: SimNode) => boolean,
): string[] {
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

export function WorldLayer({
  nodes,
  groups,
  worlds,
  show,
  zoom,
  packVis,
  mode,
  selectedWorlds,
  onWorldDragStart,
}: Props) {
  if (!show) return null;

  const worldNames = worldNamesFrom(nodes, packVis);
  const tag = worldTagMetrics(zoom);

  if (mode === 'frames') {
    return (
      <g id="lWorlds">
        {worldNames.map((w) => {
          const frame = worldFrame(w, nodes, groups, packVis);
          if (!frame) return null;
          const col = worldColor(w, worlds);
          const selected = !!selectedWorlds?.has(w);
          return (
            <g key={w} className={selected ? 'world-frame world-frame--sel' : 'world-frame'}>
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

  const chips: ChipHit[] = [];
  for (const w of worldNames) {
    const frame = worldFrame(w, nodes, groups, packVis);
    if (!frame) continue;
    const pillW = (w.length * 8.2 + 46) * tag.scale;
    const bw = frame.r - frame.l;
    const bh = frame.b - frame.t;
    chips.push({
      w,
      // Hit expands around the painted chip; paint stays at frame top-left.
      x: frame.l - tag.hitPad,
      y: frame.t - tag.hitPad,
      hw: Math.min(bw + tag.hitPad, pillW + 2 * tag.hitPad),
      hh: Math.min(bh + tag.hitPad, tag.hitH),
      pillW,
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
    nodes.forEach((n) => {
      if (n.world === chip.w) base[n.id] = { ox: n.ox ?? 0, oy: n.oy ?? 0 };
    });
    onWorldDragStart(chip.w, pt.wx, pt.wy, base, ev);
  };

  return (
    <g id="lWorldHandles">
      {chips.map((c) => {
        const selected = !!selectedWorlds?.has(c.w);
        return (
          <g
            key={c.w}
            className={selected ? 'whandle whandle--sel' : 'whandle'}
            style={{ cursor: 'grab' }}
            onPointerDown={beginDrag}
          >
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
              width={c.pillW}
              height={tag.pillH}
              rx={13 * tag.scale}
              fill={c.col}
              stroke={selected ? '#ffffff' : c.col}
              strokeWidth={selected ? 2.5 : 1}
              vectorEffect={selected ? 'non-scaling-stroke' : undefined}
              style={{ pointerEvents: 'none' }}
            />
            {selected && (
              <rect
                x={c.paintX - 3 * tag.scale}
                y={c.paintY - 3 * tag.scale}
                width={c.pillW + 6 * tag.scale}
                height={tag.pillH + 6 * tag.scale}
                rx={15 * tag.scale}
                fill="none"
                stroke="#1b6cd6"
                strokeWidth={3}
                vectorEffect="non-scaling-stroke"
                style={{ pointerEvents: 'none' }}
              />
            )}
            <text
              x={c.paintX + 14 * tag.scale}
              y={c.paintY + tag.pillH / 2}
              dominantBaseline="middle"
              fontSize={tag.handleSize}
              fill="#ffffffbb"
              style={{ pointerEvents: 'none' }}
            >
              ⠿
            </text>
            <text
              x={c.paintX + 31 * tag.scale}
              y={c.paintY + tag.pillH / 2}
              dominantBaseline="middle"
              fontSize={tag.fontSize}
              fontWeight={800}
              fill="#fff"
              style={{ pointerEvents: 'none' }}
            >
              {c.w}
            </text>
          </g>
        );
      })}
    </g>
  );
}
