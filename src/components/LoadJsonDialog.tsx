import { useState } from 'react';
import { Warning } from '../icons.ts';
import type { LoadJsonRisk } from '../lib/loadJsonRisk.ts';

type Props = {
  risk: LoadJsonRisk;
  pendingFileName: string;
  /** File predates the current layout, so its card placements cannot be kept. */
  willRepack: boolean;
  /** How merging would change the filters on screen; null when it would not. */
  filtersNote: string | null;
  onDownload: () => void;
  onCancel: () => void;
  onMerge: (keepBoardPositions: boolean) => void;
  onReplace: (keepBoardPositions: boolean) => void;
};

/**
 * JSON load chooser — same shape as {@link SaveImportDialog}. Pick how the
 * file meets the board, then Proceed; only Cancel and Proceed act, so
 * choosing an option cannot commit you to it by accident.
 */
export function LoadJsonDialog({
  risk,
  pendingFileName,
  willRepack,
  filtersNote,
  onDownload,
  onCancel,
  onMerge,
  onReplace,
}: Props) {
  /**
   * Nothing of the visitor's is on the board yet: the built-in starter. The
   * file is their board, so Replace is picked; Merge would keep every
   * premade the file leaves out. Positions are still theirs to choose.
   */
  const starter = !risk.needsConfirm;
  const [mode, setMode] = useState<'merge' | 'replace'>(starter ? 'replace' : 'merge');
  // Each mode remembers its own choice. Merge keeps your layout by default;
  // Replace means "the file on its own", so it starts with the file's layout.
  const [keepBoardPositions, setKeepBoardPositions] = useState(true);
  const [keepOnReplace, setKeepOnReplace] = useState(false);

  return (
    <div
      className="save-import"
      role="dialog"
      aria-modal="true"
      aria-labelledby="load-json-title"
      onClick={onCancel}
    >
      <div className="save-import__card" onClick={(e) => e.stopPropagation()}>
        <h2 id="load-json-title">Load JSON</h2>
        <p>
          Choose how <b>{pendingFileName}</b> meets the board.
        </p>
        {/* Scrolls on its own, so the title and Proceed stay in view. */}
        <div className="save-import__body">
          {willRepack && (
            <p className="save-import__warn">
              <Warning aria-hidden="true" />
              <span>
                <b>{pendingFileName}</b> was saved by an older version of the
                board, before card positions could be restored reliably. Every
                sim, household and link in it loads normally, but wherever you
                dragged things will be tidied back into the automatic layout.
              </span>
            </p>
          )}
          <fieldset className="save-import__choices">
            <legend className="save-import__lead">What to do</legend>
            <div className="save-import__choice">
              <label className="save-import__choice-row">
                <input
                  type="radio"
                  name="load-json-mode"
                  checked={mode === 'merge'}
                  onChange={() => setMode('merge')}
                />
                <span className="save-import__choice-body">
                  <b>Merge into this board</b>
                  <span className="save-import__choice-note">
                    Updates matching sims and links and keeps your layout. When the
                    same pair disagrees, the JSON wins.
                  </span>
                  <ul className="save-import__stats">
                    <li>
                      <b>{risk.fromSaveCards}</b> cards from a save merge stay
                    </li>
                    <li>
                      <b>{risk.saveLinks}</b> save links (gray) ·{' '}
                      <b>{risk.plannedLinks}</b> planned (violet)
                    </li>
                    <li>
                      <b>{risk.editorAdds}</b> editor-added sims stay
                    </li>
                    <li>
                      {risk.hasUndo
                        ? 'Undo history is kept'
                        : 'No undo history on this board'}
                    </li>
                    {filtersNote && <li>{filtersNote}</li>}
                  </ul>
                </span>
              </label>
              {mode === 'merge' &&
                (willRepack ? (
                  <p className="save-import__subchoice-note">
                    The file's positions cannot be used — see the note above.
                  </p>
                ) : (
                  <fieldset className="save-import__subchoice">
                    <legend className="save-import__lead">Card positions</legend>
                    <label className="save-import__choice">
                      <input
                        type="radio"
                        name="load-json-positions"
                        checked={keepBoardPositions}
                        onChange={() => setKeepBoardPositions(true)}
                      />
                      <span className="save-import__choice-body">
                        <b>Keep the ones on this board</b>
                        <span className="save-import__choice-note">
                          Matched cards stay where you have them.
                        </span>
                      </span>
                    </label>
                    <label className="save-import__choice">
                      <input
                        type="radio"
                        name="load-json-positions"
                        checked={!keepBoardPositions}
                        onChange={() => setKeepBoardPositions(false)}
                      />
                      <span className="save-import__choice-body">
                        <b>Use the ones in the file</b>
                        <span className="save-import__choice-note">
                          Matched cards move to the file's placements.
                        </span>
                      </span>
                    </label>
                  </fieldset>
                ))}
            </div>
            <div className="save-import__choice">
              <label className="save-import__choice-row">
                <input
                  type="radio"
                  name="load-json-mode"
                  checked={mode === 'replace'}
                  onChange={() => setMode('replace')}
                />
                <span className="save-import__choice-body">
                  <b>Replace this board</b>
                  <span className="save-import__choice-note">
                    Discards the current board (<b>{risk.sourceLabel}</b>) and
                    loads the file on its own
                    {risk.hasUndo ? ', clearing the undo history' : ''}.
                  </span>
                  {starter && (
                    <span className="save-import__choice-note save-import__pick">
                      Picked for you: this is the built-in starter board, with
                      nothing of yours on it yet. Merging would keep the premade
                      sims your file leaves out.
                    </span>
                  )}
                </span>
              </label>
              {mode === 'replace' && (
                <fieldset className="save-import__subchoice">
                  <legend className="save-import__lead">Card positions</legend>
                  <label className="save-import__choice">
                    <input
                      type="radio"
                      name="load-json-replace-positions"
                      checked={keepOnReplace}
                      onChange={() => setKeepOnReplace(true)}
                    />
                    <span className="save-import__choice-body">
                      <b>Keep the ones on this board</b>
                      <span className="save-import__choice-note">
                        Sims already on this board stay where you have them.
                        {willRepack
                          ? ' Everyone else is laid out automatically.'
                          : ' Everyone else goes where the file puts them.'}
                      </span>
                    </span>
                  </label>
                  <label className="save-import__choice">
                    <input
                      type="radio"
                      name="load-json-replace-positions"
                      checked={!keepOnReplace}
                      onChange={() => setKeepOnReplace(false)}
                    />
                    <span className="save-import__choice-body">
                      {willRepack ? (
                        <>
                          <b>Lay everything out automatically</b>
                          <span className="save-import__choice-note">
                            The file is too old to keep its positions — see the
                            note above.
                          </span>
                        </>
                      ) : (
                        <>
                          <b>Use the ones in the file</b>
                          <span className="save-import__choice-note">
                            The board looks exactly like the file.
                          </span>
                        </>
                      )}
                    </span>
                  </label>
                </fieldset>
              )}
            </div>
          </fieldset>
          {/* The starter board needs no backup: Reset the board brings it back. */}
          {!starter && (
            <p className="save-import__backup">
              <button type="button" className="save-import__text-btn" onClick={onDownload}>
                Download a backup of this board
              </button>
            </p>
          )}
        </div>
        <div className="save-import__actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="save-import__ok"
            onClick={
              mode === 'merge'
                ? () => onMerge(willRepack ? true : keepBoardPositions)
                : () => onReplace(keepOnReplace)
            }
          >
            Proceed
          </button>
        </div>
      </div>
    </div>
  );
}
