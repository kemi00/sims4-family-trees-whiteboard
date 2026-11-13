import { useRef, useState, type ReactNode } from 'react';
import { CloseButton } from './CloseButton.tsx';
import { lifeText, recapTimeText, relationshipText, theDynasty, type DynastyNews, type LifeNews, type RecapSim, type RelationshipNews, type SaveRecap } from '../lib/saveRecap.ts';
import { useLightDismiss } from '../hooks/useLightDismiss.ts';

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
  const ref = useRef<HTMLElement>(null);
  useLightDismiss(ref, onClose);
  const time = recapTimeText(recap.days);
  return (
    <section ref={ref} className="recap" role="dialog" aria-labelledby="recapHead" onPointerDown={(e) => e.stopPropagation()}>
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
        <CloseButton label="Close Previously on" onClick={onClose} />
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
  const planned = (on?: boolean) => on && <span className="recap__done">as planned</span>;
  const and = (sims: RecapSim[]) =>
    sims.map((p, i) => (
      <span key={p.id}>
        {i > 0 && ' and '}
        {who(p)}
      </span>
    ));
  const dynastyItem = (d: DynastyNews): ReactNode => {
    const the = theDynasty(d.dynasty);
    const instead = d.replaced ? <>, in place of {who(d.replaced)}</> : null;
    const said: Record<DynastyNews['kind'], ReactNode> = {
      head: <>became head of {the}{instead}</>,
      heir: <>became heir of {the}{instead}</>,
      outcast: <>was made an outcast of {the}</>,
      noLongerHead: <>is no longer head of {the}</>,
      noLongerHeir: <>is no longer heir of {the}</>,
      noLongerOutcast: <>is no longer an outcast of {the}</>,
      joined: <>joined {the}</>,
      left: <>left {the}</>,
      founded: (
        <>
          founded {the}
          {d.members?.length ? <> with {and(d.members)}</> : null}
          {d.heir ? (
            <>
              , {d.members?.length ? 'and ' : 'with '}
              {who(d.heir)} as heir
            </>
          ) : null}
        </>
      ),
    };
    return (
      <>
        {who(d.sim)} {said[d.kind]}
        {planned(d.planned)}
      </>
    );
  };
  const lifeItem = (l: LifeNews): ReactNode => {
    if (l.kind === 'name') return <>{who(l.sim)} took the name {l.to}</>;
    if (l.kind === 'renamed') return <>{l.from} is now called {who(l.sim)}</>;
    // The sentence the board tells everywhere, the name to click in it.
    const text = lifeText(l);
    return (
      <>
        {who(l.sim)}
        {text.slice(l.sim.name.length)}
      </>
    );
  };
  /** A relationship's step, the board's sentence with both names to click. */
  const relationshipItem = (x: RelationshipNews): ReactNode => {
    const text = relationshipText(x);
    if (x.kind === 'secretKnown' && x.link === 'parent') {
      return (
        <>
          {who(x.a)} is no longer a secret parent of {who(x.b)}
        </>
      );
    }
    const rest = text.slice(`${x.a.name} and ${x.b.name}`.length);
    return (
      <>
        {who(x.a)} and {who(x.b)}
        {rest}
      </>
    );
  };
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
      key: 'arrivals',
      mark: '🧳',
      title: 'Moved in',
      items: (recap.arrivals ?? []).map((a) => (
        <>
          {who(a.sim)}
          {a.as ? `, ${a.as},` : ''} joined the {a.hh} household
        </>
      )),
    },
    {
      key: 'family',
      mark: '👪',
      title: 'Family',
      items: (recap.family ?? []).map((f) =>
        f.kind === 'adopted' ? (
          <>
            {and(f.parents)} adopted {who(f.child)}
            {planned(f.planned)}
          </>
        ) : (
          <>
            The family tree shows {who(f.parent)} as {f.secret ? 'a secret parent' : 'a parent'} of {who(f.child)}
          </>
        ),
      ),
    },
    {
      key: 'dynasty',
      mark: '⚜️',
      title: 'Dynasty',
      items: (recap.dynasty ?? []).map(dynastyItem),
    },
    {
      key: 'relationships',
      mark: '🤝',
      title: 'Relationships',
      items: (recap.relationships ?? []).map(relationshipItem),
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
      items: [
        ...(recap.homes ?? []).map((h) => {
          const name = (
            <button type="button" className="recap__sim" onClick={() => onGoToSim(h.ids[0]!)}>
              {h.hh}
            </button>
          );
          return h.renamedFrom ? (
            <>
              The {h.renamedFrom} household is now called the {name} household
            </>
          ) : (
            <>
              The {name} household moved to {h.to}
            </>
          );
        }),
        ...recap.moved.map((m) => (
          <>
            {/* Out of every household: left it, rather than "moved to Unhoused sims". */}
            {who(m)} {m.to === 'Unhoused sims' ? <>left {m.from}</> : <>moved to {m.to}</>}
          </>
        )),
      ],
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
      key: 'life',
      mark: '🔮',
      title: 'Life',
      items: (recap.life ?? []).map(lifeItem),
    },
    {
      key: 'died',
      mark: '🕊️',
      title: 'Passed away',
      items: recap.died.map((d) => <>{who(d)}</>),
    },
    {
      key: 'prestige',
      mark: '👑',
      title: 'Prestige',
      items: (recap.prestige ?? []).map((p) => (
        <>
          The {p.name} dynasty {p.to > p.from ? 'gained' : 'lost'} {Math.abs(p.to - p.from).toLocaleString()} prestige (
          {p.from.toLocaleString()} to {p.to.toLocaleString()})
        </>
      )),
    },
  ].filter((s) => s.items.length > 0);
  return (
    <>
      {recap.played && <p className="recap__played">You played the {recap.played.hh} household.</p>}
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
