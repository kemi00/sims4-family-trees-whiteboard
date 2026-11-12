import { useEffect, useRef, type KeyboardEvent } from 'react';
import { CloseButton } from './CloseButton.tsx';
import { useFitMenuInStage } from '../hooks/useFitMenuInStage.ts';
import { SPECIES } from '../lib/constants.ts';
import type { PetKind } from '../lib/pets.ts';

type Props = {
  x: number;
  y: number;
  /** "Add to the Goth household", "Add to the board". */
  title: string;
  /** The pets your packs allow (petKindsAvailable). */
  kinds: readonly PetKind[];
  /** A sim without `species`; a pet of that species with it. */
  onPick: (species?: string) => void;
  onClose: () => void;
};

/**
 * What to add, from the toolbar's Add or a household's ＋: a sim first (so
 * ＋ then Enter adds one, as before pets), then a pet of each kind your
 * packs allow, each named with its pack.
 */
export function AddKindMenu({ x, y, title, kinds, onPick, onClose }: Props) {
  const { compact, ref, style } = useFitMenuInStage(x, y);
  const firstRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    // A frame later: the menu is hidden while it measures where it fits.
    const f = requestAnimationFrame(() => firstRef.current?.focus());
    return () => cancelAnimationFrame(f);
  }, []);
  const close = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    onClose();
  };
  return (
    <div
      ref={ref}
      id="menu"
      className={compact ? 'menu menu--sheet pmenu' : 'menu pmenu'}
      role="dialog"
      aria-label={title}
      style={style}
      onKeyDown={close}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="pmenu__head">
        <b>{title}</b>
        <CloseButton label="Close" onClick={onClose} />
      </div>
      <button ref={firstRef} type="button" className="cmenu__pick" onClick={() => onPick()}>
        <span className="cmenu__title">＋ A sim</span>
        <span className="cmenu__sub">A young adult to name and plan</span>
      </button>
      {kinds.map((k) => (
        <button key={k.species} type="button" className="cmenu__pick" onClick={() => onPick(k.species)}>
          <span className="cmenu__title">
            <span aria-hidden="true">{SPECIES[k.species]} </span>A {k.species.toLowerCase()}
          </span>
          <span className="cmenu__sub">An adult from {k.pack}; plan a {k.young.toLowerCase()} from its ＋</span>
        </button>
      ))}
    </div>
  );
}
