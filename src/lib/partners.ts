import { DECEASED_STATE, NOT_IN_WORLD } from './constants.ts';
import { approxLifeDays, lifeDays, scaleOf } from './lifeClock.ts';
import { isUnhousedGid } from './unhoused.ts';
import { cardName } from './plan.ts';
import { edgeSourceOf, endedByPassing, fold } from './utils.ts';
import { isOngoingCouple } from './coupleStory.ts';
import { currentTitles, rankOf } from './titles.ts';
import type { Edge, SaveGameInfo, SimLife, SimNode } from '../types/whiteboard.ts';

/**
 * Everyone who shares an ancestor with `id` on the board's parent links, and
 * their own descendants: parents, siblings, cousins, aunts, nieces, children.
 */
export function bloodRelatives(id: string, edges: Edge[]): Set<string> {
  const parents = new Map<string, string[]>();
  const children = new Map<string, string[]>();
  for (const e of edges) {
    // A declared parent (the one the game names for a secret child) is no blood.
    if (e.type !== 'parent' || e.declared) continue;
    parents.set(e.b, [...(parents.get(e.b) ?? []), e.a]);
    children.set(e.a, [...(children.get(e.a) ?? []), e.b]);
  }
  const roots = new Set<string>([id]);
  const up = [id];
  while (up.length) {
    for (const p of parents.get(up.pop()!) ?? []) {
      if (roots.has(p)) continue;
      roots.add(p);
      up.push(p);
    }
  }
  const out = new Set<string>(roots);
  const down = [...roots];
  while (down.length) {
    for (const c of children.get(down.pop()!) ?? []) {
      if (out.has(c)) continue;
      out.add(c);
      down.push(c);
    }
  }
  out.delete(id);
  return out;
}

/** Each sim's parents on the board's links: a declared parent (Edge.declared) is no blood. */
function parentMap(edges: readonly Edge[]): Map<string, string[]> {
  const parents = new Map<string, string[]>();
  for (const e of edges) {
    if (e.type !== 'parent' || e.declared) continue;
    parents.set(e.b, [...(parents.get(e.b) ?? []), e.a]);
  }
  return parents;
}

/** A sim and their ancestors, each with how many generations up (the sim 0, a parent 1). */
function ancestorDepths(id: string, parents: ReadonlyMap<string, string[]>): Map<string, number> {
  const out = new Map<string, number>([[id, 0]]);
  let level = [id];
  for (let depth = 1; level.length; depth++) {
    const next: string[] = [];
    for (const x of level) {
      for (const p of parents.get(x) ?? []) {
        if (out.has(p)) continue;
        out.set(p, depth);
        next.push(p);
      }
    }
    level = next;
  }
  return out;
}

/**
 * How two sims are kin by their closest shared ancestor: generations up to it
 * from each. Undefined when they share none. A parent is (1, 0) from their
 * child; siblings (1, 1); first cousins (2, 2); second cousins (3, 3).
 */
export function kinship(a: string, b: string, edges: readonly Edge[]): { up: number; down: number } | undefined {
  const parents = parentMap(edges);
  const mine = ancestorDepths(a, parents);
  const theirs = ancestorDepths(b, parents);
  let best: { up: number; down: number } | undefined;
  for (const [x, up] of mine) {
    const down = theirs.get(x);
    if (down === undefined) continue;
    if (!best || Math.min(up, down) < Math.min(best.up, best.down) || (Math.min(up, down) === Math.min(best.up, best.down) && up + down < best.up + best.down)) {
      best = { up, down };
    }
  }
  return best;
}

/** Second cousins share only great-grandparents: three generations up from each. */
export const FAR_KIN_GENERATIONS = 3;

/** Kin who share no ancestor closer than a great-grandparent on either side: second cousins and further. */
export function isFarKin(k: { up: number; down: number }): boolean {
  return Math.min(k.up, k.down) >= FAR_KIN_GENERATIONS;
}

const ORDINALS = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth'];
const TIMES = ['', 'once', 'twice', 'three times', 'four times'];

/** "second cousin", "third cousin once removed": cousins by their closest shared ancestor. */
export function cousinText(k: { up: number; down: number }): string {
  const degree = Math.min(k.up, k.down) - 1;
  const removed = Math.abs(k.up - k.down);
  const nth = ORDINALS[degree] ?? `${degree}th`;
  const times = removed ? ` ${TIMES[removed] ?? `${removed} times`} removed` : '';
  return `${nth} cousin${times}`;
}

export type PartnerCandidate = {
  id: string;
  /** Normal-lifespan days between their place in life and the sim's. */
  gap: number;
  /** The same gap in days of the save's lifespan; positive means older. */
  gapDays: number;
  /** One or both places in life are guessed from the life stage alone. */
  approx: boolean;
  frozen?: SimLife['frozen'];
  /** In a romance with someone on the board. */
  taken: boolean;
  /** Kin too far to count as blood here ("second cousin"), when the finder lets them in. */
  kin?: string;
};

/**
 * Who is suggested to whom: grown-ups (young adults, adults and elders) to
 * each other, teens to teens, children to children, and infants and
 * toddlers together. A newborn is an infant.
 */
export const PARTNER_BANDS: readonly (readonly string[])[] = [
  ['Young Adult', 'Adult', 'Elder'],
  ['Teen'],
  ['Child'],
  ['Infant', 'Toddler'],
];

/** The life stages a sim of `age` is suggested partners from; none for an unknown age. */
export function partnerBand(age: string): readonly string[] | undefined {
  return PARTNER_BANDS.find((b) => b.includes(age));
}

/**
 * A sim with no home lot: in Not in any world, or in a world's Unhoused
 * sims box. Townies the game made, mostly.
 */
export function hasNoHome(n: Pick<SimNode, 'world' | 'gid'>): boolean {
  return n.world === NOT_IN_WORLD || isUnhousedGid(n.gid);
}

/**
 * Two sims in different households, one of them at least with a home to
 * move into: a couple just linked is asked whether one moves in.
 */
export function livesApart(a: Pick<SimNode, 'world' | 'gid'>, b: Pick<SimNode, 'world' | 'gid'>): boolean {
  return a.gid !== b.gid && (!hasNoHome(a) || !hasNoHome(b));
}

/**
 * Who could move in with whom when `first` and `second` live apart: the
 * second into the first's home, then the first into the second's, each
 * only when the host has a home.
 */
export function moveInChoices<T extends Pick<SimNode, 'world' | 'gid'>>(first: T, second: T): { mover: T; host: T }[] {
  if (first.gid === second.gid) return [];
  return [
    ...(!hasNoHome(first) ? [{ mover: second, host: first }] : []),
    ...(!hasNoHome(second) ? [{ mover: first, host: second }] : []),
  ];
}

/** Days a card has lived as far as the board can tell, in Normal days. */
export function placeInLife(n: SimNode): { days: number; approx: boolean } | null {
  if (n.life && n.life.stage === n.age) {
    const d = lifeDays(n.life);
    if (d !== null) return { days: d, approx: false };
  }
  const guess = approxLifeDays(n);
  return guess === null ? null : { days: guess, approx: true };
}

/**
 * Sims who could partner `id`, closest in life first (older or younger),
 * then A to Z: living, not pets, not
 * blood relatives, not married (to anyone), and in the same band of life
 * stages (PARTNER_BANDS). `gender` narrows to one gender, `housedOnly`
 * leaves out sims with no home (hasNoHome), and `limit` keeps the closest
 * few (all by default).
 */
export function partnerCandidates(opts: {
  id: string;
  nodes: SimNode[];
  edges: Edge[];
  game?: SaveGameInfo | null;
  gender?: string;
  housedOnly?: boolean;
  limit?: number;
  /** List married sims too (the ♥ finder says who they're with, and can hide them). */
  includeMarried?: boolean;
  /** Let in kin who share no ancestor closer than a great-grandparent: second cousins and further. */
  farKin?: boolean;
}): PartnerCandidate[] {
  const focus = opts.nodes.find((n) => n.id === opts.id);
  if (!focus || focus.species) return [];
  const band = partnerBand(focus.age);
  const me = placeInLife(focus);
  if (!band || !me) return [];
  const blood = bloodRelatives(focus.id, opts.edges);
  const married = new Set<string>();
  const romance = new Set<string>();
  const dead = new Set(opts.nodes.filter((n) => n.state === DECEASED_STATE).map((n) => n.id));
  for (const e of opts.edges) {
    // A couple with a planned divorce or breakup is free in the plan, and so
    // is one a passing ended: the widowed are single.
    if (!isOngoingCouple(e, opts.edges) || endedByPassing(e, (id) => dead.has(id))) continue;
    if (e.type === 'marriage') {
      married.add(e.a);
      married.add(e.b);
    } else if (e.type === 'romance') {
      romance.add(e.a);
      romance.add(e.b);
    }
  }
  const scale = scaleOf(opts.game?.lifespan);
  const out: PartnerCandidate[] = [];
  for (const n of opts.nodes) {
    if (n.id === focus.id || n.species || n.state === DECEASED_STATE) continue;
    let kin: string | undefined;
    if (blood.has(n.id)) {
      const k = opts.farKin ? kinship(focus.id, n.id, opts.edges) : undefined;
      if (!k || !isFarKin(k)) continue;
      kin = cousinText(k);
    }
    if (married.has(n.id) && !opts.includeMarried) continue;
    if (opts.gender && n.gender !== opts.gender) continue;
    if (!band.includes(n.age)) continue;
    if (opts.housedOnly && hasNoHome(n)) continue;
    const them = placeInLife(n);
    if (!them) continue;
    const diff = them.days - me.days;
    out.push({
      id: n.id,
      gap: Math.abs(diff),
      gapDays: diff * scale,
      approx: me.approx || them.approx,
      ...(n.life?.frozen && !them.approx ? { frozen: n.life.frozen } : {}),
      taken: romance.has(n.id),
      ...(kin ? { kin } : {}),
    });
  }
  // Ties by name: every sim whose age is guessed from their life stage has
  // the same guess, so ties are common, and by id they'd look shuffled.
  const name = new Map(opts.nodes.map((n) => [n.id, `${n.first} ${n.sur}`]));
  out.sort(
    (a, b) =>
      a.gap - b.gap ||
      Number(a.approx) - Number(b.approx) ||
      name.get(a.id)!.localeCompare(name.get(b.id)!, undefined, { sensitivity: 'base' }) ||
      a.id.localeCompare(b.id),
  );
  return opts.limit ? out.slice(0, opts.limit) : out;
}

/** "same age" (under a day apart), "2 days older", "about 5 days younger". */
export function gapText(c: PartnerCandidate): string {
  const days = Math.floor(Math.abs(c.gapDays));
  if (days < 1) return c.approx ? 'about the same age' : 'same age';
  const unit = days === 1 ? 'day' : 'days';
  return `${c.approx ? 'about ' : ''}${days} ${unit} ${c.gapDays > 0 ? 'older' : 'younger'}`;
}

/** A sim the partner picker lists. */
export type PartnerHit = {
  id: string;
  /** Set when they're a suggested partner (partnerCandidates): how close in life. */
  candidate?: PartnerCandidate;
  /** Shares an ancestor with the sim, or descends from one they share. */
  related: boolean;
  /** Married to someone on the board. */
  married: boolean;
};

/**
 * Who the partner picker lists for `id`. With nothing typed, the closest
 * suggested partners (partnerCandidates). With a name typed, anyone living
 * whose name has it, suggested partners first, then the rest A to Z: a
 * plan can pair anyone, and a relative or a married sim is marked rather
 * than hidden.
 */
export function partnerSearch(opts: {
  id: string;
  nodes: SimNode[];
  edges: Edge[];
  query: string;
  game?: SaveGameInfo | null;
  /** Suggestions shown with nothing typed. */
  suggest?: number;
  /** Most matches listed. */
  limit?: number;
}): PartnerHit[] {
  const { id, nodes, edges } = opts;
  const candidates = partnerCandidates({ id, nodes, edges, game: opts.game });
  const q = fold(opts.query);
  const blood = bloodRelatives(id, edges);
  const dead = new Set(nodes.filter((n) => n.state === DECEASED_STATE).map((n) => n.id));
  const married = new Set(
    edges.filter((e) => e.type === 'marriage' && isOngoingCouple(e, edges) && !endedByPassing(e, (x) => dead.has(x))).flatMap((e) => [e.a, e.b]),
  );
  const hit = (n: SimNode, candidate?: PartnerCandidate): PartnerHit => ({
    id: n.id,
    ...(candidate ? { candidate } : {}),
    related: blood.has(n.id),
    married: married.has(n.id),
  });
  const byId = new Map(nodes.map((n) => [n.id, n]));
  if (!q) {
    return candidates.slice(0, opts.suggest ?? 6).map((c) => hit(byId.get(c.id)!, c));
  }
  const matches = (n: SimNode) =>
    fold(`${n.first} ${n.sur}`).includes(q) || fold(cardName(n)).includes(q);
  const fromCandidates = candidates
    .map((c) => byId.get(c.id)!)
    .filter(matches)
    .map((n) => hit(n, candidates.find((c) => c.id === n.id)));
  const listed = new Set(fromCandidates.map((h) => h.id));
  const rest = nodes
    .filter(
      (n) =>
        n.id !== id &&
        !listed.has(n.id) &&
        !n.species &&
        n.state !== DECEASED_STATE &&
        matches(n),
    )
    .sort((a, b) => cardName(a).localeCompare(cardName(b), undefined, { sensitivity: 'base' }))
    .map((n) => hit(n));
  return [...fromCandidates, ...rest].slice(0, opts.limit ?? 30);
}

/** One couple a sim is in now: married, or a romance (secret or not), with whom, and whether only the plan has it. */
export type CoupleNow = { type: 'marriage' | 'romance'; secret: boolean; with: string; planned: boolean };

/** What a sim is to the ♥ finder's Relationship menu: married wins over a romance. */
export type PartnerRelation = 'single' | 'romance' | 'married';

/**
 * Each sim's couples now: marriages and romances still going, planned ones
 * too; one a planned divorce or breakup ends, or a passing ended, is over.
 * `edges` are the ones shown, so with secrets hidden a secret romance isn't
 * there to tell.
 */
export function couplesNow(nodes: readonly SimNode[], edges: readonly Edge[]): Map<string, CoupleNow[]> {
  const dead = new Set(nodes.filter((n) => n.state === DECEASED_STATE).map((n) => n.id));
  const out = new Map<string, CoupleNow[]>();
  for (const e of edges) {
    if (e.type !== 'marriage' && e.type !== 'romance') continue;
    if (!isOngoingCouple(e, edges as Edge[]) || endedByPassing(e, (id) => dead.has(id))) continue;
    const planned = edgeSourceOf(e) === 'planned';
    for (const [a, b] of [
      [e.a, e.b],
      [e.b, e.a],
    ] as const) {
      out.set(a, [...(out.get(a) ?? []), { type: e.type, secret: e.type === 'romance' && !!e.secret, with: b, planned }]);
    }
  }
  return out;
}

export function relationOf(couples: readonly CoupleNow[] | undefined): PartnerRelation {
  if (!couples?.length) return 'single';
  return couples.some((c) => c.type === 'marriage') ? 'married' : 'romance';
}

/** "A", "A and B", "A, B and C": every name, never cut short. */
function names(xs: string[]): string {
  return xs.length < 2 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
}

/**
 * Who a sim is with, by name, for their card: "Married to Thiago Abrantes ·
 * secret romance with Fia Acosta"; a couple only the plan has says so.
 * Empty when single.
 */
export function coupleLine(couples: readonly CoupleNow[] | undefined, nameOf: (id: string) => string): string {
  if (!couples?.length) return '';
  const who = (cs: CoupleNow[]) => names(cs.map((c) => `${nameOf(c.with)}${c.planned ? ' (planned)' : ''}`));
  const married = couples.filter((c) => c.type === 'marriage');
  const open = couples.filter((c) => c.type === 'romance' && !c.secret);
  const secret = couples.filter((c) => c.type === 'romance' && c.secret);
  const parts = [
    married.length ? `married to ${who(married)}` : '',
    open.length ? `in a romance with ${who(open)}` : '',
    secret.length ? `secret romance with ${who(secret)}` : '',
  ].filter(Boolean);
  const line = parts.join(' · ');
  return line.charAt(0).toUpperCase() + line.slice(1);
}

/**
 * The ♥ finder's filters; '' is any. `title`: 'titled' for any title held
 * now, or 'rN' for rank N or higher (titles.ts rankOf). `marker`: a board
 * marker's id.
 */
export type PartnerFilters = {
  stage: string;
  gender: string;
  relation: '' | PartnerRelation;
  world: string;
  housedOnly: boolean;
  title?: string;
  marker?: string;
};

/** A sim the ♥ finder can list, with what its filters look at. */
export type PartnerOption = {
  id: string;
  candidate: PartnerCandidate;
  couples: CoupleNow[];
  relation: PartnerRelation;
  stage: string;
  gender: string;
  world: string;
  noHome: boolean;
  /** Holds a title now, and the highest rank among them. */
  titled: boolean;
  rank?: number;
  /** The board's markers they carry. */
  markers: string[];
};

/**
 * Everyone who could partner `id` for the ♥ finder, closest in life first:
 * as partnerCandidates, married sims too, each with who they're with now.
 */
export function partnerOptions(opts: { id: string; nodes: SimNode[]; edges: Edge[]; game?: SaveGameInfo | null; farKin?: boolean }): PartnerOption[] {
  const byId = new Map(opts.nodes.map((n) => [n.id, n]));
  const couples = couplesNow(opts.nodes, opts.edges);
  return partnerCandidates({ ...opts, includeMarried: true }).map((c) => {
    const n = byId.get(c.id)!;
    const cs = couples.get(c.id) ?? [];
    const rank = rankOf(n);
    return {
      id: c.id,
      candidate: c,
      couples: cs,
      relation: relationOf(cs),
      stage: n.age,
      gender: n.gender,
      world: n.world,
      noHome: hasNoHome(n),
      titled: currentTitles(n).length > 0,
      ...(rank !== undefined ? { rank } : {}),
      markers: n.markers ?? [],
    };
  });
}

/** Whether an option passes the Title filter: any title, or rank N or higher. */
function titlePasses(o: PartnerOption, title: string | undefined): boolean {
  if (!title) return true;
  if (title === 'titled') return o.titled;
  const at = /^r(\d+)$/.exec(title);
  return !!at && o.rank !== undefined && o.rank >= Number(at[1]);
}

/**
 * The Title menu: 'titled', then each rank someone listed holds, highest
 * first ("rank 9 or higher"), each with how many it leaves.
 */
export function partnerTitleChoices(list: readonly PartnerOption[], f: PartnerFilters): { value: string; count: number }[] {
  const pool = filterPartners(list, f, 'title');
  const ranks = [...new Set(pool.flatMap((o) => (o.rank !== undefined ? [o.rank] : [])))].sort((a, b) => b - a);
  const titled = pool.filter((o) => o.titled).length;
  return [
    ...(titled ? [{ value: 'titled', count: titled }] : []),
    ...ranks.map((r) => ({ value: `r${r}`, count: pool.filter((o) => o.rank !== undefined && o.rank >= r).length })),
  ];
}

/** How many each marker leaves, with the other filters on. */
export function partnerMarkerCounts(list: readonly PartnerOption[], f: PartnerFilters): Map<string, number> {
  const out = new Map<string, number>();
  for (const o of filterPartners(list, f, 'marker')) for (const m of o.markers) out.set(m, (out.get(m) ?? 0) + 1);
  return out;
}

/** The options the filters keep; `skip` leaves one filter out, for that menu's own counts. */
export function filterPartners(list: readonly PartnerOption[], f: PartnerFilters, skip?: keyof PartnerFilters): PartnerOption[] {
  return list.filter(
    (o) =>
      (skip === 'stage' || !f.stage || o.stage === f.stage) &&
      (skip === 'gender' || !f.gender || o.gender === f.gender) &&
      (skip === 'relation' || !f.relation || o.relation === f.relation) &&
      (skip === 'world' || !f.world || o.world === f.world) &&
      (skip === 'housedOnly' || !f.housedOnly || !o.noHome) &&
      (skip === 'title' || titlePasses(o, f.title)) &&
      (skip === 'marker' || !f.marker || o.markers.includes(f.marker)),
  );
}

/** How many each value of one field leaves, with the other filters on. */
export function partnerCounts<K extends 'stage' | 'relation' | 'world'>(
  list: readonly PartnerOption[],
  f: PartnerFilters,
  key: K,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const o of filterPartners(list, f, key)) out.set(o[key], (out.get(o[key]) ?? 0) + 1);
  return out;
}

/**
 * The World menu's worlds: theirs first, then the others A to Z, Not in any
 * world last; only those with someone left, and the one picked.
 */
export function partnerWorlds(counts: ReadonlyMap<string, number>, own: string, picked: string): string[] {
  const worlds = [...counts.keys()].filter((w) => w !== own && w !== NOT_IN_WORLD).sort((a, b) => a.localeCompare(b));
  const out = [...(counts.has(own) && own !== NOT_IN_WORLD ? [own] : []), ...worlds, ...(counts.has(NOT_IN_WORLD) ? [NOT_IN_WORLD] : [])];
  return picked && !out.includes(picked) ? [...out, picked] : out;
}
