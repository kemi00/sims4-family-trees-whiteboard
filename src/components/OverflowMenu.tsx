import {
  ArrowCounterClockwise,
  DotsThreeVertical,
  DownloadSimple,
  EnvelopeSimple,
  Info,
  UploadSimple,
} from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
import { CONTACT_EMAIL, CONTACT_MAILTO } from '../lib/credits.ts';
import { useDropdownPosition } from '../hooks/useDropdownPosition.ts';
import { CreditsPanel } from './CreditsPanel.tsx';
import { ToolButton } from './ToolButton.tsx';

type Props = {
  onSave: () => void;
  onLoad: (file: File) => void;
  onLoadSave: (file: File) => void;
  onResetBuiltIn: () => void;
};

/** File actions, kept out of the bar because they are used rarely. */
export function OverflowMenu({
  onSave,
  onLoad,
  onLoadSave,
  onResetBuiltIn,
}: Props) {
  const [open, setOpen] = useState(false);
  const [creditsOpen, setCreditsOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
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
  }, [open, creditsOpen]);

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
        label="Save, load, contact, and credits"
        expanded={open}
        onClick={() => setOpen((o) => !o)}
      />
      {open && (
        <div
          ref={popRef}
          className="pop"
          role="menu"
          aria-label="More actions"
          style={popStyle}
        >
          <button
            ref={firstItemRef}
            type="button"
            role="menuitem"
            onClick={() => run(onSave)}
          >
            <DownloadSimple aria-hidden="true" />
            Save .json
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => fileRef.current?.click()}
          >
            <UploadSimple aria-hidden="true" />
            Load .json
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => saveRef.current?.click()}
          >
            <UploadSimple aria-hidden="true" />
            Load .save
          </button>
          <button
            type="button"
            role="menuitem"
            className="pop__danger"
            onClick={() =>
              run(() => {
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
