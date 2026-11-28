import { useCallback, useId, useRef, useState } from 'react';
import type { ChipObstacle, ChipSim, LinkSelectionInfo } from '../lib/linkLabel.ts';
import { placeChipOnVisiblePath } from '../lib/linkLabel.ts';
import { Baby, CaretDown, Heart, LinkBreak, NotePencil, Plus, Trash, UserPlus } from '../icons.ts';
import type { BabyTry } from '../types/whiteboard.ts';
import type { NextStep, StoryStep } from '../lib/coupleStory.ts';
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
   * The picked couple's new-child action and direct adoption picker.
   * Gets the button so the menu can open underneath it.
   */
  onChildMenu?: (button: HTMLElement, step: 'new' | 'adopt') => void;
  adoptDisabledReason?: string;
  /**
   * The picked couple's story, step by step, when it has more than one:
   * where each step comes from, and a bin on each planned one.
   */
  story?: {
    steps: (StoryStep & { from: 'save' | 'seed' | 'planned' })[];
    onCancel: (step: StoryStep) => void;
  };
  /** What can come next in their story: "Marry", "Break up", "Get back together". */
  next?: { step: NextStep; label: string; onClick: (button: HTMLElement) => void }[];
  onSaveNote?: (text: string) => void;
  /** Take the picked link off the board (the Delete key's job too). */
  onDelete?: () => void;
  /** The couple's tries for a baby (TriesForABaby). */
  tries?: TriesProps;
};

type TriesProps = {
  list: BabyTry[];
  /** The baby on the way by the last save: when it is due, as the game's clock says it. */
  expecting?: string;
  /** Today in the game, by the last save: the day a new try starts at. */
  today: number;
  /** "Day 3", or "Day 3 · 1300" with calendar years. */
  dayText: (day: number) => string;
  onAdd: (t: BabyTry) => void;
  onRemove: (index: number) => void;
};

/** A pregnancy lasts 100 sim hours (the game's PREGNANCY_RATE to 100): a baby is due about four days after. */
const DAYS_TO_DUE = 4;

/**
 * A couple's tries for a baby, as the player logs them: each try's day and
 * whether it took, with the due date of one that did (the save's own, when
 * it has the pregnancy). Folded under its count until opened.
 */
function TriesForABaby({ tries }: { tries: TriesProps }) {
  const [open, setOpen] = useState(false);
  const [day, setDay] = useState(String(tries.today));
  const id = useId();
  const n = tries.list.length;
  const typed = /^-?\d+$/.test(day.trim()) ? Number(day.trim()) : null;
  const lastPregnant = tries.list.map((t) => t.pregnant).lastIndexOf(true);
  const add = (pregnant: boolean) => {
    if (typed === null) return;
    tries.onAdd({ day: typed, pregnant });
  };
  return (
    <div className="link-sel-chip__tries" role="group" aria-label="Tries for a baby">
      <button
        type="button"
        className="link-sel-chip__act link-sel-chip__act--tries"
        aria-expanded={open}
        aria-controls={id}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => setOpen(!open)}
      >
        <Baby weight="bold" aria-hidden="true" />
        <span>{n ? `Tries for a baby · ${n}` : 'Tries for a baby'}</span>
        <CaretDown className="link-sel-chip__note-caret" weight="bold" aria-hidden="true" />
      </button>
      {open && (
        <div id={id} className="link-sel-chip__trylog" onPointerDown={(e) => e.stopPropagation()}>
          {tries.expecting && <p className="link-sel-chip__expecting">{`Expecting, due ${tries.expecting} (your save)`}</p>}
          {n > 0 ? (
            <ol>
              {tries.list.map((t, i) => (
                <li key={i}>
                  <span className="link-sel-chip__num" aria-hidden="true">
                    {i + 1}
                  </span>
                  <span className="link-sel-chip__try">
                    {t.pregnant
                      ? `${tries.dayText(t.day)} · Pregnant${i === lastPregnant && tries.expecting ? '' : ` · due about ${tries.dayText(t.day + DAYS_TO_DUE)}`}`
                      : `${tries.dayText(t.day)} · Not this time`}
                  </span>
                  <button
                    type="button"
                    className="link-sel-chip__bin"
                    aria-label={`Remove try ${i + 1}`}
                    title="Remove this try. Undo takes it back."
                    onClick={() => tries.onRemove(i)}
                  >
                    <Trash aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <p className="link-sel-chip__tryempty">No tries logged yet.</p>
          )}
          <div className="link-sel-chip__tryform">
            <label className="link-sel-chip__tryday">
              <span>Try {n + 1} on Day</span>
              <input
                type="text"
                inputMode="numeric"
                value={day}
                aria-invalid={typed === null}
                onChange={(e) => setDay(e.target.value)}
              />
            </label>
            <button type="button" className="link-sel-chip__act link-sel-chip__act--log" disabled={typed === null} onClick={() => add(true)}>
              Pregnant
            </button>
            <button type="button" className="link-sel-chip__act link-sel-chip__act--log" disabled={typed === null} onClick={() => add(false)}>
              Not this time
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Each story step's mark, as Connect's menu marks the links. */
const STEP_MARK: Record<StoryStep['kind'], string> = {
  romance: '❤',
  marriage: '⚭',
  divorced: '⚮',
  breakup: '♡',
  divorce: '⚮',
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
  onChildMenu,
  adoptDisabledReason,
  story,
  next = [],
  onSaveNote,
  onDelete,
  tries,
}: Props) {
  const [editingNote, setEditingNote] = useState(false);
  const [noteExpanded, setNoteExpanded] = useState(false);
  const noteId = useId();
  const noteButton = useRef<HTMLButtonElement>(null);
  const closeNote = () => {
    setEditingNote(false);
    noteButton.current?.focus({ preventScroll: true });
  };
  const noteVisible = editingNote || (!!info.yourNote && noteExpanded);
  const toggleNote = () => {
    if (editingNote) setEditingNote(false);
    if (info.yourNote) setNoteExpanded(!noteVisible);
    else if (!editingNote) setEditingNote(true);
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
  const hasPlans = !!onChildMenu || next.length > 0;
  const told = !!story && story.steps.length > 1;
  const hasNoteControl = !!(info.yourNote || onSaveNote);

  return (
    <div
      ref={ref}
      className={`link-sel-chip${directed || hasPlans || told || hasNoteControl || onDelete || tries ? ' link-sel-chip--tall' : ''}${editingNote ? ' link-sel-chip--editing' : ''}`}
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
        {told && (
          <div className="link-sel-chip__story" role="group" aria-label="Their story">
            <span className="link-sel-chip__head">Their story</span>
            <ol>
              {story.steps.map((step, i) => (
                <li key={`${step.edgeId}:${step.part}`} className={step.planned ? 'is-planned' : undefined}>
                  <span className="link-sel-chip__num" aria-hidden="true">
                    {i + 1}
                  </span>
                  <span className="link-sel-chip__step">
                    <span className="link-sel-chip__step-mark" aria-hidden="true">
                      {STEP_MARK[step.kind]}
                    </span>
                    {step.label}
                  </span>
                  {step.planned ? (
                    <button
                      type="button"
                      className="link-sel-chip__bin"
                      aria-label={`Cancel step ${i + 1}: ${step.label}`}
                      title="Cancel this step; the rest of their story stays. Undo takes it back."
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => story.onCancel(step)}
                    >
                      <Trash aria-hidden="true" />
                    </button>
                  ) : (
                    <span className="link-sel-chip__from">{step.from === 'save' ? 'from your save' : 'from the game'}</span>
                  )}
                </li>
              ))}
            </ol>
          </div>
        )}
        {tries && <TriesForABaby tries={tries} />}
        {hasPlans && (
          <div className="link-sel-chip__plans" role="group" aria-label="Relationship plans">
            <span className="link-sel-chip__head">Plan next</span>
            {onChildMenu && (
              <>
                <button
                  type="button"
                  className="link-sel-chip__act link-sel-chip__act--plan"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => onChildMenu(e.currentTarget, 'new')}
                >
                  <Plus weight="bold" aria-hidden="true" />
                  Add a child
                </button>
                <button
                  type="button"
                  className="link-sel-chip__act link-sel-chip__act--plan"
                  disabled={!!adoptDisabledReason}
                  title={adoptDisabledReason}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => onChildMenu(e.currentTarget, 'adopt')}
                >
                  <UserPlus weight="bold" aria-hidden="true" />
                  Adopt a sim
                </button>
              </>
            )}
            {next.map((n) => (
              <button
                key={n.step}
                type="button"
                className="link-sel-chip__act link-sel-chip__act--plan"
                title={`Plan it: ${n.label}, after the steps before it. Undo takes it back.`}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => n.onClick(e.currentTarget)}
              >
                {n.step === 'romance' ? (
                  <Heart weight="bold" aria-hidden="true" />
                ) : n.step === 'marriage' ? (
                  <span className="link-sel-chip__glyph" aria-hidden="true">
                    ⚭
                  </span>
                ) : (
                  <LinkBreak weight="bold" aria-hidden="true" />
                )}
                {n.label}
              </button>
            ))}
          </div>
        )}
        {(hasNoteControl || onDelete) && (
          <div className="link-sel-chip__utility">
            {hasNoteControl && (
              <button
                ref={noteButton}
                type="button"
                className="link-sel-chip__act link-sel-chip__act--note"
                aria-expanded={noteVisible}
                aria-controls={noteId}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={toggleNote}
              >
                {info.yourNote ? (
                  <CaretDown className="link-sel-chip__note-caret" weight="bold" aria-hidden="true" />
                ) : (
                  <NotePencil weight="bold" aria-hidden="true" />
                )}
                {info.yourNote ? (noteVisible ? 'Hide note' : 'Show note') : 'Add a note'}
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
          </div>
        )}
        {hasNoteControl && (
          <div
            id={noteId}
            className="link-sel-chip__note-panel"
            hidden={!noteVisible}
            role="region"
            aria-label="Relationship note"
          >
            {editingNote && onSaveNote ? (
              <NoteEditor
                initial={info.noteTarget.note ?? ''}
                onCancel={closeNote}
                onSave={(text) => {
                  onSaveNote(text);
                  if (!text.trim()) setNoteExpanded(false);
                  closeNote();
                }}
              />
            ) : noteVisible && info.yourNote ? (
              <>
                <div className="link-sel-chip__yours" tabIndex={0}>{info.yourNote}</div>
                {onSaveNote && (
                  <button
                    type="button"
                    className="link-sel-chip__act link-sel-chip__act--note link-sel-chip__edit-note"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => setEditingNote(true)}
                  >
                    <NotePencil weight="bold" aria-hidden="true" />
                    {info.noteTarget.note ? 'Edit note' : 'Add a note'}
                  </button>
                )}
              </>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
