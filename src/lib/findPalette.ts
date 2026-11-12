import { dynastyKey, dynastyLabelText, type DynastyName } from './generations.ts';
import { cardName, isPlannedSim } from './plan.ts';
import { isUnhousedGid } from './unhoused.ts';
import { isPet } from './utils.ts';
import type { Group, SimNode, World } from '../types/whiteboard.ts';

/**
 * Search, Spotlight-style (⌘K or Ctrl+K): everything on the board a name
 * finds, grouped by kind, each with where it is, and the board's actions
 * by their words. Only what the board shows counts: a sim filtered out,
 * or a household or world whose sims all are, is left out.
 */

export type FindKind = 'sim' | 'household' | 'neighbourhood' | 'world' | 'dynasty' | 'action';

export type FindResult = {
  kind: FindKind;
  /** A sim's id, a household's gid, `world||nb`, a world's name, a dynasty's key, an action's id. */
  key: string;
  label: string;
  /** Where it is or what it does: "Goth household · Willow Creek". */
  detail: string;
};

export type FindGroup = { title: string; items: FindResult[]; more: number };

/**
 * An action the search offers: what it's called, words that find it, what
 * it does, and whether it is one of the few shown before anything is typed.
 */
export type FindAction = { id: string; label: string; detail: string; words?: string; suggested?: boolean };

/** How many of each kind show before "and N more". */
const SHOWN: Record<FindKind, number> = { sim: 8, household: 5, neighbourhood: 4, world: 4, dynasty: 4, action: 5 };

/**
 * Better matches first: the whole name, then its start, then a word's
 * start, then anywhere. Inside a word only from three letters: "wi" finds
 * Wilder, not Vivian Lewis.
 */
function rank(text: string, q: string): number {
  const t = text.toLowerCase();
  if (t === q) return 0;
  if (t.startsWith(q)) return 1;
  if (t.split(/[\s,·-]+/).some((w) => w.startsWith(q))) return 2;
  return q.length >= 3 && t.includes(q) ? 3 : -1;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "Goth household · Willow Creek", "Unhoused · Willow Creek". */
function homeOf(n: SimNode): string {
  const where = n.world && n.world !== '-' ? ` · ${n.world}` : '';
  return isUnhousedGid(n.gid) || !n.hh ? `Unhoused${where}` : `${n.hh} household${where}`;
}

export function findResults(
  query: string,
  board: {
    worlds: readonly World[];
    groups: readonly Group[];
    visibleNodes: readonly SimNode[];
    dynastyNames?: ReadonlyMap<string, DynastyName>;
  },
  actions: readonly FindAction[] = [],
): FindGroup[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];
  const { visibleNodes } = board;
  const scored: Record<FindKind, { r: number; at: number; item: FindResult }[]> = {
    sim: [],
    household: [],
    neighbourhood: [],
    world: [],
    dynasty: [],
    action: [],
  };
  const add = (kind: FindKind, r: number, at: number, item: FindResult) => {
    if (r >= 0) scored[kind].push({ r, at, item });
  };

  visibleNodes.forEach((n, at) => {
    // The game's married name finds them too (Cassandra Vatore), and a planned sim's label.
    const names = [`${n.first} ${n.sur}`, ...(n.marriedSur ? [`${n.first} ${n.marriedSur}`] : []), ...(isPlannedSim(n) ? [cardName(n)] : [])];
    const best = Math.min(...names.map((s) => rank(s.trim(), q)).map((r) => (r < 0 ? 9 : r)));
    if (best === 9) return;
    const kind = isPet(n) ? (n.species ?? 'Pet') : n.age;
    add('sim', best, at, { kind: 'sim', key: n.id, label: cardName(n), detail: `${kind} · ${homeOf(n)}` });
  });

  const count = new Map<string, number>();
  const worldHomes = new Map<string, Set<string>>();
  const nbSims = new Map<string, number>();
  for (const n of visibleNodes) {
    count.set(n.gid, (count.get(n.gid) ?? 0) + 1);
    if (!isUnhousedGid(n.gid)) worldHomes.set(n.world, (worldHomes.get(n.world) ?? new Set()).add(n.gid));
    if (n.nb && n.nb !== '-' && n.world) nbSims.set(`${n.world}||${n.nb}`, (nbSims.get(`${n.world}||${n.nb}`) ?? 0) + 1);
  }
  board.groups.forEach((g, at) => {
    const sims = count.get(g.gid);
    if (!sims || isUnhousedGid(g.gid)) return;
    add('household', rank(g.hh, q), at, {
      kind: 'household',
      key: g.gid,
      label: `The ${g.hh} household`,
      detail: [g.nb && g.nb !== '-' ? g.nb : '', g.world, plural(sims, 'sim')].filter(Boolean).join(' · '),
    });
  });
  [...nbSims].forEach(([key, sims], at) => {
    const [world, nb] = key.split('||') as [string, string];
    add('neighbourhood', rank(nb, q), at, { kind: 'neighbourhood', key, label: nb, detail: `Neighbourhood · ${world} · ${plural(sims, 'sim')}` });
  });
  board.worlds.forEach((w, at) => {
    const homes = worldHomes.get(w.name)?.size ?? 0;
    if (!visibleNodes.some((n) => n.world === w.name)) return;
    add('world', rank(w.name, q), at, { kind: 'world', key: w.name, label: w.name, detail: `World · ${plural(homes, 'household')}` });
  });
  if (board.dynastyNames) {
    const members = new Map<string, number>();
    for (const n of visibleNodes) {
      const k = dynastyKey(n);
      if (k && !isPet(n) && n.dynastyPlan !== 'none') members.set(k, (members.get(k) ?? 0) + 1);
    }
    [...board.dynastyNames].forEach(([key, name], at) => {
      const sims = members.get(key);
      if (!sims) return;
      add('dynasty', rank(name.name, q), at, {
        kind: 'dynasty',
        key,
        label: `The ${dynastyLabelText(name)} dynasty`,
        detail: `Dynasty · ${plural(sims, 'sim')}`,
      });
    });
  }
  actions.forEach((a, at) => {
    const r = Math.min(...[a.label, a.words ?? ''].map((s) => rank(s, q)).map((x) => (x < 0 ? 9 : x)));
    if (r < 9) add('action', r, at, { kind: 'action', key: a.id, label: a.label, detail: a.detail });
  });

  const TITLES: Record<FindKind, string> = {
    sim: 'Sims',
    household: 'Households',
    neighbourhood: 'Neighbourhoods',
    world: 'Worlds',
    dynasty: 'Dynasties',
    action: 'Do',
  };
  // The kind with the best match leads ("goth": the Goth household before Mortimer Goth); ties keep this order.
  return (Object.keys(scored) as FindKind[])
    .map((kind, order) => {
      const list = scored[kind].sort((a, b) => a.r - b.r || a.at - b.at);
      const best = list[0]?.r ?? 9;
      const all = list.map((x) => x.item);
      return { best, order, group: { title: TITLES[kind], items: all.slice(0, SHOWN[kind]), more: Math.max(0, all.length - SHOWN[kind]) } };
    })
    .filter((g) => g.group.items.length)
    .sort((a, b) => a.best - b.best || a.order - b.order)
    .map((g) => g.group);
}

/** "⌘K" on a Mac, iPhone or iPad; "Ctrl+K" elsewhere. */
export function findShortcut(): string {
  const p = typeof navigator === 'undefined' ? '' : `${navigator.platform} ${navigator.userAgent}`;
  return /Mac|iPhone|iPad/.test(p) ? '⌘K' : 'Ctrl+K';
}
