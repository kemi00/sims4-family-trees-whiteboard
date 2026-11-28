import type { ReactNode } from 'react';
import type { PlannerCalendar } from '../types/whiteboard.ts';
import { useMemo, useState } from 'react';
import { entryAbout, storyDays, type ChronicleEntry } from '../lib/chronicle.ts';
import { recapTimeText } from '../lib/saveRecap.ts';
import { BarPanel } from './BarPanel.tsx';
import { RecapStory } from './RecapPanel.tsx';

type Props = {
  /** Tabs over the panel (PanelTabs): the other pages of its place. */
  tabs?: ReactNode;
  entries: readonly ChronicleEntry[];
  /** Whose story: "the Goth dynasty", "Bella Goth"; the whole board's with null ids. */
  label: string;
  ids: readonly string[] | null;
  /** A dynasty's story: its key, for its prestige. */
  dynasties?: readonly string[];
  onGoToSim: (id: string) => void;
  onClose: () => void;
  /** The board's calendar years, for each day's heading. */
  calendar?: PlannerCalendar | null;
};

/** "12 Nov 2026": when an upload was read, in the reader's words. */
const uploaded = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

/** "Thebe household" for "the Thebe household": whose story, on its switch. */
const scopeName = (label: string) => {
  const name = label.replace(/^the /, '');
  return `${name.charAt(0).toUpperCase()}${name.slice(1)}`;
};

/** "Nov 13", "Nov 13 and Nov 18", "Nov 13, Nov 14 and Nov 18". */
const inWords = (list: readonly string[]) =>
  list.length < 2 ? (list[0] ?? '') : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;

/**
 * The board's story, newest first: each day of the game a save was
 * uploaded on, and what happened by then, back to where the story starts.
 * Uploads on the same day of the game are one day. Opened on
 * one sim's, household's or dynasty's story, it shows theirs, with a
 * switch to everyone's and back. A search narrows it to names.
 */
export function ChroniclePanel({ entries, label, ids, dynasties, onGoToSim, onClose, calendar = null, tabs }: Props) {
  const [query, setQuery] = useState('');
  /** Opened on someone's story: theirs, or everyone's, a switch either way. */
  const [everyone, setEveryone] = useState(false);
  /** The one list open in the whole story, across its days: opening one closes the other. */
  const [openFold, setOpenFold] = useState<string | null>(null);
  const theirs = !!ids && !everyone;
  const set = useMemo(() => (ids && !everyone ? new Set(ids) : null), [ids, everyone]);
  const keys = useMemo(() => new Set(dynasties ?? []), [dynasties]);
  const shown = useMemo(
    () => [...entries].reverse().map((e) => entryAbout(e, set, query, keys)).filter((e): e is ChronicleEntry => !!e),
    [entries, set, query, keys],
  );
  const days = useMemo(() => storyDays(shown, calendar), [shown, calendar]);
  return (
    <BarPanel
      id="story"
      tabs={tabs}
      className="chron"
      title={theirs ? `The story of ${label}` : 'Story'}
      description={theirs ? 'What happened to them, save by save.' : 'What happened in your game, save by save'}
      onClose={onClose}
      tools={
        entries.length > 0 && (
          <>
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
          {ids && (
            <div className="seg" role="group" aria-label="Whose story">
              <button type="button" className="seg__opt" aria-pressed={!everyone} onClick={() => setEveryone(false)}>
                {scopeName(label)}
              </button>
              <button type="button" className="seg__opt" aria-pressed={everyone} onClick={() => setEveryone(true)}>
                Everyone
              </button>
            </div>
          )}
          </>
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
            {query.trim()
              ? `Nothing in the story matches “${query.trim()}”.`
              : theirs
                ? `Nothing has happened to ${label} in your saves yet.`
                : 'Nothing has happened in your saves yet.'}
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
            // How many the story starts with: the whole board's, so not in one household's story.
            const start = theirs ? undefined : told.find((e) => e.start)?.start;
            const meta = [
              time ? `${time[0]!.toUpperCase()}${time.slice(1)}` : '',
              seasons ? `${seasons.to} arrived` : '',
              told.length > 1 ? `${told.length} uploads, ${inWords(dates)}` : `uploaded ${dates[0] ?? ''}`,
              plans ? (plans === 1 ? '1 plan came true' : `${plans} plans came true`) : '',
            ].filter(Boolean);
            if (day.remembered) {
              return (
                <article key={`first${day.entries[0]!.at}`} className="chron__entry chron__entry--first">
                  <h3 className="chron__when">
                    {day.when} <span className="chron__tag">From your save</span>
                  </h3>
                  <p className="chron__meta">
                    Your save keeps the day of each birth from a pregnancy. Everything else it remembers without a
                    date.
                  </p>
                  {start && (
                    <p className="chron__start">
                      Your save started the story with {start.sims === 1 ? '1 sim' : `${start.sims} sims`} in{' '}
                      {start.households === 1 ? '1 household' : `${start.households} households`}.
                    </p>
                  )}
                  {recaps.length > 0 && (
                    <RecapStory
                      recaps={recaps}
                      onGoToSim={onGoToSim}
                      focus={set}
                      openFold={openFold}
                      onOpenFold={setOpenFold}
                      foldScope={day.entries[0]!.at}
                    />
                  )}
                  {days.length === 1 && <p className="chron__next">Your next upload carries the story on from here.</p>}
                </article>
              );
            }
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
                {recaps.length > 0 && (
                  <RecapStory
                    recaps={recaps}
                    onGoToSim={onGoToSim}
                    focus={set}
                    openFold={openFold}
                    onOpenFold={setOpenFold}
                    foldScope={day.entries[0]!.at}
                  />
                )}
              </article>
            );
          })
        )}
    </BarPanel>
  );
}
