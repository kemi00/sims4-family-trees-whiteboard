import type { Edge, SimNode } from '../types/whiteboard.ts';
import { DECEASED_STATE } from './constants.ts';
import { edgeSourceOf, fold } from './utils.ts';

/**
 * A dynasty's key on the board: the game's id when the card has one (two
 * dynasties can share a name), else a planned one's own board id when it
 * shares its name with another (`dynastyRef`), else its name.
 */
export function dynastyKey(n: Pick<SimNode, 'dynasty' | 'dynastyId' | 'dynastyRef'>): string | null {
  if (n.dynastyId) return `id:${n.dynastyId}`;
  if (n.dynastyRef && n.dynasty) return `ref:${n.dynastyRef}`;
  if (n.dynasty) return `name:${n.dynasty}`;
  return null;
}

/** A new board id for a planned dynasty that shares its name with another. */
export function newDynastyRef(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
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
  // A dynasty only planned, with no head in the game: its planned head.
  for (const n of nodes) {
    const key = dynastyKey(n);
    if (key && n.dynastyRole === 'head' && n.dynastyPlan && !out.has(key)) out.set(key, n.id);
  }
  return out;
}

export type FamilyGeneration = {
  /** 1 for a sim with no parents on the board, one more for each step down their longest line. */
  gen: number;
  /** Gen 1: their oldest known ancestor, the top of that line. */
  rootId: string;
  /** The line runs through a planned (board-only) parent link. */
  planned?: true;
};

/**
 * Every sim's generation, dynasty or not: counted down from their oldest
 * known ancestor on the board (the top of their longest line up the parent
 * links, the deceased and family-tree relatives included), each child one
 * more. When lines tie, the one through the parent carrying their last name
 * wins. Pets have none.
 */
export function familyGenerations(nodes: SimNode[], edges: Edge[]): Map<string, FamilyGeneration> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const parents = new Map<string, Edge[]>();
  for (const e of edges) {
    if (e.type !== 'parent' || !byId.has(e.a) || !byId.has(e.b)) continue;
    parents.set(e.b, [...(parents.get(e.b) ?? []), e]);
  }
  const out = new Map<string, FamilyGeneration>();
  const busy = new Set<string>();
  const fold = (s: string) => s.trim().toLocaleLowerCase();
  const of = (id: string): FamilyGeneration => {
    const known = out.get(id);
    if (known) return known;
    const n = byId.get(id)!;
    let best: { g: FamilyGeneration; e: Edge } | null = null;
    busy.add(id);
    for (const e of parents.get(id) ?? []) {
      if (busy.has(e.a)) continue;
      const g = of(e.a);
      const better =
        !best ||
        g.gen > best.g.gen ||
        (g.gen === best.g.gen && fold(byId.get(e.a)!.sur) === fold(n.sur) && fold(byId.get(best.e.a)!.sur) !== fold(n.sur));
      if (better) best = { g, e };
    }
    busy.delete(id);
    const g: FamilyGeneration = best
      ? {
          gen: best.g.gen + 1,
          rootId: best.g.rootId,
          ...(best.g.planned || edgeSourceOf(best.e) === 'planned' ? { planned: true as const } : {}),
        }
      : { gen: 1, rootId: id };
    out.set(id, g);
    return g;
  };
  for (const n of nodes) if (!n.species) of(n.id);
  for (const n of nodes) if (n.species) out.delete(n.id);
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
export type DynastyName = {
  name: string;
  /**
   * "Oliana’s line": only when another dynasty on the board has the same
   * name, in any case. The board's own: the game knows them by name only.
   */
  tag?: string;
};

/** "Goth", or "Ngata (Oliana’s line)" for one of two Ngata dynasties. */
export const dynastyLabelText = (d: DynastyName): string => (d.tag ? `${d.name} (${d.tag})` : d.name);

/** "Goth dynasty", or "Ngata dynasty (Oliana’s line)": for sentences and cards. */
export const dynastyPhrase = (d: DynastyName): string => (d.tag ? `${d.name} dynasty (${d.tag})` : `${d.name} dynasty`);

const STAGES = ['Infant', 'Toddler', 'Child', 'Teen', 'Young Adult', 'Adult', 'Elder'];

/**
 * What every dynasty on the board is called, by key. Two with the same name
 * (two Ngata in the game, or a second "Scott" planned on the board) are told
 * apart by their founder: the first head, else the head planned, else for
 * one with no head yet its eldest living member. Their first names, or their
 * full names when those match too.
 */
export function dynastyNames(nodes: SimNode[]): Map<string, DynastyName> {
  const members = new Map<string, SimNode[]>();
  for (const n of nodes) {
    const key = dynastyKey(n);
    if (key) members.set(key, [...(members.get(key) ?? []), n]);
  }
  const byName = new Map<string, string[]>();
  for (const [key, list] of members) {
    const w = fold(list[0]!.dynasty!);
    byName.set(w, [...(byName.get(w) ?? []), key]);
  }
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const heads = firstHeads(nodes);
  const founder = (key: string): SimNode | undefined => {
    const head = byId.get(heads.get(key) ?? '');
    if (head) return head;
    const sims = members.get(key)!.filter((n) => !n.species);
    const living = sims.filter((n) => n.state !== DECEASED_STATE);
    return [...(living.length ? living : sims)].sort(
      (a, b) =>
        STAGES.indexOf(b.age) - STAGES.indexOf(a.age) ||
        `${a.first} ${a.sur}`.localeCompare(`${b.first} ${b.sur}`),
    )[0];
  };
  const out = new Map<string, DynastyName>();
  for (const keys of byName.values()) {
    if (keys.length === 1) {
      out.set(keys[0]!, { name: members.get(keys[0]!)![0]!.dynasty! });
      continue;
    }
    const found = keys.map((key) => ({ key, sim: founder(key) }));
    const first = (s?: SimNode) => (s ? s.first.trim() || `${s.first} ${s.sur}`.trim() : '');
    const full = (s?: SimNode) => (s ? `${s.first} ${s.sur}`.trim() : '');
    for (const { key, sim } of found) {
      const name = members.get(key)![0]!.dynasty!;
      const short = first(sim);
      const same = found.some((o) => o.key !== key && first(o.sim) === short);
      const who = same ? full(sim) : short;
      out.set(key, who ? { name, tag: `${who}’s line` } : { name });
    }
  }
  return out;
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
