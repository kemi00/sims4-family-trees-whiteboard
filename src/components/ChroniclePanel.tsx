import { useMemo, useState } from 'react';
import { entryAbout, storyDays, type ChronicleEntry } from '../lib/chronicle.ts';
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

/** "Nov 13", "Nov 13 and Nov 18", "Nov 13, Nov 14 and Nov 18". */
const inWords = (list: readonly string[]) =>
  list.length < 2 ? (list[0] ?? '') : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;

/**
 * The board's story, newest first: each day of the game a save was
 * uploaded on, and what happened by then, back to where the story starts.
 * Uploads on the same day of the game are one day. Opened on
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
  const days = useMemo(() => storyDays(shown), [shown]);
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
          days.map((day) => {
            const told = [...day.entries].reverse();
            const recaps = told.flatMap((e) => (e.recap ? [e.recap] : []));
            const played = recaps.map((r) => r.days).filter((d): d is number => d !== null);
            const time = played.length ? recapTimeText(played.reduce((sum, d) => sum + d, 0)) : null;
            const seasons = recaps.map((r) => r.seasons).filter(Boolean).at(-1);
            const plans = recaps.reduce((sum, r) => sum + r.plansDone, 0);
            const dates = [...new Set(told.map((e) => uploaded(e.at)).filter(Boolean))];
            const start = told.find((e) => e.start)?.start;
            const meta = [
              time ? `${time[0]!.toUpperCase()}${time.slice(1)}` : '',
              seasons ? `${seasons.to} arrived` : '',
              told.length > 1 ? `${told.length} uploads, ${inWords(dates)}` : `uploaded ${dates[0] ?? ''}`,
              plans ? (plans === 1 ? '1 plan came true' : `${plans} plans came true`) : '',
            ].filter(Boolean);
            return (
              <article key={day.entries[0]!.at} className="chron__entry">
                <h3 className="chron__when">{day.when}</h3>
                <p className="chron__meta">{meta.join(' · ')}</p>
                {start && (
                  <p className="chron__start">
                    The story starts: {start.sims === 1 ? '1 sim' : `${start.sims} sims`} in{' '}
                    {start.households === 1 ? '1 household' : `${start.households} households`}.
                  </p>
                )}
                {recaps.length > 0 && <RecapStory recaps={recaps} onGoToSim={onGoToSim} focus={set} />}
              </article>
            );
          })
        )}
    </BarPanel>
  );
}
