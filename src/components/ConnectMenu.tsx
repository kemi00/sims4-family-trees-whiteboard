import { useEffect, useRef, type ReactNode } from 'react';
import { useFitMenuInStage } from '../hooks/useFitMenuInStage.ts';
import { COL } from '../lib/constants.ts';
import type { ConnectChoice, SimNode } from '../types/whiteboard.ts';
import type { ConnectOption, connectOptions } from '../lib/connectOptions.ts';
import { InlineLock } from './LockGlyph.tsx';
import { MoveInAsk } from './MoveInAsk.tsx';
import { useLightDismiss } from '../hooks/useLightDismiss.ts';

type Props = {
  aName: string;
  bName: string;
  left: number;
  top: number;
  /** What to offer, from connectOptions. */
  options: ReturnType<typeof connectOptions>;
  onConfirm: (type: ConnectChoice) => void;
  /**
   * Set once a marriage or a romance is made between two who live apart:
   * the menu asks whether one moves in with the other, as the ♥ menu does.
   */
  ask?: { done: string; moves: { mover: SimNode; host: SimNode }[] };
  /** One of the two moves into the other's household. */
  onMove: (mover: string, host: string) => void;
  /** Cancel, or keep them apart once asked. */
  onCancel: () => void;
};

function label(opt: ConnectOption, a: string, b: string): ReactNode {
  switch (opt.choice) {
    case 'marriage':
      return '⚭ Marriage';
    case 'romance':
      return '❤ Romance / partners';
    case 'secretromance':
      return (
        <>
          <InlineLock color={COL.romance} /> Secret lovers
        </>
      );
    case 'divorced':
      return '⚮ Divorced';
    case 'divorce':
      return opt.cancel ? '⚭ Cancel their planned divorce' : '⚮ Plan their divorce';
    case 'breakup':
      return opt.cancel ? '❤ Cancel their planned breakup' : '♡ Plan their breakup';
    case 'parent':
      return `┳ ${a} is the parent of ${b}`;
    case 'secretparent':
      return (
        <>
          <InlineLock color={COL.blood} /> {a} is the secret parent of {b}
        </>
      );
    case 'adoptive':
      return `┳ ${a} is the adoptive parent of ${b}`;
    case 'childof':
      return `┻ ${a} is the child of ${b}`;
    case 'secretchildof':
      return (
        <>
          <InlineLock color={COL.blood} /> {a} is the secret child of {b}
        </>
      );
    case 'adoptedby':
      return `┻ ${a} is the adopted child of ${b}`;
    case 'coparents':
      return '⊔ Co-parents, not a couple: pick their child next';
    case 'sibling':
      return '⊓ Siblings';
    case 'custom':
      return '⋯ Other link';
  }
}

/**
 * Grouped so the longer list scans: what the two are to each other, then
 * family. Each secret or adoptive option sits under its plain one. Links the
 * two have already are off, with why; a couple's end is planned here as on
 * the board (connectOptions). A marriage or a romance between two who live
 * apart then asks about one household (MoveInAsk).
 */
export function ConnectMenu({ aName, bName, left, top, options, onConfirm, ask, onMove, onCancel }: Props) {
  const { compact, ref, style } = useFitMenuInStage(left, top);
  useLightDismiss(ref, onCancel);
  const firstMoveRef = useRef<HTMLButtonElement>(null);
  const asking = !!ask;
  useEffect(() => {
    if (!asking) return;
    // A frame later, as the ♥ menu does: the menu settles where it fits first.
    const f = requestAnimationFrame(() => firstMoveRef.current?.focus());
    return () => cancelAnimationFrame(f);
  }, [asking]);
  if (ask) {
    return (
      <div
        ref={ref}
        id="menu"
        className={compact ? 'menu menu--sheet pmenu' : 'menu pmenu'}
        role="dialog"
        aria-label={`Move ${bName} and ${aName} into one household?`}
        style={style}
      >
        <MoveInAsk
          done={ask.done}
          ask="They live apart. Will one move in with the other?"
          moves={ask.moves}
          firstRef={firstMoveRef}
          onMove={onMove}
          onKeep={onCancel}
        />
      </div>
    );
  }
  return (
    <div
      ref={ref}
      id="menu"
      className={compact ? 'menu menu--sheet' : 'menu'}
      role="dialog"
      aria-label={`Link ${aName} and ${bName}`}
      style={style}
    >
      <div className="menu__pair">
        {aName} ↔ {bName}
        {options.now && <span className="menu__now"> · {options.now}</span>}
      </div>
      {options.sections.map(({ title, options: list }) => (
        <div key={title ?? 'other'} role="group" aria-label={title ?? undefined}>
          {title && <div className="menu__section">{title}</div>}
          {list.map((opt) => (
            <button
              key={opt.choice}
              type="button"
              disabled={!!opt.why}
              onClick={() => onConfirm(opt.choice)}
            >
              {label(opt, aName, bName)}
              {opt.why && <span className="menu__why">{opt.why}</span>}
            </button>
          ))}
        </div>
      ))}
      <button type="button" className="menu__cancel" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}
