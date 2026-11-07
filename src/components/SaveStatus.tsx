import { useEffect, useRef, useState } from 'react';
import { CalendarBlank, CaretUp } from '../icons.ts';
import { trackAction } from '../lib/analytics.ts';
import {
  agingSummary,
  clockText,
  dayOf,
  dayText,
  playedAgingText,
  saveChipText,
  yearOf,
  yearText,
} from '../lib/lifeClock.ts';
import type { SaveGameInfo } from '../types/whiteboard.ts';

/** "Nov 7, 12:10 AM" for when the board read the save. */
function readAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/**
 * What the board knows of the save it last read: the game time, then the
 * options that decide ages. Read only: they change in the game.
 */
export function SaveDetails({ game }: { game: SaveGameInfo }) {
  const day = dayOf(game.clock);
  const rows: [string, string][] = [
    ['Game time', `${clockText(game.clock)}${game.seasonDays ? ` · ${yearText(yearOf(day, game.seasonDays))}` : ''}`],
    ['Sim Lifespan', game.lifespan ?? 'Unknown'],
    [
      'Season Length',
      game.seasonDays ? `${game.seasonDays} days (a year is ${game.seasonDays * 4} days)` : 'Not in this save',
    ],
    ['Auto Age (Played)', playedAgingText(game.playedAging)],
    [
      'Auto Age (Unplayed)',
      game.unplayedAging === undefined ? 'Unknown' : game.unplayedAging ? 'On' : 'Off',
    ],
  ];
  if (game.activeHousehold) rows.push(['Active household', game.activeHousehold]);
  if (game.allAgingSince !== undefined) rows.push(['Everyone ages since', dayText(dayOf(game.allAgingSince))]);
  const who = agingSummary(game);
  const read = readAt(game.importedAt);
  return (
    <>
      <div className="pop__head">From your save</div>
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
    </>
  );
}

/**
 * The save's lifespan and season length in the status bar, beside Autosave:
 * status about the board, not an action, so it lives with the board's other
 * status rather than in the top bar. Opens the save details above it.
 */
export function SaveStatus({ game }: { game: SaveGameInfo }) {
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
        <CalendarBlank aria-hidden="true" />
        {saveChipText(game)}
        <CaretUp className="savestatus__caret" weight="bold" aria-hidden="true" />
      </button>
      {open && (
        <div className="pop pop--save savestatus__pop" role="dialog" aria-label="Your save">
          <SaveDetails game={game} />
        </div>
      )}
    </span>
  );
}
