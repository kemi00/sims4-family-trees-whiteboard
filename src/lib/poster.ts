import { DECEASED_STATE, DYNASTY_ROLES } from './constants.ts';
import { dynastyGenerations, dynastyKey } from './generations.ts';
import { dayOf, dayText, seasonNow } from './lifeClock.ts';
import { NOT_YET_AGE, cardName, isPlannedSim } from './plan.ts';
import { successionLine } from './succession.ts';
import { isPet } from './utils.ts';
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
};

/** A row of cards, under a heading or none. */
export type PosterRow = { label?: string; cards: PosterCard[] };

/**
 * What a poster shows: a household or a dynasty, its place, its sims in
 * rows (a household's as on the board, a dynasty's by generation) and,
 * for a dynasty, its line of succession.
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
  rows: PosterRow[];
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

/** A household's poster: its sims in their board rows, then its pets. */
export function householdPoster(opts: {
  group: Group;
  nodes: SimNode[];
  /** Its game lot's name. */
  lot?: string;
  saveGame?: SaveGameInfo | null;
}): PosterModel {
  const { group, nodes, lot, saveGame } = opts;
  const members = nodes.filter((n) => n.gid === group.gid);
  const people = members.filter((n) => !isPet(n));
  const pets = members.filter(isPet).sort(byPlace);
  const rows: PosterRow[] = boardRows(people).map((r) => ({ cards: r.map((n) => cardOf(n)) }));
  if (pets.length) rows.push({ label: pets.length === 1 ? 'Pet' : 'Pets', cards: pets.map((n) => cardOf(n)) });
  return {
    kind: 'household',
    title: `The ${group.hh} household`,
    subtitle: [lot, group.nb && group.nb !== '-' ? group.nb : '', group.world].filter(Boolean).join(' · '),
    world: group.world,
    ...(group.nb && group.nb !== '-' ? { nb: group.nb } : {}),
    color: group.color,
    rows,
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
  saveGame?: SaveGameInfo | null;
}): PosterModel {
  const { key, label, nodes, edges, saveGame } = opts;
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
  const rows = [...groups.values()]
    .sort((a, b) => a.order - b.order)
    .map((g) => ({ label: g.label, cards: g.sims.sort((a, b) => rank(a) - rank(b) || byPlace(a, b)).map((n) => cardOf(n, true)) }));
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
    calendar: posterCalendar(saveGame),
    slug: `${slugOf(label)}-dynasty`,
  };
}
