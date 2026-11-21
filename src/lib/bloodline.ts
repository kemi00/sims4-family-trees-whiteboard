import type { Edge } from '../types/whiteboard.ts';

/**
 * How far a sim's line reaches: their children only, every descendant
 * (grandchildren and further down), or ancestors too, up and down.
 */
export type BloodlineReach = 'children' | 'descendants' | 'both';

export const BLOODLINE_REACHES: readonly BloodlineReach[] = ['children', 'descendants', 'both'];

/** The switch's words, and what each takes in. */
export const REACH_LABEL: Record<BloodlineReach, string> = {
  children: 'Children',
  descendants: 'Descendants',
  both: 'Ancestors too',
};
export const REACH_HINT: Record<BloodlineReach, string> = {
  children: 'Their children only',
  descendants: 'Children, grandchildren and further down',
  both: 'Parents, grandparents and further up, and every descendant',
};

/** "Consort Capp’s descendants": what the line is called, by its reach. */
export const REACH_NOUN: Record<BloodlineReach, string> = {
  children: 'children',
  descendants: 'descendants',
  both: 'bloodline',
};

export type Bloodline = {
  id: string;
  reach: BloodlineReach;
  /** The sim and everyone in their line. */
  ids: Set<string>;
  /**
   * Each relative's generation from the sim: 1 their children, 2
   * grandchildren; -1 parents, -2 grandparents. The nearer one when a
   * sim comes down two ways (cousins who married).
   */
  generation: Map<string, number>;
  /**
   * Who links each relative to the line, one generation nearer the sim:
   * a descendant's parents in it, an ancestor's children in it.
   */
  via: Map<string, string[]>;
  /** Relatives whose link to the line is an adoption. */
  adopted: Set<string>;
  /** The line has an adoption in it (a child, or the sim's own adoptive parent), counted or not: the switch shows. */
  hasAdopted: boolean;
};

type Options = {
  /** Count adopted children, and adoptive parents. On unless you turn it off. */
  adopted?: boolean;
};

/**
 * A sim's line on parent links, generation by generation (breadth first,
 * so the nearer generation wins). Down for children and descendants, up
 * and down for ancestors too. Adopted children count unless `adopted` is
 * false; `hasAdopted` says whether there is one to count either way.
 * Spouses, siblings and step-family are not in the line.
 */
export function bloodlineOf(id: string, edges: readonly Edge[], reach: BloodlineReach, opts: Options = {}): Bloodline {
  const countAdopted = opts.adopted ?? true;
  const down = new Map<string, Edge[]>();
  const up = new Map<string, Edge[]>();
  for (const e of edges) {
    if (e.type !== 'parent' || e.a === e.b) continue;
    down.set(e.a, [...(down.get(e.a) ?? []), e]);
    up.set(e.b, [...(up.get(e.b) ?? []), e]);
  }
  const ids = new Set<string>([id]);
  const generation = new Map<string, number>();
  const via = new Map<string, string[]>();
  const adopted = new Set<string>();
  let hasAdopted = false;

  const walk = (step: 1 | -1, maxDepth: number) => {
    let ring = [id];
    for (let depth = 1; ring.length && depth <= maxDepth; depth++) {
      const next: string[] = [];
      for (const from of ring) {
        for (const e of (step > 0 ? down : up).get(from) ?? []) {
          const to = step > 0 ? e.b : e.a;
          if (e.adopted) hasAdopted = true;
          if (e.adopted && !countAdopted) continue;
          if (to === id) continue;
          const had = generation.get(to);
          if (had !== undefined && Math.abs(had) < depth) continue;
          if (had === undefined) {
            generation.set(to, step * depth);
            ids.add(to);
            next.push(to);
          }
          // Everyone at this depth who links them, once: two parents in the line.
          const by = via.get(to) ?? [];
          if (!by.includes(from)) via.set(to, [...by, from]);
          if (e.adopted) adopted.add(to);
        }
      }
      ring = next;
    }
  };
  walk(1, reach === 'children' ? 1 : Infinity);
  if (reach === 'both') walk(-1, Infinity);
  // Born to one parent in the line and adopted by another: born wins.
  for (const a of adopted) {
    const born = (generation.get(a)! > 0 ? up.get(a) : down.get(a))?.some(
      (e) => !e.adopted && (via.get(a) ?? []).includes(generation.get(a)! > 0 ? e.a : e.b),
    );
    if (born) adopted.delete(a);
  }
  return { id, reach, ids, generation, via, adopted, hasAdopted };
}

/** The sim and everyone in their line, as the board lights them. */
export function lineageIds(focusId: string, edges: Edge[], reach: BloodlineReach = 'both', opts: Options = {}): Set<string> {
  return bloodlineOf(focusId, edges, reach, opts).ids;
}

/**
 * A generation's name: Children, Grandchildren, Great-grandchildren,
 * Great-great-grandchildren, then "3× great-grandchildren"; the same
 * upward for parents.
 */
export function generationName(gen: number): string {
  const [one, two] = gen > 0 ? ['Children', 'grandchildren'] : ['Parents', 'grandparents'];
  const n = Math.abs(gen);
  if (n === 1) return one;
  if (n === 2) return `${two[0]!.toUpperCase()}${two.slice(1)}`;
  if (n === 3) return `Great-${two}`;
  if (n === 4) return `Great-great-${two}`;
  return `${n - 2}× great-${two}`;
}

const NOUNS: [number, string, string][] = [
  [1, 'child', 'children'],
  [2, 'grandchild', 'grandchildren'],
  [3, 'great-grandchild', 'great-grandchildren'],
  [4, 'great-great-grandchild', 'great-great-grandchildren'],
];
const UP_NOUNS: [number, string, string][] = [
  [-1, 'parent', 'parents'],
  [-2, 'grandparent', 'grandparents'],
  [-3, 'great-grandparent', 'great-grandparents'],
  [-4, 'great-great-grandparent', 'great-great-grandparents'],
];

/** "1 child, 2 grandchildren, 4 great-grandchildren": a line's counts, nearest first. `ids` limits who counts. */
export function generationCounts(line: Bloodline, dir: 1 | -1 = 1, ids?: ReadonlySet<string>): string {
  const counts = new Map<number, number>();
  for (const [sim, gen] of line.generation) {
    if (Math.sign(gen) !== dir || (ids && !ids.has(sim))) continue;
    counts.set(gen, (counts.get(gen) ?? 0) + 1);
  }
  return [...counts]
    .sort(([a], [b]) => Math.abs(a) - Math.abs(b))
    .map(([gen, n]) => {
      const named = (dir > 0 ? NOUNS : UP_NOUNS).find(([g]) => g === gen);
      if (named) return `${n} ${n === 1 ? named[1] : named[2]}`;
      const word = dir > 0 ? (n === 1 ? 'great-grandchild' : 'great-grandchildren') : n === 1 ? 'great-grandparent' : 'great-grandparents';
      return `${n} ${Math.abs(gen) - 2}× ${word}`;
    })
    .join(', ');
}
