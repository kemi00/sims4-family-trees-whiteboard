import deathTraitsData from '../data/deathTraits.json' with { type: 'json' };
import { calendarYear, yearLabel } from './calendar.ts';
import type { ChronicleEntry } from './chronicle.ts';
import { hasDied } from './constants.ts';
import { money } from './funds.ts';
import { dayOf, dayText } from './lifeClock.ts';
import { cardName } from './plan.ts';
import { FAME_WORDS, theDynasty, type RecapSim } from './saveRecap.ts';
import { topTitle } from './titles.ts';
import type { Edge, PlannerCalendar, SaveGameInfo, SimNode } from '../types/whiteboard.ts';

/** The kinds of story, each with its sticker: the game's own moodlet (gazetteStickers.json). */
export type StoryKind =
  | 'wedding'
  | 'romance'
  | 'baby'
  | 'adoption'
  | 'death'
  | 'divorce'
  | 'breakup'
  | 'affair'
  | 'promotion'
  | 'noble'
  | 'fame'
  | 'birthday'
  | 'head'
  | 'heir'
  | 'outcast';

export type Article = {
  kind: StoryKind | 'society';
  headline: string;
  body: string;
  /** How big a story it is: the front page leads with the biggest. */
  score: number;
  /** Whose story it is, for lighting them up on the board. */
  ids: string[];
};

export type GazetteEdition = {
  /** "The Willow Creek Gazette". */
  title: string;
  /** "Day 12 · Spring", with the calendar year when the board has one. */
  dateline: string;
  /** Its number: the story's chapter. */
  number: number;
  /** The front page: the biggest story, then the next few. */
  lead?: Article;
  front: Article[];
  /** The inside pages, each a column with a heading. */
  columns: { title: string; articles: Article[] }[];
};

/** The ghost traits that say how a sim died. */
const DEATH_TRAITS = new Set<string>(deathTraitsData.ids);

/** A front-page story scores at least this. */
const FRONT = 50;
/** How many stories follow the lead on the front page. */
const FRONT_MORE = 4;
/** A household this rich is high society (Father Winter aside: he's not news). */
const RICH = 100_000;

const STAGE_WORDS: Record<string, string> = {
  Infant: 'an infant',
  Toddler: 'a toddler',
  Child: 'a child',
  Teen: 'a teen',
  'Young Adult': 'a young adult',
  Adult: 'an adult',
  Elder: 'an elder',
};

/**
 * One edition of the gazette: what a save upload's chapter of the story
 * tells, as a newspaper. Its stories come from the chapter's recap, weighed
 * by what the board knows of each sim now (a title, fame, a rich household):
 * a scandal or a royal wedding leads, births and passings have columns of
 * their own. Facts only; the tone is the paper's.
 */
export function gazetteEdition(opts: {
  entry: ChronicleEntry;
  number: number;
  nodes: readonly SimNode[];
  edges: readonly Edge[];
  saveGame?: SaveGameInfo | null;
  calendar?: PlannerCalendar | null;
  /** The world the paper is named for: the played household's. */
  world?: string;
  /** A death's cause by the game's ghost trait id: "Old Age", "Fire". */
  deathName?: (traitId: string) => string | undefined;
}): GazetteEdition {
  const { entry, nodes, saveGame } = opts;
  const recap = entry.recap;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const day = dayOf(entry.game.clock);
  const year = opts.calendar ? ` · ${yearLabel(calendarYear(day, opts.calendar))}` : '';
  const season = entry.game.season ? ` · ${entry.game.season}` : '';
  const edition: GazetteEdition = {
    title: `The ${opts.world || 'Family Trees'} Gazette`,
    dateline: `${dayText(day)}${season}${year}`,
    number: opts.number,
    front: [],
    columns: [],
  };
  if (!recap) return edition;

  const node = (s: RecapSim) => byId.get(s.id);
  const name = (s: RecapSim) => s.name;
  /** "Grand Duke Tybalt Capp", or the name alone. */
  const styled = (s: RecapSim) => {
    const t = node(s) ? topTitle(node(s)!) : undefined;
    return t ? `${t.title} ${s.name}` : s.name;
  };
  const fameOf = (s: RecapSim) => node(s)?.fame ?? 0;
  const noble = (s: RecapSim) => {
    const t = node(s) ? topTitle(node(s)!) : undefined;
    return !!t && t.rank !== undefined;
  };
  const fundsOf = (s: RecapSim) => {
    const hh = node(s)?.hhId;
    return hh ? (saveGame?.households?.[hh]?.funds ?? 0) : 0;
  };
  const partnersOf = (id: string) =>
    opts.edges
      .filter((e) => (e.type === 'marriage' || e.type === 'romance') && (e.a === id || e.b === id))
      .map((e) => byId.get(e.a === id ? e.b : e.a))
      .filter((n): n is SimNode => !!n);
  const childrenOf = (id: string) =>
    opts.edges.filter((e) => e.type === 'parent' && e.a === id).map((e) => byId.get(e.b)).filter((n): n is SimNode => !!n);

  const stories: Article[] = [];
  const births: Article[] = [];
  const obits: Article[] = [];
  const society: Article[] = [];
  const birthdays: Article[] = [];

  // Weddings and romances, weighed by who is marrying whom.
  for (const t of recap.together) {
    if (t.standing) continue;
    const ids = [t.a.id, t.b.id];
    if (t.type === 'marriage') {
      const royal = noble(t.a) || noble(t.b);
      const star = Math.max(fameOf(t.a), fameOf(t.b)) >= 3;
      const rich = Math.max(fundsOf(t.a), fundsOf(t.b)) >= RICH;
      const kind = royal ? 'A royal wedding' : star ? 'A star wedding' : rich ? 'A society wedding' : 'Wedding bells';
      const who = [t.a, t.b].map(styled);
      stories.push({
        kind: 'wedding',
        headline: `${kind}: ${name(t.a)} weds ${name(t.b)}`,
        body: `${who[0]} and ${who[1]} are married.${t.planned ? ' Just as planned.' : ''}`,
        score: 60 + (royal ? 30 : 0) + (star ? 20 : 0) + (rich ? 10 : 0),
        ids,
      });
    } else {
      society.push({ kind: 'romance', headline: `Love is in the air`, body: `${name(t.a)} and ${name(t.b)} are a couple.`, score: 30, ids });
    }
  }

  // Splits.
  for (const a of recap.apart) {
    if (a.standing) continue;
    const ids = [a.a.id, a.b.id];
    if (a.type === 'divorced')
      stories.push({ kind: 'divorce', headline: `Split! ${name(a.a)} and ${name(a.b)} divorce`, body: `${name(a.a)} and ${name(a.b)} are no longer married.`, score: 62, ids });
    else society.push({ kind: 'breakup', headline: `It's over`, body: `${name(a.a)} and ${name(a.b)} broke up.`, score: 35, ids });
  }

  // Births: twins and more lead the paper; every baby gets its line.
  const byParents = new Map<string, typeof recap.born>();
  for (const b of recap.born) {
    if (b.when) continue;
    const k = [...(b.parentIds ?? b.parents)].sort().join('|');
    byParents.set(k, [...(byParents.get(k) ?? []), b]);
  }
  for (const [, babies] of byParents) {
    const parents = babies[0]!.parents;
    const of = parents.length ? ` to ${parents.join(' and ')}` : '';
    if (babies.length > 1) {
      const word = babies.length === 2 ? 'Twins' : babies.length === 3 ? 'Triplets' : `${babies.length} babies`;
      stories.push({
        kind: 'baby',
        headline: `${word}! ${babies.length} new arrivals${parents.length ? ` for ${parents.join(' and ')}` : ''}`,
        body: `${babies.map(name).join(', ')} were born${of}.`,
        score: 72,
        ids: babies.map((b) => b.id),
      });
    }
    for (const b of babies) births.push({ kind: 'baby', headline: `Welcome, ${b.name}`, body: `${b.name} was born${of}.${b.planned ? ' A planned arrival.' : ''}`, score: 20, ids: [b.id] });
  }
  for (const f of recap.family ?? []) {
    if (f.kind === 'adopted')
      births.push({ kind: 'adoption', headline: `A new member of the family`, body: `${f.parents.map(name).join(' and ')} adopted ${f.child.name}.`, score: 25, ids: [f.child.id, ...f.parents.map((p) => p.id)] });
    else if (f.secret === undefined && f.kind === 'parentFound')
      society.push({ kind: 'society', headline: `Family ties`, body: `${f.parent.name} is ${f.child.name}'s parent, the family tree now says.`, score: 30, ids: [f.parent.id, f.child.id] });
  }

  // Passings: a death not of old age is a tragedy on the front page; every one has its obituary.
  for (const d of recap.died) {
    const n = node(d);
    // Your words first; else the game's ghost trait: the tree's for a relative, among their traits for a sim.
    const trait = n?.deathTrait ?? n?.about?.traits?.find((t) => DEATH_TRAITS.has(t));
    const cause = n?.deathCause?.trim() || (trait ? opts.deathName?.(trait) : undefined);
    const stage = n?.age && STAGE_WORDS[n.age] ? STAGE_WORDS[n.age] : '';
    const partners = n ? partnersOf(n.id).filter((p) => !hasDied(p.state)).map(cardName) : [];
    const kids = n ? childrenOf(n.id).filter((c) => !hasDied(c.state)).map(cardName) : [];
    const survived = [...partners, ...kids];
    const tragic = !!cause && !/old age/i.test(cause);
    if (tragic)
      stories.push({
        kind: 'death',
        headline: `Tragedy: ${d.name} is gone`,
        body: `${styled(d)}${stage ? `, ${stage},` : ''} has died. The cause: ${cause}.`,
        score: 80 + (noble(d) ? 10 : 0) + fameOf(d) * 3,
        ids: [d.id],
      });
    obits.push({
      kind: 'death',
      headline: styled(d),
      body: [
        cause && /old age/i.test(cause)
          ? `${d.name}${stage ? `, ${stage},` : ''} passed away of old age.`
          : `${d.name}${stage ? `, ${stage},` : ''} passed away.${cause ? ` The cause: ${cause}.` : ''}`,
        survived.length ? `Survived by ${survived.slice(0, 4).join(', ')}${survived.length > 4 ? ` and ${survived.length - 4} more` : ''}.` : '',
      ]
        .filter(Boolean)
        .join(' '),
      score: 20,
      ids: [d.id],
    });
  }

  // Scandals, secrets and feuds.
  for (const r of recap.relationships ?? []) {
    const ids = [r.a.id, r.b.id];
    if (r.kind === 'affair')
      stories.push({ kind: 'affair', headline: `Scandal! ${name(r.a)} and ${name(r.b)} in an affair`, body: `${name(r.a)} and ${name(r.b)} cheated together. Who knew, and who will find out?`, score: 100, ids });
    else if (r.kind === 'betrayed')
      stories.push({ kind: 'affair', headline: `Betrayed!`, body: `Cheating came to light between ${name(r.a)} and ${name(r.b)}.`, score: 90, ids });
    else if (r.kind === 'secretKnown')
      stories.push(
        r.link === 'parent'
          ? { kind: 'affair', headline: `Secret child revealed`, body: `${name(r.a)} is ${name(r.b)}'s parent, and it's a secret no more.`, score: 95, ids }
          : { kind: 'romance', headline: `Secret lovers no more`, body: `${name(r.a)} and ${name(r.b)} are out in the open.`, score: 70, ids },
      );
    else if (r.kind === 'enemies' && r.on)
      stories.push({ kind: 'breakup', headline: `Feud! ${name(r.a)} and ${name(r.b)} are enemies`, body: `${name(r.a)} and ${name(r.b)} can't stand each other.`, score: 48, ids });
    else if (r.kind === 'engaged') society.push({ kind: 'wedding', headline: `Engaged`, body: `${name(r.a)} and ${name(r.b)} got engaged.`, score: 40, ids });
    else if (r.kind === 'friendship' && (r.to ?? 0) === 3 && (r.from ?? 0) < 3)
      society.push({ kind: 'society', headline: `Best friends`, body: `${name(r.a)} and ${name(r.b)} are best friends now.`, score: 15, ids });
  }

  // Dynasties.
  for (const d of recap.dynasty ?? []) {
    if (d.planned) continue;
    const the = theDynasty(d.dynasty);
    if (d.kind === 'head')
      stories.push({ kind: 'head', headline: `Long live ${d.sim.name}`, body: `${styled(d.sim)} is the new head of ${the}${d.replaced ? `, in place of ${d.replaced.name}` : ''}.`, score: 75, ids: [d.sim.id] });
    else if (d.kind === 'heir')
      stories.push({ kind: 'heir', headline: `An heir for ${the}`, body: `${styled(d.sim)} is now heir of ${the}${d.replaced ? `, in place of ${d.replaced.name}` : ''}.`, score: 56, ids: [d.sim.id] });
    else if (d.kind === 'outcast')
      stories.push({ kind: 'outcast', headline: `Cast out!`, body: `${d.sim.name} is an outcast of ${the}.`, score: 74, ids: [d.sim.id] });
    else if (d.kind === 'founded')
      stories.push({ kind: 'head', headline: `A new dynasty rises`, body: `${d.sim.name} founded ${the}.`, score: 60, ids: [d.sim.id] });
  }

  // Titles, fame, life states, new names.
  for (const l of recap.life ?? []) {
    const ids = [l.sim.id];
    if (l.kind === 'title') {
      if (l.to) stories.push({ kind: 'noble', headline: `Arise, ${l.to} ${l.sim.name}`, body: `${l.sim.name} is now ${l.to}${l.from ? `, once ${l.from}` : ''}.`, score: 66, ids });
      else stories.push({ kind: 'breakup', headline: `${l.sim.name} loses a title`, body: `${l.sim.name} is no longer ${l.from}.`, score: 58, ids });
    } else if (l.kind === 'fame') {
      const to = Number(l.to);
      if (to > Number(l.from))
        (to >= 3 ? stories : society).push({ kind: 'fame', headline: `${l.sim.name}: ${FAME_WORDS[to]}!`, body: `${l.sim.name} has ${to} ${to === 1 ? 'star' : 'stars'} of fame now.`, score: 40 + to * 8, ids });
    } else if (l.kind === 'state')
      stories.push({ kind: 'birthday', headline: `Shock change for ${l.sim.name}`, body: `${l.sim.name}: ${l.from} before, ${l.to} now.`, score: 54, ids });
    else if (l.kind === 'name' || l.kind === 'renamed')
      society.push({ kind: 'society', headline: `A new name`, body: l.kind === 'name' ? `${l.sim.name} took the name ${l.to}.` : `${l.from} is now called ${l.to}.`, score: 15, ids });
  }

  // Money.
  for (const m of recap.money ?? []) {
    if (m.to >= RICH && m.from < RICH)
      stories.push({ kind: 'promotion', headline: `The ${m.hh}s strike it rich`, body: `The ${m.hh} household has ${money(m.to)} now, up from ${money(m.from)}.`, score: 52, ids: m.ids });
    else if (m.from >= 10_000 && m.to < 1_000)
      stories.push({ kind: 'breakup', headline: `Hard times for the ${m.hh}s`, body: `The ${m.hh} household is down to ${money(m.to)}, from ${money(m.from)}.`, score: 50, ids: m.ids });
  }

  // Homes and growing up, for the inside pages.
  for (const h of recap.homes ?? [])
    society.push({ kind: 'society', headline: `On the move`, body: `The ${h.hh} household moved to ${h.to}${h.from ? `, from ${h.from}` : ''}.`, score: 20, ids: h.ids });
  for (const g of recap.grew) birthdays.push({ kind: 'birthday', headline: g.name, body: `${g.name} is now ${STAGE_WORDS[g.to] ?? g.to.toLowerCase()}.`, score: 10, ids: [g.id] });

  const ranked = stories.sort((a, b) => b.score - a.score);
  const frontPage = ranked.filter((s) => s.score >= FRONT);
  edition.lead = frontPage[0] ?? ranked[0];
  edition.front = frontPage.slice(1, 1 + FRONT_MORE);
  const rest = ranked.filter((s) => s !== edition.lead && !edition.front.includes(s));
  const columns: GazetteEdition['columns'] = [
    { title: 'More news', articles: rest },
    { title: 'Society', articles: society.sort((a, b) => b.score - a.score) },
    { title: 'Births', articles: births },
    { title: 'Birthdays', articles: birthdays },
    { title: 'Obituaries', articles: obits },
  ];
  edition.columns = columns.filter((c) => c.articles.length);
  return edition;
}

/** Whether an edition has anything to print. */
export function editionHasNews(e: GazetteEdition): boolean {
  return !!e.lead || e.columns.length > 0;
}
