import { DYNASTY_ROLES } from '../lib/constants.ts';
import { dynastyKey, dynastyPhrase, type DynastyName } from '../lib/generations.ts';
import { gapText, type PartnerCandidate } from '../lib/partners.ts';
import { cardName } from '../lib/plan.ts';
import type { SimNode } from '../types/whiteboard.ts';

type Props = {
  sim: SimNode;
  /** Set for a suggested partner: how close in life they are. */
  candidate?: PartnerCandidate;
  /** Every dynasty's name on the board (dynastyNames), for "Watson dynasty". */
  dynasties: Map<string, DynastyName>;
  /** A blood relative: found by name, never suggested. */
  related?: boolean;
  married?: boolean;
};

/**
 * One possible partner, the same in the sim editor and the ♥ menu: their
 * dynasty role's mark and name; how close in life and where they live; then
 * what to weigh, in amber (related, married or in a romance, not aging now,
 * their dynasty). Only the inside of the row: each list wraps it in its own
 * button.
 */
export function PartnerRow({ sim: p, candidate: c, dynasties, related, married }: Props) {
  const mark = p.dynastyRole ? `${DYNASTY_ROLES[p.dynastyRole].mark} ` : '';
  const flags = [
    related ? 'related' : '',
    married ? 'married' : c?.taken ? 'in a romance' : '',
    c?.frozen ? 'not aging now' : '',
    p.dynasty ? dynastyPhrase(dynasties.get(dynastyKey(p) ?? '') ?? { name: p.dynasty }) : '',
  ].filter(Boolean);
  return (
    <>
      <span className="partners__name">
        {mark}
        {cardName(p)}
      </span>
      <span className="partners__meta">
        {c ? gapText(c) : p.age} · {p.hh || 'no household'}
      </span>
      {flags.length > 0 && <span className="partners__flags">{flags.join(' · ')}</span>}
    </>
  );
}
