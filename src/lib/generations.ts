import type { Edge, SimNode } from '../types/whiteboard.ts';

/**
 * A dynasty's key on the board: the game's id when the card has one (two
 * dynasties can share a name), else its name (a dynasty set by hand).
 */
export function dynastyKey(n: Pick<SimNode, 'dynasty' | 'dynastyId'>): string | null {
  if (n.dynastyId) return `id:${n.dynastyId}`;
  if (n.dynasty) return `name:${n.dynasty}`;
  return null;
}

/**
 * Board id of each dynasty's first head: the sim the board remembers
 * (`firstHeadOf`), else the head it has now.
 */
export function firstHeads(nodes: SimNode[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const n of nodes) if (n.firstHeadOf && !out.has(n.firstHeadOf)) out.set(n.firstHeadOf, n.id);
  for (const n of nodes) {
    const key = dynastyKey(n);
    // A planned head isn't one yet: the count stays with the game's.
    if (key && n.dynastyRole === 'head' && !n.dynastyPlan && !out.has(key)) out.set(key, n.id);
  }
  return out;
}

/**
 * Remember each dynasty's first head: a dynasty no card is the first head of
 * gets its head now. A first head remembered by name moves to the game's id
 * once the dynasty has one. Returns the nodes, changed only where needed.
 */
export function rememberFirstHeads(nodes: SimNode[]): SimNode[] {
  const remembered = new Set(nodes.map((n) => n.firstHeadOf).filter(Boolean));
  const renamed = new Map<string, string>();
  for (const n of nodes) {
    if (!n.dynastyId || !n.dynasty) continue;
    const byId = `id:${n.dynastyId}`;
    const byName = `name:${n.dynasty}`;
    if (!remembered.has(byId) && remembered.has(byName)) renamed.set(byName, byId);
  }
  const heads = new Map<string, string>();
  for (const n of nodes) {
    const key = dynastyKey(n);
    if (!key || n.dynastyRole !== 'head' || n.dynastyPlan) continue;
    if (remembered.has(key) || [...renamed.values()].includes(key)) continue;
    if (!heads.has(key)) heads.set(key, n.id);
  }
  if (!renamed.size && !heads.size) return nodes;
  const headOf = new Map([...heads].map(([key, id]) => [id, key]));
  return nodes.map((n) => {
    const moved = n.firstHeadOf ? renamed.get(n.firstHeadOf) : undefined;
    if (moved) return { ...n, firstHeadOf: moved };
    const key = headOf.get(n.id);
    return key && !n.firstHeadOf ? { ...n, firstHeadOf: key } : n;
  });
}

/**
 * Make `id` Gen 1 of dynasty `key`'s count, and no other card; null goes
 * back to counting from the first head's oldest known ancestor.
 */
export function setGenRoot(nodes: SimNode[], key: string, id: string | null): SimNode[] {
  return nodes.map((n) => {
    if (id && n.id === id) return n.genRootOf === key ? n : { ...n, genRootOf: key };
    if (n.genRootOf !== key) return n;
    const { genRootOf: _drop, ...rest } = n;
    return rest;
  });
}

export type DynastyGeneration = {
  key: string;
  dynasty: string;
  firstHeadId: string;
  /** Gen 1 of the count. */
  rootId: string;
  /** The first head's oldest known ancestor: Gen 1 unless one was picked. */
  autoRootId: string;
  /** Gen 1 was picked in the editor. */
  rootPicked?: true;
  /** 1 for the root, one more for each parent step down. */
  gen?: number;
  /** The number is their spouse's: they married into that generation. */
  byMarriage?: true;
  /** An ancestor of a picked Gen 1: before the count begins. */
  before?: true;
  /** Their line to Gen 1 runs through a planned (board-only) link. */
  planned?: true;
  /** On the line to the first head, but not a dynasty member (an ancestor). */
  forebear?: true;
  /**
   * The other dynasties' lines this sim is also an ancestor on: the Darongs'
   * great-grandmother is Gen 1 of the Darong line and of the Dreamer line.
   */
  also?: DynastyGeneration[];
};

/**
 * The first head's oldest known ancestor: the top of their longest line up
 * the board's parent links, dead and family-tree relatives included. When
 * lines tie, one whose name carries the dynasty's wins (Queen Thebe over
 * John Wilson Beard for the Thebes). The first head themselves with no parents.
 */
function oldestAncestor(
  start: string,
  parents: Map<string, string[]>,
  nameOf: (id: string) => string,
  dynasty: string,
): string {
  const depth = new Map<string, number>();
  const onPath = new Set<string>();
  const up = (x: string): number => {
    const known = depth.get(x);
    if (known !== undefined) return known;
    if (onPath.has(x)) return 0;
    onPath.add(x);
    let best = 0;
    for (const p of parents.get(x) ?? []) best = Math.max(best, 1 + up(p));
    onPath.delete(x);
    depth.set(x, best);
    return best;
  };
  up(start);
  // Follow every parent that keeps the line longest, down to the tops.
  const tops: string[] = [];
  const seen = new Set<string>([start]);
  const queue = [start];
  for (let i = 0; i < queue.length; i++) {
    const x = queue[i]!;
    const d = depth.get(x) ?? 0;
    if (d === 0) {
      tops.push(x);
      continue;
    }
    for (const p of parents.get(x) ?? []) {
      if (seen.has(p) || (depth.get(p) ?? 0) !== d - 1) continue;
      seen.add(p);
      queue.push(p);
    }
  }
  const word = dynasty.trim().toLowerCase();
  const named = (id: string) => (word && nameOf(id).toLowerCase().includes(word) ? 0 : 1);
  tops.sort((a, b) => named(a) - named(b) || a.localeCompare(b));
  return tops[0] ?? start;
}

/**
 * Each dynasty member's generation. Gen 1 is the first head's oldest known
 * ancestor on the board, dead and family-tree relatives included (so
 * Cordelia Thebe V, four generations below Queen Thebe, is Gen 5), or the
 * sim picked in the editor. The count runs down the parent links, the
 * shortest line winning. A member with no line of their own takes their
 * spouse's generation; an ancestor of a picked Gen 1 is "before"; anyone
 * else gets no number. Ancestors on the line to the first head who are no
 * members get their number too, marked as forebears.
 */
export function dynastyGenerations(nodes: SimNode[], edges: Edge[]): Map<string, DynastyGeneration> {
  const out = new Map<string, DynastyGeneration>();
  /** A forebear's place on each line they are on, gathered before choosing. */
  const lines = new Map<string, DynastyGeneration[]>();
  const heads = firstHeads(nodes);
  if (!heads.size) return out;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const nameOf = (id: string) => {
    const n = byId.get(id);
    return n ? `${n.first} ${n.sur}` : '';
  };
  const children = new Map<string, Edge[]>();
  const parents = new Map<string, string[]>();
  const spouses = new Map<string, string[]>();
  for (const e of edges) {
    if (e.type === 'parent') {
      children.set(e.a, [...(children.get(e.a) ?? []), e]);
      parents.set(e.b, [...(parents.get(e.b) ?? []), e.a]);
    } else if (e.type === 'marriage') {
      spouses.set(e.a, [...(spouses.get(e.a) ?? []), e.b]);
      spouses.set(e.b, [...(spouses.get(e.b) ?? []), e.a]);
    }
  }
  const members = new Map<string, SimNode[]>();
  const picked = new Map<string, string>();
  for (const n of nodes) {
    const key = dynastyKey(n);
    if (key) members.set(key, [...(members.get(key) ?? []), n]);
    if (n.genRootOf && !picked.has(n.genRootOf)) picked.set(n.genRootOf, n.id);
  }
  const ancestorsOf = (id: string) => {
    const found = new Set<string>();
    const up = [...(parents.get(id) ?? [])];
    while (up.length) {
      const p = up.pop()!;
      if (found.has(p)) continue;
      found.add(p);
      up.push(...(parents.get(p) ?? []));
    }
    return found;
  };
  for (const [key, list] of members) {
    const first = heads.get(key);
    if (!first) continue;
    const dynasty = list[0]!.dynasty ?? '';
    const autoRoot = oldestAncestor(first, parents, nameOf, dynasty);
    const root = picked.get(key) ?? autoRoot;
    const gen = new Map<string, { gen: number; planned: boolean }>([[root, { gen: 1, planned: false }]]);
    const queue = [root];
    for (let i = 0; i < queue.length; i++) {
      const at = queue[i]!;
      const here = gen.get(at)!;
      for (const e of children.get(at) ?? []) {
        if (gen.has(e.b)) continue;
        gen.set(e.b, { gen: here.gen + 1, planned: here.planned || e.source === 'planned' });
        queue.push(e.b);
      }
    }
    const before = ancestorsOf(root);
    const base = {
      key,
      dynasty,
      firstHeadId: first,
      rootId: root,
      autoRootId: autoRoot,
      ...(picked.has(key) ? { rootPicked: true as const } : {}),
    };
    const memberIds = new Set(list.map((n) => n.id));
    for (const n of list) {
      const own = gen.get(n.id);
      if (own) {
        out.set(n.id, { ...base, gen: own.gen, ...(own.planned ? { planned: true as const } : {}) });
        continue;
      }
      const spouse = (spouses.get(n.id) ?? [])
        .map((s) => gen.get(s))
        .filter((g): g is { gen: number; planned: boolean } => !!g)
        .sort((a, b) => a.gen - b.gen)[0];
      if (spouse) {
        out.set(n.id, { ...base, gen: spouse.gen, byMarriage: true, ...(spouse.planned ? { planned: true as const } : {}) });
      } else if (before.has(n.id)) {
        out.set(n.id, { ...base, before: true });
      } else {
        out.set(n.id, base);
      }
    }
    // The line itself: the first head's ancestors from Gen 1 down.
    for (const a of new Set([root, ...ancestorsOf(first)])) {
      const g = gen.get(a);
      if (!g || memberIds.has(a)) continue;
      lines.set(a, [...(lines.get(a) ?? []), { ...base, gen: g.gen, forebear: true }]);
    }
  }
  // An ancestor shared by several dynasties is on each of their lines. Their
  // own dynasty comes first if they belong to one, then the line whose name
  // they carry (Unknown Darong: the Darong line), then the first counted.
  for (const [id, found] of lines) {
    const own = out.get(id);
    const word = (d: string) => d.trim().toLowerCase();
    const carries = (g: DynastyGeneration) => {
      const w = word(g.dynasty);
      return !!w && nameOf(id).toLowerCase().includes(w);
    };
    const ranked = [...found].sort((a, b) => Number(carries(b)) - Number(carries(a)));
    const [main, ...rest] = own ? [own, ...ranked] : ranked;
    out.set(id, rest.length ? { ...main!, also: rest } : main!);
  }
  return out;
}
/**
 * "Goth", or "Ngata (Oliana’s line)" when another dynasty on the board has
 * the same name: told apart by the first head's first name.
 */
export function dynastyLabel(g: DynastyGeneration, all: Map<string, DynastyGeneration>, byId: Record<string, SimNode | undefined>): string {
  const twin = [...all.values()].some((x) => x.key !== g.key && x.dynasty === g.dynasty);
  if (!twin) return g.dynasty;
  const head = byId[g.firstHeadId];
  return head ? `${g.dynasty} (${head.first}’s line)` : g.dynasty;
}

/**
 * "Gen 5 of the Thebe", "Gen 1 of the Goth by marriage", "Gen 3 of the Thebe
 * line" for an ancestor who is no member, "before the Goth count".
 */
export function generationText(g: DynastyGeneration, label: string): string | null {
  if (g.before) return `before the ${label} count`;
  if (!g.gen) return null;
  return `Gen ${g.gen} of the ${label}${g.forebear ? ' line' : ''}${g.byMarriage ? ' by marriage' : ''}`;
}
