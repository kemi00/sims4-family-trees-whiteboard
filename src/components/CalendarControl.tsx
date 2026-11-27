import { useEffect, useId, useState } from 'react';
import { MAX_DAYS_PER_YEAR, MIN_DAYS_PER_YEAR, calendarYear, validCalendar, yearLabel } from '../lib/calendar.ts';
import { dayOf } from '../lib/lifeClock.ts';
import type { PlannerCalendar, SaveGameInfo } from '../types/whiteboard.ts';

/** A decades playthrough's usual start: the Ultimate Decades Challenge begins in 1300. */
const SUGGESTED: PlannerCalendar = { startYear: 1300, daysPerYear: 4 };

/**
 * The board's calendar years: which year Day 1 of the save is, and how many
 * sim days make a year. Off, the board counts the game's days as before.
 * Typed numbers apply on Use; a year that makes no sense says why.
 */
export function CalendarControl({
  calendar,
  onCalendar,
  game,
}: {
  calendar: PlannerCalendar | null;
  onCalendar: (cal: PlannerCalendar | null) => void;
  /** The last save read: for "Your save is now in 1309". */
  game?: SaveGameInfo | null;
}) {
  const id = useId();
  const shown = calendar ?? SUGGESTED;
  const [start, setStart] = useState(String(shown.startYear));
  const [days, setDays] = useState(String(shown.daysPerYear));
  // Undo, or a board loaded, can change the calendar under the form.
  useEffect(() => {
    setStart(String((calendar ?? SUGGESTED).startYear));
    setDays(String((calendar ?? SUGGESTED).daysPerYear));
  }, [calendar]);
  const typed = validCalendar({ startYear: Number(start.trim()), daysPerYear: Number(days.trim()) });
  const changed = !!typed && (!calendar || typed.startYear !== calendar.startYear || typed.daysPerYear !== calendar.daysPerYear);
  const today = game ? dayOf(game.clock) : null;
  const problem =
    start.trim() === '' || !Number.isInteger(Number(start.trim()))
      ? 'The year needs a whole number, like 1300.'
      : days.trim() === '' || !Number.isInteger(Number(days.trim()))
        ? 'Days a year needs a whole number, like 4.'
        : !typed
          ? `A year can be ${MIN_DAYS_PER_YEAR} to ${MAX_DAYS_PER_YEAR} sim days long.`
          : null;
  return (
    <div className="calctl" role="group" aria-labelledby={`${id}-head`}>
      <div className="calctl__head">
        <span id={`${id}-head`} className="calctl__label">
          Calendar years
        </span>
        <span className={calendar ? 'calctl__state calctl__state--on' : 'calctl__state'}>{calendar ? 'On' : 'Off'}</span>
      </div>
      <p className="calctl__lead">
        For a decades or historical save: cards, the story and posters show years like 1282–1299 instead of game days.
      </p>
      <div className="calctl__fields">
        <label className="calctl__field">
          <span>Day 1 of your save is the year</span>
          <input
            type="text"
            inputMode="numeric"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && typed) onCalendar(typed);
            }}
            aria-invalid={!!problem && problem.startsWith('The year')}
          />
        </label>
        <label className="calctl__field">
          <span>A year passes every</span>
          <span className="calctl__days">
            <input
              type="text"
              inputMode="numeric"
              value={days}
              onChange={(e) => setDays(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && typed) onCalendar(typed);
              }}
              aria-invalid={!!problem && !problem.startsWith('The year')}
            />
            sim days
          </span>
        </label>
      </div>
      <p className={problem ? 'calctl__note calctl__note--bad' : 'calctl__note'} aria-live="polite">
        {problem ??
          (typed
            ? `Day 1 → ${yearLabel(typed.startYear)} · Day ${1 + typed.daysPerYear} → ${yearLabel(typed.startYear + 1)}${
                today !== null ? ` · your save now: ${yearLabel(calendarYear(today, typed))}` : ''
              }`
            : '')}
      </p>
      <div className="calctl__actions">
        <button type="button" className="calctl__btn calctl__btn--primary" disabled={!typed || (!changed && !!calendar)} onClick={() => typed && onCalendar(typed)}>
          {calendar ? 'Use these years' : 'Turn on'}
        </button>
        {calendar && (
          <button type="button" className="calctl__btn" onClick={() => onCalendar(null)}>
            Turn off
          </button>
        )}
      </div>
    </div>
  );
}
