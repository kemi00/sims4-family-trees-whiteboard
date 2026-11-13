import {
  ArrowCounterClockwise,
  DotsThreeVertical,
  DownloadSimple,
  EnvelopeSimple,
  Info,
  Megaphone,
  UploadSimple,
  type Icon,
} from '../icons.ts';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { CONTACT_EMAIL, CONTACT_MAILTO } from '../lib/credits.ts';
import { useDropdownPosition } from '../hooks/useDropdownPosition.ts';
import { CreditsPanel } from './CreditsPanel.tsx';
import { StepText } from './StepText.tsx';
import { ToolButton } from './ToolButton.tsx';

/** A bar control that phones fold into this menu, listed above the file actions. */
export type FoldedItem = {
  id: string;
  icon: Icon;
  label: string;
  /** A second line: what the control does, or what it is set to. */
  note?: string;
  onSelect: () => void;
};

type Props = {
  onSave: () => void;
  onLoad: (file: File) => void;
  onLoadSave: (file: File) => void;
  onResetBuiltIn: () => void;
  canResetBoard?: boolean;
  onDevUpdates: () => void;
  /** Marks the entry with a dot until the visitor has read the newest change. */
  devUpdatesUnseen: boolean;
  /** The button's name and tooltip. */
  label?: string;
  /** Bar controls with no room on a phone; empty on wider screens. */
  folded?: FoldedItem[];
  /** The menu's wrapper, so a popover opened from a folded item can hang off it. */
  wrapRef?: RefObject<HTMLDivElement | null>;
};

/** File actions, kept out of the bar because they are used rarely. */
export function OverflowMenu({
  onSave,
  onLoad,
  onLoadSave,
  onResetBuiltIn,
  canResetBoard = true,
  onDevUpdates,
  devUpdatesUnseen,
  label = 'Save, load, contact, and credits',
  folded = [],
  wrapRef: outerWrapRef,
}: Props) {
  const [open, setOpen] = useState(false);
  const [creditsOpen, setCreditsOpen] = useState(false);
  const ownWrapRef = useRef<HTMLDivElement>(null);
  const wrapRef = outerWrapRef ?? ownWrapRef;
  const fileRef = useRef<HTMLInputElement>(null);
  const saveRef = useRef<HTMLInputElement>(null);
  const firstItemRef = useRef<HTMLButtonElement>(null);
  const { popRef, style: popStyle } = useDropdownPosition(open, wrapRef);

  useEffect(() => {
    if (!open && !creditsOpen) return;
    const onPointer = (ev: PointerEvent) => {
      if (!wrapRef.current?.contains(ev.target as Node)) {
        setOpen(false);
        setCreditsOpen(false);
      }
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        ev.stopPropagation();
        if (creditsOpen) setCreditsOpen(false);
        else setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointer, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onPointer, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open, creditsOpen, wrapRef]);

  useEffect(() => {
    if (open) firstItemRef.current?.focus();
  }, [open]);

  const run = (fn: () => void) => {
    setOpen(false);
    fn();
  };

  return (
    <div className="overflow" ref={wrapRef}>
      <ToolButton
        icon={DotsThreeVertical}
        label={label}
        expanded={open}
        onClick={() => setOpen((o) => !o)}
      />
      {open && (
        <div
          ref={popRef}
          className={folded.length ? 'pop pop--folded' : 'pop'}
          role="menu"
          aria-label="More actions"
          style={popStyle}
        >
          {folded.map(({ id, icon: Glyph, label: name, note, onSelect }, i) => (
            <button
              key={id}
              ref={i === 0 ? firstItemRef : undefined}
              type="button"
              role="menuitem"
              className="pop__noted"
              onClick={() => run(onSelect)}
            >
              <Glyph aria-hidden="true" />
              <span className="pop__text">
                {name}
                {note && <small><StepText text={note} /></small>}
              </span>
            </button>
          ))}
          {folded.length > 0 && <span className="pop__rule" aria-hidden="true" />}
          <button
            ref={folded.length ? undefined : firstItemRef}
            type="button"
            role="menuitem"
            onClick={() => run(onSave)}
          >
            <DownloadSimple aria-hidden="true" />
            Download the board (.json)
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => fileRef.current?.click()}
          >
            <UploadSimple aria-hidden="true" />
            Upload a board (.json)
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => saveRef.current?.click()}
          >
            <UploadSimple aria-hidden="true" />
            Upload your save (.save)
          </button>
          <button
            type="button"
            role="menuitem"
            className="pop__danger"
            disabled={!canResetBoard}
            title={
              canResetBoard
                ? undefined
                : 'Already the starter fodder board'
            }
            onClick={() =>
              run(() => {
                if (!canResetBoard) return;
                if (
                  confirm(
                    'Reset to the initial starter board (fodder roster)? This clears the browser draft and discards the current board. Download JSON first if you need a copy.',
                  )
                ) {
                  onResetBuiltIn();
                }
              })
            }
          >
            <ArrowCounterClockwise aria-hidden="true" />
            Reset the board
          </button>
          <a
            href={CONTACT_MAILTO}
            role="menuitem"
            title={`Problems, feedback, suggestions, or ideas: ${CONTACT_EMAIL}`}
            onClick={() => setOpen(false)}
          >
            <EnvelopeSimple aria-hidden="true" />
            <span className="pop__stack">
              Contact
              <span className="pop__sub">{CONTACT_EMAIL}</span>
            </span>
          </a>
          <button
            type="button"
            role="menuitem"
            onClick={() => run(onDevUpdates)}
          >
            <Megaphone aria-hidden="true" />
            Developer updates
            {devUpdatesUnseen && (
              <span
                className="pop__dot"
                aria-label="New since you last looked"
              />
            )}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              setCreditsOpen(true);
            }}
          >
            <Info aria-hidden="true" />
            Credits
          </button>
        </div>
      )}
      {creditsOpen && (
        <CreditsPanel
          anchorRect={wrapRef.current?.getBoundingClientRect() ?? null}
          onClose={() => setCreditsOpen(false)}
        />
      )}
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          setOpen(false);
          onLoad(f);
        }}
      />
      <input
        ref={saveRef}
        type="file"
        accept=".save"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          setOpen(false);
          onLoadSave(f);
        }}
      />
    </div>
  );
}
