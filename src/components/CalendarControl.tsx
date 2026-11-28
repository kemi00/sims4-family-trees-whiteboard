import { useEffect, useId, useState } from 'react';
import { CalendarBlank } from '../icons.ts';
import { SettingRow } from './BoardSettingPanel.tsx';
import {
  MAX_DAYS_PER_YEAR,
  MIN_DAYS_PER_YEAR,
  calendarOn,
  calendarSummary,
  calendarYear,
  firstDayOfYear,
  parseYear,
  yearLabel,
} from '../lib/calendar.ts';
import { dayOf } from '../lib/lifeClock.ts';
import type { PlannerCalendar, SaveGameInfo } from '../types/whiteboard.ts';
import { ToggleRow } from './ToggleRow.tsx';

/** A decades playthrough's usual start: the Ultimate Decades Challenge begins in 1300. */
const SUGGESTED: PlannerCalendar = { startYear: 1300, daysPerYear: 4 };

/** "Day 5", "Day −3": a game day, before play counted below 1. */
function dayName(day: number): string {
  return `Day ${day < 0 ? `−${-day}` : day}`;
}

/**
 * Lengths of a year a player can pick at once: a sim day, then the save's
 * own season and the game's year of four seasons. Without Seasons, a sim
 * week stands in for them.
 */
function yearLengths(game: SaveGameInfo | null | undefined): { days: number; label: string }[] {
  const season = game && game.calendar !== 'days' ? game.seasonDays : undefined;
  if (season) {
    return [
      { days: 1, label: '1 day' },
      { days: season, label: `1 season · ${season}` },
      { days: season * 4, label: `4 seasons · ${season * 4}` },
    ];
  }
  return [
    { days: 1, label: '1 day' },
    { days: 4, label: '4 days' },
    { days: 7, label: 'A week · 7' },
  ];
}

/**
 * Three calendar years and the game days in each, around the save's day:
 * how the board turns days into years, at a glance.
 */
function YearRuler({ cal, today }: { cal: PlannerCalendar; today: number | null }) {
  const now = today === null ? cal.startYear : calendarYear(today, cal);
  const first = now <= cal.startYear ? now : now - 1;
  const years = [first, first + 1, first + 2];
  return (
    <ol className="calctl__ruler" aria-label="Game days in each year">
      {years.map((y) => {
        const from = firstDayOfYear(y, cal);
        const to = from + cal.daysPerYear - 1;
        const isNow = today !== null && y === now;
        return (
          <li key={y} className={isNow ? 'calctl__year calctl__year--now' : 'calctl__year'}>
            <b>{yearLabel(y)}</b>
            <span>{from === to ? dayName(from) : `${dayName(from)}–${to < 0 ? `−${-to}` : to}`}</span>
            {isNow && <em>Your save</em>}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * The board's calendar years: a switch, then which year Day 1 of the save
 * is and how many sim days make a year, greyed out while the switch is off.
 * Each change applies at once (a typed number when the box is left or on
 * Enter) and is one undo step. Turned off, the years are kept for next time.
 */
export function CalendarControl({
  calendar,
  onCalendar,
  game,
}: {
  calendar: PlannerCalendar | null;
  onCalendar: (cal: PlannerCalendar | null) => void;
  /** The last save read: its day for the ruler, its season for the year lengths. */
  game?: SaveGameInfo | null;
}) {
  const id = useId();
  const on = calendarOn(calendar);
  const base: PlannerCalendar = calendar ? { startYear: calendar.startYear, daysPerYear: calendar.daysPerYear } : SUGGESTED;
  const [start, setStart] = useState(yearLabel(base.startYear));
  const [days, setDays] = useState(String(base.daysPerYear));
  // Undo, or a board loaded, can change the calendar under the form.
  useEffect(() => {
    setStart(yearLabel(base.startYear));
    setDays(String(base.daysPerYear));
  }, [base.startYear, base.daysPerYear]);

  const typedYear = parseYear(start);
  const typedDays = /^\d+$/.test(days.trim()) ? Number(days.trim()) : NaN;
  const yearBad = typedYear === null || typedYear === undefined || Math.abs(typedYear) > 100_000;
  const daysBad = !Number.isInteger(typedDays) || typedDays < MIN_DAYS_PER_YEAR || typedDays > MAX_DAYS_PER_YEAR;
  const problem = yearBad
    ? 'The year needs a number, like 1300 or 45 BCE.'
    : daysBad
      ? `A year can last ${MIN_DAYS_PER_YEAR} to ${MAX_DAYS_PER_YEAR} sim days.`
      : null;
  /** What the ruler shows: the numbers being typed when they make sense, else the board's. */
  const shown: PlannerCalendar = {
    startYear: yearBad ? base.startYear : typedYear!,
    daysPerYear: daysBad ? base.daysPerYear : typedDays,
  };
  const today = game ? dayOf(game.clock) : null;

  const apply = (next: Partial<PlannerCalendar>) => {
    if (!on) return;
    onCalendar({ startYear: next.startYear ?? base.startYear, daysPerYear: next.daysPerYear ?? base.daysPerYear });
  };
  const applyYear = () => {
    if (!yearBad && typedYear !== base.startYear) apply({ startYear: typedYear! });
  };
  const applyDays = (n: number) => {
    const d = Math.min(MAX_DAYS_PER_YEAR, Math.max(MIN_DAYS_PER_YEAR, n));
    setDays(String(d));
    if (d !== base.daysPerYear) apply({ daysPerYear: d });
  };
  const lengths = yearLengths(game);

  return (
    <div className="calctl">
      <ToggleRow
        icon={CalendarBlank}
        label="Show calendar years"
        note={
          on
            ? `On. Cards and the story show years: Day 1 is ${yearLabel(base.startYear)}.`
            : 'Off. The board shows the game’s own days.'
        }
        on={on}
        onClick={() => onCalendar(on ? { ...base, off: true } : base)}
      />
      <p className="calctl__lead">
        For a decades or historical save. The game only counts days, so the board turns them into years you pick here.
        Your game and your save stay as they are.
      </p>
      <fieldset className="calctl__set" disabled={!on} aria-describedby={`${id}-note`}>
        <legend className="calctl__head">Your calendar</legend>
        <label className="calctl__field">
          <span>Day 1 of your save is the year</span>
          <input
            className="calctl__year-in"
            type="text"
            inputMode="text"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            onBlur={applyYear}
            onKeyDown={(e) => {
              if (e.key === 'Enter') applyYear();
            }}
            aria-invalid={yearBad}
          />
        </label>
        <div className="calctl__field">
          <span id={`${id}-days`}>A year lasts</span>
          <span className="calctl__days">
            <span className="hlstep">
              <button type="button" aria-label="A year lasts one sim day fewer" onClick={() => applyDays((daysBad ? base.daysPerYear : typedDays) - 1)}>
                −
              </button>
              <input
                type="text"
                inputMode="numeric"
                aria-labelledby={`${id}-days`}
                value={days}
                onChange={(e) => setDays(e.target.value)}
                onBlur={() => !daysBad && applyDays(typedDays)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !daysBad) applyDays(typedDays);
                }}
                aria-invalid={daysBad}
              />
              <button type="button" aria-label="A year lasts one sim day more" onClick={() => applyDays((daysBad ? base.daysPerYear : typedDays) + 1)}>
                +
              </button>
            </span>
            sim days
          </span>
        </div>
        <div className="calctl__picks" role="group" aria-label="Common lengths of a year">
          {lengths.map((l) => (
            <button key={l.days} type="button" aria-pressed={base.daysPerYear === l.days} onClick={() => applyDays(l.days)}>
              {l.label}
            </button>
          ))}
        </div>
        <YearRuler cal={shown} today={today} />
        <p id={`${id}-note`} className={problem ? 'calctl__note calctl__note--bad' : 'calctl__note'} aria-live="polite">
          {problem ??
            (today !== null
              ? `Your save is on ${dayName(today)}, so the board is in ${yearLabel(calendarYear(today, shown))}.`
              : `Day 1 of your save is ${yearLabel(shown.startYear)}.`)}
        </p>
      </fieldset>
      <div className="calctl__where">
        <div className="calctl__head">Where the years show</div>
        <ul>
          <li>
            Cards: <b>b. 1282</b>, or <b>1266–1299</b> once they pass away
          </li>
          <li>The Story, the look-back bar and posters</li>
          <li>The sim editor, where you can type a year for sims born or gone before your save</li>
        </ul>
      </div>
    </div>
  );
}

/** Calendar years summed up in one row, in Your save's On the board: on or off, and its years. */
export function CalendarRow({ calendar, onOpen }: { calendar: PlannerCalendar | null; onOpen: () => void }) {
  return <SettingRow icon={CalendarBlank} title="Calendar years" summary={calendarSummary(calendar)} onOpen={onOpen} />;
}
