import { usePanelSheet } from '../hooks/usePanelSheet.ts';
import { livingPlace } from '../lib/connectionLog.ts';
import { waitText, type ElderTime, type PlanItem, type PlanState } from '../lib/householdPlan.ts';
import { daysText, oldAgeSoonText } from '../lib/lifeClock.ts';
import type { Group } from '../types/whiteboard.ts';

type Props = {
  group: Group;
  /** The plan items this household's sims are in. */
  items: PlanItem[];
  /** Other households' items that playing this one moves along. */
  unblocks: PlanItem[];
  elders: ElderTime[];
  nameOf: (id: string) => string;
  /** "the Munch household". */
  hhOf: (gid: string) => string;
  /** A save was imported, so ages and countdowns come from it. */
  fromSave: boolean;
  /** Sims to glow on the board while a line is hovered or focused; null to stop. */
  onHover: (ids: string[] | null) => void;
  /** A line was clicked: show its sims. */
  onPick: (item: PlanItem) => void;
  onPickSim: (id: string) => void;
  onClose: () => void;
};

const SECTIONS: { state: PlanState; title: string }[] = [
  { state: 'ready', title: 'Ready' },
  { state: 'waiting', title: 'Waiting' },
  { state: 'offPlan', title: 'Off plan' },
];

/**
 * One household's plan, for the household you feel like playing: what
 * you can do today, what waits and on whom, what the game did instead,
 * how long its elders have, and what playing it moves along elsewhere.
 * Only the verdict: who the sims are is on the board, and hovering a line
 * lights them up there.
 */
export function HouseholdBrief({
  group,
  items,
  unblocks,
  elders,
  nameOf,
  hhOf,
  fromSave,
  onHover,
  onPick,
  onPickSim,
  onClose,
}: Props) {
  const sheet = usePanelSheet();
  const place = livingPlace(group.nb, group.world);
  const hover = (ids: string[]) => ({
    onMouseEnter: () => onHover(ids),
    onMouseLeave: () => onHover(null),
    onFocus: () => onHover(ids),
    onBlur: () => onHover(null),
  });
  const line = (i: PlanItem) => (
    <li key={i.id}>
      <button type="button" className={`brief__item brief__item--${i.state}`} {...hover(i.sims)} onClick={() => onPick(i)}>
        {i.text}
        {i.waits.map((w) => (
          <span key={`${w.sim}|${w.why}`} className="brief__why">
            {waitText(w, nameOf, hhOf)}
          </span>
        ))}
        {i.note && <span className="brief__note">{i.note}</span>}
      </button>
    </li>
  );

  return (
    <aside
      className={sheet ? 'brief brief--sheet' : 'brief'}
      role="dialog"
      aria-label={`The ${group.hh} household’s plan`}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <header className="brief__head">
        <span className="brief__dot" style={{ background: group.color }} aria-hidden />
        <div className="brief__title">
          <b>{group.hh}</b>
          {place && <span>{place}</span>}
        </div>
        <button type="button" className="brief__close" aria-label="Close the household plan" title="Close (Esc)" onClick={onClose}>
          ✕
        </button>
      </header>
      {!items.length && (
        <p className="brief__empty">
          Nothing planned for this household yet. Plan a sim with the + on its tag, a baby with a couple’s +, or a
          couple with Connect.
        </p>
      )}
      {SECTIONS.map(({ state, title }) => {
        const list = items.filter((i) => i.state === state);
        if (!list.length) return null;
        return (
          <section key={state} className="brief__section">
            <h3>
              {title} <span className="brief__count">{list.length}</span>
            </h3>
            {state === 'offPlan' && (
              <p className="brief__hint">The game went another way. Open one of these sims to follow the game or keep your plan.</p>
            )}
            <ul>{list.map(line)}</ul>
          </section>
        );
      })}
      {elders.length > 0 && (
        <section className="brief__section">
          <h3>Elders</h3>
          <ul>
            {elders.map((e) => (
              <li key={e.id}>
                <button type="button" className="brief__item brief__item--elder" {...hover([e.id])} onClick={() => onPickSim(e.id)}>
                  {nameOf(e.id)}
                  <span className="brief__why">
                    Elder for {daysText(e.elderDays)} · {oldAgeSoonText(e.oldAgeIn)}
                    {e.frozen ? ' of aging' : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {unblocks.length > 0 && (
        <section className="brief__section">
          <h3>Also moves</h3>
          <p className="brief__hint">
            Playing {hhOf(group.gid)} moves {unblocks.length === 1 ? 'this plan' : `these ${unblocks.length} plans`} for
            other households:
          </p>
          <ul>{unblocks.map(line)}</ul>
        </section>
      )}
      <p className="brief__foot">
        {fromSave
          ? 'Ages come from your last save import. Upload a newer save to refresh them.'
          : 'No save imported yet: countdowns appear once you upload one.'}
      </p>
    </aside>
  );
}
