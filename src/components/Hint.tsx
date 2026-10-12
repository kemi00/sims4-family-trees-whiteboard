import { Info, X } from '../icons.ts';
import { useEffect, useId, useRef, useState } from 'react';
import { usePanelSheet } from '../hooks/usePanelSheet.ts';

export function Hint() {
  const [open, setOpen] = useState(false);
  const sheet = usePanelSheet();
  const hintRef = useRef<HTMLDivElement>(null);
  const iconRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const wasOpen = useRef(false);

  useEffect(() => {
    if (!open) {
      if (wasOpen.current) iconRef.current?.focus();
      wasOpen.current = false;
      return;
    }
    wasOpen.current = true;
    closeRef.current?.focus();

    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        ev.preventDefault();
        ev.stopPropagation();
        setOpen(false);
      }
    };
    const onPointer = (ev: PointerEvent) => {
      if (hintRef.current?.contains(ev.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onPointer, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onPointer, true);
    };
  }, [open]);

  if (!open) {
    return (
      <button
        ref={iconRef}
        id="hintIcon"
        type="button"
        title="Quick tips"
        aria-label="Quick tips"
        aria-expanded={false}
        aria-haspopup="dialog"
        style={{ display: 'flex' }}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
      >
        <Info aria-hidden="true" />
      </button>
    );
  }

  return (
    <div
      id="hint"
      ref={hintRef}
      className={sheet ? 'hint hint--sheet' : 'hint'}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="hint__head">
        <b id={titleId}>Quick tips</b>
        <button
          ref={closeRef}
          id="hintClose"
          type="button"
          title="Close"
          aria-label="Close tips"
          onClick={(e) => {
            e.stopPropagation();
            setOpen(false);
          }}
        >
          <X aria-hidden="true" />
        </button>
      </div>

      <div className="hint__legend" aria-label="Link colors">
        <span className="hint__chip hint__chip--planned">
          <i aria-hidden="true" />
          Purple = planned link
        </span>
        <span className="hint__chip hint__chip--save">
          <i aria-hidden="true" />
          Gray = in your game save
        </span>
      </div>

      <section className="hint__section">
        <h3 className="hint__heading">Move around</h3>
        <p className="hint__body">
          Drag a sim to move them. Drag empty space to pan the board.
          <span className="hint__platform"> On a phone, pinch to zoom.</span>
        </p>
      </section>

      <section className="hint__section">
        <h3 className="hint__heading">Link Sims</h3>
        <p className="hint__body">
          Tap <b>Connect</b>, then two Sims, and pick Marriage, Romance,
          Divorced, Parent → Child, or Sibling. Links you draw stay purple
          until they also show up in a game save.
          <span className="hint__platform">
            {' '}
            On a phone, two-finger drag pans while Connect is on.
          </span>
        </p>
      </section>

      <section className="hint__section">
        <h3 className="hint__heading">Add children</h3>
        <p className="hint__body">
          Tap a couple’s ring or heart on the board, then <b>+</b>, to add a
          baby. Or tap a ring/heart link, then a Sim, to make that Sim the
          child of both partners.
        </p>
      </section>

      <section className="hint__section">
        <h3 className="hint__heading">Age Sims</h3>
        <p className="hint__body">
          On a household label, <b>Age up</b> advances everyone one life stage
          (Infant → … → Elder → Deceased). Pets and Sims who are already
          deceased stay put. To age one Sim only, open <b>Edit</b> and change
          their age.
        </p>
      </section>

      <section className="hint__section">
        <h3 className="hint__heading">Edit a name</h3>
        <p className="hint__body">
          Double-click a Sim to edit. On a phone, double-tap or long-press
          instead.
        </p>
      </section>

      <section className="hint__section">
        <h3 className="hint__heading">Save and open</h3>
        <p className="hint__body">
          Open the <b>⋮</b> menu: <b>Save .json</b> downloads your board,{' '}
          <b>Load .json</b> opens a board you saved, and <b>Load .save</b>{' '}
          brings Sims in from a Sims 4 game file without wiping links you
          already drew.
        </p>
      </section>

      <details className="hint__more">
        <summary>More tips</summary>
        <ul className="hint__more-list">
          <li>
            <b>Undo</b> (Ctrl/⌘ Z) reverses the last add, link, move, age-up,
            edit, or delete.
          </li>
          <li>
            The corner <b>map</b> shows the whole board. Click or drag it to
            pan; scroll on it to zoom.
          </li>
          <li>
            Select a Sim, then <b>Filters → Bloodline</b>, to dim everyone
            else. Use <b>Show everyone</b> on the banner (or Esc) to leave.
          </li>
          <li>
            <b>Log</b> lists planned (purple) links and links confirmed by a
            game save (gray).
          </li>
        </ul>
      </details>
    </div>
  );
}
