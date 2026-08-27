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
 * Save import chooser — same decision layout/CTAs as {@link LoadJsonDialog}.
 * Merge keeps the board; Replace builds from the save alone.
 */
export function SaveImportDialog({
  summary,
  onMerge,
  onReplace,
  onCancel,
}: Props) {
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
        <p>
          Choose how this save meets the board. Merge updates matching sims and
          keeps planned violet links. Replace discards the current board and
          builds from the save only.
        </p>
        <p className="save-import__lead">If you merge</p>
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
