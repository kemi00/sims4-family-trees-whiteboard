import { CARD_H, CARD_MIN_W, hasDied } from './constants.ts';
import type { Edge, SimNode } from '../types/whiteboard.ts';

/**
 * Which sims are Gen 1: the oldest known ancestors on the board, living or
 * passed away ('known'); or the oldest living sims, with the ancestors who
 * passed away above them, before Gen 1 ('living').
 */
export type GenMode = 'known' | 'living';

/**
 * A generation row as drawn: its number (0 and below are before Gen 1), its
 * words, where it sits, how many sims it holds, where it ends, and the rule
 * over it (dashed between rows, solid where a new shelf of families starts).
 */
export type GenRow = { gen: number; label: string; y: number; count: number; x2: number; rule: 'none' | 'dash' | 'solid' };

/** Each sim's parents on the board: birth, adoptive, declared and secret parents alike. */
function parentsMap(edges: readonly Edge[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const e of edges) if (e.type === 'parent') out.set(e.b, [...(out.get(e.b) ?? []), e.a]);
  return out;
}

/**
 * Generations by the user's rule: one more than the higher of a sim's
 * parents' (Gen 3 and Gen 1 parents: Gen 4), Gen 1 for a sim with no parents
 * on the board (a spouse who married in too, by their own line). Adoptive
 * parents count. In 'living' mode only living parents do: a living sim whose
 * parents passed away is Gen 1, and the passed-away ancestors get rows above,
 * numbered 0, -1, … by their own known generation.
 */
export function generations(nodes: readonly SimNode[], edges: readonly Edge[], mode: GenMode): Map<string, number> {
  const parents = parentsMap(edges);
  const ids = new Set(nodes.map((n) => n.id));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const memo = new Map<string, number>();
  const known = (id: string, seen = new Set<string>()): number => {
    const hit = memo.get(id);
    if (hit !== undefined) return hit;
    if (seen.has(id)) return 1;
    seen.add(id);
    const ps = (parents.get(id) ?? []).filter((p) => ids.has(p));
    const g = ps.length ? 1 + Math.max(...ps.map((p) => known(p, seen))) : 1;
    memo.set(id, g);
    return g;
  };
  const out = new Map<string, number>();
  for (const n of nodes) out.set(n.id, known(n.id));
  if (mode === 'known') return out;

  // Living mode. Who has a living descendant: those are ancestors, before Gen 1.
  const children = new Map<string, string[]>();
  for (const [c, ps] of parents) for (const p of ps) children.set(p, [...(children.get(p) ?? []), c]);
  const alive = (id: string) => {
    const n = byId.get(id);
    return !!n && !hasDied(n.state);
  };
  const livingBelow = new Map<string, boolean>();
  const hasLivingBelow = (id: string, seen = new Set<string>()): boolean => {
    const hit = livingBelow.get(id);
    if (hit !== undefined) return hit;
    if (seen.has(id)) return false;
    seen.add(id);
    const r = (children.get(id) ?? []).some((c) => ids.has(c) && (alive(c) || hasLivingBelow(c, seen)));
    livingBelow.set(id, r);
    return r;
  };
  // Before Gen 1: the passed away with a living descendant, and the passed away whose
  // parents all sit before Gen 1 (a great-uncle), so no one before sits among the living.
  const before = new Set(nodes.filter((n) => hasDied(n.state) && hasLivingBelow(n.id)).map((n) => n.id));
  for (let grew = true; grew; ) {
    grew = false;
    for (const n of nodes) {
      if (before.has(n.id) || !hasDied(n.state)) continue;
      const ps = (parents.get(n.id) ?? []).filter((p) => ids.has(p));
      if (ps.length && ps.every((p) => before.has(p))) {
        before.add(n.id);
        grew = true;
      }
    }
  }
  const living = new Map<string, number>();
  const gl = (id: string, seen = new Set<string>()): number => {
    const hit = living.get(id);
    if (hit !== undefined) return hit;
    if (seen.has(id)) return 1;
    seen.add(id);
    const ps = (parents.get(id) ?? []).filter((p) => ids.has(p) && !before.has(p));
    const g = ps.length ? 1 + Math.max(...ps.map((p) => gl(p, seen))) : 1;
    living.set(id, g);
    return g;
  };
  // Each ancestor right above their highest child: a passed-away parent of a Gen 1 sim is Before Gen 1,
  // their parent a row further up. A branch with no children sits a row under its parents.
  const above = new Map<string, number>();
  const rowOf = (id: string, seen: Set<string>): number => (before.has(id) ? rowBefore(id, seen) : gl(id));
  const rowBefore = (id: string, seen = new Set<string>()): number => {
    const hit = above.get(id);
    if (hit !== undefined) return hit;
    if (seen.has(id)) return 0;
    seen.add(id);
    // Childless branches (a great-uncle) follow their parents: they never place them.
    const hasKids = (c: string) => (children.get(c) ?? []).some((k) => ids.has(k));
    const kids = (children.get(id) ?? []).filter((c) => ids.has(c) && (!before.has(c) || hasKids(c)));
    let r: number;
    // A late parent of a Gen 3 sim (their partner living) sits in Gen 2, beside that partner.
    if (kids.length) r = Math.min(...kids.map((c) => rowOf(c, seen))) - 1;
    else {
      const ps = (parents.get(id) ?? []).filter((p) => before.has(p));
      r = ps.length ? Math.max(...ps.map((p) => rowBefore(p, seen))) + 1 : 0;
    }
    above.set(id, r);
    return r;
  };
  const result = new Map<string, number>();
  for (const n of nodes) result.set(n.id, before.has(n.id) ? rowBefore(n.id) : gl(n.id));
  return result;
}

/** A row's words: "Gen 3", "Before Gen 1", "2 generations before Gen 1". */
export function genLabel(gen: number): string {
  if (gen >= 1) return `Gen ${gen}`;
  return gen === 0 ? 'Before Gen 1' : `${1 - gen} generations before Gen 1`;
}

/** Room between cards in a row, and between rows (lines run there). */
const COL_GAP = 40;
const ROW_GAP = 150;
/** Room between two families on a shelf, and between shelves. */
const FAMILY_GAP = 200;
const SHELF_GAP = 120;
/** Room between lines of a grid (sims with no family, pets): no lines run there. */
const GRID_ROW_GAP = 60;
/** The shape the shelves aim for: a little wider than tall, like a screen. */
const ASPECT = 1.6;
/** Edges that make a family: parents, partners (past ones too) and siblings. */
const FAMILY_TIES = new Set(['parent', 'marriage', 'romance', 'divorced', 'sibling']);

const AGE_ORDER = ['Elder', 'Adult', 'Young Adult', 'Teen', 'Child', 'Toddler', 'Infant'];

/** Families: sims joined by parents, partners or siblings, each a list of ids, biggest first. */
function familiesOf(sims: readonly SimNode[], edges: readonly Edge[]): string[][] {
  const up = new Map(sims.map((n) => [n.id, n.id]));
  const root = (id: string): string => {
    let r = id;
    while (up.get(r) !== r) r = up.get(r)!;
    up.set(id, r);
    return r;
  };
  for (const e of edges) {
    if (!FAMILY_TIES.has(e.type) || !up.has(e.a) || !up.has(e.b)) continue;
    up.set(root(e.a), root(e.b));
  }
  const out = new Map<string, string[]>();
  for (const n of sims) out.set(root(n.id), [...(out.get(root(n.id)) ?? []), n.id]);
  return [...out.values()];
}

/** One family laid out in columns: each sim's column and the generations it spans. */
type Block = { ids: string[]; col: Map<string, number>; gens: number[]; cols: number };

/**
 * A family in rows by generation: a sim with parents sits under them (at the
 * average column of their parents), partners side by side, siblings by age,
 * the rest in the board's own order (worlds and households).
 */
function layFamily(
  members: readonly SimNode[],
  gen: Map<string, number>,
  parents: Map<string, string[]>,
  partnersOf: Map<string, string[]>,
): Block {
  const gens = [...new Set(members.map((n) => gen.get(n.id)!))].sort((a, b) => a - b);
  const col = new Map<string, number>();
  const ageRank = (n: SimNode) => AGE_ORDER.indexOf(n.age);
  let cols = 0;
  for (const g of gens) {
    const row = members.filter((n) => gen.get(n.id) === g);
    // Under their parents when they have some placed above; else in the board's own order.
    const key = (n: SimNode) => {
      const ps = (parents.get(n.id) ?? []).map((p) => col.get(p)).filter((c): c is number => c !== undefined);
      return ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : null;
    };
    const withKey = row.map((n) => ({ n, k: key(n) }));
    const keyed = withKey.filter((x) => x.k !== null).sort((a, b) => a.k! - b.k! || ageRank(a.n) - ageRank(b.n) || a.n.x - b.n.x);
    const loose = withKey.filter((x) => x.k === null).sort((a, b) => a.n.x - b.n.x || a.n.y - b.n.y);
    const order: SimNode[] = [];
    const seen = new Set<string>();
    const put = (n: SimNode) => {
      if (seen.has(n.id)) return;
      seen.add(n.id);
      order.push(n);
      // A partner in the same row stands beside them.
      for (const p of partnersOf.get(n.id) ?? []) {
        const partner = row.find((m) => m.id === p);
        if (partner && !seen.has(partner.id)) {
          seen.add(partner.id);
          order.push(partner);
        }
      }
    };
    // Keyed first, each at its place; the loose ones after (their partners pull them in).
    for (const x of keyed) put(x.n);
    for (const x of loose) put(x.n);
    // Each in turn, never left of the card before it: under their parents where there's room.
    let next = 0;
    for (const n of order) {
      const want = key(n);
      const c = Math.max(next, want === null ? next : Math.round(want - 0.5));
      col.set(n.id, c);
      next = c + 1;
    }
    cols = Math.max(cols, next);
  }
  return { ids: members.map((n) => n.id), col, gens, cols };
}

/**
 * The board laid out by generation. Each family (sims joined by parents,
 * partners or siblings) is a block with a row per generation; the blocks sit
 * side by side on shelves that share their rows, biggest family first, the
 * shelves about as wide as a screen's shape asks. Sims with no family on the
 * board come after, in a grid, and pets last. Only positions change: the
 * board's own arrangement is untouched.
 */
export function generationLayout(
  nodes: readonly SimNode[],
  edges: readonly Edge[],
  mode: GenMode,
): { nodes: SimNode[]; rows: GenRow[] } {
  const sims = nodes.filter((n) => !n.species);
  const pets = nodes.filter((n) => n.species);
  const byId = new Map(sims.map((n) => [n.id, n]));
  const gen = generations(sims, edges, mode);
  const parents = parentsMap(edges);
  const partnersOf = new Map<string, string[]>();
  for (const e of edges) {
    if (e.type !== 'marriage' && e.type !== 'romance') continue;
    partnersOf.set(e.a, [...(partnersOf.get(e.a) ?? []), e.b]);
    partnersOf.set(e.b, [...(partnersOf.get(e.b) ?? []), e.a]);
  }
  const stepX = CARD_MIN_W + COL_GAP;
  const stepY = CARD_H + ROW_GAP;
  const fams = familiesOf(sims, edges);
  const blocks = fams
    .filter((f) => f.length > 1)
    .map((f) => layFamily(f.map((id) => byId.get(id)!), gen, parents, partnersOf))
    .sort((a, b) => b.ids.length - a.ids.length || a.gens[0]! - b.gens[0]!);
  const alone = fams.filter((f) => f.length === 1).map((f) => byId.get(f[0]!)!);

  const widthOf = (b: Block) => b.cols * stepX - COL_GAP;
  const area = blocks.reduce((s, b) => s + (widthOf(b) + FAMILY_GAP) * b.gens.length * stepY, 0) + (alone.length + pets.length) * stepX * stepY;
  const shelfW = Math.max(CARD_MIN_W * 8, ...blocks.map(widthOf), Math.sqrt(area * ASPECT));

  // First fit: each family on the first shelf with room, else a new shelf.
  const shelves: { blocks: { b: Block; x: number }[]; used: number }[] = [];
  for (const b of blocks) {
    const w = widthOf(b);
    let shelf = shelves.find((s) => s.used + FAMILY_GAP + w <= shelfW);
    if (!shelf) {
      shelf = { blocks: [], used: -FAMILY_GAP };
      shelves.push(shelf);
    }
    shelf.blocks.push({ b, x: shelf.used + FAMILY_GAP });
    shelf.used += FAMILY_GAP + w;
  }

  const placed: SimNode[] = [];
  const rows: GenRow[] = [];
  let top = 0;
  for (const shelf of shelves) {
    const bands = [...new Set(shelf.blocks.flatMap(({ b }) => b.gens))].sort((a, b) => a - b);
    const yOf = new Map(bands.map((g, i) => [g, top + i * stepY]));
    const count = new Map<number, number>();
    for (const { b, x } of shelf.blocks)
      for (const id of b.ids) {
        const g = gen.get(id)!;
        count.set(g, (count.get(g) ?? 0) + 1);
        placed.push({ ...byId.get(id)!, x: x + b.col.get(id)! * stepX, y: yOf.get(g)!, ox: 0, oy: 0 });
      }
    bands.forEach((g, i) =>
      rows.push({ gen: g, label: genLabel(g), y: yOf.get(g)!, count: count.get(g) ?? 0, x2: shelf.used + 80, rule: i ? 'dash' : rows.length ? 'solid' : 'none' }),
    );
    top += bands.length * stepY + SHELF_GAP;
  }

  // A grid for the rest: sims with no family on the board, then pets.
  const grid = (list: readonly SimNode[], gen: number, label: string) => {
    if (!list.length) return;
    const per = Math.max(1, Math.floor((shelfW + COL_GAP) / stepX));
    const lineH = CARD_H + GRID_ROW_GAP;
    list
      .slice()
      .sort((a, b) => a.x - b.x || a.y - b.y)
      .forEach((n, i) => placed.push({ ...n, x: (i % per) * stepX, y: top + Math.floor(i / per) * lineH, ox: 0, oy: 0 }));
    const lines = Math.ceil(list.length / per);
    rows.push({ gen, label, y: top, count: list.length, x2: Math.min(list.length, per) * stepX - COL_GAP + 80, rule: rows.length ? 'solid' : 'none' });
    top += lines * lineH - GRID_ROW_GAP + ROW_GAP + SHELF_GAP;
  };
  // With no parents, children or partners on the board, they are Gen 1 in both counts.
  grid(alone, 1, 'Gen 1, no family on the board');
  grid(pets, Infinity, 'Pets');
  return { nodes: placed, rows };
}
