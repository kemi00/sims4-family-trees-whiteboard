import { useCallback, useRef, useState } from 'react';
import type { ChipObstacle, ChipSim, LinkSelectionInfo } from '../lib/linkLabel.ts';
import { placeChipOnVisiblePath } from '../lib/linkLabel.ts';

type Props = {
  info: LinkSelectionInfo;
  tx: number;
  ty: number;
  k: number;
  /** Stage size in CSS pixels (for keeping the chip in view on the path). */
  stageW: number;
  stageH: number;
  /** Sim cards / household chrome — chip prefers path points clear of these. */
  obstacles?: ChipObstacle[];
  /** A name was clicked: select that sim and bring their card into view. */
  onGoToSim?: (id: string) => void;
  /** What to do with the picked couple: plan its end, or cancel that plan. */
  action?: { label: string; onClick: () => void };
};

/** Most names a chip lists; past that, the rest are "+ N more". */
const CHIP_MAX_NAMES = 8;

/**
 * Names as buttons that take you to each sim, " + " between them. Each
 * name keeps its "+" and wraps as one, so a big family takes more lines
 * instead of being cut off.
 */
function SimNames({
  sims,
  onGoToSim,
}: {
  sims: ChipSim[];
  onGoToSim?: (id: string) => void;
}) {
  const shown = sims.length > CHIP_MAX_NAMES ? sims.slice(0, CHIP_MAX_NAMES - 1) : sims;
  const more = sims.length - shown.length;
  return (
    <>
      {shown.map((s, i) => (
        <span key={s.id} className="link-sel-chip__item">
          {i > 0 && (
            <span className="link-sel-chip__sep" aria-hidden="true">
              +
            </span>
          )}
          {onGoToSim ? (
            <button
              type="button"
              className="link-sel-chip__sim"
              title={`Go to ${s.name}`}
              onClick={() => onGoToSim(s.id)}
            >
              {s.name}
            </button>
          ) : (
            <span>{s.name}</span>
          )}
        </span>
      ))}
      {more > 0 && (
        <span className="link-sel-chip__item link-sel-chip__more">
          <span className="link-sel-chip__sep" aria-hidden="true">
            +
          </span>
          {more} more
        </span>
      )}
    </>
  );
}

/**
 * Relationship chip: follows the visible part of the selected link.
 * Drawn beside the stroke (above when it fits, below near the top edge) so
 * it stays on-screen while cards remain draggable (pointer-events: none).
 */
export function LinkSelectionChip({
  info,
  tx,
  ty,
  k,
  stageW,
  stageH,
  obstacles = [],
  onGoToSim,
  action,
}: Props) {
  // The chip's real height (a big family or a note takes more lines), so
  // it's placed where all of it stays on screen.
  const [height, setHeight] = useState<number>();
  const watching = useRef<ResizeObserver | null>(null);
  const ref = useCallback((el: HTMLDivElement | null) => {
    watching.current?.disconnect();
    watching.current = null;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setHeight(el.offsetHeight || undefined));
    ro.observe(el);
    watching.current = ro;
  }, []);
  const placement = placeChipOnVisiblePath(
    info.path,
    {
      tx,
      ty,
      k,
      width: stageW,
      height: stageH,
    },
    40,
    obstacles,
    height,
  );
  if (!placement) return null;

  const left = tx + placement.at[0] * k;
  const top = ty + placement.at[1] * k;
  const directed = !!(info.nameFrom && info.nameTo);

  return (
    <div
      ref={ref}
      className={directed || info.yourNote || action ? 'link-sel-chip link-sel-chip--tall' : 'link-sel-chip'}
      data-side={placement.side}
      style={{ left, top }}
      role="status"
      aria-live="polite"
      aria-label={[
        [info.label, info.names].filter(Boolean).join(': '),
        info.note,
        info.yourNote && `Your note: ${info.yourNote}`,
      ]
        .filter(Boolean)
        .join('. ')}
    >
      <span className="link-sel-chip__mark" aria-hidden="true">
        {info.mark}
      </span>
      <span className="link-sel-chip__body">
        <span className="link-sel-chip__label">{info.label}</span>
        {directed ? (
          <span className="link-sel-chip__names">
            <span className="link-sel-chip__party">
              {info.fromSims ? (
                <SimNames sims={info.fromSims} onGoToSim={onGoToSim} />
              ) : (
                info.nameFrom
              )}
            </span>
            <span className="link-sel-chip__dir" aria-hidden="true">
              →
            </span>
            <span className="link-sel-chip__party link-sel-chip__party--to">
              {info.toSims ? (
                <SimNames sims={info.toSims} onGoToSim={onGoToSim} />
              ) : (
                info.nameTo
              )}
            </span>
          </span>
        ) : info.names ? (
          <span className="link-sel-chip__names">
            {info.sims ? <SimNames sims={info.sims} onGoToSim={onGoToSim} /> : info.names}
          </span>
        ) : null}
        {info.note && <span className="link-sel-chip__note">{info.note}</span>}
        {info.yourNote && <span className="link-sel-chip__yours">{info.yourNote}</span>}
        {action && (
          <button
            type="button"
            className="link-sel-chip__act"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={action.onClick}
          >
            {action.label}
          </button>
        )}
      </span>
    </div>
  );
}
