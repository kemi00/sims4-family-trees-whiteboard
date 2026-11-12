import type { ReactNode } from 'react';
import { useFitMenuInStage } from '../hooks/useFitMenuInStage.ts';
import { COL } from '../lib/constants.ts';
import type { ConnectChoice } from '../types/whiteboard.ts';
import type { ConnectOption, connectOptions } from '../lib/connectOptions.ts';
import { InlineLock } from './LockGlyph.tsx';
import { useLightDismiss } from '../hooks/useLightDismiss.ts';

type Props = {
  aName: string;
  bName: string;
  left: number;
  top: number;
  /** What to offer, from connectOptions. */
  options: ReturnType<typeof connectOptions>;
  onConfirm: (type: ConnectChoice) => void;
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
 * the board (connectOptions).
 */
export function ConnectMenu({ aName, bName, left, top, options, onConfirm, onCancel }: Props) {
  const { compact, ref, style } = useFitMenuInStage(left, top);
  useLightDismiss(ref, onCancel);
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
