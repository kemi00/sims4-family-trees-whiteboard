import { Info, X } from '../icons.ts';
import { useEffect, useId, useRef, useState } from 'react';
import { usePanelSheet } from '../hooks/usePanelSheet.ts';

/** localStorage key, set once the first-visit Getting around card is dismissed. */
export const NAV_INTRO_SEEN_KEY = 'sims4-family-trees:nav-intro-seen:v1';

function navIntroSeen(): boolean {
  try {
    return localStorage.getItem(NAV_INTRO_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

function markNavIntroSeen(): void {
  try {
    localStorage.setItem(NAV_INTRO_SEEN_KEY, '1');
  } catch {
    // No storage (private window, blocked site data): it shows again next load.
  }
}

/**
 * How to move around the board, by what you want to do. Shown on a first
 * visit and in Quick tips. Phones and tablets get their own gestures.
 */
function NavTips() {
  const touch = window.matchMedia?.('(pointer: coarse)').matches;
  if (touch) {
    return (
      <dl className="navtips">
        <dt>Pan</dt>
        <dd>Drag the board, or drag with two fingers anywhere, in Select and Connect too.</dd>
        <dt>Zoom</dt>
        <dd>Pinch.</dd>
        <dt>Edit</dt>
        <dd>Tap a Sim's ⠇, or long-press the Sim.</dd>
      </dl>
    );
  }
  return (
    <dl className="navtips">
      <dt>Pan</dt>
      <dd>Drag empty board, or scroll with two fingers or the mouse wheel.</dd>
      <dt>Zoom</dt>
      <dd>
        Pinch, or hold <kbd>⌘</kbd>/<kbd>Ctrl</kbd> and scroll.
      </dd>
      <dt>Pan from anywhere</dt>
      <dd>
        Hold <kbd>Space</kbd> and drag, or drag with the middle button: in
        Select and Connect too, even starting on a Sim.
      </dd>
      <dt>Select</dt>
      <dd>
        <kbd>Shift</kbd> + drag a box, or turn on <b>Select</b> and drag.
      </dd>
    </dl>
  );
}

type Props = {
  /**
   * Nothing else is asking for attention (no update notes or import dialog
   * open): a first visit may show the Getting around card now.
   */
  introReady?: boolean;
};

/**
 * Quick tips behind the ⓘ button. On a first visit it opens by itself as a
 * short Getting around card: no focus taken, and it stays while the board is
 * tried out, until Got it.
 */
export function Hint({ introReady = false }: Props) {
  const [open, setOpen] = useState<false | 'tips' | 'intro'>(false);
  const sheet = usePanelSheet();
  const hintRef = useRef<HTMLDivElement>(null);
  const iconRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const wasOpen = useRef(false);
  const introShown = useRef(false);

  useEffect(() => {
    if (!introReady || introShown.current || navIntroSeen()) return;
    introShown.current = true;
    setOpen((o) => o || 'intro');
  }, [introReady]);

  const close = () => {
    markNavIntroSeen();
    setOpen(false);
  };

  useEffect(() => {
    if (!open) {
      if (wasOpen.current) iconRef.current?.focus();
      wasOpen.current = false;
      return;
    }
    wasOpen.current = true;
    if (open === 'tips') closeRef.current?.focus();

    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        ev.preventDefault();
        ev.stopPropagation();
        markNavIntroSeen();
        setOpen(false);
      }
    };
    const onPointer = (ev: PointerEvent) => {
      if (hintRef.current?.contains(ev.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('keydown', onKey, true);
    // The intro stays put while the board is panned and zoomed to try it.
    if (open === 'tips') document.addEventListener('pointerdown', onPointer, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onPointer, true);
    };
  }, [open]);

  if (open === 'intro') {
    return (
      <div
        id="hint"
        ref={hintRef}
        className={sheet ? 'hint hint--sheet hint--intro' : 'hint hint--intro'}
        role="dialog"
        aria-labelledby={titleId}
      >
        <div className="hint__head">
          <b id={titleId}>Getting around</b>
          <button
            ref={closeRef}
            id="hintClose"
            type="button"
            title="Close"
            aria-label="Close"
            onClick={close}
          >
            <X aria-hidden="true" />
          </button>
        </div>
        <NavTips />
        <p className="hint__again">
          These stay in <b>Quick tips</b>, under the <Info aria-hidden="true" /> button.
        </p>
        <div className="hint__actions">
          <button
            type="button"
            onClick={() => {
              markNavIntroSeen();
              setOpen('tips');
            }}
          >
            All tips
          </button>
          <button type="button" className="hint__ok" onClick={close}>
            Got it
          </button>
        </div>
      </div>
    );
  }

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
          markNavIntroSeen();
          setOpen('tips');
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
        <h3 className="hint__heading">Getting around</h3>
        <NavTips />
        <p className="hint__body hint__body--after">Drag a Sim to move them.</p>
      </section>

      <section className="hint__section">
        <h3 className="hint__heading">Link Sims</h3>
        <p className="hint__body">
          Tap <b>Connect</b>, then two Sims, and pick Marriage, Romance,
          Divorced, Parent → Child, or Sibling, or a secret: secret lovers or
          a secret parent. Drag the board between the two taps to reach a Sim
          far away. Links you draw stay purple until they also show up in a
          game save.
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
          child of both partners. For two Sims who had a child without being
          a couple, pick <b>Co-parents</b> in Connect, then tap the child.
        </p>
      </section>

      <section className="hint__section">
        <h3 className="hint__heading">Add and age Sims</h3>
        <p className="hint__body">
          On a household label, <b>+</b> adds a new Sim to that household.{' '}
          <b>Age up</b> advances everyone one life stage
          (Infant → … → Elder → Deceased). Pets and Sims who are already
          deceased stay put. To age one Sim only, open <b>Edit</b> and change
          their age.
        </p>
      </section>

      <section className="hint__section">
        <h3 className="hint__heading">Edit a sim</h3>
        <p className="hint__body">
          Click a Sim's ⠇, or double-click the Sim, to edit it or move it
          to another household. On a phone, tap ⠇ or long-press the Sim.
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
            <b>Organise</b> lays the whole board out like the starter one:
            worlds in columns by how many households and sims they have, each
            household packed tight. Undo puts everything back.
          </li>
          <li>
            The corner <b>map</b> shows the whole board. Click or drag it to
            pan; scroll on it to zoom.
          </li>
          <li>
            The <b>family links</b> button (the tree) shows all links, only
            those inside households, or none. Its <b>Highlight a sim's
            family</b> lights up whoever you select, with how many and in how
            many households. <b>Close</b> family is partners, parents, children
            and siblings; <b>Extended</b> adds grandparents, grandchildren,
            aunts, uncles, first cousins and step-family.
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
