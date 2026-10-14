import { useState, type SyntheticEvent } from 'react';
import type { SaveMergeSummary } from '../lib/savegame/mergeSave.ts';

type Props = {
  summary: SaveMergeSummary;
  /** The board is still the starter roster (see isStarterBoard): Replace is picked. */
  starter: boolean;
  onMerge: () => void;
  onReplace: () => void;
  onCancel: () => void;
};

/** "1 sim … rejoins" / "3 sims … rejoin". */
const sims = (n: number) => (n === 1 ? 'sim' : 'sims');
const cards = (n: number) => (n === 1 ? 'card' : 'cards');
const verb = (n: number, one: string, many: string) => (n === 1 ? one : many);

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
  starter,
  onMerge,
  onReplace,
  onCancel,
}: Props) {
  const [mode, setMode] = useState<'merge' | 'replace'>(starter ? 'replace' : 'merge');
  const hasDetails =
    summary.rejoined.length > 0 ||
    summary.relatives.length > 0 ||
    summary.relativesNamed.length > 0 ||
    summary.toNotInWorld.length > 0 ||
    summary.skipped.length > 0 ||
    summary.saveWorlds.length > 0 ||
    summary.hidePacks.length > 0;

  /** Opening the details scrolls them up into view, not below the fold. */
  const showOpened = (e: SyntheticEvent<HTMLDetailsElement>) => {
    const el = e.currentTarget;
    if (!el.open) return;
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ block: 'start', behavior: still ? 'auto' : 'smooth' });
  };

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
        {/* Scrolls on its own, so the title and Proceed stay in view. */}
        <div className="save-import__body">
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
                  {summary.rejoined.length > 0 && (
                    <li>
                      <b>{summary.rejoined.length}</b> {sims(summary.rejoined.length)}{' '}
                      {verb(summary.rejoined.length, 'rejoins', 'rejoin')} their household
                    </li>
                  )}
                  {summary.unhoused.length > 0 && (
                    <li>
                      <b>{summary.unhoused.length}</b> {sims(summary.unhoused.length)} the
                      game made {verb(summary.unhoused.length, 'goes', 'go')} in Unhoused sims
                    </li>
                  )}
                  {summary.toNotInWorld.length > 0 && (
                    <li>
                      <b>{summary.toNotInWorld.length}</b> {sims(summary.toNotInWorld.length)}{' '}
                      with no home {verb(summary.toNotInWorld.length, 'moves', 'move')} to Not
                      in any world
                    </li>
                  )}
                  {summary.relatives.length > 0 && (
                    <li>
                      <b>{summary.relatives.length}</b>{' '}
                      {verb(summary.relatives.length, 'relative', 'relatives')} from the family
                      tree {verb(summary.relatives.length, 'joins', 'join')} their family
                    </li>
                  )}
                  {summary.relativesNamed.length > 0 && (
                    <li>
                      <b>{summary.relativesNamed.length}</b> Unknown{' '}
                      {verb(summary.relativesNamed.length, 'relative gets', 'relatives get')}{' '}
                      the game's name for them
                    </li>
                  )}
                  {summary.notInSave > 0 && (
                    <li>
                      <b>{summary.notInSave}</b> {cards(summary.notInSave)} not in this save{' '}
                      {verb(summary.notInSave, 'stays', 'stay')} as{' '}
                      {verb(summary.notInSave, 'it is', 'they are')}
                    </li>
                  )}
                  {(summary.secretParents > 0 || summary.secretLovers > 0) && (
                    <li>
                      <b>{summary.secretParents}</b> secret parents ·{' '}
                      <b>{summary.secretLovers}</b> secret lovers, marked with a lock
                    </li>
                  )}
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
                {starter && (
                  <span className="save-import__choice-note save-import__pick">
                    Picked for you: this board is still the starter roster.
                    Merging would keep its {summary.notInSave} premade{' '}
                    {sims(summary.notInSave)} your game doesn't have mixed in with
                    yours.
                  </span>
                )}
              </span>
            </label>
          </fieldset>
          {hasDetails && (
            <details className="save-import__details" onToggle={showOpened}>
              <summary>Households, worlds, packs, and skipped names</summary>
              {summary.rejoined.length > 0 && (
                <div className="save-import__meta">
                  <span className="save-import__meta-label">Rejoin their household</span>
                  <span className="save-import__meta-value">
                    {listPreview(summary.rejoined, 8)}
                  </span>
                </div>
              )}
              {summary.relatives.length + summary.relativesNamed.length > 0 && (
                <div className="save-import__meta">
                  <span className="save-import__meta-label">Family-tree relatives</span>
                  <span className="save-import__meta-value">
                    {listPreview([...summary.relativesNamed, ...summary.relatives], 8)}. The
                    game's family tree links them to your sims, though they are no sims
                    in your save: mostly ancestors who died long ago. Those the game
                    gives no name stay Unknown.
                  </span>
                </div>
              )}
              {summary.toNotInWorld.length > 0 && (
                <div className="save-import__meta">
                  <span className="save-import__meta-label">Move to Not in any world</span>
                  <span className="save-import__meta-value">
                    {listPreview(summary.toNotInWorld, 8)}. The game has them
                    Currently Not in World.
                  </span>
                </div>
              )}
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
                  <span className="save-import__meta-label">Games switched off</span>
                  <span className="save-import__meta-value">
                    {listPreview(summary.hidePacks, 8)}: no world from{' '}
                    {summary.hidePacks.length === 1 ? 'it' : 'them'} is in your save.
                    Switch back on anytime in Filters → Games.
                  </span>
                </div>
              )}
            </details>
          )}
        </div>
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
