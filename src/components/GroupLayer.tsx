import { memo, type PointerEvent as ReactPointerEvent } from 'react';
import type { Group, SimNode } from '../types/whiteboard.ts';
import { rectsIntersect, type WorldRect } from '../lib/marquee.ts';
import { nodesForGid, type NodeBuckets } from '../lib/nodeIndex.ts';
import { HH_TAG_STACK_GAP } from '../lib/constants.ts';
import { planBadge, type PlanTally } from '../lib/householdPlan.ts';
import { animalLaneDivider, householdChrome, tagPillWidth, UNHOUSED_MARK_W } from '../lib/tiles.ts';
import { isUnhousedGid } from '../lib/unhoused.ts';
import { neighbourhoodIconUrl, type GameLot } from '../lib/places.ts';
import { UnhousedGlyph } from './UnhousedGlyph.tsx';
import { BlankDisc } from './BlankDisc.tsx';

type Props = {
  groups: Group[];
  nodes: SimNode[];
  show: boolean;
  packVis: (n: SimNode) => boolean;
  /** `frames` = dashed boxes (under edges); `handles` = name/Age up on top. */
  mode: 'frames' | 'handles';
  /** False when zoomed out far enough that pill type would be sub-pixel. */
  labels: boolean;
  selectedGids?: ReadonlySet<string>;
  buckets?: NodeBuckets;
  /** Render window — households outside it are not mounted (see viewportCull). */
  cull?: WorldRect | null;
  /** Households that stay mounted wherever they are (e.g. being dragged). */
  keepGids?: ReadonlySet<string>;
  onHouseholdDragStart: (
    gid: string,
    wx: number,
    wy: number,
    base: Record<string, { ox: number; oy: number }>,
    ev: ReactPointerEvent,
  ) => void;
  onAgeUp: (gid: string) => void;
  /** The household's + : add a new sim to it. */
  /** The household tag's ＋, with where it was clicked. */
  onAddSim?: (gid: string, ev: { clientX: number; clientY: number }) => void;
  /** Each household's plan items by state, for the badge beside its +. */
  tallies?: ReadonlyMap<string, PlanTally>;
  /** The badge: open the household's plan. */
  onOpenPlan?: (gid: string) => void;
  /** The game lot each household lives on (householdLots), for its tag's tip. */
  homes?: ReadonlyMap<string, GameLot>;
  /** The household the save was last played in: a soft glow, no label. */
  lastPlayedGid?: string;
};

/** The neighbourhood icon in a household tag, where the grip would be. */
const NB_ICON = 18;

/** Badge colors: ready to do, off plan, or only waiting. */
const BADGE = {
  // A window for babies closing: amber on white, to play soon.
  closing: { fill: '#ffffff', stroke: '#b45309', text: '#8a4208' },
  ready: { fill: '#e3f3ea', stroke: '#2f8f5b', text: '#1f6b43' },
  offPlan: { fill: '#fdf0dc', stroke: '#b45309', text: '#8a4208' },
  waiting: { fill: '#ffffff', stroke: '#aeb9c7', text: '#5a6675' },
} as const;

export const GroupLayer = memo(function GroupLayer({
  groups,
  nodes,
  show,
  packVis,
  mode,
  labels,
  selectedGids,
  buckets,
  cull,
  keepGids,
  onHouseholdDragStart,
  onAgeUp,
  onAddSim,
  tallies,
  onOpenPlan,
  homes,
  lastPlayedGid,
}: Props) {
  if (!show) return null;

  return (
    <g id={mode === 'frames' ? 'lGroups' : 'lGroupHandles'}>
      {groups.map((g0) => {
        const mem = nodesForGid(g0.gid, nodes, buckets).filter(packVis);
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
          addX,
          addW,
          pillH,
          label,
          labelW,
          ageLabel,
          ageW,
        } = chrome;
        const textY = (pillY: number) => pillY + pillH / 2;
        const selected = !!selectedGids?.has(g0.gid);
        /** Unhoused sims: not a home, so a dotted box, an outlined tag and no Age up. */
        const unhoused = isUnhousedGid(g0.gid);
        const nbIcon = unhoused ? undefined : neighbourhoodIconUrl(g0.world, g0.nb);
        /** A neighbourhood the game draws no picture of that we have: a blank disc. */
        const nbBlank = !unhoused && !nbIcon && !!g0.nb && g0.nb !== '-';
        if (
          cull &&
          !selected &&
          !keepGids?.has(g0.gid) &&
          !rectsIntersect({ l: boxL, t: boxT, r: boxR, b: boxB }, cull)
        ) {
          return null;
        }

        if (mode === 'frames') {
          const lane = animalLaneDivider(mem);
          return (
            <g key={g0.gid} data-gid={g0.gid}>
              {g0.gid === lastPlayedGid && (
                // Where you were when the game saved: a glow in its colour.
                <rect
                  className="hh-lastplayed"
                  x={boxL - 6}
                  y={boxT - 6}
                  width={boxR - boxL + 12}
                  height={boxB - boxT + 12}
                  rx={18}
                  fill="none"
                  stroke={g0.color}
                  strokeWidth={10}
                  strokeOpacity={0.35}
                  filter="url(#softGlow)"
                  style={{ pointerEvents: 'none' }}
                />
              )}
              <rect
                x={boxL}
                y={boxT}
                width={boxR - boxL}
                height={boxB - boxT}
                rx={14}
                fill={selected ? '#1b6cd622' : g0.color + (unhoused ? '08' : '12')}
                stroke={selected ? '#1b6cd6' : g0.color + (unhoused ? '88' : '55')}
                strokeWidth={selected ? 3 : unhoused ? 2 : 1.5}
                strokeDasharray={selected ? undefined : unhoused ? '0.1 7' : '2 4'}
                strokeLinecap={unhoused && !selected ? 'round' : undefined}
                vectorEffect={selected ? 'non-scaling-stroke' : undefined}
                style={{ pointerEvents: 'none' }}
              />
              {lane && (
                // Midway through the empty column, which puts it on a grid
                // line: bolder than the box's own dashes so it still shows.
                <line
                  className="hh-lane"
                  x1={lane.x}
                  y1={lane.t}
                  x2={lane.x}
                  y2={lane.b}
                  stroke={g0.color + 'aa'}
                  strokeWidth={2.5}
                  strokeDasharray="8 7"
                  strokeLinecap="round"
                  style={{ pointerEvents: 'none' }}
                />
              )}
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
          <g key={g0.gid} data-gid={g0.gid}>
            <g
              className={selected ? 'hhandle hhandle--sel' : 'hhandle'}
              style={{ cursor: 'grab' }}
              onPointerDown={(ev) => {
                ev.stopPropagation();
                const base: Record<string, { ox: number; oy: number }> = {};
                for (const n of nodesForGid(g0.gid, nodes, buckets)) {
                  base[n.id] = { ox: n.ox ?? 0, oy: n.oy ?? 0 };
                }
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
              {unhoused ? (
                <title>
                  Unhoused sims: townies the game made as you played. Premade sims
                  with no home keep their own households.
                </title>
              ) : (
                <title>
                  {g0.gid === lastPlayedGid ? 'The household you last played, when the game saved.\n' : ''}
                  {homeLine(homes?.get(g0.gid), g0.nb)}
                  Click for this household’s plan · drag to move the household
                </title>
              )}
              <rect
                x={headerX}
                y={headerY}
                width={labelW}
                height={pillH}
                rx={8}
                fill={selected ? '#1b6cd6' : unhoused ? '#fbfcfe' : g0.color + '22'}
                stroke={selected ? '#ffffff' : g0.color + (unhoused ? 'aa' : '55')}
                strokeWidth={selected ? 2 : unhoused ? 1.5 : 1}
                strokeDasharray={unhoused && !selected ? '4 3' : undefined}
                vectorEffect={selected ? 'non-scaling-stroke' : undefined}
              />
              {labels && (
                <>
                  {nbIcon ? (
                    // The neighbourhood's icon stands for the grip: the whole
                    // tag is the handle, and it shows where they live.
                    <>
                      <circle
                        cx={headerX + 4 + NB_ICON / 2}
                        cy={textY(headerY)}
                        r={NB_ICON / 2 + 1}
                        fill={selected ? '#ffffff' : g0.color + '33'}
                      />
                      <image
                        className="hh-nb"
                        href={nbIcon}
                        x={headerX + 4}
                        y={textY(headerY) - NB_ICON / 2}
                        width={NB_ICON}
                        height={NB_ICON}
                        preserveAspectRatio="xMidYMid meet"
                      />
                    </>
                  ) : nbBlank ? (
                    <BlankDisc cx={headerX + 4 + NB_ICON / 2} cy={textY(headerY)} r={NB_ICON / 2} color={selected ? '#ffffff' : g0.color} />
                  ) : (
                    <text
                      x={headerX + 10}
                      y={textY(headerY)}
                      dominantBaseline="middle"
                      fontSize={12}
                      fill={selected ? '#ffffffbb' : g0.color + '99'}
                    >
                      ⠿
                    </text>
                  )}
                  {unhoused && (
                    <UnhousedGlyph
                      x={headerX + 24 + UNHOUSED_MARK_W / 2 - 2}
                      y={textY(headerY)}
                      color={selected ? '#fff' : g0.color}
                    />
                  )}
                  <text
                    x={headerX + 24 + (unhoused ? UNHOUSED_MARK_W : 0)}
                    y={textY(headerY)}
                    dominantBaseline="middle"
                    fontSize={12}
                    fontWeight={700}
                    fill={selected ? '#fff' : g0.color}
                  >
                    {label}
                  </text>
                </>
              )}
            </g>
            {/* Without its text, Age up is a blank pill a stray click hits. */}
            {!unhoused && labels && (
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
            )}
            {!unhoused && labels && onAddSim && (
              <g
                className="hh-add"
                role="button"
                aria-label={`Add a sim or a pet to ${g0.hh}`}
                // Acts on click, not press, so a press that turns into a pan
                // or a stray tap while zooming adds nobody.
                onPointerDown={(ev) => ev.stopPropagation()}
                onClick={(ev) => onAddSim(g0.gid, ev)}
              >
                <title>Add a sim or a pet to this household</title>
                <rect
                  x={addX}
                  y={ageY}
                  width={addW}
                  height={pillH}
                  rx={8}
                  fill="#fff"
                  stroke={g0.color}
                  strokeWidth={1.5}
                />
                <text
                  x={addX + addW / 2}
                  y={textY(ageY)}
                  dominantBaseline="central"
                  fontSize={18}
                  fontWeight={700}
                  textAnchor="middle"
                  fill={g0.color}
                >
                  +
                </text>
              </g>
            )}
            {!unhoused && labels && onOpenPlan && (() => {
              const badge = planBadge(tallies?.get(g0.gid));
              if (!badge) return null;
              const tone = BADGE[badge.tone];
              const x = addX + addW + HH_TAG_STACK_GAP;
              const w = tagPillWidth(badge.text, 18);
              return (
                <g
                  className="hh-plan"
                  role="button"
                  aria-label={`${g0.hh} household plan: ${badge.title}`}
                  style={{ cursor: 'pointer' }}
                  // Acts on click, like the +, so a pan that starts here opens nothing.
                  onPointerDown={(ev) => ev.stopPropagation()}
                  onClick={() => onOpenPlan(g0.gid)}
                >
                  <title>{`${badge.title}. Click for the household’s plan.`}</title>
                  <rect x={x} y={ageY} width={w} height={pillH} rx={8} fill={tone.fill} stroke={tone.stroke} strokeWidth={1.5} />
                  <text
                    x={x + w / 2}
                    y={textY(ageY)}
                    dominantBaseline="middle"
                    fontSize={12}
                    fontWeight={700}
                    textAnchor="middle"
                    fill={tone.text}
                  >
                    {badge.text}
                  </text>
                </g>
              );
            })()}
          </g>
        );
      })}
    </g>
  );
});

/** "Lives on Ophelia Villa, Pendula View." and a line break, for a tag's tip. */
function homeLine(lot: GameLot | undefined, nb: string): string {
  if (lot) return `Lives on ${lot.name}, ${lot.nb}.\n`;
  return nb && nb !== '-' ? `Lives in ${nb}.\n` : '';
}
