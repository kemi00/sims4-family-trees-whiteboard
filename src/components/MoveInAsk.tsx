import { useEffect, useRef, useState, type ReactNode, type Ref } from 'react';
import { cardName } from '../lib/plan.ts';
import { theHousehold } from '../lib/utils.ts';
import type { SimNode } from '../types/whiteboard.ts';
import { MoveToLotForm, type CoupleLots } from './MoveToLotForm.tsx';

type Props = {
  /** What was just planned, in green: "✓ Married: Iris Ladipo and Glen Nhoam". */
  done: ReactNode;
  /** The question: "They live apart. Will one move in with the other?" */
  ask: string;
  /** Each move offered, first the one most likely. */
  moves: { mover: SimNode; host: SimNode }[];
  /**
   * A couple can also move together onto a free lot, as a new household:
   * offered when some world on the board has one. `who` names them both.
   */
  lots?: CoupleLots & { who: string };
  /** The first move, focused when the step opens. */
  firstRef?: Ref<HTMLButtonElement>;
  onMove: (mover: string, host: string) => void;
  onKeep: () => void;
};

/**
 * The step after a link that could bring two households together: a
 * marriage or a romance (the ♥ menu, Connect) or an adoption (the ＋ menu).
 * Each move into one household, both onto a free lot for a couple, or keep
 * them apart. The same step wherever the link was made, so it reads the same.
 */
export function MoveInAsk({ done, ask, moves, lots, firstRef, onMove, onKeep }: Props) {
  const [toLot, setToLot] = useState(false);
  const lotRef = useRef<HTMLButtonElement>(null);
  const back = useRef(false);
  useEffect(() => {
    // Back from the lots: the button that went there has the focus again.
    if (toLot || !back.current) return;
    back.current = false;
    lotRef.current?.focus();
  }, [toLot]);

  if (lots && toLot) {
    return (
      <MoveToLotForm
        {...lots}
        onBack={() => {
          back.current = true;
          setToLot(false);
        }}
      />
    );
  }
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
      {lots && (
        <button ref={lotRef} type="button" className="pmenu__move" onClick={() => setToLot(true)}>
          Both move to a free lot
        </button>
      )}
      <button type="button" className="pmenu__move pmenu__keep" onClick={onKeep}>
        Keep them apart
      </button>
      <p className="pmenu__hint">A move is part of your plan until a save shows it.</p>
    </>
  );
}
