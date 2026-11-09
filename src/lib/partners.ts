import { DECEASED_STATE, NOT_IN_WORLD } from './constants.ts';
import { approxLifeDays, lifeDays, scaleOf } from './lifeClock.ts';
import { isUnhousedGid } from './unhoused.ts';
import { cardName } from './plan.ts';
import { fold } from './utils.ts';
import type { Edge, SaveGameInfo, SimLife, SimNode } from '../types/whiteboard.ts';

/**
 * Everyone who shares an ancestor with `id` on the board's parent links, and
 * their own descendants: parents, siblings, cousins, aunts, nieces, children.
 */
export function bloodRelatives(id: string, edges: Edge[]): Set<string> {
  const parents = new Map<string, string[]>();
  const children = new Map<string, string[]>();
  for (const e of edges) {
    if (e.type !== 'parent') continue;
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

/** Days a card has lived as far as the board can tell, in Normal days. */
function placeInLife(n: SimNode): { days: number; approx: boolean } | null {
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
}): PartnerCandidate[] {
  const focus = opts.nodes.find((n) => n.id === opts.id);
  if (!focus || focus.species) return [];
  const band = partnerBand(focus.age);
  const me = placeInLife(focus);
  if (!band || !me) return [];
  const blood = bloodRelatives(focus.id, opts.edges);
  const married = new Set<string>();
  const romance = new Set<string>();
  for (const e of opts.edges) {
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
    if (blood.has(n.id) || married.has(n.id)) continue;
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
  const married = new Set(edges.filter((e) => e.type === 'marriage').flatMap((e) => [e.a, e.b]));
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
