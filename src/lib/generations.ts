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
    if (key && n.dynastyRole === 'head' && !out.has(key)) out.set(key, n.id);
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
    if (!key || n.dynastyRole !== 'head') continue;
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

/** Make `id` the first head of dynasty `key`, and no other card. */
export function setFirstHead(nodes: SimNode[], key: string, id: string): SimNode[] {
  return nodes.map((n) => {
    if (n.id === id) return n.firstHeadOf === key ? n : { ...n, firstHeadOf: key };
    if (n.firstHeadOf !== key) return n;
    const { firstHeadOf: _drop, ...rest } = n;
    return rest;
  });
}

export type DynastyGeneration = {
  key: string;
  dynasty: string;
  firstHeadId: string;
  /** 1 for the first head, one more for each parent step down. */
  gen?: number;
  /** The number is their spouse's: they married into that generation. */
  byMarriage?: true;
  /** An ancestor of the first head: before the dynasty began. */
  before?: true;
  /** Their line to the first head runs through a planned (board-only) link. */
  planned?: true;
};

/**
 * Each dynasty member's generation, counted from the dynasty's first head
 * (Gen 1) down the board's parent links, the shortest line winning. A
 * member with no line of their own takes their spouse's generation; an
 * ancestor of the first head is "before"; anyone else gets no number.
 */
export function dynastyGenerations(nodes: SimNode[], edges: Edge[]): Map<string, DynastyGeneration> {
  const out = new Map<string, DynastyGeneration>();
  const heads = firstHeads(nodes);
  if (!heads.size) return out;
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
  for (const n of nodes) {
    const key = dynastyKey(n);
    if (key) members.set(key, [...(members.get(key) ?? []), n]);
  }
  for (const [key, list] of members) {
    const first = heads.get(key);
    if (!first) continue;
    const gen = new Map<string, { gen: number; planned: boolean }>([[first, { gen: 1, planned: false }]]);
    const queue = [first];
    for (let i = 0; i < queue.length; i++) {
      const at = queue[i]!;
      const here = gen.get(at)!;
      for (const e of children.get(at) ?? []) {
        if (gen.has(e.b)) continue;
        gen.set(e.b, { gen: here.gen + 1, planned: here.planned || e.source === 'planned' });
        queue.push(e.b);
      }
    }
    const ancestors = new Set<string>();
    const up = [...(parents.get(first) ?? [])];
    while (up.length) {
      const p = up.pop()!;
      if (ancestors.has(p)) continue;
      ancestors.add(p);
      up.push(...(parents.get(p) ?? []));
    }
    const dynasty = list[0]!.dynasty ?? '';
    for (const n of list) {
      const base = { key, dynasty, firstHeadId: first };
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
      } else if (ancestors.has(n.id)) {
        out.set(n.id, { ...base, before: true });
      } else {
        out.set(n.id, base);
      }
    }
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

/** "Gen 2 of the Goth", "Gen 1 of the Goth by marriage", "before the Goth dynasty". */
export function generationText(g: DynastyGeneration, label: string): string | null {
  if (g.before) return `before the ${label} dynasty`;
  if (!g.gen) return null;
  return `Gen ${g.gen} of the ${label}${g.byMarriage ? ' by marriage' : ''}`;
}
