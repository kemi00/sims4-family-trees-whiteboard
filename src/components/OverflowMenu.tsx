import {
  ArrowCounterClockwise,
  CalendarBlank,
  ClipboardText,
  DotsThreeVertical,
  DownloadSimple,
  Info,
  Megaphone,
  UploadSimple,
  type Icon,
} from '../icons.ts';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { DEVELOPER_NAME } from '../lib/credits.ts';
import { useDropdownPosition } from '../hooks/useDropdownPosition.ts';
import type { PlannerCalendar, SaveGameInfo } from '../types/whiteboard.ts';
import { CalendarPanel } from './CalendarPanel.tsx';
import { calendarSummary } from '../lib/calendar.ts';
import { CreditsPanel } from './CreditsPanel.tsx';
import { DeveloperContact } from './DeveloperContact.tsx';
import { ProblemReportPanel } from './ProblemReportPanel.tsx';
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
  /** The problem report's text, made when it is asked for (problemReport). */
  onProblemReport?: () => string;
  /** The board's calendar years, set in its panel (CalendarPanel). */
  calendar?: PlannerCalendar | null;
  onCalendar?: (cal: PlannerCalendar | null) => void;
  /** The calendar's panel, open from here or from Your save (useWhiteboard's calendarOpen). */
  calendarOpen?: boolean;
  onCalendarOpen?: (open: boolean) => void;
  /** The last save read, for the calendar's "your save now". */
  game?: SaveGameInfo | null;
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
  onProblemReport,
  calendar = null,
  onCalendar,
  calendarOpen = false,
  onCalendarOpen,
  game = null,
}: Props) {
  const [open, setOpen] = useState(false);
  const [creditsOpen, setCreditsOpen] = useState(false);
  /** The problem report, made when the panel opened, to send or copy. */
  const [report, setReport] = useState<{ text: string } | null>(null);
  const ownWrapRef = useRef<HTMLDivElement>(null);
  const wrapRef = outerWrapRef ?? ownWrapRef;
  const fileRef = useRef<HTMLInputElement>(null);
  const saveRef = useRef<HTMLInputElement>(null);
  const firstItemRef = useRef<HTMLButtonElement>(null);
  const { popRef, style: popStyle } = useDropdownPosition(open, wrapRef);

  useEffect(() => {
    if (!open && !creditsOpen && !calendarOpen && !report) return;
    const onPointer = (ev: PointerEvent) => {
      if (!wrapRef.current?.contains(ev.target as Node)) {
        setOpen(false);
        setCreditsOpen(false);
        // A phone's calendar sheet folds on a press outside it, as every drawer does; only ✕ closes it.
        if (!document.getElementById('calendar-panel')?.hasAttribute('data-detent')) onCalendarOpen?.(false);
        setReport(null);
      }
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        ev.stopPropagation();
        if (creditsOpen) setCreditsOpen(false);
        else if (calendarOpen) onCalendarOpen?.(false);
        else if (report) setReport(null);
        else setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointer, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onPointer, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open, creditsOpen, calendarOpen, onCalendarOpen, report, wrapRef]);

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
          {onCalendar && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                setCreditsOpen(false);
                setReport(null);
                onCalendarOpen?.(true);
              }}
            >
              <CalendarBlank aria-hidden="true" />
              <span className="pop__stack">
                Calendar years
                <span className="pop__sub">{calendarSummary(calendar)}</span>
              </span>
            </button>
          )}
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
          {onProblemReport && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                setCreditsOpen(false);
                onCalendarOpen?.(false);
                setReport({ text: onProblemReport() });
              }}
            >
              <ClipboardText aria-hidden="true" />
              <span className="pop__stack">
                Send a problem report
                <span className="pop__sub">To the developer, with no names</span>
              </span>
            </button>
          )}
          <DeveloperContact
            variant="menu"
            heading={`Contact ${DEVELOPER_NAME}`}
            note="Problems, feedback or ideas"
            onPick={() => setOpen(false)}
          />
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
              setReport(null);
              onCalendarOpen?.(false);
              setCreditsOpen(true);
            }}
          >
            <Info aria-hidden="true" />
            Credits
          </button>
        </div>
      )}
      {calendarOpen && onCalendar && (
        <CalendarPanel
          anchorRect={wrapRef.current?.getBoundingClientRect() ?? null}
          calendar={calendar}
          onCalendar={onCalendar}
          game={game}
          onClose={() => onCalendarOpen?.(false)}
        />
      )}
      {creditsOpen && (
        <CreditsPanel
          anchorRect={wrapRef.current?.getBoundingClientRect() ?? null}
          onClose={() => setCreditsOpen(false)}
        />
      )}
      {report && (
        <ProblemReportPanel
          anchorRect={wrapRef.current?.getBoundingClientRect() ?? null}
          text={report.text}
          onClose={() => setReport(null)}
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
