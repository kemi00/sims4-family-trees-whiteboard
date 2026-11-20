import { memo, useRef, useState } from 'react';
import { rectsIntersect, type WorldRect } from '../lib/marquee.ts';
import type { LotBox } from '../lib/lotBoxes.ts';
import { lotKey, lotKindLabel, lotRoomsLabel, lotSizeLabel, neighbourhoodIconUrl, type GameLot } from '../lib/places.ts';
import { HH_TAG_INSET, HH_TAG_PILL_H } from '../lib/constants.ts';
import { tagPillWidth } from '../lib/tiles.ts';
import { textWidth } from '../lib/textWidth.ts';
import { worldColor } from '../lib/utils.ts';
import type { World } from '../types/whiteboard.ts';
import { BlankDisc } from './BlankDisc.tsx';

type Props = {
  boxes: ReadonlyMap<string, LotBox>;
  worlds: World[];
  show: boolean;
  /** False when zoomed out far enough that tile type would be sub-pixel. */
  labels: boolean;
  cull?: WorldRect | null;
  /** A lot's tile, clicked where on screen: move sims in. */
  onPickLot?: (lot: GameLot, clientX: number, clientY: number) => void;
  /** The board's zoom, for a drag's distance in board units. */
  k?: number;
  /** A box dragged by its tag to a new top-left: it stays there (moveLotBox). */
  onMoveBox?: (world: string, x: number, y: number) => void;
};

const NAME_SIZE = 12.5;
const NAME_LINE = 15;
const DETAIL_SIZE = 11;
const DETAIL_LINE = 13.5;
const ICON = 18;
const PAD = 9;

/** `text` broken into lines no wider than `w`, at spaces, a long word on its own. */
function wrap(text: string, w: number, size: number, weight: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (!line || textWidth(next, size, weight) <= w) line = next;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** How many lots and units are available, for the box's tag. */
function boxLabel(tiles: LotBox['tiles']): string {
  const reserved = tiles.filter(({ lot }) => lot.reservedFor).length;
  const units = tiles.filter(({ lot }) => lot.unit).length;
  if (reserved) {
    const kind = units > 0 && units < tiles.length ? 'lots & units' : units ? 'units' : 'lots';
    return `${tiles.length} vacant ${kind} · ${reserved} planned`;
  }
  if (units > 0 && units < tiles.length) return `${tiles.length} free lots & units`;
  const kind = units ? 'unit' : 'lot';
  return `${tiles.length} free ${kind}${tiles.length === 1 ? '' : 's'}`;
}

/** A lot's tip: all it is, and what a click does. */
function lotTip(lot: GameLot): string {
  const parts = [lotKindLabel(lot), lotSizeLabel(lot), lotRoomsLabel(lot)].filter(Boolean).join(', ');
  const place = [lot.name, lot.building && !lot.name.includes(lot.building) ? lot.building : null, lot.nb].filter(Boolean);
  return `${place.join(', ')}: ${parts}.\n${lot.reservedFor
    ? `Vacant in your save. Planned for ${lot.reservedFor.hh}; this reservation is kept on the board.`
    : 'Click to move sims in.'}`;
}

/**
 * Each world's Free lots: vacancies, with labels for homes reserved by plans, so
 * sims who move have somewhere to go. A faded box under the world's
 * households, like a household with no one in it, with one faded tile per
 * lot: its neighbourhood's icon, its name, what stands on it and its size.
 */
export const LotLayer = memo(function LotLayer({ boxes, worlds, show, labels, cull, onPickLot, k = 1, onMoveBox }: Props) {
  /** A box on the move by its tag: how far, in board units, until it's let go. */
  const [drag, setDrag] = useState<{ world: string; dx: number; dy: number } | null>(null);
  const from = useRef<{ x: number; y: number } | null>(null);
  if (!show || !boxes.size) return null;
  return (
    <g id="lLots">
      {[...boxes.values()].map((box) => {
        if (cull && !rectsIntersect(box, cull)) return null;
        const color = worldColor(box.world, worlds);
        const label = boxLabel(box.tiles);
        const pillW = tagPillWidth(label, 22);
        const moving = drag?.world === box.world;
        return (
            <g
            key={box.world}
            className={moving ? 'lots lots--moving' : 'lots'}
            data-world={box.world}
            transform={moving ? `translate(${drag.dx} ${drag.dy})` : undefined}
          >
            <rect
              x={box.l}
              y={box.t}
              width={box.r - box.l}
              height={box.b - box.t}
              rx={14}
              fill={color + '06'}
              stroke={color + '55'}
              strokeWidth={1.5}
              strokeDasharray="2 6"
              strokeLinecap="round"
              style={{ pointerEvents: 'none' }}
            />
            {/* The tag is always there to grab, as a household's is: zoomed
                out it is a bar in the world's colour, its words hidden. */}
            <g
              className={onMoveBox ? 'lots__tag lots__tag--drag' : 'lots__tag'}
              data-tip={`Vacant lots in ${box.world}\nPlanned households keep their reservations. Click an unreserved lot to move sims in. Drag this tag to move the box.`}
              // Drag the tag to move the box: only you move it, and it stays where you put it.
              onPointerDown={(ev) => {
                if (!onMoveBox || ev.button !== 0) return;
                ev.stopPropagation();
                ev.currentTarget.setPointerCapture(ev.pointerId);
                from.current = { x: ev.clientX, y: ev.clientY };
                setDrag({ world: box.world, dx: 0, dy: 0 });
              }}
              onPointerMove={(ev) => {
                if (!from.current || drag?.world !== box.world) return;
                setDrag({ world: box.world, dx: (ev.clientX - from.current.x) / k, dy: (ev.clientY - from.current.y) / k });
              }}
              onPointerUp={() => {
                if (drag?.world === box.world && from.current && (drag.dx || drag.dy)) onMoveBox?.(box.world, box.l + drag.dx, box.t + drag.dy);
                from.current = null;
                setDrag(null);
              }}
              onPointerCancel={() => {
                from.current = null;
                setDrag(null);
              }}
            >
              <rect
                x={box.l + HH_TAG_INSET}
                y={box.t + HH_TAG_INSET}
                width={pillW}
                height={HH_TAG_PILL_H}
                rx={8}
                {...(labels
                  ? { stroke: color + '77', strokeWidth: 1.25, strokeDasharray: '4 3' }
                  : { style: { fill: color + '22' } })}
              />
              {labels && (
                <text
                  x={box.l + HH_TAG_INSET + 11}
                  y={box.t + HH_TAG_INSET + HH_TAG_PILL_H / 2}
                  dominantBaseline="middle"
                  fontSize={12}
                  fontWeight={700}
                  fill={color}
                >
                  {label}
                </text>
              )}
            </g>
            {box.tiles.map(({ lot, x, y, w, h }) => {
              const icon = neighbourhoodIconUrl(lot.world, lot.nb);
              const textX = x + PAD + ICON + 7;
              const room = x + w - PAD - textX;
              const name = wrap(lot.name, room, NAME_SIZE, 700);
              // Its neighbourhood first, so the icon is never the only clue.
              const detail = [
                lot.nb,
                [lotKindLabel(lot), lotSizeLabel(lot)].filter(Boolean).join(' · '),
                lotRoomsLabel(lot),
                lot.reservedFor ? `Planned for ${lot.reservedFor.hh}` : null,
              ]
                .filter((d): d is string => !!d)
                .flatMap((d) => wrap(d, room, DETAIL_SIZE, 500));
              const top = y + PAD + 2;
              return (
                <g
                  key={lotKey(lot)}
                  className={lot.reservedFor ? 'lot lot--reserved' : 'lot'}
                  role="button"
                  aria-label={`${lot.name}: ${lot.reservedFor ? `vacant, planned for ${lot.reservedFor.hh}` : 'move sims in'}`}
                  aria-disabled={!!lot.reservedFor}
                  tabIndex={-1}
                  // Acts on click, as the household + does, so a pan that
                  // starts on a lot moves nobody.
                  onPointerDown={(ev) => ev.stopPropagation()}
                  onClick={(ev) => { if (!lot.reservedFor) onPickLot?.(lot, ev.clientX, ev.clientY); }}
                  data-tip={lotTip(lot)}
                >
                  <rect
                    className="lot__tile"
                    x={x}
                    y={y}
                    width={w}
                    height={h}
                    rx={10}
                    stroke={color}
                    strokeOpacity={0.45}
                    strokeWidth={1.25}
                    strokeDasharray="4 3"
                  />
                  {labels && (
                    <g className="lot__face" style={{ pointerEvents: 'none' }}>
                      {icon ? (
                        <image
                          href={icon}
                          x={x + PAD}
                          y={top - 3}
                          width={ICON}
                          height={ICON}
                          preserveAspectRatio="xMidYMid meet"
                        />
                      ) : (
                        <BlankDisc cx={x + PAD + ICON / 2} cy={top - 3 + ICON / 2} r={ICON / 2} color={color} />
                      )}
                      <text className="lot__name" fontSize={NAME_SIZE} fontWeight={700}>
                        {name.map((line, i) => (
                          <tspan key={i} x={textX} y={top + 7 + i * NAME_LINE}>
                            {line}
                          </tspan>
                        ))}
                      </text>
                      <text className="lot__detail" fontSize={DETAIL_SIZE} fontWeight={500}>
                        {detail.map((line, i) => (
                          <tspan key={i} x={textX} y={top + 7 + name.length * NAME_LINE + 2 + i * DETAIL_LINE}>
                            {line}
                          </tspan>
                        ))}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
          </g>
        );
      })}
    </g>
  );
});
