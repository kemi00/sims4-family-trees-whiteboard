import { useEffect, useRef, useState } from 'react';
import { CalendarBlank, CaretUp, Flower, Leaf, Snowflake, Sun } from '../icons.ts';
import { HouseholdLimitControl } from './HouseholdLimitControl.tsx';
import { trackAction } from '../lib/analytics.ts';
import {
  agingSummary,
  clockText,
  dayOf,
  dayText,
  playedAgingText,
  saveChipText,
  seasonNow,
  yearOf,
  yearText,
} from '../lib/lifeClock.ts';
import type { PlannerCalendar, SaveGameInfo } from '../types/whiteboard.ts';
import { CalendarControl } from './CalendarControl.tsx';

/** "Nov 7, 12:10 AM" for when the board read the save. */
function readAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** The calendar's rows: the season and when the next begins, or days alone without Seasons. */
function seasonRows(game: SaveGameInfo): [string, string][] {
  const s = seasonNow(game);
  if (s) {
    return [
      ['Season', `${s.season}, day ${s.day} of ${s.of}`],
      ['Next', `${s.next} in ${s.nextIn === 1 ? '1 day' : `${s.nextIn} days`}`],
      ['Season Length', `${s.of} days (a year is ${s.of * 4} days)`],
    ];
  }
  if (game.calendar === 'days') return [['Calendar', 'Days only: no Seasons in this save']];
  return [['Season Length', game.seasonDays ? `${game.seasonDays} days (a year is ${game.seasonDays * 4} days)` : 'Not in this save']];
}

/** The chip's icon: the season's, or a calendar without Seasons. */
const SEASON_ICON = { Spring: Flower, Summer: Sun, Fall: Leaf, Winter: Snowflake } as const;

/**
 * What the board knows of the save it last read: the game time, then the
 * options that decide ages. Read only: they change in the game.
 */
export function SaveDetails({
  game,
  onRecap,
  onStory,
  limit,
  onLimit,
  calendar,
  onCalendar,
}: {
  game: SaveGameInfo;
  onRecap?: () => void;
  onStory?: () => void;
  /** The household limit the board warns past: a game rule a mod may change, so the player sets it here. */
  limit?: number | null;
  onLimit?: (n: number | null) => void;
  /** The board's calendar years (CalendarControl). */
  calendar?: PlannerCalendar | null;
  onCalendar?: (cal: PlannerCalendar | null) => void;
}) {
  const day = dayOf(game.clock);
  const rows: [string, string][] = [
    ['Game time', `${clockText(game.clock)}${game.seasonDays ? ` · ${yearText(yearOf(day, game.seasonDays))}` : ''}`],
    ['Sim Lifespan', game.lifespan ?? 'Unknown'],
    ...seasonRows(game),
    ['Auto Age (Played)', playedAgingText(game.playedAging)],
    [
      'Auto Age (Unplayed)',
      game.unplayedAging === undefined ? 'Unknown' : game.unplayedAging ? 'On' : 'Off',
    ],
  ];
  // Where the player was when the game saved: maybe not who they play next.
  if (game.activeHousehold) rows.push(['Last played', game.activeHousehold]);
  if (game.allAgingSince !== undefined) rows.push(['Everyone ages since', dayText(dayOf(game.allAgingSince))]);
  const who = agingSummary(game);
  const read = readAt(game.importedAt);
  return (
    <>
      <div className="pop__head">From your save</div>
      {onRecap && (
        <button type="button" className="savechip__recap" onClick={onRecap}>
          ✨ What happened since your last save
        </button>
      )}
      {onStory && (
        <button type="button" className="savechip__recap" onClick={onStory}>
          📖 Your story so far
        </button>
      )}
      <dl className="savechip__list">
        {rows.map(([k, v]) => (
          <div key={k} className="savechip__row">
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <p className="savechip__note">
        {who ? `In this save ${who}. ` : ''}Ages in the sim editor come from{' '}
        {game.fileName ?? 'this save'}
        {read ? `, read ${read}` : ''}. To change these options, use Game Options in the game,
        then load the save again.
      </p>
      {onLimit && (
        <div className="savechip__board">
          <div className="pop__head">On the board</div>
          <HouseholdLimitControl limit={limit ?? null} onLimit={onLimit} />
          <p className="savechip__note">
            The board warns when a household has more sims and pets than this. Raised it with a mod like MCCC? Set its
            number.
          </p>
        </div>
      )}
      {onCalendar && (
        <div className="savechip__board">
          <CalendarControl calendar={calendar ?? null} onCalendar={onCalendar} game={game} />
        </div>
      )}
    </>
  );
}

/**
 * The save's lifespan and season length in the status bar, beside Autosave:
 * status about the board, not an action, so it lives with the board's other
 * status rather than in the top bar. Opens the save details above it.
 */
export function SaveStatus({
  game,
  onRecap,
  onStory,
  limit,
  onLimit,
  calendar,
  onCalendar,
}: {
  game: SaveGameInfo;
  onRecap?: () => void;
  onStory?: () => void;
  limit?: number | null;
  onLimit?: (n: number | null) => void;
  calendar?: PlannerCalendar | null;
  onCalendar?: (cal: PlannerCalendar | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const onPointer = (ev: PointerEvent) => {
      if (!ref.current?.contains(ev.target as Node)) setOpen(false);
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape') return;
      ev.stopPropagation();
      setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onPointer, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);
  return (
    <span className="savestatus" ref={ref}>
      <button
        type="button"
        className="savestatus__btn"
        title={`Your save: ${clockText(game.clock)}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          if (!open) trackAction('/action/save-details');
          setOpen(!open);
        }}
      >
        {(() => {
          const Icon = game.season && game.calendar === 'seasons' ? SEASON_ICON[game.season] : CalendarBlank;
          return <Icon aria-hidden="true" className={game.season ? `savestatus__season savestatus__season--${game.season.toLowerCase()}` : undefined} />;
        })()}
        {saveChipText(game)}
        <CaretUp className="savestatus__caret" weight="bold" aria-hidden="true" />
      </button>
      {open && (
        <div className="pop pop--save savestatus__pop" role="dialog" aria-label="Your save">
          <SaveDetails
            game={game}
            {...(onLimit ? { limit: limit ?? null, onLimit } : {})}
            {...(onCalendar ? { calendar: calendar ?? null, onCalendar } : {})}
            {...(onRecap
              ? {
                  onRecap: () => {
                    setOpen(false);
                    onRecap();
                  },
                }
              : {})}
            {...(onStory
              ? {
                  onStory: () => {
                    setOpen(false);
                    onStory();
                  },
                }
              : {})}
          />
        </div>
      )}
    </span>
  );
}
