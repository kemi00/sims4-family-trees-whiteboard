import { useState } from 'react';
import { Trash } from '../icons.ts';
import { calendarYear, dayWithYear, firstDayOfYear, parseYear, yearLabel } from '../lib/calendar.ts';
import { TOP_NOBLE_RANK, nobleTitle, titleSource, titleText } from '../lib/titles.ts';
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
 * the next upload keeps current; a noble title in your plan (a rank, worded
 * for their gender as the game does), shown as a plan until your save gives
 * it; and titles of your own, in your words, only on the board. The card
 * shows the highest held, or a plan's faded. Changes wait for Save.
 */
export function SimTitles({
  titles,
  onChange,
  calendar,
  nameOf,
  gender,
  nobles,
}: {
  titles: readonly SimTitle[];
  onChange: (next: SimTitle[]) => void;
  /** The board's calendar, when on: dates are typed and shown as years. */
  calendar: PlannerCalendar | null;
  nameOf: (id: string) => string | undefined;
  /** Their gender, for a planned noble title's words ("Duchess"). */
  gender: string;
  /** The save has Royalty & Legacy: noble titles can be planned. */
  nobles: boolean;
}) {
  /** What is being added: a noble title for the plan, or a title of your own. */
  const [kind, setKind] = useState<'plan' | 'own'>(nobles ? 'plan' : 'own');
  // A plan starts one rank above the highest they hold: the next step up.
  const held = Math.max(0, ...titles.filter((t) => t.to === undefined && !t.planned && t.rank !== undefined).map((t) => t.rank!));
  const [planRank, setPlanRank] = useState(Math.min(TOP_NOBLE_RANK, held + 1));
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
  const addPlan = () => {
    const words = nobleTitle(planRank, gender);
    if (!words) return;
    onChange([...titles, { title: words, rank: planRank, planned: true, ...(fromTyped ? { from: fromTyped } : {}) }]);
    setFrom('');
    setAdding(false);
  };
  const add = () => {
    if (kind === 'plan') return addPlan();
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
              <li
                key={i}
                className={t.to !== undefined ? 'edtitles__item edtitles__item--past' : t.planned ? 'edtitles__item edtitles__item--planned' : 'edtitles__item'}
              >
                <span className="edtitles__text">
                  <span className="edtitles__name">{titleText(t)}</span>
                  <span className="edtitles__meta">
                    {[t.game ? `${source} · from your save` : t.planned ? `${source} · not in your save yet` : `${source ? `${source} · ` : ''}your own, on the board only`, span]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
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
          {/* Two kinds, said first: one the game can give (a plan), or one only the board has. */}
          {nobles && (
            <span className="edtitles__kinds" role="radiogroup" aria-label="What kind of title">
              <button type="button" role="radio" aria-checked={kind === 'plan'} onClick={() => setKind('plan')}>
                A noble title to plan
              </button>
              <button type="button" role="radio" aria-checked={kind === 'own'} onClick={() => setKind('own')}>
                A title of your own
              </button>
            </span>
          )}
          {kind === 'plan' ? (
            <>
              <div className="edtitles__row">
                <label className="edtitles__field edtitles__field--wide">
                  <span>Noble rank</span>
                  <select value={planRank} onChange={(e) => setPlanRank(Number(e.target.value))}>
                    {Array.from({ length: TOP_NOBLE_RANK }, (_, k) => k + 1).map((r) => (
                      <option key={r} value={r}>{`${r} · ${nobleTitle(r, gender) ?? ''}`}</option>
                    ))}
                  </select>
                </label>
                <label className="edtitles__field">
                  <span>{`By (${unit})`}</span>
                  <input type="text" inputMode={calendar ? 'text' : 'numeric'} value={from} aria-invalid={fromTyped === null} onChange={(e) => setFrom(e.target.value)} />
                </label>
              </div>
              <p className="edhint">
                {`Part of your plan, shown faded until your save has the game give ${nobleTitle(planRank, gender) ?? 'it'}: through the Noble career, a marriage, or a noble parent.`}
              </p>
            </>
          ) : (
            <>
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
              <p className="edhint">
                Only on your board: the game never has it. A higher rank outranks a lower one, and the card shows the
                highest title held now. Leave To empty for a title still held.
              </p>
            </>
          )}
          <div className="edtitles__row edtitles__row--end">
            <button type="button" className="edtitles__cancel" onClick={() => setAdding(false)}>
              Cancel
            </button>
            <button type="button" className="edtitles__add" disabled={kind === 'plan' ? fromTyped === null : !ok} onClick={add}>
              {kind === 'plan' ? 'Plan this title' : 'Add title'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
