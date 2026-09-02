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
 * JSON load chooser — same decision layout/CTAs as {@link SaveImportDialog}.
 * Merge keeps the board; Replace loads the file alone.
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
          Choose how <b>{pendingFileName}</b> meets the board. Merge updates
          matching sims and links and keeps your layout; when the same pair
          disagrees, <b>the JSON wins</b>. Replace discards the current board
          and loads the file only.
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
        <p className="save-import__lead">If you merge</p>
        <ul className="save-import__stats">
          <li>
            Keeps layout · current board:{' '}
            <b>{risk.sourceLabel}</b>
          </li>
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
              ? 'Undo history is kept on Merge, cleared on Replace'
              : 'No undo history on this board'}
          </li>
        </ul>
        <p className="save-import__backup">
          <button type="button" className="save-import__text-btn" onClick={onDownload}>
            Download a backup of this board
          </button>
        </p>
        <div className="save-import__actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" onClick={onReplace}>
            Replace board
          </button>
          <button type="button" className="save-import__ok" onClick={onMerge}>
            Merge
          </button>
        </div>
      </div>
    </div>
  );
}
