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
  Coins,
  House,
  Medal,
  Sparkle,
  Star,
  SuitcaseRolling,
  TreeStructure,
  UserMinus,
  UserPlus,
  UsersThree,
  type Icon,
} from '../icons.ts';
import { money } from '../lib/funds.ts';
import { CloseButton } from './CloseButton.tsx';
import { NOT_IN_WORLD } from '../lib/constants.ts';
import { lifeText, perkText, prestigeLevelNewsText, recapTimeText, relationshipText, theDynasty, type ArrivalNews, type DynastyNews, type FamilyNews, type ForebearNews, type GoneNews, type HomeNews, type LifeNews, type MoneyNews, type RecapSim, type RelationshipNews, type SaveRecap } from '../lib/saveRecap.ts';
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

/** A kind with more moments than this is one line that opens to list them. */
const FOLD_AT = 3;

type StoryItem = {
  key: string;
  /** Which kind of moment (born, together, dynasty…), so many of one kind fold into one line. */
  kind: string;
  Icon: Icon;
  node: ReactNode;
  /** A plan that came true: a quiet ✓ at the end of the line. */
  planned?: boolean;
  /** Context rather than news (who you played, sims met): told quietly. */
  quiet?: boolean;
  /** When it happened, when the line knows (a first chapter's birth): quietly at its end. */
  when?: string;
};

/**
 * What happened, as one list of moments, the biggest first: passings,
 * births, couples and partings, family, dynasty, life, arrivals, moves and
 * birthdays, then the rest. A kind with more than three moments is one line
 * ("28 babies were born, the first Cordelia Thebe VI") that opens to a
 * bulleted list; friendships, the many small ones, always fold. Every list
 * starts closed, and one is open at a time. The sim each line is about is
 * in bold; every name takes you to the sim. A plan that came true gets a ✓.
 * Shared by Previously on and the Story, for one upload (`recaps` of one) or
 * a day's (several, told as one).
 */
export function RecapStory({
  recaps,
  onGoToSim,
  focus,
  openFold,
  onOpenFold,
  foldScope = '',
}: {
  recaps: readonly Omit<SaveRecap, 'celebrate'>[];
  onGoToSim: (id: string) => void;
  /** Whose story it is: their friendships are counted by whom they're with. */
  focus?: ReadonlySet<string> | null;
  /** The list open in the whole Story (one at a time across its days), as `scope:kind`; this list keeps its own without. */
  openFold?: string | null;
  onOpenFold?: (key: string | null) => void;
  /** This day's part of `openFold`'s key. */
  foldScope?: string;
}) {
  // One list open at a time: the Story's, across its days, or this list's own.
  const [ownOpen, setOwnOpen] = useState<string | null>(null);
  const opened = onOpenFold ? (openFold ?? null) : ownOpen;
  const isOpen = (kind: string) => opened === `${foldScope}:${kind}`;
  const toggle = (kind: string) => {
    const key = `${foldScope}:${kind}`;
    const next = opened === key ? null : key;
    if (onOpenFold) onOpenFold(next);
    else setOwnOpen(next);
  };
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
  /** "A, B and C", each name to click. */
  const listed = (sims: RecapSim[]) =>
    sims.map((p, i) => (
      <span key={p.id}>
        {i > 0 && (i === sims.length - 1 ? ' and ' : ', ')}
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
      heads: (
        <>
          heads {the}
          {d.level !== undefined ? ` (Prestige Level ${d.level})` : ''}
          {d.heir ? <>, with {who(d.heir)} as heir</> : null}
        </>
      ),
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
  /** Each kind's moments as told, for its line when they fold. */
  const raw = new Map<string, unknown[]>();
  const friendships: RelationshipNews[] = [];
  let met = 0;
  const played = new Map<string, NonNullable<SaveRecap['played']>>();
  // The biggest moments first, kind by kind, across the day's uploads.
  const each = <T,>(
    kind: string,
    pick: (r: Omit<SaveRecap, 'celebrate'>) => readonly T[] | undefined,
    make: (x: T, key: string) => Omit<StoryItem, 'kind'> | null,
  ) => {
    recaps.forEach((r, ri) => (pick(r) ?? []).forEach((x, i) => {
      const item = make(x, `${ri}:${i}`);
      if (!item) return;
      items.push({ ...item, kind });
      raw.set(kind, [...(raw.get(kind) ?? []), x]);
    }));
  };
  each('died', (r) => r.died, (d, k) => ({ key: `died${k}`, Icon: Flower, node: <>{who(d, true)} passed away</> }));
  each('born', (r) => r.born, (b, k) => ({
    key: `born${k}`,
    Icon: BabyCarriage,
    planned: b.planned,
    node: (
      <>
        {who(b, true)} was born{b.parents.length > 0 && <> to {b.parents.join(' and ')}</>}
      </>
    ),
    ...(b.when ? { when: b.when } : {}),
  }));
  each('together', (r) => r.together, (t, k) => ({
    key: `together${k}`,
    Icon: Heart,
    planned: t.planned,
    node: t.standing ? (
      t.type === 'marriage' ? (
        <>
          {who(t.a, true)} is married to {who(t.b, true)}
        </>
      ) : (
        <>
          {who(t.a, true)} and {who(t.b, true)} are in a romance
        </>
      )
    ) : (
      <>
        {who(t.a, true)} {t.type === 'marriage' ? 'married' : 'fell for'} {who(t.b, true)}
      </>
    ),
  }));
  each('apart', (r) => r.apart, (t, k) => ({
    key: `apart${k}`,
    Icon: HeartBreak,
    node: (
      <>
        {who(t.a, true)} and {who(t.b, true)}{' '}
        {t.standing ? (t.type === 'divorced' ? 'are divorced' : 'are no longer together') : t.type === 'divorced' ? 'divorced' : 'broke up'}
      </>
    ),
  }));
  each('family', (r) => r.family, (f, k) =>
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
  each('dynasty', (r) => r.dynasty, (d, k) => ({ key: `dynasty${k}`, Icon: Crown, planned: d.planned, node: dynastyItem(d) }));
  each('life', (r) => r.life, (l, k) => ({ key: `life${k}`, Icon: Sparkle, node: lifeItem(l) }));
  each('arrivals', (r) => r.arrivals, (a, k) => ({
    key: `arrival${k}`,
    Icon: SuitcaseRolling,
    node: (
      <>
        {who(a.sim, true)}
        {a.as ? `, ${a.as},` : ''} joined the {a.hh} household
      </>
    ),
  }));
  each('homes', (r) => r.homes, (h, k) => {
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
      ) : h.to === NOT_IN_WORLD ? (
        <>
          The {name} household moved out{h.from ? ` of ${h.from}` : ''} and has no home lot now
        </>
      ) : (
        <>
          The {name} household moved to {h.to}
        </>
      ),
    };
  });
  // A household's money: quiet, after its moves.
  each('money', (r) => r.money, (m, k) => {
    const name = (
      <button type="button" className="recap__sim recap__sim--lead" onClick={() => onGoToSim(m.ids[0]!)}>
        {m.hh}
      </button>
    );
    return {
      key: `money${k}`,
      Icon: Coins,
      node: (
        <>
          The {name} household’s funds went from {money(m.from)} to {money(m.to)}
        </>
      ),
    };
  });
  each('moved', (r) => r.moved, (m, k) => ({
    key: `moved${k}`,
    Icon: House,
    // Out of every household: left it, rather than "moved to Unhoused sims".
    node: <>{who(m, true)} {m.to === 'Unhoused sims' ? <>left {m.from}</> : <>moved to {m.to}</>}</>,
  }));
  each('grew', (r) => r.grew, (g, k) => ({
    key: `grew${k}`,
    Icon: Cake,
    node: (
      <>
        {who(g, true)}: {g.from} to {g.to}
      </>
    ),
  }));
  each('relationships', (r) => r.relationships, (x, k) => {
    if (x.kind === 'friendship') {
      friendships.push(x);
      return null;
    }
    return { key: `rel${k}`, Icon: x.kind === 'engaged' ? Diamond : UsersThree, node: relationshipItem(x) };
  });
  each('prestige', (r) => r.prestigeLevels, (p, k) => ({ key: `level${k}`, Icon: Star, node: <>{prestigeLevelNewsText(p)}</> }));
  each('perks', (r) => r.perks, (p, k) => ({ key: `perks${k}`, Icon: Medal, node: <>{perkText(p)}</> }));
  const gone: GoneNews[] = [];
  const forebears: ForebearNews[] = [];
  for (const r of recaps) {
    met += r.met;
    if (r.played) played.set(r.played.hh, r.played);
    gone.push(...(r.gone ?? []));
    forebears.push(...(r.forebears ?? []));
  }
  const passedAway = forebears.flatMap((f) => f.sims.map((s) => ({ sim: s, hh: f.hh })));
  /** A first chapter: told against the game's start, not the upload before. */
  const remembered = recaps.length > 0 && recaps.every((r) => r.remembered);

  // Kinds in the order their first moment came, each with its moments.
  const kinds: { kind: string; items: StoryItem[] }[] = [];
  for (const it of items) {
    const k = kinds.find((x) => x.kind === it.kind);
    if (k) k.items.push(it);
    else kinds.push({ kind: it.kind, items: [it] });
  }
  /** A name in a folded line: coloured like every name, but part of the line you press to open. */
  const nm = (name: string) => <span className="recap__foldname">{name}</span>;
  /** The line a kind folds into: how many, and the first of them. */
  const summary = (kind: string, xs: unknown[]): ReactNode => {
    const n = xs.length;
    switch (kind) {
      case 'died':
        return <>{n} sims passed away, among them {nm((xs[0] as RecapSim).name)}</>;
      case 'born': {
        const b = xs[0] as SaveRecap['born'][number];
        // A first chapter's births come oldest first: the first is the first born.
        return <>{n} babies were born, {b.when ? 'the first' : 'among them'} {nm(b.name)}</>;
      }
      case 'together': {
        const t = xs[0] as SaveRecap['together'][number];
        return (
          <>
            {n} couples {t.standing ? 'are together now' : 'got together'}, among them {nm(t.a.name)} and {nm(t.b.name)}
          </>
        );
      }
      case 'apart': {
        const t = xs[0] as SaveRecap['apart'][number];
        return (
          <>
            {n} couples {t.standing ? 'are no longer together' : 'split up'}, among them {nm(t.a.name)} and {nm(t.b.name)}
          </>
        );
      }
      case 'family':
        return (xs as FamilyNews[]).every((f) => f.kind === 'adopted') ? <>{n} adoptions</> : <>{n} adoptions and parents found</>;
      case 'dynasty': {
        const ds = xs as DynastyNews[];
        const top = ds.find((d) => d.kind === 'heads');
        // A first chapter's dynasties as they stand, the highest first.
        if (top) {
          const count = new Set(ds.map((d) => d.dynasty.key)).size;
          return (
            <>
              {count} dynasties
              {top.level !== undefined ? `, ${theDynasty(top.dynasty)} highest at Prestige Level ${top.level}` : ''}
            </>
          );
        }
        return <>{n} changes in the dynasties, among them {nm(ds[0]!.sim.name)}</>;
      }
      case 'life':
        return <>{n} new names and life states, among them {nm((xs[0] as LifeNews).sim.name)}</>;
      case 'arrivals':
        return <>{n} joined households, among them {nm((xs[0] as ArrivalNews).sim.name)}</>;
      case 'homes':
        return <>{n} households moved home, among them the {nm((xs[0] as HomeNews).hh)} household</>;
      case 'money':
        return <>{n} households’ funds changed, among them the {nm((xs[0] as MoneyNews).hh)} household’s</>;
      case 'moved':
        return <>{n} sims moved, among them {nm((xs[0] as RecapSim).name)}</>;
      case 'grew':
        return <>{n} sims grew up, among them {nm((xs[0] as RecapSim).name)}</>;
      case 'relationships': {
        const x = xs[0] as RelationshipNews;
        return <>{n} relationships took a step, among them {nm(x.a.name)} and {nm(x.b.name)}</>;
      }
      case 'prestige':
        return <>{n} dynasties changed Prestige Level</>;
      case 'perks':
        return <>{n} dynasties changed their perks</>;
      default:
        return <>{n} more</>;
    }
  };
  const planned = (
    <span className="recap__planned" title="As planned" aria-label="as planned" role="img">
      <Check weight="bold" />
    </span>
  );
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
      {kinds.map(({ kind, items: its }) => {
        if (its.length > FOLD_AT) {
          const Glyph = its[0]!.Icon;
          return (
            <li key={kind} className="recap__line recap__line--fold">
              <Glyph className="recap__icon" aria-hidden="true" />
              <span className="recap__text">
                <button type="button" className="recap__fold" aria-expanded={isOpen(kind)} onClick={() => toggle(kind)}>
                  <span>{summary(kind, raw.get(kind) ?? [])}</span>
                  <CaretDown className="recap__caret" weight="bold" aria-hidden="true" />
                </button>
                {isOpen(kind) && (
                  <ul className="recap__folded">
                    {its.map((it) => (
                      <li key={it.key}>
                        {it.node}
                        {it.when && <span className="recap__when">{it.when}</span>}
                        {it.planned && planned}
                      </li>
                    ))}
                  </ul>
                )}
              </span>
              {its.some((it) => it.planned) && planned}
            </li>
          );
        }
        return its.map((it) => (
          <li key={it.key} className={it.quiet ? 'recap__line recap__line--quiet' : 'recap__line'}>
            <it.Icon className="recap__icon" aria-hidden="true" />
            <span className="recap__text">
              {it.node}
              {it.when && <span className="recap__when">{it.when}</span>}
            </span>
            {it.planned && planned}
          </li>
        ));
      })}
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
            <button type="button" className="recap__fold" aria-expanded={isOpen('friends')} onClick={() => toggle('friends')}>
              <span>
                {friendships.length === 1 ? '1 friendship' : `${friendships.length} friendships`} {grew ? 'grew' : 'changed'}
                {top && top.n > 1 && friendships.length > 1 ? `, ${top.n} with ${top.sim.name}` : ''}
              </span>
              <CaretDown className="recap__caret" weight="bold" aria-hidden="true" />
            </button>
            {isOpen('friends') && (
              <ul className="recap__folded">
                {friendships.map((f, i) => (
                  <li key={i}>{relationshipItem(f)}</li>
                ))}
              </ul>
            )}
          </span>
        </li>
      )}
      {passedAway.length > 0 && (
        <li className="recap__line recap__line--quiet recap__line--fold">
          <TreeStructure className="recap__icon" aria-hidden="true" />
          <span className="recap__text">
            {forebears.length === 1 && passedAway.length <= 3 ? (
              // One household's few: by name.
              <>The family tree remembers {listed(passedAway.map((p) => p.sim))}, who passed away</>
            ) : (
              <>
                <button type="button" className="recap__fold" aria-expanded={isOpen('forebears')} onClick={() => toggle('forebears')}>
                  <span>The family tree remembers {passedAway.length} sims who passed away</span>
                  <CaretDown className="recap__caret" weight="bold" aria-hidden="true" />
                </button>
                {isOpen('forebears') && (
                  <ul className="recap__folded">
                    {passedAway.map((p) => (
                      <li key={p.sim.id}>
                        {who(p.sim)}, of the {p.hh} household
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </span>
        </li>
      )}
      {gone.length > 0 && (
        <li className="recap__line recap__line--quiet recap__line--fold">
          <UserMinus className="recap__icon" aria-hidden="true" />
          <span className="recap__text">
            {gone.length === 1 ? (
              // One: their name, plainly; they have no card to go to.
              <>
                {gone[0]!.sim.name}, of the {gone[0]!.hh} household, is no longer in your save
              </>
            ) : (
              <>
                <button type="button" className="recap__fold" aria-expanded={isOpen('gone')} onClick={() => toggle('gone')}>
                  <span>{gone.length} sims the game started with are no longer in your save</span>
                  <CaretDown className="recap__caret" weight="bold" aria-hidden="true" />
                </button>
                {isOpen('gone') && (
                  <ul className="recap__folded">
                    {gone.map((g) => (
                      <li key={g.sim.id}>
                        {g.sim.name}, of the {g.hh} household
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </span>
        </li>
      )}
      {met > 0 && (
        <li className="recap__line recap__line--quiet">
          <UserPlus className="recap__icon" aria-hidden="true" />
          <span className="recap__text">
            {met === 1 ? '1 new sim' : `${met} new sims`} {remembered ? 'since the game began' : 'met along the way'}
          </span>
        </li>
      )}
    </ul>
  );
}
