import { useState } from 'react';
import type { SaveMergeSummary } from '../lib/savegame/mergeSave.ts';

type Props = {
  summary: SaveMergeSummary;
  onMerge: () => void;
  onReplace: () => void;
  onCancel: () => void;
};

function listPreview(items: string[], max = 6): string {
  if (!items.length) return '';
  if (items.length <= max) return items.join(', ');
  return `${items.slice(0, max).join(', ')} +${items.length - max} more`;
}

/**
 * Save import chooser — same shape as {@link LoadJsonDialog}. Pick how the
 * save meets the board, then Proceed; only Cancel and Proceed act, so
 * choosing an option cannot commit you to it by accident.
 */
export function SaveImportDialog({
  summary,
  onMerge,
  onReplace,
  onCancel,
}: Props) {
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');
  const hasDetails =
    summary.skipped.length > 0 ||
    summary.saveWorlds.length > 0 ||
    summary.hidePacks.length > 0;

  return (
    <div
      className="save-import"
      role="dialog"
      aria-modal="true"
      aria-labelledby="save-import-title"
      onClick={onCancel}
    >
      <div className="save-import__card" onClick={(e) => e.stopPropagation()}>
        <h2 id="save-import-title">Load save game</h2>
        <p>Choose how this save meets the board.</p>
        <fieldset className="save-import__choices">
          <legend className="save-import__lead">What to do</legend>
          <label className="save-import__choice">
            <input
              type="radio"
              name="save-import-mode"
              checked={mode === 'merge'}
              onChange={() => setMode('merge')}
            />
            <span className="save-import__choice-body">
              <b>Merge into this board</b>
              <span className="save-import__choice-note">
                Updates matching sims and keeps planned violet links.
              </span>
              <ul className="save-import__stats">
                <li>
                  <b>{summary.matched}</b> cards updated
                </li>
                <li>
                  <b>{summary.added}</b> new cards
                </li>
                <li>
                  <b>{summary.newLinks}</b> new save links ·{' '}
                  <b>{summary.confirmed}</b> planned→save
                </li>
                <li>
                  <b>{summary.stillPlanned}</b> stay planned (violet)
                </li>
              </ul>
            </span>
          </label>
          <label className="save-import__choice">
            <input
              type="radio"
              name="save-import-mode"
              checked={mode === 'replace'}
              onChange={() => setMode('replace')}
            />
            <span className="save-import__choice-body">
              <b>Replace this board</b>
              <span className="save-import__choice-note">
                Discards the current board and builds a new one from the save
                alone.
              </span>
            </span>
          </label>
        </fieldset>
        {hasDetails && (
          <details className="save-import__details">
            <summary>Worlds, packs, and skipped names</summary>
            {summary.skipped.length > 0 && (
              <div className="save-import__meta">
                <span className="save-import__meta-label">Skipped (ambiguous name)</span>
                <span className="save-import__meta-value">
                  {listPreview(summary.skipped)}
                </span>
              </div>
            )}
            {summary.saveWorlds.length > 0 && (
              <div className="save-import__meta">
                <span className="save-import__meta-label">Worlds in save</span>
                <span className="save-import__meta-value">
                  {listPreview(summary.saveWorlds, 8)}
                  {summary.extraWorlds.length
                    ? `. Not on board: ${listPreview(summary.extraWorlds, 6)}`
                    : ''}
                </span>
              </div>
            )}
            {summary.hidePacks.length > 0 && (
              <div className="save-import__meta">
                <span className="save-import__meta-label">Filters will hide</span>
                <span className="save-import__meta-value">
                  {listPreview(summary.hidePacks, 8)}. Turn back on anytime.
                </span>
              </div>
            )}
          </details>
        )}
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
