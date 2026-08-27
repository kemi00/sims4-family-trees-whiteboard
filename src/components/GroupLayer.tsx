import type { PointerEvent as ReactPointerEvent } from 'react';
import type { Group, SimNode } from '../types/whiteboard.ts';
import { householdChrome } from '../lib/tiles.ts';

type Props = {
  groups: Group[];
  nodes: SimNode[];
  show: boolean;
  packVis: (n: SimNode) => boolean;
  /** `frames` = dashed boxes (under edges); `handles` = name/Age up on top. */
  mode: 'frames' | 'handles';
  selectedGids?: ReadonlySet<string>;
  onHouseholdDragStart: (
    gid: string,
    wx: number,
    wy: number,
    base: Record<string, { ox: number; oy: number }>,
    ev: ReactPointerEvent,
  ) => void;
  onAgeUp: (gid: string) => void;
};

export function GroupLayer({
  groups,
  nodes,
  show,
  packVis,
  mode,
  selectedGids,
  onHouseholdDragStart,
  onAgeUp,
}: Props) {
  if (!show) return null;

  return (
    <g id={mode === 'frames' ? 'lGroups' : 'lGroupHandles'}>
      {groups.map((g0) => {
        const mem = nodes.filter((n) => n.gid === g0.gid && packVis(n));
        const chrome = householdChrome(mem, g0);
        if (!chrome) return null;
        const {
          boxL,
          boxT,
          boxR,
          boxB,
          headerX,
          headerY,
          ageX,
          ageY,
          pillH,
          label,
          labelW,
          ageLabel,
          ageW,
        } = chrome;
        const textY = (pillY: number) => pillY + pillH / 2;
        const selected = !!selectedGids?.has(g0.gid);

        if (mode === 'frames') {
          return (
            <g key={g0.gid}>
              <rect
                x={boxL}
                y={boxT}
                width={boxR - boxL}
                height={boxB - boxT}
                rx={14}
                fill={selected ? '#1b6cd622' : g0.color + '12'}
                stroke={selected ? '#1b6cd6' : g0.color + '55'}
                strokeWidth={selected ? 3 : 1.5}
                strokeDasharray={selected ? undefined : '2 4'}
                vectorEffect={selected ? 'non-scaling-stroke' : undefined}
                style={{ pointerEvents: 'none' }}
              />
              {selected && (
                <rect
                  x={boxL}
                  y={boxT}
                  width={boxR - boxL}
                  height={boxB - boxT}
                  rx={14}
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth={1.25}
                  strokeOpacity={0.9}
                  vectorEffect="non-scaling-stroke"
                  style={{ pointerEvents: 'none' }}
                />
              )}
            </g>
          );
        }

        return (
          <g key={g0.gid}>
            <g
              className={selected ? 'hhandle hhandle--sel' : 'hhandle'}
              style={{ cursor: 'grab' }}
              onPointerDown={(ev) => {
                ev.stopPropagation();
                const base: Record<string, { ox: number; oy: number }> = {};
                nodes.forEach((n) => {
                  if (n.gid === g0.gid)
                    base[n.id] = { ox: n.ox ?? 0, oy: n.oy ?? 0 };
                });
                const svg = (ev.target as Element).closest('svg');
                const r = svg!.getBoundingClientRect();
                const scene = svg!.querySelector('#scene')!;
                const { tx, ty, k } = JSON.parse(
                  scene.getAttribute('data-vp') || '{}',
                ) as { tx: number; ty: number; k: number };
                const wx = (ev.clientX - r.left - tx) / k;
                const wy = (ev.clientY - r.top - ty) / k;
                onHouseholdDragStart(g0.gid, wx, wy, base, ev);
              }}
            >
              <rect
                x={headerX}
                y={headerY}
                width={labelW}
                height={pillH}
                rx={8}
                fill={selected ? '#1b6cd6' : g0.color + '22'}
                stroke={selected ? '#ffffff' : g0.color + '55'}
                strokeWidth={selected ? 2 : 1}
                vectorEffect={selected ? 'non-scaling-stroke' : undefined}
              />
              <text
                x={headerX + 10}
                y={textY(headerY)}
                dominantBaseline="middle"
                fontSize={12}
                fill={selected ? '#ffffffbb' : g0.color + '99'}
              >
                ⠿
              </text>
              <text
                x={headerX + 24}
                y={textY(headerY)}
                dominantBaseline="middle"
                fontSize={12}
                fontWeight={700}
                fill={selected ? '#fff' : g0.color}
              >
                {label}
              </text>
            </g>
            <g
              className="hh-ageup"
              role="button"
              aria-label={`Age up ${g0.hh}`}
              style={{ cursor: 'pointer' }}
              onPointerDown={(ev) => {
                ev.stopPropagation();
                onAgeUp(g0.gid);
              }}
            >
              <title>Age up this household</title>
              <rect
                x={ageX}
                y={ageY}
                width={ageW}
                height={pillH}
                rx={8}
                fill={g0.color}
                stroke={g0.color}
                strokeWidth={1}
              />
              <text
                x={ageX + ageW / 2}
                y={textY(ageY)}
                dominantBaseline="middle"
                fontSize={12}
                fontWeight={700}
                textAnchor="middle"
                fill="#fff"
              >
                {ageLabel}
              </text>
            </g>
          </g>
        );
      })}
    </g>
  );
}
