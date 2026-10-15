import { simName } from '../lib/connectionLog.ts';
import { familySummary, type Family } from '../lib/family.ts';
import type { SimNode } from '../types/whiteboard.ts';

type Props = {
  /** The selected sim's family; null while no sim is selected. */
  family: Family | null;
  byid: Record<string, SimNode>;
  /** The filters: relatives they hide are counted apart. */
  shown: (n: SimNode) => boolean;
  onDone: () => void;
};

/**
 * Says whose family glows and how far it reaches, while the highlight is on.
 * A status region, so a screen reader hears the counts change as the
 * selection moves from sim to sim.
 */
export function FamilyBanner({ family, byid, shown, onDone }: Props) {
  const node = family ? byid[family.id] : undefined;
  let text;
  if (!family || !node) {
    text = <>Family highlight is on. Select a sim to light up their family.</>;
  } else {
    const s = familySummary(family, byid, shown);
    text = s.roles ? (
      <>
        {simName(node)}'s family: <b>{s.sims}</b> in <b>{s.homes}</b>
        <span className="family-banner__roles">
          {s.roles}
          {s.hidden ? ` · ${s.hidden} more hidden by filters` : ''}
        </span>
      </>
    ) : (
      <>
        {simName(node)} has no family links on the board
        {s.hidden ? ` (${s.hidden} hidden by filters)` : ''}.
      </>
    );
  }
  return (
    <div
      className="bloodline-banner family-banner"
      role="status"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <p>{text}</p>
      <button type="button" onClick={onDone}>
        Done
      </button>
    </div>
  );
}
