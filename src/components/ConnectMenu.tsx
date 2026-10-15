import type { ReactNode } from 'react';
import { useFitMenuInStage } from '../hooks/useFitMenuInStage.ts';
import { COL } from '../lib/constants.ts';
import type { ConnectChoice } from '../types/whiteboard.ts';
import { InlineLock } from './LockGlyph.tsx';

type Props = {
  aName: string;
  bName: string;
  left: number;
  top: number;
  /** Hide sibling option when both sims already share parents on the board. */
  hideSibling?: boolean;
  /** Why a parent/child option is off — it would make a sim their own ancestor. */
  blocked?: Partial<Record<'parent' | 'childof', string>>;
  onConfirm: (type: ConnectChoice) => void;
  onCancel: () => void;
};

/** Which cycle check a choice is subject to. */
const CYCLE: Partial<Record<ConnectChoice, 'parent' | 'childof'>> = {
  parent: 'parent',
  secretparent: 'parent',
  childof: 'childof',
  secretchildof: 'childof',
};

function label(ty: ConnectChoice, a: string, b: string): ReactNode {
  switch (ty) {
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
    case 'parent':
      return `┳ ${a} is the parent of ${b}`;
    case 'secretparent':
      return (
        <>
          <InlineLock color={COL.blood} /> {a} is the secret parent of {b}
        </>
      );
    case 'childof':
      return `┻ ${a} is the child of ${b}`;
    case 'secretchildof':
      return (
        <>
          <InlineLock color={COL.blood} /> {a} is the secret child of {b}
        </>
      );
    case 'coparents':
      return '⊔ Co-parents, not a couple: pick their child next';
    case 'sibling':
      return '⊓ Siblings';
    case 'custom':
      return '➖ Other link';
  }
}

/**
 * Grouped so the longer list scans: what the two are to each other, then
 * family. Each secret option sits under its plain one.
 */
const SECTIONS: { title: string | null; options: ConnectChoice[] }[] = [
  { title: 'Couple', options: ['marriage', 'romance', 'secretromance', 'divorced'] },
  {
    title: 'Family',
    options: ['parent', 'secretparent', 'childof', 'secretchildof', 'coparents', 'sibling'],
  },
  { title: null, options: ['custom'] },
];

export function ConnectMenu({
  aName,
  bName,
  left,
  top,
  hideSibling,
  blocked,
  onConfirm,
  onCancel,
}: Props) {
  const { compact, ref, style } = useFitMenuInStage(left, top);
  return (
    <div
      ref={ref}
      id="menu"
      className={compact ? 'menu menu--sheet' : 'menu'}
      role="dialog"
      aria-label={`Link ${aName} and ${bName}`}
      style={style}
    >
      <div style={{ fontSize: 10, color: '#889', padding: '2px 4px' }}>
        {aName} ↔ {bName}
      </div>
      {SECTIONS.map(({ title, options }) => (
        <div key={title ?? 'other'} role="group" aria-label={title ?? undefined}>
          {title && <div className="menu__section">{title}</div>}
          {options
            .filter((ty) => !(hideSibling && ty === 'sibling'))
            .map((ty) => {
              const check = CYCLE[ty];
              const why = check ? blocked?.[check] : undefined;
              return (
                <button
                  key={ty}
                  type="button"
                  disabled={!!why}
                  onClick={() => onConfirm(ty)}
                >
                  {label(ty, aName, bName)}
                  {why && <span className="menu__why">{why}</span>}
                </button>
              );
            })}
        </div>
      ))}
      <button type="button" style={{ color: '#b00' }} onClick={onCancel}>
        ✕ cancel
      </button>
    </div>
  );
}
