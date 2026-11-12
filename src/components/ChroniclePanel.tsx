import { useMemo, useState } from 'react';
import { X } from '../icons.ts';
import { chronicleWhen, entryAbout, type ChronicleEntry } from '../lib/chronicle.ts';
import { recapTimeText } from '../lib/saveRecap.ts';
import { RecapStory } from './RecapPanel.tsx';

type Props = {
  entries: readonly ChronicleEntry[];
  /** Whose story: "the Goth dynasty", "Bella Goth"; the whole board's with null ids. */
  label: string;
  ids: readonly string[] | null;
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
export function ChroniclePanel({ entries, label, ids, onGoToSim, onShowAll, onClose }: Props) {
  const [query, setQuery] = useState('');
  const set = useMemo(() => (ids ? new Set(ids) : null), [ids]);
  const shown = useMemo(
    () => [...entries].reverse().map((e) => entryAbout(e, set, query)).filter((e): e is ChronicleEntry => !!e),
    [entries, set, query],
  );
  return (
    <section
      className="recap chron"
      role="dialog"
      aria-labelledby="chronHead"
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return;
        e.stopPropagation();
        if (query) setQuery('');
        else onClose();
      }}
    >
      <div className="recap__head">
        <div>
          <p className="recap__kicker">The story so far</p>
          <h2 id="chronHead">{ids ? `The story of ${label}` : 'Your story'}</h2>
          {ids && (
            <button type="button" className="recap__more" onClick={onShowAll}>
              The whole story
            </button>
          )}
        </div>
        <button type="button" className="recap__close" aria-label="Close" onClick={onClose}>
          <X aria-hidden="true" />
        </button>
      </div>
      {entries.length > 0 && (
        <input
          type="search"
          className="chron__search"
          value={query}
          placeholder="Find a name in the story"
          aria-label="Find a name in the story"
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => setQuery(e.target.value)}
        />
      )}
      <div className="recap__body">
        {!entries.length ? (
          <p className="chron__empty">
            Your story starts with your next save upload: each one adds what happened in your game since the one
            before.
          </p>
        ) : !shown.length ? (
          <p className="chron__empty">
            {query.trim() ? `Nothing in the story matches “${query.trim()}”.` : `Nothing has happened to ${label} in your uploads yet.`}
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
      </div>
    </section>
  );
}
