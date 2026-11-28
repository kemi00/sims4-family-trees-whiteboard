import { useState } from 'react';
import { Trash } from '../icons.ts';
import { calendarYear, dayWithYear, firstDayOfYear, parseYear, yearLabel } from '../lib/calendar.ts';
import { titleSource, titleText } from '../lib/titles.ts';
import type { PlannerCalendar, SimTitle } from '../types/whiteboard.ts';

/** A day or year as typed: a game day without a calendar, a calendar year (its first day) with one. */
function parseWhen(text: string, calendar: PlannerCalendar | null): number | null | undefined {
  const t = text.trim();
  if (!t) return undefined;
  if (calendar) {
    const year = parseYear(t);
    return year === null || year === undefined ? year : firstDayOfYear(year, calendar);
  }
  const day = /^(?:day\s*)?(-?\d{1,6})$/i.exec(t);
  return day ? Number(day[1]) : null;
}

/**
 * A sim's titles, in the editor: the game's noble titles from the save, which
 * the next upload keeps current, and your own, in your words, with a rank to
 * order them and when each began and ended. The card shows the highest
 * title held now. Changes wait for Save, like the rest of the editor.
 */
export function SimTitles({
  titles,
  onChange,
  calendar,
  nameOf,
}: {
  titles: readonly SimTitle[];
  onChange: (next: SimTitle[]) => void;
  /** The board's calendar, when on: dates are typed and shown as years. */
  calendar: PlannerCalendar | null;
  nameOf: (id: string) => string | undefined;
}) {
  const [title, setTitle] = useState('');
  const [realm, setRealm] = useState('');
  const [rank, setRank] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  /** The form opens from "Add a title": most sims have none, and it would crowd the editor. */
  const [adding, setAdding] = useState(false);
  const rankTyped = rank.trim() === '' ? undefined : /^\d{1,3}$/.test(rank.trim()) ? Number(rank.trim()) : null;
  const fromTyped = parseWhen(from, calendar);
  const toTyped = parseWhen(to, calendar);
  const backwards = typeof fromTyped === 'number' && typeof toTyped === 'number' && toTyped < fromTyped;
  const ok = !!title.trim() && rankTyped !== null && fromTyped !== null && toTyped !== null && !backwards;
  const when = (day: number) => (calendar ? yearLabel(calendarYear(day, calendar)) : dayWithYear(day, null));
  const add = () => {
    if (!ok) return;
    onChange([
      ...titles,
      {
        title: title.trim(),
        ...(realm.trim() ? { realm: realm.trim() } : {}),
        ...(rankTyped !== undefined ? { rank: rankTyped } : {}),
        ...(fromTyped !== undefined ? { from: fromTyped } : {}),
        ...(toTyped !== undefined ? { to: toTyped } : {}),
      },
    ]);
    setTitle('');
    setRealm('');
    setRank('');
    setFrom('');
    setTo('');
    setAdding(false);
  };
  const unit = calendar ? 'year' : 'day';
  return (
    <section className="edtitles" aria-labelledby="edTitlesHead">
      <div className="edlabel">
        <span className="edlabel__text" id="edTitlesHead">
          {titles.length ? `Titles · ${titles.length}` : 'Titles'}
        </span>
        {!adding && (
          <button type="button" className="edlink edtitles__open" onClick={() => setAdding(true)}>
            Add a title
          </button>
        )}
      </div>
      {titles.length > 0 && (
        <ul className="edtitles__list">
          {titles.map((t, i) => {
            const source = titleSource(t, nameOf);
            const span =
              t.from !== undefined && t.to !== undefined
                ? `${when(t.from)} to ${when(t.to)}`
                : t.from !== undefined
                  ? `since ${when(t.from)}`
                  : t.to !== undefined
                    ? `until ${when(t.to)}`
                    : '';
            return (
              <li key={i} className={t.to !== undefined ? 'edtitles__item edtitles__item--past' : 'edtitles__item'}>
                <span className="edtitles__text">
                  <span className="edtitles__name">{titleText(t)}</span>
                  <span className="edtitles__meta">{[t.game ? `${source} · from your save` : source, span].filter(Boolean).join(' · ')}</span>
                </span>
                {t.game ? null : (
                  <button
                    type="button"
                    className="edtitles__bin"
                    aria-label={`Remove the title ${titleText(t)}`}
                    title="Remove this title. Cancel keeps it."
                    onClick={() => onChange(titles.filter((_, j) => j !== i))}
                  >
                    <Trash aria-hidden="true" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {adding && (
      <div className="edtitles__form" role="group" aria-label="Add a title">
        <div className="edtitles__row">
          <label className="edtitles__field edtitles__field--wide">
            <span>Title</span>
            <input type="text" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())} />
          </label>
          <label className="edtitles__field edtitles__field--wide">
            <span>Of (optional)</span>
            <input type="text" value={realm} onChange={(e) => setRealm(e.target.value)} />
          </label>
        </div>
        <div className="edtitles__row">
          <label className="edtitles__field">
            <span>Rank</span>
            <input type="text" inputMode="numeric" value={rank} aria-invalid={rankTyped === null} onChange={(e) => setRank(e.target.value)} />
          </label>
          <label className="edtitles__field">
            <span>{`From (${unit})`}</span>
            <input type="text" inputMode={calendar ? 'text' : 'numeric'} value={from} aria-invalid={fromTyped === null || backwards} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="edtitles__field">
            <span>{`To (${unit})`}</span>
            <input type="text" inputMode={calendar ? 'text' : 'numeric'} value={to} aria-invalid={toTyped === null || backwards} onChange={(e) => setTo(e.target.value)} />
          </label>
        </div>
        <div className="edtitles__row edtitles__row--end">
          <button type="button" className="edtitles__cancel" onClick={() => setAdding(false)}>
            Cancel
          </button>
          <button type="button" className="edtitles__add" disabled={!ok} onClick={add}>
            Add title
          </button>
        </div>
        <p className="edhint">
          A higher rank outranks a lower one, and the card shows the highest title held now; the game’s noble ranks
          run from 1, Knight or Dame, to 10, King or Queen. Leave To empty for a title still held.
        </p>
      </div>
      )}
    </section>
  );
}
