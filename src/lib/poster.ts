import { DECEASED_STATE, DYNASTY_ROLES } from './constants.ts';
import { dynastyGenerations, dynastyKey } from './generations.ts';
import { dayOf, dayText, seasonNow } from './lifeClock.ts';
import { NOT_YET_AGE, cardName, isPlannedSim } from './plan.ts';
import { successionLine } from './succession.ts';
import { edgeSourceOf, isPet } from './utils.ts';
import type { Edge, Group, SaveGameInfo, SimNode } from '../types/whiteboard.ts';

/** One sim on a poster. */
export type PosterCard = {
  id: string;
  name: string;
  /** "Young Adult", "Not born yet", "Cat". */
  stage: string;
  /** "👑 Head of the Goth dynasty", or on its own poster "👑 Head": a dynasty role they hold. */
  role?: string;
  deceased: boolean;
  /** Not in the game yet: drawn as the board draws plans. */
  planned: boolean;
  /** Their household's colour on the board. */
  color: string;
  /**
   * What the poster can't draw as a line, in words: a partner not beside
   * them ("Married to Caleb Vatore"), parents not above them ("Child of
   * Odette Capp").
   */
  notes?: string[];
};

/** A row of cards, under a heading or none. */
export type PosterRow = { label?: string; cards: PosterCard[] };

/** Two sims side by side in a row, joined: married, partners, divorced, or parents of a child together. */
export type PosterCouple = {
  a: string;
  b: string;
  type: 'marriage' | 'romance' | 'divorced' | 'coparents';
  /** Not in the save yet. */
  planned: boolean;
  /** A divorce or breakup planned for a couple the game has. */
  ending: boolean;
};

/** Children on the poster and their parents on it: a line down from the parents to each child. */
export type PosterFamily = {
  parents: string[];
  children: { id: string; planned: boolean; adopted: boolean }[];
};

/**
 * What a poster shows: a household or a dynasty, its place, its sims in
 * rows (a household's as on the board, a dynasty's by generation), the
 * couples and parents among them, and for a dynasty its line of succession.
 */
export type PosterModel = {
  kind: 'household' | 'dynasty';
  title: string;
  subtitle: string;
  world?: string;
  nb?: string;
  color: string;
  /** A dynasty's line: "👑 Mortimer Goth", "⚜️ Cassandra Goth", "Olivia Goth". */
  line?: string[];
  /** Each row is one line of cards, partners side by side and children under their parents. */
  rows: PosterRow[];
  couples: PosterCouple[];
  families: PosterFamily[];
  /** The save's calendar when it has one: "Short · Spring, day 6 of 7". */
  calendar: string;
  /** For the file: "goth-household". */
  slug: string;
};

/**
 * The save's calendar for a poster's foot: "Spring, day 6 of 7 · Short
 * lifespan", or "Day 6 · Short lifespan" without Seasons. Empty with no save.
 */
export function posterCalendar(game: SaveGameInfo | null | undefined): string {
  if (!game) return '';
  const s = seasonNow(game);
  const when = s ? `${s.season}, day ${s.day} of ${s.of}` : game.calendar === 'days' ? dayText(dayOf(game.clock)) : '';
  return [when, game.lifespan ? `${game.lifespan} lifespan` : ''].filter(Boolean).join(' · ');
}

const slugOf = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'poster';

function cardOf(n: SimNode, onDynastyPoster = false): PosterCard {
  const planned = isPlannedSim(n);
  const role = n.dynastyRole && n.dynastyPlan !== 'none' && n.dynasty ? n.dynastyRole : undefined;
  return {
    id: n.id,
    name: cardName(n),
    stage: isPet(n) ? (n.species ?? 'Pet') : planned && (n.age === NOT_YET_AGE || !n.age) ? 'Not born yet' : n.age,
    ...(role
      ? {
          role: `${DYNASTY_ROLES[role].mark} ${DYNASTY_ROLES[role].noun}${onDynastyPoster ? '' : ` of the ${n.dynasty} dynasty`}`,
        }
      : {}),
    deceased: n.state === DECEASED_STATE,
    planned,
    color: n.color,
  };
}

const COUPLE_RANK: Record<string, number> = { marriage: 0, romance: 1, divorced: 2 };

/**
 * The relationships among `rows`' sims, from the links the board shows
 * (`links`: secret ones gone when the board hides them), and the rows
 * ordered to draw them: partners side by side, each row's sims under their
 * parents in the rows above, the rest in the order they came. Each sim is in
 * at most one couple: a marriage before a romance before a divorce; two
 * parents of a child in one row with no couple of their own sit together
 * too. A partner the poster can't put beside them, or parents not in a
 * row above, are named on the card instead.
 */
function relate(
  rows: SimNode[][],
  links: readonly Edge[],
  nameOf: Map<string, SimNode>,
): { rows: SimNode[][]; couples: PosterCouple[]; families: PosterFamily[]; notes: Map<string, string[]> } {
  const rowOf = new Map<string, number>();
  rows.forEach((r, i) => r.forEach((n) => rowOf.set(n.id, i)));
  const on = (id: string) => rowOf.has(id);

  // Couples, the strongest link first; each sim in one.
  const paired = new Map<string, PosterCouple>();
  const partnerOf = new Map<string, string>();
  const notes = new Map<string, string[]>();
  const note = (id: string, text: string) => notes.set(id, [...(notes.get(id) ?? []), text]);
  const coupleLinks = links
    .filter((e) => e.type in COUPLE_RANK && (on(e.a) || on(e.b)) && e.a !== e.b)
    .sort((x, y) => COUPLE_RANK[x.type]! - COUPLE_RANK[y.type]! || Number(!!x.ending) - Number(!!y.ending));
  for (const e of coupleLinks) {
    const type = e.type as PosterCouple['type'];
    if (on(e.a) && on(e.b) && rowOf.get(e.a) === rowOf.get(e.b)) {
      if (paired.has(e.a) || paired.has(e.b)) continue;
      const c: PosterCouple = { a: e.a, b: e.b, type, planned: edgeSourceOf(e) === 'planned', ending: !!e.ending };
      paired.set(e.a, c).set(e.b, c);
      continue;
    }
    // One of them off the poster, or in another row: said on the card, once.
    if (type === 'divorced') continue;
    for (const [me, other] of [[e.a, e.b], [e.b, e.a]] as const) {
      const o = nameOf.get(other);
      if (!on(me) || paired.has(me) || partnerOf.has(me) || !o) continue;
      partnerOf.set(me, other);
      note(me, `${type === 'marriage' ? 'Married to' : 'Partner of'} ${cardName(o)}${edgeSourceOf(e) === 'planned' ? ' (planned)' : ''}`);
    }
  }

  // Families: each child's parents on the poster, children of the same parents together.
  const parentsOf = new Map<string, Edge[]>();
  for (const e of links) {
    if (e.type !== 'parent' || !on(e.a) || !on(e.b)) continue;
    parentsOf.set(e.b, [...(parentsOf.get(e.b) ?? []), e]);
  }
  const families = new Map<string, PosterFamily>();
  for (const [child, es] of parentsOf) {
    const parents = [...new Set(es.map((e) => e.a))].sort();
    const key = parents.join('|');
    const fam = families.get(key) ?? { parents, children: [] };
    fam.children.push({ id: child, planned: es.some((e) => edgeSourceOf(e) === 'planned'), adopted: es.some((e) => !!e.adopted) });
    families.set(key, fam);
    // Two parents in one row with no couple of their own still sit together.
    const [p, q] = parents;
    if (parents.length === 2 && rowOf.get(p!) === rowOf.get(q!) && !paired.has(p!) && !paired.has(q!)) {
      const c: PosterCouple = { a: p!, b: q!, type: 'coparents', planned: false, ending: false };
      paired.set(p!, c).set(q!, c);
    }
  }

  // Each row in order: couples together, sims under their parents.
  const at = new Map<string, number>();
  const ordered = rows.map((row) => {
    const mid = (row.length - 1) / 2;
    const home = new Map(row.map((n, i) => [n.id, i - mid]));
    const under = (id: string): number | undefined => {
      const ps = (parentsOf.get(id) ?? []).map((e) => at.get(e.a)).filter((x): x is number => x !== undefined);
      return ps.length ? ps.reduce((s, x) => s + x, 0) / ps.length : undefined;
    };
    const units: { ids: string[]; key: number; first: number }[] = [];
    const placed = new Set<string>();
    row.forEach((n, i) => {
      if (placed.has(n.id)) return;
      const c = paired.get(n.id);
      const partner = c ? (c.a === n.id ? c.b : c.a) : null;
      const ids = partner && home.has(partner) && !placed.has(partner) ? [n.id, partner] : [n.id];
      ids.forEach((id) => placed.add(id));
      const keys = ids.map(under).filter((x): x is number => x !== undefined);
      const key = keys.length ? keys.reduce((s, x) => s + x, 0) / keys.length : (ids.reduce((s, id) => s + home.get(id)!, 0) / ids.length);
      // The partner whose parents are on the poster stands on their side.
      if (ids.length === 2) ids.sort((x, y) => (under(x) ?? key) - (under(y) ?? key));
      units.push({ ids, key, first: i });
    });
    units.sort((x, y) => x.key - y.key || x.first - y.first);
    const byId = new Map(row.map((n) => [n.id, n]));
    const out = units.flatMap((u) => u.ids.map((id) => byId.get(id)!));
    out.forEach((n, i) => at.set(n.id, i - mid));
    return out;
  });
  const couples = [...new Set(paired.values())];
  // Parents in the same row as their child, or below it: no line down, so said on the child's card.
  const drawn: PosterFamily[] = [];
  for (const f of families.values()) {
    const top = Math.max(...f.parents.map((p) => rowOf.get(p)!));
    const below = f.children.filter((k) => rowOf.get(k.id)! > top);
    for (const k of f.children.filter((x) => rowOf.get(x.id)! <= top)) {
      const names = f.parents.map((p) => nameOf.get(p)).filter((n): n is SimNode => !!n).map(cardName);
      note(k.id, `${k.adopted ? 'Adopted by' : 'Child of'} ${names.length < 2 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`}`);
    }
    if (below.length) drawn.push({ ...f, children: below });
  }
  return { rows: ordered, couples, families: drawn, notes };
}

/** Rows of sims as poster rows, with what joins them. */
function posterRows(
  rows: { label?: string; sims: SimNode[] }[],
  links: readonly Edge[],
  nodes: SimNode[],
  onDynastyPoster: boolean,
): Pick<PosterModel, 'rows' | 'couples' | 'families'> {
  const r = relate(
    rows.map((x) => x.sims),
    links,
    new Map(nodes.map((n) => [n.id, n])),
  );
  return {
    rows: r.rows.map((sims, i) => ({
      ...(rows[i]!.label ? { label: rows[i]!.label } : {}),
      cards: sims.map((n) => {
        const c = cardOf(n, onDynastyPoster);
        const notes = r.notes.get(n.id);
        return notes ? { ...c, notes } : c;
      }),
    })),
    couples: r.couples,
    families: r.families,
  };
}

/** Left to right, top to bottom, as the cards sit on the board. */
const byPlace = (a: SimNode, b: SimNode) => a.y - b.y || a.x - b.x;

/** Sims in rows as the board has them: a new row wherever a card sits lower than the last row by half a card. */
function boardRows(sims: SimNode[]): SimNode[][] {
  const rows: SimNode[][] = [];
  let top = -Infinity;
  for (const n of [...sims].sort((a, b) => a.y - b.y)) {
    const row = rows[rows.length - 1];
    if (row && n.y - top < Math.max(20, n.h / 2)) row.push(n);
    else {
      rows.push([n]);
      top = n.y;
    }
  }
  return rows.map((r) => r.sort((a, b) => a.x - b.x));
}

/** Pets in rows by generation: those with no parent among them first, their young under them. */
function petGenerations(pets: SimNode[], links: readonly Edge[]): SimNode[][] {
  const ids = new Set(pets.map((p) => p.id));
  const parents = new Map<string, string[]>();
  for (const e of links) if (e.type === 'parent' && ids.has(e.a) && ids.has(e.b)) parents.set(e.b, [...(parents.get(e.b) ?? []), e.a]);
  const depth = new Map<string, number>();
  const of = (id: string, seen: Set<string>): number => {
    const known = depth.get(id);
    if (known !== undefined) return known;
    if (seen.has(id)) return 0;
    seen.add(id);
    const d = Math.max(-1, ...(parents.get(id) ?? []).map((p) => of(p, seen))) + 1;
    depth.set(id, d);
    return d;
  };
  const rows: SimNode[][] = [];
  for (const p of pets) (rows[of(p.id, new Set())] ??= []).push(p);
  return rows.filter((r) => r?.length);
}

/** A household's poster: its sims in their board rows, then its pets. */
export function householdPoster(opts: {
  group: Group;
  nodes: SimNode[];
  /** The links the board shows (without secrets when it hides them). */
  links?: readonly Edge[];
  /** Its game lot's name. */
  lot?: string;
  saveGame?: SaveGameInfo | null;
}): PosterModel {
  const { group, nodes, links = [], lot, saveGame } = opts;
  const members = nodes.filter((n) => n.gid === group.gid);
  const people = members.filter((n) => !isPet(n));
  const pets = members.filter(isPet).sort(byPlace);
  const sims: { label?: string; sims: SimNode[] }[] = boardRows(people).map((r) => ({ sims: r }));
  // Pets by generation among them, so a litter sits under its parents.
  petGenerations(pets, links).forEach((row, i) =>
    sims.push(i ? { sims: row } : { label: pets.length === 1 ? 'Pet' : 'Pets', sims: row }),
  );
  const { rows, couples, families } = posterRows(sims, links, nodes, false);
  return {
    kind: 'household',
    title: `The ${group.hh} household`,
    subtitle: [lot, group.nb && group.nb !== '-' ? group.nb : '', group.world].filter(Boolean).join(' · '),
    world: group.world,
    ...(group.nb && group.nb !== '-' ? { nb: group.nb } : {}),
    color: group.color,
    rows,
    couples,
    families,
    calendar: posterCalendar(saveGame),
    slug: `${slugOf(group.hh)}-household`,
  };
}

/**
 * A dynasty's poster: its line of succession, then its members by
 * generation (Gen 1 its first head's oldest known ancestor), each
 * generation left to right as on the board. Members the count gives no
 * number close it.
 */
export function dynastyPoster(opts: {
  key: string;
  /** "Goth", or "Ngata (Oliana’s line)" for one of two. */
  label: string;
  nodes: SimNode[];
  edges: Edge[];
  /** The links the board shows (without secrets when it hides them); every link by default. */
  links?: readonly Edge[];
  saveGame?: SaveGameInfo | null;
}): PosterModel {
  const { key, label, nodes, edges, links = edges, saveGame } = opts;
  const members = nodes.filter((n) => dynastyKey(n) === key && !isPet(n) && n.dynastyPlan !== 'none');
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const gens = dynastyGenerations(nodes, edges);
  const rank = (n: SimNode) => (n.dynastyRole === 'head' ? 0 : n.dynastyRole === 'heir' ? 1 : 2);
  const groups = new Map<string, { order: number; label: string; sims: SimNode[] }>();
  for (const n of members) {
    const g = gens.get(n.id);
    const at =
      g?.gen !== undefined && !g.before
        ? { key: `g${g.gen}`, order: g.gen, label: `Generation ${g.gen}` }
        : g?.before
          ? { key: 'before', order: 0, label: 'Before Generation 1' }
          : { key: 'other', order: Infinity, label: 'Also in the dynasty' };
    const row = groups.get(at.key) ?? { order: at.order, label: at.label, sims: [] };
    row.sims.push(n);
    groups.set(at.key, row);
  }
  const { rows, couples, families } = posterRows(
    [...groups.values()]
      .sort((a, b) => a.order - b.order)
      .map((g) => ({ label: g.label, sims: g.sims.sort((a, b) => rank(a) - rank(b) || byPlace(a, b)) })),
    links,
    nodes,
    true,
  );
  const line = successionLine(nodes, key).map((p) => {
    const n = byId.get(p.id)!;
    const mark = p.place === 'head' ? `${DYNASTY_ROLES.head.mark} ` : p.place === 'heir' ? `${DYNASTY_ROLES.heir.mark} ` : '';
    return `${mark}${cardName(n)}`;
  });
  const head = members.find((n) => n.dynastyRole === 'head' && n.state !== DECEASED_STATE) ?? members[0];
  const living = members.filter((n) => n.state !== DECEASED_STATE).length;
  const deceased = members.length - living;
  return {
    kind: 'dynasty',
    title: `The ${label} dynasty`,
    subtitle: [
      `${living} living ${living === 1 ? 'member' : 'members'}`,
      deceased ? `${deceased} remembered` : '',
      head?.world && head.world !== '-' ? `head in ${head.world}` : '',
    ]
      .filter(Boolean)
      .join(' · '),
    ...(head?.world ? { world: head.world } : {}),
    ...(head?.nb && head.nb !== '-' ? { nb: head.nb } : {}),
    color: head?.color ?? '#5a6675',
    ...(line.length ? { line } : {}),
    rows,
    couples,
    families,
    calendar: posterCalendar(saveGame),
    slug: `${slugOf(label)}-dynasty`,
  };
}
