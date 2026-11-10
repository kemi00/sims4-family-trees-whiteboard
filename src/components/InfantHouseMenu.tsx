import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { X } from '../icons.ts';
import { useFitMenuInStage } from '../hooks/useFitMenuInStage.ts';
import type { InfantChoices } from '../hooks/useWhiteboard.ts';

type Props = InfantChoices & {
  left: number;
  top: number;
  onPick: (gid: string, sur: string) => void;
  onCancel: () => void;
};

/**
 * A couple's new baby, when there is something to settle first: where it
 * lives, when the parents live apart, and which last name it takes, when
 * theirs differ. One question: a click on an answer plans the baby. Both:
 * pick one of each, then "Plan the baby".
 */
export function InfantHouseMenu({ left, top, title, homes, surnames, surFor, onPick, onCancel }: Props) {
  const { compact, ref, style } = useFitMenuInStage(left, top);
  const firstRef = useRef<HTMLButtonElement>(null);
  const askHome = homes.length > 1;
  const askSur = surnames.length > 1;
  const both = askHome && askSur;
  const [gid, setGid] = useState<string | null>(askHome ? null : (homes[0]?.gid ?? null));
  const [sur, setSur] = useState<string | null>(null);
  useEffect(() => {
    // A frame later: the menu is hidden while it measures where it fits.
    const f = requestAnimationFrame(() => firstRef.current?.focus());
    return () => cancelAnimationFrame(f);
  }, []);
  const close = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    // Esc closes this menu, not the panel or selection behind it.
    e.stopPropagation();
    onCancel();
  };
  const pickHome = (g: string) => (askSur ? setGid(g) : onPick(g, surFor[g] ?? ''));
  const pickSur = (s: string) => (askHome ? setSur(s) : onPick(homes[0]!.gid, s));
  return (
    <div
      ref={ref}
      id="menu"
      className={compact ? 'menu menu--sheet pmenu' : 'menu pmenu'}
      role="dialog"
      aria-label={title}
      style={style}
      onKeyDown={close}
    >
      <div className="pmenu__head">
        <b>{title}</b>
        <button type="button" className="pmenu__close" aria-label="Close" onClick={onCancel}>
          <X aria-hidden="true" />
        </button>
      </div>
      {askHome && (
        <div role={both ? 'radiogroup' : 'group'} aria-label="Where will the baby live?">
          <p className="pmenu__ask">Where will the baby live?</p>
          {homes.map((h, i) => (
            <button
              key={h.gid}
              ref={i === 0 ? firstRef : undefined}
              type="button"
              className="cmenu__pick"
              {...(both ? { role: 'radio', 'aria-checked': gid === h.gid } : {})}
              onClick={() => pickHome(h.gid)}
            >
              <span className="cmenu__title">{h.title}</span>
              <span className="cmenu__sub">{h.sub}</span>
            </button>
          ))}
        </div>
      )}
      {askSur && (
        <div role={both ? 'radiogroup' : 'group'} aria-label="Which last name will the baby have?">
          <p className="pmenu__ask">Which last name will the baby have?</p>
          {surnames.map((s, i) => (
            <button
              key={s.sur}
              ref={i === 0 && !askHome ? firstRef : undefined}
              type="button"
              className="cmenu__pick"
              {...(both ? { role: 'radio', 'aria-checked': sur === s.sur } : {})}
              onClick={() => pickSur(s.sur)}
            >
              <span className="cmenu__title">{s.sur}</span>
              <span className="cmenu__sub">{s.sub}</span>
            </button>
          ))}
        </div>
      )}
      {both && (
        <button
          type="button"
          className="pmenu__move pmenu__move--first"
          disabled={!gid || !sur}
          onClick={() => gid && sur && onPick(gid, sur)}
        >
          Plan the baby
        </button>
      )}
      <p className="pmenu__hint">The baby is part of your plan until a save shows them.</p>
    </div>
  );
}
