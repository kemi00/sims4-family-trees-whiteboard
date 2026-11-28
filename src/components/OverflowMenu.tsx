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

/** An entry of the menu: an icon, its name, and a line on what it does or is set to. */
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
  /**
   * The menu's own groups, by what you came to do: Your game (Up next,
   * Story, the Gazette, Dynasties, Worlds in numbers), Board (View,
   * Organise, the Log), and entries added to Save and files (Your save, the
   * whole tree as a file). A phone folds the bar's buttons into these.
   */
  play?: FoldedItem[];
  board?: FoldedItem[];
  files?: FoldedItem[];
  /** A phone: Your game and Board as tiles, three to a row, their notes in their names' tips. */
  tiles?: boolean;
  /** The menu opens: every other panel and menu closes first (one popup at a time). */
  onOpenMenu?: () => void;
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

/** One entry: its icon, its name over its note. */
function MenuEntry({
  item,
  first,
  tile = false,
  onRun,
}: {
  item: FoldedItem;
  first?: RefObject<HTMLButtonElement | null> | undefined;
  /** A tile: the icon over the name, the note in its tip. */
  tile?: boolean;
  onRun: (fn: () => void) => void;
}) {
  const { icon: Glyph, label: name, note, onSelect } = item;
  if (tile)
    return (
      <button ref={first} type="button" role="menuitem" className="pop__tile" title={note} onClick={() => onRun(onSelect)}>
        <Glyph aria-hidden="true" />
        <span>{name}</span>
      </button>
    );
  return (
    <button ref={first} type="button" role="menuitem" className="pop__noted" onClick={() => onRun(onSelect)}>
      <Glyph aria-hidden="true" />
      <span className="pop__text">
        {name}
        {note && (
          <small>
            <StepText text={note} />
          </small>
        )}
      </span>
    </button>
  );
}

/** The More menu: everything the bar has no room for, in named groups. */
export function OverflowMenu({
  onSave,
  onLoad,
  onLoadSave,
  onResetBuiltIn,
  canResetBoard = true,
  onDevUpdates,
  devUpdatesUnseen,
  label = 'Save, load, contact, and credits',
  play: gameItems = [],
  board: boardItems = [],
  files: fileItems = [],
  tiles = false,
  onOpenMenu,
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
        onClick={() => {
          if (!open) {
            onOpenMenu?.();
            // Its own panels too: the calendar, the credits, a problem report.
            setCreditsOpen(false);
            setReport(null);
            onCalendarOpen?.(false);
          }
          setOpen(!open);
        }}
      />
      {open && (
        <div ref={popRef} className="pop pop--folded pop--more" role="menu" aria-label="More" style={popStyle}>
          {/* Grouped by what you came to do; each group named, the rare and the risky last. */}
          {gameItems.length > 0 && (
            <div role="group" aria-labelledby="more-game">
              <div className="pop__head" id="more-game">
                Your game
              </div>
              <div className={tiles ? 'pop__tiles' : undefined}>
                {gameItems.map((item, i) => (
                  <MenuEntry key={item.id} item={item} tile={tiles} first={i === 0 ? firstItemRef : undefined} onRun={run} />
                ))}
              </div>
            </div>
          )}
          {boardItems.length > 0 && (
            <div role="group" aria-labelledby="more-board">
              <span className="pop__rule" aria-hidden="true" />
              <div className="pop__head" id="more-board">
                Board
              </div>
              <div className={tiles ? 'pop__tiles' : undefined}>
                {boardItems.map((item, i) => (
                  <MenuEntry key={item.id} item={item} tile={tiles} first={!gameItems.length && i === 0 ? firstItemRef : undefined} onRun={run} />
                ))}
              </div>
            </div>
          )}
          <div role="group" aria-labelledby="more-files">
            {(gameItems.length > 0 || boardItems.length > 0) && <span className="pop__rule" aria-hidden="true" />}
            <div className="pop__head" id="more-files">
              Save and files
            </div>
            <button
              ref={gameItems.length || boardItems.length ? undefined : firstItemRef}
              type="button"
              role="menuitem"
              className="pop__noted"
              onClick={() => saveRef.current?.click()}
            >
              <UploadSimple aria-hidden="true" />
              <span className="pop__text">
                Upload your save (.save)
                <small>Your newest save brings the board up to date</small>
              </span>
            </button>
            {fileItems.map((item) => (
              <MenuEntry key={item.id} item={item} onRun={run} />
            ))}
            {onCalendar && (
              <button
                type="button"
                role="menuitem"
                className="pop__noted"
                onClick={() => {
                  setOpen(false);
                  setCreditsOpen(false);
                  setReport(null);
                  onCalendarOpen?.(true);
                }}
              >
                <CalendarBlank aria-hidden="true" />
                <span className="pop__text">
                  Calendar years
                  <small>{calendarSummary(calendar)}</small>
                </span>
              </button>
            )}
            <button type="button" role="menuitem" onClick={() => run(onSave)}>
              <DownloadSimple aria-hidden="true" />
              Download the board (.json)
            </button>
            <button type="button" role="menuitem" onClick={() => fileRef.current?.click()}>
              <UploadSimple aria-hidden="true" />
              Upload a board (.json)
            </button>
          </div>
          <div role="group" aria-labelledby="more-help">
            <span className="pop__rule" aria-hidden="true" />
            <div className="pop__head" id="more-help">
              Help
            </div>
            <button type="button" role="menuitem" onClick={() => run(onDevUpdates)}>
              <Megaphone aria-hidden="true" />
              Developer updates
              {devUpdatesUnseen && <span className="pop__dot" aria-label="New since you last looked" />}
            </button>
            {onProblemReport && (
              <button
                type="button"
                role="menuitem"
                className="pop__noted"
                onClick={() => {
                  setOpen(false);
                  setCreditsOpen(false);
                  onCalendarOpen?.(false);
                  setReport({ text: onProblemReport() });
                }}
              >
                <ClipboardText aria-hidden="true" />
                <span className="pop__text">
                  Send a problem report
                  <small>To the developer, with no names</small>
                </span>
              </button>
            )}
            <DeveloperContact variant="menu" heading={`Contact ${DEVELOPER_NAME}`} note="Problems, feedback or ideas" onPick={() => setOpen(false)} />
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
            {/* The one entry that throws work away: last, apart, in red, and it asks first. */}
            <span className="pop__rule" aria-hidden="true" />
            <button
              type="button"
              role="menuitem"
              className="pop__danger"
              disabled={!canResetBoard}
              title={canResetBoard ? undefined : 'Already the starter fodder board'}
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
          </div>
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
