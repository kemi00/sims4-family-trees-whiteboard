import { ArrowsDownUp, Check, NotePencil, Trash, Warning } from '../icons.ts';
import { useEffect, useMemo, useRef, useState } from 'react';
import { BarPanel } from './BarPanel.tsx';
import { IconButton } from './CloseButton.tsx';
import {
  canNote,
  connectionLogRows,
  formatLogTime,
  logSection,
  relDisplay,
  sortConnectionLog,
  type ConnectionLogEntry,
  type LogPart,
} from '../lib/connectionLog.ts';
import { NOTE_MAX } from '../lib/utils.ts';

type Props = {
  entries: ConnectionLogEntry[];
  selectedSimId: string | null;
  isSelLink: (ids: string[]) => boolean;
  onPick: (entry: ConnectionLogEntry) => void;
  onFocusSim: (id: string) => void;
  onClose: () => void;
  /** Planned links the game went against (planConflicts). */
  offPlanEdgeIds?: ReadonlySet<string>;
  /** Write (or, with an empty text, take off) the note on a line. */
  onNote: (entry: ConnectionLogEntry, text: string) => void;
  /** Cancel a plan still to do: the board goes back to what the game has. */
  onCancel: (entry: ConnectionLogEntry) => void;
};

type Tab = 'plan' | 'game';
const TAB_KEY = 'log-tab';

function storedTab(): Tab | null {
  try {
    const v = localStorage.getItem(TAB_KEY);
    return v === 'plan' || v === 'game' ? v : null;
  } catch {
    return null;
  }
}

/** The sentence, without the stamp: the row shows the time on its own. */
function LogParts({
  parts,
  onFocusSim,
}: {
  parts: LogPart[];
  onFocusSim: (id: string) => void;
}) {
  return parts.map((part, i) => {
    if (part.kind === 'time' || part.kind === 'break') return null;
    if (part.kind === 'sim') {
      return (
        <button
          key={i}
          type="button"
          className="connection-log__sim"
          title={
            part.place
              ? `Show ${part.name} on the board (${part.place})`
              : `Show ${part.name} on the board`
          }
          onClick={(e) => {
            e.stopPropagation();
            onFocusSim(part.id);
          }}
        >
          {part.name}
        </button>
      );
    }
    if (part.kind === 'hh') {
      return (
        <span key={i} className="connection-log__hh" title={part.place || undefined}>
          {part.name || part.place}
          {part.world && <span className="connection-log__world"> ({part.world})</span>}
        </span>
      );
    }
    if (part.kind === 'rel') {
      return (
        <strong key={i} className="connection-log__rel">
          {relDisplay(part.mark, part.label)}
        </strong>
      );
    }
    return <span key={i}>{part.value}</span>;
  });
}

/** Inline note box: Enter saves, Shift+Enter starts a new line, Esc cancels. */
function NoteEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial: string;
  onSave: (text: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(initial);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);
  return (
    <div
      className="connection-log__noteedit"
      onClick={(e) => e.stopPropagation()}
    >
      <textarea
        ref={ref}
        rows={2}
        maxLength={NOTE_MAX}
        value={text}
        aria-label="Note"
        placeholder="Why this plan? For example: so the Fyres line gets an heir."
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            // Esc leaves the note, not the log.
            e.stopPropagation();
            onCancel();
          } else if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            onSave(text);
          }
        }}
      />
      <div className="connection-log__noteactions">
        <span className="connection-log__notehint">
          {initial && !text.trim() ? 'Save an empty note to remove it' : 'Enter to save · Shift+Enter for a new line'}
        </span>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="connection-log__notesave"
          onClick={() => onSave(text)}
        >
          Save
        </button>
      </div>
    </div>
  );
}

export function ConnectionLogPanel({
  entries,
  selectedSimId,
  isSelLink,
  onPick,
  onFocusSim,
  onClose,
  offPlanEdgeIds,
  onNote,
  onCancel,
}: Props) {
  const [newestFirst, setNewestFirst] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [doneOnly, setDoneOnly] = useState(false);

  const sectionOf = useMemo(() => {
    const off = offPlanEdgeIds ?? new Set<string>();
    return new Map(entries.map((e) => [e.id, logSection(e, off)]));
  }, [entries, offPlanEdgeIds]);
  const counts = useMemo(() => {
    let off = 0;
    let plan = 0;
    let game = 0;
    let done = 0;
    for (const e of entries) {
      const s = sectionOf.get(e.id);
      if (s === 'off') off += 1;
      else if (s === 'plan') plan += 1;
      else {
        game += 1;
        if (e.done) done += 1;
      }
    }
    return { off, plan, game, done };
  }, [entries, sectionOf]);

  const [tab, setTabState] = useState<Tab>(
    () => storedTab() ?? (counts.off + counts.plan || !counts.game ? 'plan' : 'game'),
  );
  const setTab = (next: Tab) => {
    setTabState(next);
    setEditing(null);
    try {
      localStorage.setItem(TAB_KEY, next);
    } catch {
      /* the tab is a convenience: it just isn't remembered */
    }
  };

  const sorted = useMemo(() => sortConnectionLog(entries, newestFirst), [entries, newestFirst]);
  const offRows = useMemo(
    () => (tab === 'plan' ? sorted.filter((e) => sectionOf.get(e.id) === 'off') : []),
    [sorted, sectionOf, tab],
  );
  const rows = useMemo(
    () =>
      connectionLogRows(
        sorted.filter((e) =>
          tab === 'plan'
            ? sectionOf.get(e.id) === 'plan'
            : sectionOf.get(e.id) === 'game' && (!doneOnly || e.done),
        ),
      ),
    [sorted, sectionOf, tab, doneOnly],
  );

  const sortLabel = newestFirst
    ? 'Newest first. Click for oldest first.'
    : 'Oldest first. Click for newest first.';

  const renderRow = (entry: ConnectionLogEntry, off = false) => {
    const selected = entry.edgeIds.length
      ? isSelLink(entry.edgeIds)
      : !!entry.simId && entry.simId === selectedSimId;
    const classes = ['connection-log__item'];
    if (selected) classes.push('connection-log__item--on');
    if (off) classes.push('connection-log__item--off');
    const stamp = formatLogTime(entry.createdAt);
    const isEditing = editing === entry.id;
    const noteable = canNote(entry);
    // Only what's still to do can be cancelled; off plan is settled in the editor.
    const cancelable = tab === 'plan' && !off && (entry.kind === 'link' || entry.kind === 'move' || entry.kind === 'end');
    return (
      <li key={entry.id}>
        <div
          className={classes.join(' ')}
          aria-current={selected ? 'true' : undefined}
          onClick={() => onPick(entry)}
        >
          <div className="connection-log__main">
            <p className="connection-log__text">
              <LogParts parts={entry.parts} onFocusSim={onFocusSim} />
            </p>
            {isEditing ? (
              <NoteEditor
                initial={entry.note ?? ''}
                onCancel={() => setEditing(null)}
                onSave={(text) => {
                  onNote(entry, text);
                  setEditing(null);
                }}
              />
            ) : (
              entry.note && (
                <button
                  type="button"
                  className="connection-log__note"
                  title="Edit the note"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditing(entry.id);
                  }}
                >
                  {entry.note}
                </button>
              )
            )}
          </div>
          <div className="connection-log__side">
            <span className="connection-log__sidetop">
              {noteable && !entry.note && !isEditing && (
                <button
                  type="button"
                  className="connection-log__addnote"
                  title="Add a note"
                  aria-label="Add a note"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditing(entry.id);
                  }}
                >
                  <NotePencil aria-hidden="true" />
                </button>
              )}
              {cancelable && !isEditing && (
                <button
                  type="button"
                  className="connection-log__addnote connection-log__cancel"
                  title="Cancel this plan: put the board back as your game has it"
                  aria-label="Cancel this plan"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCancel(entry);
                  }}
                >
                  <Trash aria-hidden="true" />
                </button>
              )}
              {stamp && (
                <time
                  className="connection-log__time"
                  dateTime={entry.createdAt}
                  title={stamp}
                >
                  {stamp.slice(11)}
                </time>
              )}
            </span>
            {entry.done && tab === 'game' && (
              <span
                className="connection-log__done"
                title="From your plan: a save showed it done"
              >
                <Check aria-hidden="true" weight="bold" />
                planned
              </span>
            )}
          </div>
        </div>
      </li>
    );
  };

  const planTotal = counts.off + counts.plan;

  return (
    <BarPanel
      id="connection-log"
      className="gpanel connection-log"
      title="Log"
      description="Links and household moves you added, and what your saves showed"
      onClose={onClose}
      actions={
        <IconButton label={sortLabel} pressed={newestFirst} disabled={entries.length < 2} onClick={() => setNewestFirst((on) => !on)}>
          <ArrowsDownUp aria-hidden="true" />
        </IconButton>
      }
      tools={
        <>
        <div className="connection-log__tabs" role="tablist" aria-label="Log">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'plan'}
            className="connection-log__tab"
            title="What you plan to do in your game"
            onClick={() => setTab('plan')}
          >
            Plan <span className="connection-log__count">{planTotal}</span>
            {counts.off > 0 && (
              <span className="connection-log__count connection-log__count--off" title={`${counts.off} off plan`}>
                <Warning aria-hidden="true" weight="fill" />
                {counts.off}
                <span className="sr-only"> off plan</span>
              </span>
            )}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'game'}
            className="connection-log__tab"
            title="What your saves show, and your plans they showed done"
            onClick={() => setTab('game')}
          >
            In your game <span className="connection-log__count">{counts.game}</span>
          </button>
        </div>
        {tab === 'game' && (counts.done > 0 || doneOnly) && (
          <div className="connection-log__tools">
            <button
              type="button"
              className="connection-log__chip"
              aria-pressed={doneOnly}
              title={doneOnly ? 'Show everything in your game' : 'Show only plans a save showed done'}
              onClick={() => setDoneOnly((on) => !on)}
            >
              <Check aria-hidden="true" weight="bold" />
              {counts.done} from your plan
            </button>
          </div>
        )}
        </>
      }
    >
      {tab === 'plan' && planTotal === 0 ? (
        <p className="connection-log__empty">
          Nothing planned. Links you add with Connect and moves you plan show
          up here, until a save shows them done.
        </p>
      ) : tab === 'game' && counts.game === 0 ? (
        <p className="connection-log__empty">
          Nothing from your game yet. Open your save: the links it finds, and
          the plans it shows done, show up here.
        </p>
      ) : (
        <>
          {offRows.length > 0 && (
            <section className="connection-log__offplan" aria-label="Off plan">
              <h3 className="connection-log__head connection-log__head--off">
                <Warning aria-hidden="true" weight="fill" />
                Off plan: the game went another way
              </h3>
              <ul className="connection-log__list">{offRows.map((e) => renderRow(e, true))}</ul>
            </section>
          )}
          {offRows.length > 0 && rows.length > 0 && (
            <h3 className="connection-log__head">To do</h3>
          )}
          {rows.length > 0 && (
            <ul className="connection-log__list">
              {rows.map((row) =>
                row.kind === 'day' ? (
                  <li key={row.key} className="connection-log__day">
                    <time dateTime={row.day}>{row.day}</time>
                  </li>
                ) : (
                  renderRow(row.entry)
                ),
              )}
            </ul>
          )}
          {tab === 'plan' && (
            <p className="connection-log__foot">
              Each line is a step of your plan, in order: move a sim there and
              back, or plan a divorce, and both steps stay. The bin takes one
              step back out. When a save shows a step done, it moves to In
              your game, with its note.
            </p>
          )}
        </>
      )}
    </BarPanel>
  );
}
