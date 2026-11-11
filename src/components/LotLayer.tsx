import { memo } from 'react';
import { rectsIntersect, type WorldRect } from '../lib/marquee.ts';
import type { LotBox } from '../lib/lotBoxes.ts';
import { lotKindLabel, lotRoomsLabel, lotSizeLabel, neighbourhoodIconUrl, type GameLot } from '../lib/places.ts';
import { HH_TAG_INSET, HH_TAG_PILL_H } from '../lib/constants.ts';
import { tagPillWidth } from '../lib/tiles.ts';
import { textWidth } from '../lib/textWidth.ts';
import { worldColor } from '../lib/utils.ts';
import type { World } from '../types/whiteboard.ts';

type Props = {
  boxes: ReadonlyMap<string, LotBox>;
  worlds: World[];
  show: boolean;
  /** False when zoomed out far enough that tile type would be sub-pixel. */
  labels: boolean;
  cull?: WorldRect | null;
  /** A lot's tile, clicked where on screen: move sims in. */
  onPickLot?: (lot: GameLot, clientX: number, clientY: number) => void;
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

/** "Free lots" with how many, for the box's tag. */
function boxLabel(count: number): string {
  return count === 1 ? '1 free lot' : `${count} free lots`;
}

/** A lot's tip: all it is, and what a click does. */
function lotTip(lot: GameLot): string {
  const parts = [lotKindLabel(lot), lotSizeLabel(lot), lotRoomsLabel(lot)].filter(Boolean).join(', ');
  return `${lot.name}, ${lot.nb}: ${parts}.\nNo one on the board lives here. Click to move sims in.`;
}

/**
 * Each world's Free lots: the lots no household on the board lives on, so
 * sims who move have somewhere to go. A faded box under the world's
 * households, like a household with no one in it, with one faded tile per
 * lot: its neighbourhood's icon, its name, what stands on it and its size.
 */
export const LotLayer = memo(function LotLayer({ boxes, worlds, show, labels, cull, onPickLot }: Props) {
  if (!show || !boxes.size) return null;
  return (
    <g id="lLots">
      {[...boxes.values()].map((box) => {
        if (cull && !rectsIntersect(box, cull)) return null;
        const color = worldColor(box.world, worlds);
        const label = boxLabel(box.tiles.length);
        const pillW = tagPillWidth(label, 22);
        return (
          <g key={box.world} className="lots" data-world={box.world}>
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
            {labels && (
              <g className="lots__tag">
                <title>{`Lots in ${box.world} that no household on the board lives on. Sims move in from Move to, or click a lot.`}</title>
                <rect
                  x={box.l + HH_TAG_INSET}
                  y={box.t + HH_TAG_INSET}
                  width={pillW}
                  height={HH_TAG_PILL_H}
                  rx={8}
                  stroke={color + '77'}
                  strokeWidth={1.25}
                  strokeDasharray="4 3"
                />
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
              </g>
            )}
            {box.tiles.map(({ lot, x, y, w, h }) => {
              const icon = neighbourhoodIconUrl(lot.world, lot.nb);
              const textX = x + PAD + (icon ? ICON + 7 : 0);
              const room = x + w - PAD - textX;
              const name = wrap(lot.name, room, NAME_SIZE, 700);
              const detail = [
                [lotKindLabel(lot), lotSizeLabel(lot)].filter(Boolean).join(' · '),
                lotRoomsLabel(lot),
              ]
                .filter((d): d is string => !!d)
                .flatMap((d) => wrap(d, room, DETAIL_SIZE, 500));
              const top = y + PAD + 2;
              return (
                <g
                  key={lot.name}
                  className="lot"
                  role="button"
                  aria-label={`${lot.name}: move sims in`}
                  tabIndex={-1}
                  // Acts on click, as the household + does, so a pan that
                  // starts on a lot moves nobody.
                  onPointerDown={(ev) => ev.stopPropagation()}
                  onClick={(ev) => onPickLot?.(lot, ev.clientX, ev.clientY)}
                >
                  <title>{lotTip(lot)}</title>
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
                      {icon && (
                        <image
                          href={icon}
                          x={x + PAD}
                          y={top - 3}
                          width={ICON}
                          height={ICON}
                          preserveAspectRatio="xMidYMid meet"
                        />
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
