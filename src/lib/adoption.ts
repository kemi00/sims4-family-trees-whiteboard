import { DECEASED_STATE } from './constants.ts';
import { scaleOf } from './lifeClock.ts';
import { bloodRelatives, placeInLife, type PartnerCandidate } from './partners.ts';
import { cardName } from './plan.ts';
import { fold } from './utils.ts';
import type { Edge, SaveGameInfo, SimNode } from '../types/whiteboard.ts';

/** Life stages that can adopt, as in the game: young adults and older. */
export const ADOPTER_AGES: readonly string[] = ['Young Adult', 'Adult', 'Elder'];

/** Why `n` can't adopt, or null when they can. */
export function whyCantAdopt(n: SimNode): string | null {
  if (n.species) return 'Pets don’t adopt.';
  if (n.state === DECEASED_STATE) return 'The deceased don’t adopt.';
  if (!ADOPTER_AGES.includes(n.age)) return 'Only young adults and older can adopt.';
  return null;
}

/** A sim the adoption picker lists. */
export type AdopteeHit = {
  id: string;
  /** How much younger than the adopter (gapDays is negative). */
  candidate: PartnerCandidate;
  /** Parents the board already gives them. */
  parents: number;
};

const COUPLE_TYPES: ReadonlySet<Edge['type']> = new Set(['marriage', 'romance', 'divorced']);

/** `id`'s family for adoption: blood relatives, partners and exes. */
function familyOf(id: string, edges: Edge[]): Set<string> {
  const family = bloodRelatives(id, edges);
  for (const e of edges) {
    if (!COUPLE_TYPES.has(e.type)) continue;
    if (e.a === id) family.add(e.b);
    if (e.b === id) family.add(e.a);
  }
  return family;
}

/** Why `child` can't be planned as adopted by `parent`, or null when they can. */
export function whyNotAdopt(
  parent: SimNode,
  child: SimNode,
  edges: Edge[],
  unborn?: ReadonlySet<string>,
): string | null {
  const own = whyCantAdopt(parent);
  if (own) return own;
  if (child.species) return `${child.first} is a pet.`;
  if (child.state === DECEASED_STATE) return `${child.first} has died.`;
  if (unborn?.has(child.id)) return `${child.first} isn’t born yet.`;
  if (familyOf(parent.id, edges).has(child.id)) return 'They’re family already.';
  const mine = placeInLife(parent);
  const theirs = placeInLife(child);
  if (!mine || !theirs || theirs.days >= mine.days) return `${child.first} isn’t younger than ${parent.first}.`;
  return null;
}

/**
 * Who `ids` (one sim, or a couple adopting together) could adopt, youngest
 * first, then A to Z: living sims (not pets, not babies still planned in
 * `unborn`), younger than each of them, who aren't family to any of them
 * already: no blood relative (bloodRelatives), and no partner or ex. How
 * much younger is said against the younger adopter. A name in `query`
 * narrows the list; `limit` keeps the first few.
 */
export function adopteeSearch(opts: {
  ids: string[];
  nodes: SimNode[];
  edges: Edge[];
  query?: string;
  game?: SaveGameInfo | null;
  unborn?: ReadonlySet<string>;
  limit?: number;
}): AdopteeHit[] {
  const adopters = opts.ids.map((id) => opts.nodes.find((n) => n.id === id));
  if (!adopters.length || adopters.some((a) => !a || whyCantAdopt(a))) return [];
  const lives = adopters.map((a) => placeInLife(a!));
  if (lives.some((l) => !l)) return [];
  // The younger adopter sets how young the child must be.
  const mine = lives.reduce((y, l) => (l!.days < y!.days ? l : y))!;
  const family = new Set(opts.ids);
  for (const id of opts.ids) for (const f of familyOf(id, opts.edges)) family.add(f);
  const parents = new Map<string, number>();
  for (const e of opts.edges) if (e.type === 'parent') parents.set(e.b, (parents.get(e.b) ?? 0) + 1);
  const q = fold(opts.query ?? '');
  const scale = scaleOf(opts.game?.lifespan);
  const out: (AdopteeHit & { days: number; name: string })[] = [];
  for (const n of opts.nodes) {
    if (n.species || n.state === DECEASED_STATE) continue;
    if (family.has(n.id) || opts.unborn?.has(n.id)) continue;
    const theirs = placeInLife(n);
    if (!theirs || theirs.days >= mine.days) continue;
    const name = cardName(n);
    if (q && !fold(`${n.first} ${n.sur}`).includes(q) && !fold(name).includes(q)) continue;
    const diff = theirs.days - mine.days;
    out.push({
      id: n.id,
      candidate: {
        id: n.id,
        gap: Math.abs(diff),
        gapDays: diff * scale,
        approx: lives.some((l) => l!.approx) || theirs.approx,
        ...(n.life?.frozen && !theirs.approx ? { frozen: n.life.frozen } : {}),
        taken: false,
      },
      parents: parents.get(n.id) ?? 0,
      days: theirs.days,
      name,
    });
  }
  out.sort(
    (a, b) =>
      a.days - b.days ||
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) ||
      a.id.localeCompare(b.id),
  );
  const hits = out.map(({ days: _d, name: _n, ...h }) => h);
  return opts.limit ? hits.slice(0, opts.limit) : hits;
}
