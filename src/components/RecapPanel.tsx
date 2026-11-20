import { useRef, useState, type ReactNode } from 'react';
import {
  BabyCarriage,
  Cake,
  CaretDown,
  Check,
  Crown,
  Diamond,
  Flower,
  GameController,
  HandHeart,
  Heart,
  HeartBreak,
  House,
  Medal,
  Sparkle,
  Star,
  SuitcaseRolling,
  TreeStructure,
  UserPlus,
  UsersThree,
  type Icon,
} from '../icons.ts';
import { CloseButton } from './CloseButton.tsx';
import { lifeText, perkText, prestigeLevelNewsText, recapTimeText, relationshipText, theDynasty, type DynastyNews, type LifeNews, type RecapSim, type RelationshipNews, type SaveRecap } from '../lib/saveRecap.ts';
import { useLightDismiss } from '../hooks/useLightDismiss.ts';

type Props = {
  recap: SaveRecap;
  /** Plans the game went against, now: the Log's job, said here in one line. */
  offPlan: number;
  onGoToSim: (id: string) => void;
  onClose: () => void;
};

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
        <RecapStory recaps={[recap]} onGoToSim={onGoToSim} />
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

/** How many big moments a day shows before "and N more". */
const SHOWN = 8;

type StoryItem = {
  key: string;
  Icon: Icon;
  node: ReactNode;
  /** A plan that came true: a quiet ✓ at the end of the line. */
  planned?: boolean;
  /** Context rather than news (who you played, sims met): told quietly. */
  quiet?: boolean;
};

/**
 * What happened, as one list of moments, the biggest first: passings,
 * births, couples and partings, family, dynasty, life, arrivals, moves and
 * birthdays, then the rest. Friendships, the many small ones, fold into one
 * line you can open. The sim each line is about is in bold; every name
 * takes you to the sim. A plan that came true gets a ✓. Shared by
 * Previously on and the Story, for one upload (`recaps` of one) or a
 * day's (several, told as one).
 */
export function RecapStory({
  recaps,
  onGoToSim,
  focus,
}: {
  recaps: readonly Omit<SaveRecap, 'celebrate'>[];
  onGoToSim: (id: string) => void;
  /** Whose story it is: their friendships are counted by whom they're with. */
  focus?: ReadonlySet<string> | null;
}) {
  const [all, setAll] = useState(false);
  const [friendsOpen, setFriendsOpen] = useState(false);
  const who = (s: RecapSim, lead = false) => (
    <button type="button" className={lead ? 'recap__sim recap__sim--lead' : 'recap__sim'} onClick={() => onGoToSim(s.id)}>
      {s.name}
    </button>
  );
  const and = (sims: RecapSim[], lead = false) =>
    sims.map((p, i) => (
      <span key={p.id}>
        {i > 0 && ' and '}
        {who(p, lead)}
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
        {who(d.sim, true)} {said[d.kind]}
      </>
    );
  };
  const lifeItem = (l: LifeNews): ReactNode => {
    if (l.kind === 'name') return <>{who(l.sim, true)} took the name {l.to}</>;
    if (l.kind === 'renamed') return <>{l.from} is now called {who(l.sim, true)}</>;
    // The sentence the board tells everywhere, the name to click in it.
    const text = lifeText(l);
    return (
      <>
        {who(l.sim, true)}
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
          {who(x.a, true)} is no longer a secret parent of {who(x.b)}
        </>
      );
    }
    const rest = text.slice(`${x.a.name} and ${x.b.name}`.length);
    return (
      <>
        {who(x.a, true)} and {who(x.b, true)}
        {rest}
      </>
    );
  };

  const items: StoryItem[] = [];
  const friendships: RelationshipNews[] = [];
  let met = 0;
  const played = new Map<string, NonNullable<SaveRecap['played']>>();
  // The biggest moments first, kind by kind, across the day's uploads.
  const each = <T,>(pick: (r: Omit<SaveRecap, 'celebrate'>) => readonly T[] | undefined, make: (x: T, key: string) => StoryItem | null) => {
    recaps.forEach((r, ri) => (pick(r) ?? []).forEach((x, i) => {
      const item = make(x, `${ri}:${i}`);
      if (item) items.push(item);
    }));
  };
  each((r) => r.died, (d, k) => ({ key: `died${k}`, Icon: Flower, node: <>{who(d, true)} passed away</> }));
  each((r) => r.born, (b, k) => ({
    key: `born${k}`,
    Icon: BabyCarriage,
    planned: b.planned,
    node: (
      <>
        {who(b, true)} was born{b.parents.length > 0 && <> to {b.parents.join(' and ')}</>}
      </>
    ),
  }));
  each((r) => r.together, (t, k) => ({
    key: `together${k}`,
    Icon: Heart,
    planned: t.planned,
    node: (
      <>
        {who(t.a, true)} {t.type === 'marriage' ? 'married' : 'fell for'} {who(t.b, true)}
      </>
    ),
  }));
  each((r) => r.apart, (t, k) => ({
    key: `apart${k}`,
    Icon: HeartBreak,
    node: (
      <>
        {who(t.a, true)} and {who(t.b, true)} {t.type === 'divorced' ? 'divorced' : 'broke up'}
      </>
    ),
  }));
  each((r) => r.family, (f, k) =>
    f.kind === 'adopted'
      ? { key: `family${k}`, Icon: HandHeart, planned: f.planned, node: <>{and(f.parents)} adopted {who(f.child, true)}</> }
      : {
          key: `family${k}`,
          Icon: TreeStructure,
          node: (
            <>
              The family tree shows {who(f.parent)} as {f.secret ? 'a secret parent' : 'a parent'} of {who(f.child, true)}
            </>
          ),
        },
  );
  each((r) => r.dynasty, (d, k) => ({ key: `dynasty${k}`, Icon: Crown, planned: d.planned, node: dynastyItem(d) }));
  each((r) => r.life, (l, k) => ({ key: `life${k}`, Icon: Sparkle, node: lifeItem(l) }));
  each((r) => r.arrivals, (a, k) => ({
    key: `arrival${k}`,
    Icon: SuitcaseRolling,
    node: (
      <>
        {who(a.sim, true)}
        {a.as ? `, ${a.as},` : ''} joined the {a.hh} household
      </>
    ),
  }));
  each((r) => r.homes, (h, k) => {
    const name = (
      <button type="button" className="recap__sim recap__sim--lead" onClick={() => onGoToSim(h.ids[0]!)}>
        {h.hh}
      </button>
    );
    return {
      key: `home${k}`,
      Icon: House,
      node: h.renamedFrom ? (
        <>
          The {h.renamedFrom} household is now called the {name} household
        </>
      ) : (
        <>
          The {name} household moved to {h.to}
        </>
      ),
    };
  });
  each((r) => r.moved, (m, k) => ({
    key: `moved${k}`,
    Icon: House,
    // Out of every household: left it, rather than "moved to Unhoused sims".
    node: <>{who(m, true)} {m.to === 'Unhoused sims' ? <>left {m.from}</> : <>moved to {m.to}</>}</>,
  }));
  each((r) => r.grew, (g, k) => ({
    key: `grew${k}`,
    Icon: Cake,
    node: (
      <>
        {who(g, true)}: {g.from} to {g.to}
      </>
    ),
  }));
  each((r) => r.relationships, (x, k) => {
    if (x.kind === 'friendship') {
      friendships.push(x);
      return null;
    }
    return { key: `rel${k}`, Icon: x.kind === 'engaged' ? Diamond : UsersThree, node: relationshipItem(x) };
  });
  each((r) => r.prestigeLevels, (p, k) => ({ key: `level${k}`, Icon: Star, node: <>{prestigeLevelNewsText(p)}</> }));
  each((r) => r.perks, (p, k) => ({ key: `perks${k}`, Icon: Medal, node: <>{perkText(p)}</> }));
  for (const r of recaps) {
    met += r.met;
    if (r.played) played.set(r.played.hh, r.played);
  }

  const big = all ? items : items.slice(0, SHOWN);
  const more = items.length - big.length;
  // Friendships, the many small ones: one line, by whom most of them were with.
  const counts = new Map<string, { sim: RecapSim; n: number }>();
  for (const f of friendships) {
    for (const s of [f.a, f.b]) {
      if (focus?.has(s.id)) continue;
      const c = counts.get(s.id) ?? { sim: s, n: 0 };
      c.n += 1;
      counts.set(s.id, c);
    }
  }
  const top = [...counts.values()].sort((x, y) => y.n - x.n || x.sim.name.localeCompare(y.sim.name))[0];
  const grew = friendships.every((f) => (f.to ?? 0) > (f.from ?? 0));
  return (
    <ul className="recap__story">
      {big.map((it) => (
        <li key={it.key} className={it.quiet ? 'recap__line recap__line--quiet' : 'recap__line'}>
          <it.Icon className="recap__icon" aria-hidden="true" />
          <span className="recap__text">{it.node}</span>
          {it.planned && (
            <span className="recap__planned" title="As planned" aria-label="as planned" role="img">
              <Check weight="bold" />
            </span>
          )}
        </li>
      ))}
      {more > 0 && (
        <li className="recap__line recap__line--more">
          <button type="button" className="recap__more" onClick={() => setAll(true)}>
            And {more} more
          </button>
        </li>
      )}
      {[...played.values()].map((p) => (
        <li key={`played${p.hh}`} className="recap__line recap__line--quiet">
          <GameController className="recap__icon" aria-hidden="true" />
          <span className="recap__text">You played the {p.hh} household</span>
        </li>
      ))}
      {friendships.length > 0 && (
        <li className="recap__line recap__line--quiet recap__line--fold">
          <UsersThree className="recap__icon" aria-hidden="true" />
          <span className="recap__text">
            <button type="button" className="recap__fold" aria-expanded={friendsOpen} onClick={() => setFriendsOpen(!friendsOpen)}>
              {friendships.length === 1 ? '1 friendship' : `${friendships.length} friendships`} {grew ? 'grew' : 'changed'}
              {top && top.n > 1 && friendships.length > 1 ? `, ${top.n} with ${top.sim.name}` : ''}
              <CaretDown className="recap__caret" weight="bold" aria-hidden="true" />
            </button>
            {friendsOpen && (
              <ul className="recap__folded">
                {friendships.map((f, i) => (
                  <li key={i}>{relationshipItem(f)}</li>
                ))}
              </ul>
            )}
          </span>
        </li>
      )}
      {met > 0 && (
        <li className="recap__line recap__line--quiet">
          <UserPlus className="recap__icon" aria-hidden="true" />
          <span className="recap__text">{met === 1 ? '1 new sim' : `${met} new sims`} met along the way</span>
        </li>
      )}
    </ul>
  );
}
