import { useId } from 'react';
import { BarPanel } from './BarPanel.tsx';
import { calendarYear, yearLabel } from '../lib/calendar.ts';
import { upNextReason, type UpNextRow } from '../lib/householdPlan.ts';
import { WEEK_SCOPES, weekdayOf, type WeekItem, type WeekItemKind, type WeekScope, type WeekTodo } from '../lib/weekTodo.ts';
import type { Group, PlannerCalendar } from '../types/whiteboard.ts';

/** The week's to-do, as Up next shows it (WeekSection). */
export type WeekProps = {
  todo: WeekTodo;
  scope: WeekScope;
  /** Keys of the items ticked off. */
  done: ReadonlySet<string>;
  /** "the Goth household": the one the save was made in, for the Active choice. */
  activeHousehold?: string;
  /** Whether the save info says which households were played (uploads from before didn't). */
  playedKnown: boolean;
  calendar: PlannerCalendar | null;
  onScope: (scope: WeekScope) => void;
  onToggle: (key: string) => void;
};

const KIND_HEADS: Record<WeekItemKind, string> = { ageUp: 'Age-ups', baby: 'Babies due', outfits: 'Outfits' };

/** "Sunday, Day 1 to Saturday, Day 7", with the calendar's year when it has one. */
function weekText(todo: WeekTodo, calendar: PlannerCalendar | null): string {
  const days = `${weekdayOf(todo.first)}, Day ${todo.first} to ${weekdayOf(todo.last)}, Day ${todo.last}`;
  if (!calendar) return days;
  const from = calendarYear(todo.first, calendar);
  const to = calendarYear(todo.last, calendar);
  return `${days} · ${from === to ? yearLabel(from) : `${yearLabel(from)}–${yearLabel(to)}`}`;
}

/**
 * This week of play, at the top of Up next: who ages up, which babies are
 * due and who needs new outfits, in the households chosen, each ticked off
 * as it's done. The game's week the last save falls in, Sunday to Saturday.
 */
/** One section's items in households, each household once, soonest first ('' for every household, first). */
function byHousehold(items: WeekItem[]): { gid: string; hh: string; items: WeekItem[] }[] {
  const out: { gid: string; hh: string; items: WeekItem[] }[] = [];
  for (const i of items) {
    const g = out.find((x) => x.gid === i.gid);
    if (g) g.items.push(i);
    else out.push({ gid: i.gid, hh: i.hh, items: [i] });
  }
  return out.sort((a, b) => Number(b.gid === '') - Number(a.gid === ''));
}

function WeekSection({ week, groups }: { week: WeekProps; groups: Group[] }) {
  const id = useId();
  const { todo, scope, done } = week;
  const kinds = (['ageUp', 'baby', 'outfits'] as const).filter((k) => todo.items.some((i) => i.kind === k));
  const left = todo.items.filter((i) => !done.has(i.key)).length;
  return (
    <section className="upweek" aria-labelledby={`${id}-head`}>
      <div className="upweek__head">
        <h3 id={`${id}-head`}>This week</h3>
        <span className="upweek__count">{todo.items.length ? `${left} of ${todo.items.length} to do` : ''}</span>
      </div>
      <p className="upweek__when">{weekText(todo, week.calendar)}</p>
      <div className="upweek__scope" role="group" aria-label="Households this week covers">
        {WEEK_SCOPES.map((s) => (
          <button key={s.scope} type="button" aria-pressed={scope === s.scope} onClick={() => week.onScope(s.scope)}>
            {s.label}
          </button>
        ))}
      </div>
      {scope === 'played' && !week.playedKnown && (
        <p className="upweek__hint">Upload your save again to see which households you’ve played.</p>
      )}
      {scope === 'active' && <p className="upweek__hint">{week.activeHousehold ? `The ${week.activeHousehold} household, played last in your save.` : 'Your save doesn’t say which household was played last.'}</p>}
      {!kinds.length && (scope !== 'played' || week.playedKnown) && <p className="upweek__empty">Nothing due this week in these households.</p>}
      {kinds.map((k) => (
        <div key={k} className="upweek__group">
          <h4>{KIND_HEADS[k]}</h4>
          {byHousehold(todo.items.filter((i) => i.kind === k)).map((h) => (
            <div key={h.gid || 'every'} className="upweek__hh" role="group" aria-label={h.hh ? `The ${h.hh} household` : 'Every household'}>
              <p className="upweek__hhname">
                <span className="brief__dot" style={{ background: groups.find((g) => g.gid === h.gid)?.color ?? '#697380' }} aria-hidden />
                <span>{h.hh ? `${h.hh} household` : 'Every household'}</span>
              </p>
              <ul>
                {h.items.map((i) => (
                  <li key={i.key} className={done.has(i.key) ? 'is-done' : undefined}>
                    <label>
                      <input type="checkbox" checked={done.has(i.key)} onChange={() => week.onToggle(i.key)} />
                      <span>{i.text}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}

type Props = {
  rows: UpNextRow[];
  groups: Group[];
  nameOf: (id: string) => string;
  /** "the Munch household". */
  hhOf: (gid: string) => string;
  onClose: () => void;
  onOpen: (row: UpNextRow) => void;
  onSkip: (gid: string, skip: boolean) => void;
  /** This week's to-do, at the top; none without a save. */
  week?: WeekProps;
};

/** "Gen 2 · you played them last". */
function metaText(r: UpNextRow): string {
  const parts: string[] = [];
  if (r.gen !== undefined) parts.push(`Gen ${r.gen}`);
  if (r.playedAgo === 0) parts.push('you played them last');
  if (r.skipped) parts.push('skipped until your next save import');
  return parts.join(' · ');
}

/**
 * A suggested order to play households in, for when you'd rather be
 * handed a plan than pick by mood: only households where playing does
 * something, each with why it is where it is. It never changes the board.
 */
export function UpNextPanel({ rows, groups, nameOf, hhOf, onClose, onOpen, onSkip, week }: Props) {
  // The suggestion is the first household you can play now.
  const first = rows.findIndex((r) => !r.skipped && !r.notInGame);
  return (
    <BarPanel
      id="upnext"
      className="gpanel upnext"
      title="Up next"
      description="A suggested order to play your households in"
      onClose={onClose}
    >
      {week && <WeekSection week={week} groups={groups} />}
      {week && <h3 className="upnext__subhead">Who to play next</h3>}
      {!rows.length ? (
        <p className="upnext__empty">
          Nothing to suggest yet. Plan a couple or a baby, and the households with something to do show up here.
        </p>
      ) : (
        <ol className="upnext__list">
          {rows.map((r, i) => {
            const g = groups.find((x) => x.gid === r.gid);
            const meta = metaText(r);
            return (
              <li
                key={r.gid}
                className={
                  r.skipped ? 'upnext__row upnext__row--skipped' : r.notInGame ? 'upnext__row upnext__row--away' : 'upnext__row'
                }
              >
                <div className="upnext__top">
                  <span className="upnext__n">{i + 1}</span>
                  <span className="brief__dot" style={{ background: g?.color ?? '#697380' }} aria-hidden />
                  <b className="upnext__hh">{g?.hh ?? hhOf(r.gid)}</b>
                  {i === first && <span className="upnext__next">Next</span>}
                </div>
                <p className={r.closing && !r.notInGame ? 'upnext__why upnext__why--closing' : 'upnext__why'}>
                  {r.closing && !r.notInGame && <span aria-hidden="true">⏳ </span>}
                  {upNextReason(r, nameOf, hhOf)}
                </p>
                {meta && <p className="upnext__meta">{meta}</p>}
                <div className="upnext__actions">
                  <button type="button" className="upnext__open" onClick={() => onOpen(r)}>
                    Open plan
                  </button>
                  <button type="button" className="upnext__skip" onClick={() => onSkip(r.gid, !r.skipped)}>
                    {r.skipped ? 'Bring back' : 'Skip for now'}
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <p className="upnext__rules">
        A couple running out of time for babies comes first: playing there grows up the one still too young before
        the other turns Elder. Then plays that help other households’ plans, an elder short on days, the most ready,
        the oldest generation, and whoever you played longest ago. Households not in your game yet come last. It only
        suggests: play who you like.
      </p>
    </BarPanel>
  );
}
