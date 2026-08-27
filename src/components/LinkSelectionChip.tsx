import type { ChipObstacle, LinkSelectionInfo } from '../lib/linkLabel.ts';
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
};

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
}: Props) {
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
  );
  if (!placement) return null;

  const left = tx + placement.at[0] * k;
  const top = ty + placement.at[1] * k;
  const directed = !!(info.nameFrom && info.nameTo);

  return (
    <div
      className="link-sel-chip"
      data-side={placement.side}
      style={{ left, top }}
      role="status"
      aria-live="polite"
      aria-label={[info.label, info.names].filter(Boolean).join(': ')}
    >
      <span className="link-sel-chip__mark" aria-hidden="true">
        {info.mark}
      </span>
      <span className="link-sel-chip__body">
        <span className="link-sel-chip__label">{info.label}</span>
        {directed ? (
          <span className="link-sel-chip__names">
            <span className="link-sel-chip__party">{info.nameFrom}</span>
            <span className="link-sel-chip__dir" aria-hidden="true">
              →
            </span>
            <span className="link-sel-chip__party link-sel-chip__party--to">
              {info.nameTo}
            </span>
          </span>
        ) : info.names ? (
          <span className="link-sel-chip__names">{info.names}</span>
        ) : null}
      </span>
    </div>
  );
}
