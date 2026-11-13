import { Fragment } from 'react';
import { simCardLines, type SimCardOptions } from '../lib/simCard.ts';
import type { SimNode } from '../types/whiteboard.ts';

type Props = SimCardOptions & { sim: SimNode };

/**
 * One sim in any list, the same everywhere (Possible partners, the ♥ and
 * adoption menus, a highlight's list, Move in): their dynasty role's mark
 * and name; what they are and where they live; then what to weigh, in
 * amber, with "at risk" after a dynasty that could die out, set apart and
 * explained on hover as on the board. Only the inside of the card: each
 * list wraps it in its own `button.simcard` in a `ul.simcards`.
 */
export function SimCard({ sim, ...opts }: Props) {
  const { mark, name, meta, flags, riskTitle } = simCardLines(sim, opts);
  return (
    <>
      <span className="simcard__name">
        {mark ? `${mark} ` : ''}
        {name}
      </span>
      <span className="simcard__meta">{meta}</span>
      {flags.length > 0 && (
        <span className="simcard__flags" title={riskTitle}>
          {flags.map((f, i) => (
            <Fragment key={i}>
              {i > 0 && ' · '}
              {f.risk ? <span className="simcard__risk">{f.text}</span> : f.text}
            </Fragment>
          ))}
        </span>
      )}
    </>
  );
}

