import type { SaveMergeSummary } from '../lib/savegame/mergeSave.ts';

type Props = {
  summary: SaveMergeSummary;
  onConfirm: () => void;
  onCancel: () => void;
};

export function SaveImportDialog({ summary, onConfirm, onCancel }: Props) {
  return (
    <div
      className="save-import"
      role="dialog"
      aria-modal="true"
      aria-labelledby="save-import-title"
      onClick={onCancel}
    >
      <div
        className="save-import__card"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="save-import-title">Merge save game</h2>
        <p>
          This updates matching cards, adds sims from the save that are not on
          the board, paints save links gray, and leaves planned violet links
          that are not in the save.
        </p>
        <ul className="save-import__stats">
          <li>
            <b>{summary.matched}</b> existing cards updated
          </li>
          <li>
            <b>{summary.added}</b> new cards
          </li>
          <li>
            <b>{summary.fromSave}</b> marked as not on the original roster
          </li>
          <li>
            <b>{summary.confirmed}</b> planned links now in the save (gray)
          </li>
          <li>
            <b>{summary.newLinks}</b> new save links
          </li>
          <li>
            <b>{summary.stillPlanned}</b> still planned (violet)
          </li>
        </ul>
        {summary.skipped.length > 0 && (
          <p className="save-import__skip">
            Skipped (name matched more than one card):{' '}
            {summary.skipped.slice(0, 8).join(', ')}
            {summary.skipped.length > 8
              ? ` and ${summary.skipped.length - 8} more`
              : ''}
          </p>
        )}
        {summary.saveWorlds.length > 0 && (
          <p className="save-import__skip">
            Worlds in this save:{' '}
            {summary.saveWorlds.join(', ')}
            {summary.extraWorlds.length
              ? `. Also listed (not on the board): ${summary.extraWorlds.join(', ')}`
              : ''}
          </p>
        )}
        {summary.hidePacks.length > 0 && (
          <p className="save-import__skip">
            Games not in this save will be hidden in Filters:{' '}
            {summary.hidePacks.join(', ')}. Turn them back on anytime.
          </p>
        )}
        <div className="save-import__actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="save-import__ok" onClick={onConfirm}>
            Merge
          </button>
        </div>
      </div>
    </div>
  );
}
