import type { ReactNode, Ref } from 'react';
import { cardName } from '../lib/plan.ts';
import { theHousehold } from '../lib/utils.ts';
import type { SimNode } from '../types/whiteboard.ts';

type Props = {
  /** What was just planned, in green: "✓ Married: Iris Ladipo and Glen Nhoam". */
  done: ReactNode;
  /** The question: "They live apart. Will one move in with the other?" */
  ask: string;
  /** Each move offered, first the one most likely. */
  moves: { mover: SimNode; host: SimNode }[];
  /** The first move, focused when the step opens. */
  firstRef?: Ref<HTMLButtonElement>;
  onMove: (mover: string, host: string) => void;
  onKeep: () => void;
};

/**
 * The step after a link that could bring two households together: a
 * marriage or a romance (the ♥ menu, Connect) or an adoption (the ＋ menu).
 * Each move into one household, or keep them apart. The same step wherever
 * the link was made, so it reads the same.
 */
export function MoveInAsk({ done, ask, moves, firstRef, onMove, onKeep }: Props) {
  return (
    <>
      <p className="pmenu__done">{done}</p>
      <p className="pmenu__ask">{ask}</p>
      {moves.map(({ mover, host }, i) => (
        <button
          key={`${mover.id}>${host.id}`}
          ref={i === 0 ? firstRef : undefined}
          type="button"
          className={i === 0 ? 'pmenu__move pmenu__move--first' : 'pmenu__move'}
          onClick={() => onMove(mover.id, host.id)}
        >
          {cardName(mover)} moves into {theHousehold(host.hh)}
        </button>
      ))}
      <button type="button" className="pmenu__move pmenu__keep" onClick={onKeep}>
        Keep them apart
      </button>
      <p className="pmenu__hint">A move is part of your plan until a save shows it.</p>
    </>
  );
}
