import { useState, type ReactNode } from 'react';
import { X } from '../icons.ts';
import { recapTimeText, type RecapSim, type SaveRecap } from '../lib/saveRecap.ts';

type Props = {
  recap: SaveRecap;
  /** Plans the game went against, now: the Log's job, said here in one line. */
  offPlan: number;
  onGoToSim: (id: string) => void;
  onClose: () => void;
};

/** How many of a kind show before "and N more". */
const SHOWN = 5;

/**
 * "Previously on…": what the save upload says happened in the game since
 * the last one, as the story it is. Births and couples first, then moves,
 * birthdays and goodbyes. Plans that came true are marked; names take you
 * to the sim.
 */
export function RecapPanel({ recap, offPlan, onGoToSim, onClose }: Props) {
  const time = recapTimeText(recap.days);
  return (
    <section className="recap" role="dialog" aria-labelledby="recapHead" onPointerDown={(e) => e.stopPropagation()}>
      <div className="recap__head">
        <div>
          <p className="recap__kicker">Previously on…</p>
          <h2 id="recapHead">
            {time ? `${time[0]!.toUpperCase()}${time.slice(1)}` : 'Since your last save'}
            {recap.seasons && (
              <span className="recap__season">
                {' '}
                · {recap.seasons.to} arrived
              </span>
            )}
          </h2>
        </div>
        <button type="button" className="recap__close" aria-label="Close" onClick={onClose}>
          <X aria-hidden="true" />
        </button>
      </div>
      <div className="recap__body">
        <RecapStory recap={recap} onGoToSim={onGoToSim} />
      </div>
      {(recap.plansDone > 0 || offPlan > 0) && (
        <p className="recap__plans">
          {recap.plansDone > 0 && (
            <span className="recap__done recap__done--big">
              ✨ {recap.plansDone === 1 ? '1 plan came true' : `${recap.plansDone} plans came true`}
            </span>
          )}
          {offPlan > 0 && (
            <span className="recap__off">
              {offPlan === 1 ? '1 plan' : `${offPlan} plans`} the game went against: see the Log.
            </span>
          )}
        </p>
      )}
    </section>
  );
}

/**
 * What happened, as the story it is: births and couples first, then
 * moves, birthdays and goodbyes. Names take you to the sim. Shared by
 * Previously on and the Chronicle.
 */
export function RecapStory({ recap, onGoToSim }: { recap: Omit<SaveRecap, 'celebrate'>; onGoToSim: (id: string) => void }) {
  const who = (s: RecapSim) => (
    <button type="button" className="recap__sim" onClick={() => onGoToSim(s.id)}>
      {s.name}
    </button>
  );
  const sections: { key: string; mark: string; title: string; items: ReactNode[] }[] = [
    {
      key: 'born',
      mark: '🍼',
      title: 'Born',
      items: recap.born.map((b) => (
        <>
          {who(b)}
          {b.parents.length > 0 && <> to {b.parents.join(' and ')}</>}
          {b.planned && <span className="recap__done">as planned</span>}
        </>
      )),
    },
    {
      key: 'together',
      mark: '💞',
      title: 'Together',
      items: recap.together.map((t) => (
        <>
          {who(t.a)} {t.type === 'marriage' ? 'married' : 'fell for'} {who(t.b)}
          {t.planned && <span className="recap__done">as planned</span>}
        </>
      )),
    },
    {
      key: 'apart',
      mark: '💔',
      title: 'Apart',
      items: recap.apart.map((t) => (
        <>
          {who(t.a)} and {who(t.b)} {t.type === 'divorced' ? 'divorced' : 'broke up'}
        </>
      )),
    },
    {
      key: 'moved',
      mark: '🏠',
      title: 'Moved',
      items: recap.moved.map((m) => (
        <>
          {who(m)} moved to {m.to}
        </>
      )),
    },
    {
      key: 'grew',
      mark: '🎂',
      title: 'Grew up',
      items: recap.grew.map((g) => (
        <>
          {who(g)}: {g.from} to {g.to}
        </>
      )),
    },
    {
      key: 'died',
      mark: '🕊️',
      title: 'Passed away',
      items: recap.died.map((d) => <>{who(d)}</>),
    },
  ].filter((s) => s.items.length > 0);
  return (
    <>
      {sections.map((s) => (
        <RecapSection key={s.key} mark={s.mark} title={s.title} items={s.items} />
      ))}
      {recap.met > 0 && (
        <p className="recap__met">
          {recap.met === 1 ? '1 new sim' : `${recap.met} new sims`} met along the way.
        </p>
      )}
    </>
  );
}

function RecapSection({ mark, title, items }: { mark: string; title: string; items: ReactNode[] }) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, SHOWN);
  return (
    <div className="recap__sec">
      <h3>
        <span aria-hidden="true">{mark}</span> {title}
      </h3>
      <ul>
        {shown.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
      {items.length > SHOWN && (
        <button type="button" className="recap__more" onClick={() => setAll(!all)}>
          {all ? 'Show fewer' : `And ${items.length - SHOWN} more`}
        </button>
      )}
    </div>
  );
}
