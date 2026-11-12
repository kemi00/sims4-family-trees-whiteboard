import { useState, type SyntheticEvent } from 'react';
import { agingSummary, clockText } from '../lib/lifeClock.ts';
import {
  AUTO_MATCH_KEY,
  effectiveMatches,
  initialPlanChoices,
  readAutoMatch,
  sureMatches,
  type PlanChoices,
  type SavePlanReview,
} from '../lib/planReview.ts';
import type { SaveMergeSummary } from '../lib/savegame/mergeSave.ts';
import type { SaveGameInfo } from '../types/whiteboard.ts';
import { PlanReview } from './PlanReview.tsx';

type Props = {
  summary: SaveMergeSummary;
  /** The save's clock and aging options, when it has a clock. */
  game?: SaveGameInfo | null;
  /** The board is still the starter roster (see isStarterBoard): Replace is picked. */
  starter: boolean;
  /** Nothing on it is arranged yet (isUntouchedStarter): Merge lays it out afresh. */
  fresh?: boolean;
  /** Your plan against this save: Merge reviews it first when there is anything to. */
  plan: SavePlanReview;
  /** The board's planned links and planned sims, which Replace drops. */
  planned: { links: number; sims: number };
  /** Uploads in the board's story (the chronicle): Replace asks whether it goes on. */
  story?: number;
  onMerge: (choices?: PlanChoices) => void;
  /** `keepStory`: the board's story goes on, this save its next page. */
  onReplace: (keepStory: boolean) => void;
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
  game,
  starter,
  fresh,
  plan,
  planned,
  story = 0,
  onMerge,
  onReplace,
  onCancel,
}: Props) {
  const [mode, setMode] = useState<'merge' | 'replace'>(starter ? 'replace' : 'merge');
  /** Replace keeps the story by default: a newer save of the same game. */
  const [keepStory, setKeepStory] = useState(true);
  /** Merge has a second step when the save fills planned sims or goes against the plan. */
  const reviewable = plan.suggestions.length > 0 || plan.conflicts.length > 0;
  const [step, setStep] = useState<'choose' | 'plan'>('choose');
  const [auto, setAutoState] = useState(readAutoMatch);
  const [choices, setChoices] = useState<PlanChoices>(() => initialPlanChoices(plan, auto));
  const setAuto = (on: boolean) => {
    setAutoState(on);
    try {
      localStorage.setItem(AUTO_MATCH_KEY, on ? '1' : '0');
    } catch {
      // Private mode: it is forgotten when the page closes.
    }
    // Sure matches go in or out; a pick you made yourself stays.
    const sure = sureMatches(plan, choices.resolve);
    const matches = { ...choices.matches };
    for (const [slot, save] of Object.entries(sure)) {
      if (on && !matches[slot]) matches[slot] = save;
      if (!on && matches[slot] === save) delete matches[slot];
    }
    setChoices({ ...choices, matches });
  };
  const hasDetails =
    summary.rejoined.length > 0 ||
    summary.relatives.length > 0 ||
    summary.relativesNamed.length > 0 ||
    summary.relativesDied.length > 0 ||
    summary.ownSurnames.length > 0 ||
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
        <h2 id="save-import-title">Open your save</h2>
        {step === 'plan' ? (
          <p>
            Step 2 of 2 · <b>Your plan</b>: how your plan meets this save. Nothing changes until
            you press Proceed.
          </p>
        ) : (
          <p>
            Choose how this save meets the board.
            {reviewable && mode === 'merge' ? ' Next, you’ll review your plan.' : ''}
          </p>
        )}
        {step === 'choose' && game && (
          <p className="save-import__game">
            This save: <b>{clockText(game.clock)}</b>
            {game.lifespan && (
              <>
                {' · '}
                <b>{game.lifespan}</b> lifespan
              </>
            )}
            {game.seasonDays && (
              <>
                {' · '}
                <b>{game.seasonDays}-day</b> seasons
              </>
            )}
            {agingSummary(game) && <> · {agingSummary(game)}</>}.
          </p>
        )}
        {step === 'choose' && summary.gameChanges.length > 0 && (
          <div className="save-import__game save-import__game--changed">
            Changed in Game Options since your last import:
            <ul>
              {summary.gameChanges.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
            Days to the next life stage follow the new options.
          </div>
        )}
        {step === 'choose' && game?.allAgingSince !== undefined && game.allAgingSince === game.clock && (
          <p className="save-import__game save-import__game--changed">
            Every household ages from here: sims at the same place in life now grow older together.
          </p>
        )}
        {/* Scrolls on its own, so the title and Proceed stay in view. */}
        {step === 'plan' ? (
          <div className="save-import__body">
            <PlanReview
              plan={plan}
              choices={choices}
              auto={auto}
              onAuto={setAuto}
              onChange={setChoices}
            />
          </div>
        ) : (
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
                  {fresh && ' Nothing here is arranged yet, so the board is laid out afresh.'}
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
                  {summary.relativesDied.length > 0 && (
                    <li>
                      <b>{summary.relativesDied.length}</b>{' '}
                      {verb(summary.relativesDied.length, 'relative', 'relatives')} from the family
                      tree {verb(summary.relativesDied.length, 'is', 'are')} now marked deceased:{' '}
                      {listPreview(summary.relativesDied, 4)}
                    </li>
                  )}
                  {summary.ownSurnames.length > 0 && (
                    <li>
                      <b>{summary.ownSurnames.length}</b> married{' '}
                      {sims(summary.ownSurnames.length)}{' '}
                      {verb(summary.ownSurnames.length, 'keeps', 'keep')} their own surname,
                      not their spouse's
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
                  {summary.adoptions > 0 && (
                    <li>
                      <b>{summary.adoptions}</b> {summary.adoptions === 1 ? 'adopted child' : 'adopted children'},
                      marked “adopted” on their link
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
                {story > 0 && mode === 'replace' && (
                  <label className="save-import__keep">
                    <input type="checkbox" checked={keepStory} onChange={(e) => setKeepStory(e.target.checked)} />
                    <span>
                      Keep the board’s story ({story === 1 ? '1 save' : `${story} saves`}): this save is its next
                      page. Untick for a different game, to start a new story.
                    </span>
                  </label>
                )}
                {planned.links + planned.sims > 0 && (
                  <span className="save-import__choice-note planrev__drops">
                    Drops your plan: {planned.links} planned{' '}
                    {planned.links === 1 ? 'link' : 'links'}
                    {planned.sims > 0
                      ? ` and ${planned.sims} planned ${sims(planned.sims)}`
                      : ''}
                    . Merge keeps them.
                  </span>
                )}
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
              {summary.ownSurnames.length > 0 && (
                <div className="save-import__meta">
                  <span className="save-import__meta-label">Own surnames kept</span>
                  <span className="save-import__meta-value">
                    {listPreview(
                      summary.ownSurnames.map((s) => `${s.name} (${s.married} in the game)`),
                      8,
                    )}
                    . The game gives them their spouse's surname; a sim's card shows the
                    married name once you type it there.
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
        )}
        <div className="save-import__actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          {step === 'plan' && (
            <button type="button" onClick={() => setStep('choose')}>
              Back
            </button>
          )}
          <button
            type="button"
            className="save-import__ok"
            onClick={() => {
              if (mode === 'replace') onReplace(story > 0 && keepStory);
              else if (step === 'choose' && reviewable) setStep('plan');
              else onMerge(step === 'plan' ? { ...choices, matches: effectiveMatches(plan, choices) } : undefined);
            }}
          >
            {mode === 'merge' && step === 'choose' && reviewable ? 'Next: your plan' : 'Proceed'}
          </button>
        </div>
      </div>
    </div>
  );
}
