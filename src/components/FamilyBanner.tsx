import { simName } from '../lib/connectionLog.ts';
import { familySummary, type Family, type FamilyScope } from '../lib/family.ts';
import type { SimNode } from '../types/whiteboard.ts';

type Props = {
  /** The selected sim's family; null while no sim is selected. */
  family: Family | null;
  byid: Record<string, SimNode>;
  /** The filters: relatives they hide are counted apart. */
  shown: (n: SimNode) => boolean;
  scope: FamilyScope;
  onScope: (scope: FamilyScope) => void;
  onDone: () => void;
};

const SCOPES: { scope: FamilyScope; label: string; hint: string }[] = [
  { scope: 'close', label: 'Close', hint: 'Partners, parents, children, siblings' },
  {
    scope: 'extended',
    label: 'Extended',
    hint: 'Also grandparents, grandchildren, aunts, uncles, cousins, step-family',
  },
];

/**
 * Says whose family glows and how far it reaches, while the highlight is on.
 * A status region, so a screen reader hears the counts change as the
 * selection moves from sim to sim.
 */
export function FamilyBanner({ family, byid, shown, scope, onScope, onDone }: Props) {
  const node = family ? byid[family.id] : undefined;
  const which = scope === 'extended' ? 'extended family' : 'close family';
  let text;
  if (!family || !node) {
    text = <>Family highlight is on. Select a sim to light up their {which}.</>;
  } else {
    const s = familySummary(family, byid, shown);
    text = s.roles ? (
      <>
        {simName(node)}'s {which}: <b>{s.sims}</b> in <b>{s.homes}</b>
        <span className="family-banner__roles">
          {s.roles}
          {s.hidden ? ` · ${s.hidden} more hidden by filters` : ''}
        </span>
      </>
    ) : (
      <>
        {simName(node)} has no {which} on the board
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
      <span className="family-banner__scope" role="group" aria-label="How far the family reaches">
        {SCOPES.map((s) => (
          <button
            key={s.scope}
            type="button"
            aria-pressed={scope === s.scope}
            title={s.hint}
            onClick={() => onScope(s.scope)}
          >
            {s.label}
          </button>
        ))}
      </span>
      <button type="button" onClick={onDone}>
        Done
      </button>
    </div>
  );
}
