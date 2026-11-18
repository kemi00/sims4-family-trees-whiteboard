import { useCallback, useId, useRef, useState } from 'react';
import type { ChipObstacle, ChipSim, LinkSelectionInfo } from '../lib/linkLabel.ts';
import { placeChipOnVisiblePath } from '../lib/linkLabel.ts';
import { CaretDown, NotePencil, Plus } from '../icons.ts';
import { NoteEditor } from './NoteEditor.tsx';

type Props = {
  info: LinkSelectionInfo;
  tx: number;
  ty: number;
  k: number;
  /** Stage size in CSS pixels (for keeping the chip in view on the path). */
  stageW: number;
  stageH: number;
  /** Sim cards / household chrome — chip prefers path points clear of these. */
  obstacles?: ChipObstacle[];
  /** A name was clicked: select that sim and bring their card into view. */
  onGoToSim?: (id: string) => void;
  /**
   * The picked couple's ＋, here too: a new sim, or one they adopt. Offered
   * whenever the line has a ＋, so it is in reach at any zoom and when the
   * couple's badge is off screen. Gets the button, for the menu to open under.
   */
  onAddChild?: (button: HTMLElement) => void;
  /** What to do with the picked couple: plan its end, or cancel that plan. */
  action?: { label: string; onClick: () => void };
  onSaveNote?: (text: string) => void;
  /** Take the picked link off the board (the Delete key's job too). */
  onDelete?: () => void;
};

/** Most names a chip lists; past that, the rest are "+ N more". */
const CHIP_MAX_NAMES = 8;

/**
 * Names as buttons that take you to each sim, " + " between them. Each
 * name keeps its "+" and wraps as one, so a big family takes more lines
 * instead of being cut off.
 */
function SimNames({
  sims,
  onGoToSim,
}: {
  sims: ChipSim[];
  onGoToSim?: (id: string) => void;
}) {
  const shown = sims.length > CHIP_MAX_NAMES ? sims.slice(0, CHIP_MAX_NAMES - 1) : sims;
  const more = sims.length - shown.length;
  return (
    <>
      {shown.map((s, i) => (
        <span key={s.id} className="link-sel-chip__item">
          {i > 0 && (
            <span className="link-sel-chip__sep" aria-hidden="true">
              +
            </span>
          )}
          {onGoToSim ? (
            <button
              type="button"
              className="link-sel-chip__sim"
              title={`Go to ${s.name}`}
              onClick={() => onGoToSim(s.id)}
            >
              {s.name}
            </button>
          ) : (
            <span>{s.name}</span>
          )}
        </span>
      ))}
      {more > 0 && (
        <span className="link-sel-chip__item link-sel-chip__more">
          <span className="link-sel-chip__sep" aria-hidden="true">
            +
          </span>
          {more} more
        </span>
      )}
    </>
  );
}

/**
 * Relationship chip: follows the visible part of the selected link.
 * Drawn beside the stroke (above when it fits, below near the top edge) so
 * it stays on-screen while cards remain draggable (pointer-events: none).
 */
export function LinkSelectionChip({
  info,
  tx,
  ty,
  k,
  stageW,
  stageH,
  obstacles = [],
  onGoToSim,
  onAddChild,
  action,
  onSaveNote,
  onDelete,
}: Props) {
  const [editingNote, setEditingNote] = useState(false);
  const [noteExpanded, setNoteExpanded] = useState(false);
  const noteId = useId();
  const noteButton = useRef<HTMLButtonElement>(null);
  const closeNote = () => {
    setEditingNote(false);
    noteButton.current?.focus({ preventScroll: true });
  };
  // A note can widen the chip and a big family can add lines.
  const [size, setSize] = useState<{ width: number; height: number }>();
  const watching = useRef<ResizeObserver | null>(null);
  const ref = useCallback((el: HTMLDivElement | null) => {
    watching.current?.disconnect();
    watching.current = null;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      const width = el.offsetWidth;
      const height = el.offsetHeight;
      setSize((prev) => prev?.width === width && prev.height === height ? prev : { width, height });
    });
    ro.observe(el);
    watching.current = ro;
  }, []);
  const placement = placeChipOnVisiblePath(
    info.path,
    {
      tx,
      ty,
      k,
      width: stageW,
      height: stageH,
    },
    40,
    obstacles,
    size?.height,
  );
  if (!placement) return null;

  const half = Math.min(stageW / 2, (size?.width ?? 0) / 2 + 8);
  const left = Math.max(half, Math.min(stageW - half, tx + placement.at[0] * k));
  const top = ty + placement.at[1] * k;
  const directed = !!(info.nameFrom && info.nameTo);
  const hasActions = onAddChild || action || info.yourNote || onSaveNote || onDelete;

  return (
    <div
      ref={ref}
      className={`link-sel-chip${directed || hasActions ? ' link-sel-chip--tall' : ''}${editingNote ? ' link-sel-chip--editing' : ''}`}
      data-side={placement.side}
      style={{ left, top }}
      role="status"
      aria-live={editingNote ? 'off' : 'polite'}
      aria-label={[
        [info.tag ? `${info.label} (${info.tag})` : info.label, info.names].filter(Boolean).join(': '),
        info.note,
      ]
        .filter(Boolean)
        .join('. ')}
    >
      <span className="link-sel-chip__mark" aria-hidden="true">
        {info.mark}
      </span>
      <div className="link-sel-chip__body">
        <span className="link-sel-chip__label">
          {info.label}
          {info.tag && <span className="link-sel-chip__tag"> ({info.tag})</span>}
        </span>
        {directed ? (
          <span className="link-sel-chip__names">
            <span className="link-sel-chip__party">
              {info.fromSims ? (
                <SimNames sims={info.fromSims} onGoToSim={onGoToSim} />
              ) : (
                info.nameFrom
              )}
            </span>
            <span className="link-sel-chip__dir" aria-hidden="true">
              →
            </span>
            <span className="link-sel-chip__party link-sel-chip__party--to">
              {info.toSims ? (
                <SimNames sims={info.toSims} onGoToSim={onGoToSim} />
              ) : (
                info.nameTo
              )}
            </span>
          </span>
        ) : info.names ? (
          <span className="link-sel-chip__names">
            {info.sims ? <SimNames sims={info.sims} onGoToSim={onGoToSim} /> : info.names}
          </span>
        ) : null}
        {info.note && <span className="link-sel-chip__note">{info.note}</span>}
        {hasActions && (
          <span className="link-sel-chip__acts">
            {onAddChild && (
              <button
                type="button"
                className="link-sel-chip__act link-sel-chip__act--icon"
                title="Add a child of this couple: a new sim, or one they adopt"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => onAddChild(e.currentTarget)}
              >
                <Plus size={11} weight="bold" aria-hidden="true" />
                Add a child
              </button>
            )}
            {action && (
              <button
                type="button"
                className="link-sel-chip__act"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={action.onClick}
              >
                {action.label}
              </button>
            )}
            {info.yourNote && !editingNote && (
              <button
                type="button"
                className="link-sel-chip__act link-sel-chip__act--icon"
                aria-expanded={noteExpanded}
                aria-controls={noteId}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => setNoteExpanded((expanded) => !expanded)}
              >
                <CaretDown className="link-sel-chip__note-caret" weight="bold" aria-hidden="true" />
                {noteExpanded ? 'Hide note' : 'Show note'}
              </button>
            )}
            {onSaveNote && (
              <button
                ref={noteButton}
                type="button"
                className="link-sel-chip__act link-sel-chip__act--icon"
                aria-expanded={editingNote}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => setEditingNote((open) => !open)}
              >
                <NotePencil size={11} weight="bold" aria-hidden="true" />
                {info.noteTarget.note ? 'Edit note' : 'Add a note'}
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                className="link-sel-chip__act link-sel-chip__act--del"
                title="Take this link off the board (Delete key). Undo takes it back."
                onPointerDown={(e) => e.stopPropagation()}
                onClick={onDelete}
              >
                Delete link
              </button>
            )}
          </span>
        )}
        {info.yourNote && !editingNote && (
          <div
            id={noteId}
            className="link-sel-chip__yours"
            hidden={!noteExpanded}
            tabIndex={0}
            role="region"
            aria-label="Relationship note"
          >
            {info.yourNote}
          </div>
        )}
        {editingNote && onSaveNote && (
          <NoteEditor
            initial={info.noteTarget.note ?? ''}
            onCancel={closeNote}
            onSave={(text) => {
              onSaveNote(text);
              if (!text.trim()) setNoteExpanded(false);
              closeNote();
            }}
          />
        )}
      </div>
    </div>
  );
}
