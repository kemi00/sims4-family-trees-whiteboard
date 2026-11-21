import { SheetGrabber } from './SheetGrabber.tsx';
import { useEffect, useRef } from 'react';
import { CloseButton } from './CloseButton.tsx';
import { useFitMenuInStage } from '../hooks/useFitMenuInStage.ts';
import { useLightDismiss } from '../hooks/useLightDismiss.ts';
import { HouseholdLimitControl } from './HouseholdLimitControl.tsx';

type Props = {
  x: number;
  y: number;
  /** "the Michaelson household". */
  household: string;
  /** Sims and pets living there, planned ones too. */
  size: number;
  limit: number | null;
  onMoveOut: () => void;
  onLimit: (n: number | null) => void;
  onClose: () => void;
};

/**
 * A household's "⚠ 9 of 8": what the limit means, a way to move someone
 * out, and the limit itself, changed right here for a mod that raises it.
 * The plan stays as it is: the board warns, it never blocks.
 */
export function LimitMenu({ x, y, household, size, limit, onMoveOut, onLimit, onClose }: Props) {
  const { compact, ref, style, sheet } = useFitMenuInStage(x, y);
  useLightDismiss(ref, onClose);
  const goRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const f = requestAnimationFrame(() => goRef.current?.focus());
    return () => cancelAnimationFrame(f);
  }, []);
  return (
    <div
      ref={ref}
      id="menu"
      className={compact ? 'menu menu--sheet pmenu limitmenu' : 'menu pmenu limitmenu'}
      role="dialog"
      aria-label={`${household}: past the household limit`}
      style={style}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return;
        e.stopPropagation();
        onClose();
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <SheetGrabber sheet={sheet} what="the menu" />
      <div className="pmenu__head">
        <b>{size} sims and pets live here</b>
        <CloseButton label="Close" onClick={onClose} />
      </div>
      <p className="limitmenu__text">
        {limit === null
          ? 'There’s no household limit on the board now.'
          : `That’s past the household limit of ${limit}, so someone needs to move out before you play them all in ${household}. Your plan stays as it is.`}
      </p>
      <button ref={goRef} type="button" className="addmenu__go" onClick={onMoveOut}>
        Move someone out
      </button>
      <HouseholdLimitControl limit={limit} onLimit={onLimit} />
      <p className="limitmenu__note">Raised it with a mod like MCCC? Set its number. It’s also under Your save.</p>
    </div>
  );
}
