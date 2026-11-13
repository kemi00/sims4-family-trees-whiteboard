import { useMemo, useState } from 'react';
import { chronicleWhen, entryAbout, type ChronicleEntry } from '../lib/chronicle.ts';
import { recapTimeText } from '../lib/saveRecap.ts';
import { BarPanel } from './BarPanel.tsx';
import { RecapStory } from './RecapPanel.tsx';

type Props = {
  entries: readonly ChronicleEntry[];
  /** Whose story: "the Goth dynasty", "Bella Goth"; the whole board's with null ids. */
  label: string;
  ids: readonly string[] | null;
  /** A dynasty's story: its key, for its prestige. */
  dynasties?: readonly string[];
  onGoToSim: (id: string) => void;
  /** Back to the whole story, from one sim's, household's or dynasty's. */
  onShowAll: () => void;
  onClose: () => void;
};

/** "12 Nov 2026": when an upload was read, in the reader's words. */
const uploaded = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

/**
 * The board's story, newest first: each save upload's game date and what
 * happened since the one before, back to where the story starts. Opened on
 * one sim's, household's or dynasty's story, it shows theirs only, with
 * the whole story a click away. A search narrows it to names.
 */
export function ChroniclePanel({ entries, label, ids, dynasties, onGoToSim, onShowAll, onClose }: Props) {
  const [query, setQuery] = useState('');
  const set = useMemo(() => (ids ? new Set(ids) : null), [ids]);
  const keys = useMemo(() => new Set(dynasties ?? []), [dynasties]);
  const shown = useMemo(
    () => [...entries].reverse().map((e) => entryAbout(e, set, query, keys)).filter((e): e is ChronicleEntry => !!e),
    [entries, set, query, keys],
  );
  return (
    <BarPanel
      id="story"
      className="chron"
      title={ids ? `The story of ${label}` : 'Story'}
      description={
        ids ? (
          <>
            What happened to them, save by save.{' '}
            <button type="button" className="barpanel__link" onClick={onShowAll}>
              The whole story
            </button>
          </>
        ) : (
          'What happened in your game, save by save'
        )
      }
      onClose={onClose}
      tools={
        entries.length > 0 && (
          <input
            type="search"
            className="barpanel__search"
            value={query}
            placeholder="Find a name in the story"
            aria-label="Find a name in the story"
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              // Esc clears the search first, then closes the panel.
              if (e.key === 'Escape' && query) {
                e.stopPropagation();
                setQuery('');
              }
            }}
          />
        )
      }
    >
        {!entries.length ? (
          <p className="chron__empty">
            Your story starts the next time you upload your save: each save you upload adds what happened in your game
            since the one before.
          </p>
        ) : !shown.length ? (
          <p className="chron__empty">
            {query.trim() ? `Nothing in the story matches “${query.trim()}”.` : `Nothing has happened to ${label} in your saves yet.`}
          </p>
        ) : (
          shown.map((e) => {
            const time = e.recap ? recapTimeText(e.recap.days) : null;
            return (
              <article key={e.at} className="chron__entry">
                <h3 className="chron__when">{chronicleWhen(e)}</h3>
                <p className="chron__meta">
                  {[time ? `${time[0]!.toUpperCase()}${time.slice(1)}` : '', e.recap?.seasons ? `${e.recap.seasons.to} arrived` : '', `uploaded ${uploaded(e.at)}`]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                {e.start && (
                  <p className="chron__start">
                    The story starts: {e.start.sims === 1 ? '1 sim' : `${e.start.sims} sims`} in{' '}
                    {e.start.households === 1 ? '1 household' : `${e.start.households} households`}.
                  </p>
                )}
                {e.recap && <RecapStory recap={e.recap} onGoToSim={onGoToSim} />}
                {e.recap && e.recap.plansDone > 0 && (
                  <p className="chron__plans">
                    <span className="recap__done recap__done--big">
                      ✨ {e.recap.plansDone === 1 ? '1 plan came true' : `${e.recap.plansDone} plans came true`}
                    </span>
                  </p>
                )}
              </article>
            );
          })
        )}
    </BarPanel>
  );
}
