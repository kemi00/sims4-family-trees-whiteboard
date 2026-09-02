import { useState } from 'react';
import { Warning } from '../icons.ts';
import type { LoadJsonRisk } from '../lib/loadJsonRisk.ts';

type Props = {
  risk: LoadJsonRisk;
  pendingFileName: string;
  /** File predates the current layout, so its card placements cannot be kept. */
  willRepack: boolean;
  onDownload: () => void;
  onCancel: () => void;
  onMerge: () => void;
  onReplace: () => void;
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
  onDownload,
  onCancel,
  onMerge,
  onReplace,
}: Props) {
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');

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
          <label className="save-import__choice">
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
              </ul>
            </span>
          </label>
          <label className="save-import__choice">
            <input
              type="radio"
              name="load-json-mode"
              checked={mode === 'replace'}
              onChange={() => setMode('replace')}
            />
            <span className="save-import__choice-body">
              <b>Replace this board</b>
              <span className="save-import__choice-note">
                Discards the current board (<b>{risk.sourceLabel}</b>) and loads
                the file on its own
                {risk.hasUndo ? ', clearing the undo history' : ''}.
              </span>
            </span>
          </label>
        </fieldset>
        <p className="save-import__backup">
          <button type="button" className="save-import__text-btn" onClick={onDownload}>
            Download a backup of this board
          </button>
        </p>
        <div className="save-import__actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="save-import__ok"
            onClick={mode === 'merge' ? onMerge : onReplace}
          >
            Proceed
          </button>
        </div>
      </div>
    </div>
  );
}
