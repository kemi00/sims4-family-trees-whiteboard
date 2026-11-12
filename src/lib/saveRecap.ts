import { DECEASED_STATE } from './constants.ts';
import { TICKS_PER_DAY } from './lifeClock.ts';
import { dynastyKey, dynastyLabelText, dynastyNames } from './generations.ts';
import { cardName, isPlannedSim } from './plan.ts';
import { isUnhousedGid } from './unhoused.ts';
import { edgeSourceOf, uKey } from './utils.ts';
import type { Edge, SaveGameInfo, SimNode } from '../types/whiteboard.ts';

export type RecapSim = { id: string; name: string };

/**
 * What a save upload says happened in the game since the last one, as a
 * story: who was born, got together or split up, moved, grew up or died, and
 * which plans came true. Not what the board did to cards.
 */
export type SaveRecap = {
  /** Days of play between the two saves; null when either has no clock. */
  days: number | null;
  /** The season then and now, when the save has Seasons and it changed. */
  seasons?: { from: string; to: string };
  born: (RecapSim & { parents: string[]; parentIds?: string[]; planned: boolean })[];
  together: { a: RecapSim; b: RecapSim; type: 'marriage' | 'romance'; planned: boolean }[];
  apart: { a: RecapSim; b: RecapSim; type: 'divorced' | 'breakup' }[];
  moved: (RecapSim & { from: string; to: string })[];
  grew: (RecapSim & { from: string; to: string })[];
  died: RecapSim[];
  /** Sims new to the board who weren't born since: townies, visitors. */
  met: number;
  /** Who they are, so looking back can hide them (absent on older chronicle pages). */
  metIds?: string[];
  /** Planned births and couples the save shows done. */
  plansDone: number;
  /** Dynasties whose prestige changed: the game's dynasty name, before and now. */
  prestige?: { key: string; name: string; from: number; to: number }[];
  /** Cards to celebrate: a planned birth or couple came true. */
  celebrate: string[];
};

type Board = { nodes: readonly SimNode[]; edges: readonly Edge[]; saveGame?: SaveGameInfo | null };

/** Stages a sim can be born into between two saves. */
const YOUNG = new Set(['Newborn', 'Infant', 'Baby', 'Toddler']);
/** Life stages in order, to tell growing up from a correction. */
const STAGES = ['Newborn', 'Infant', 'Baby', 'Toddler', 'Child', 'Teen', 'Young Adult', 'Adult', 'Elder'];

const where = (n: SimNode) => (isUnhousedGid(n.gid) ? 'Unhoused sims' : `the ${n.hh} household`);

/** The story between `before` and `after` a save import. Empty lists when nothing happened. */
export function saveRecap(before: Board, after: Board): SaveRecap {
  const was = new Map(before.nodes.map((n) => [n.id, n]));
  const now = new Map(after.nodes.map((n) => [n.id, n]));
  const sim = (n: SimNode): RecapSim => ({ id: n.id, name: cardName(n) });
  const parentNodes = (id: string) =>
    after.edges.filter((e) => e.type === 'parent' && e.b === id).map((e) => now.get(e.a)).filter((p): p is SimNode => !!p);
  /** A baby's parents, by name and by card, so a story of their family finds the birth. */
  const parentsOf = (id: string) => {
    const ps = parentNodes(id);
    return { parents: ps.map(cardName), parentIds: ps.map((p) => p.id) };
  };

  const recap: SaveRecap = { days: null, born: [], together: [], apart: [], moved: [], grew: [], died: [], met: 0, plansDone: 0, celebrate: [] };
  const from = before.saveGame?.clock;
  const to = after.saveGame?.clock;
  if (from !== undefined && to !== undefined && to >= from) recap.days = (to - from) / TICKS_PER_DAY;
  const s0 = before.saveGame?.season;
  const s1 = after.saveGame?.season;
  if (s0 && s1 && s0 !== s1) recap.seasons = { from: s0, to: s1 };

  for (const n of after.nodes) {
    const o = was.get(n.id);
    if (!o) {
      if (!n.saveSimId) continue;
      if (YOUNG.has(n.age) && n.state !== DECEASED_STATE) recap.born.push({ ...sim(n), ...parentsOf(n.id), planned: false });
      else if (!n.treeId) {
        recap.met += 1;
        (recap.metIds ??= []).push(n.id);
      }
      continue;
    }
    // A planned sim the save filled: the plan came true.
    if (isPlannedSim(o) && !isPlannedSim(n)) {
      recap.born.push({ ...sim(n), ...parentsOf(n.id), planned: true });
      recap.plansDone += 1;
      recap.celebrate.push(n.id);
      continue;
    }
    if (isPlannedSim(n)) continue;
    if (o.state !== DECEASED_STATE && n.state === DECEASED_STATE) {
      recap.died.push(sim(n));
      continue;
    }
    if (o.gid !== n.gid && !n.treeId) recap.moved.push({ ...sim(n), from: where(o), to: where(n) });
    const a = STAGES.indexOf(o.age);
    const b = STAGES.indexOf(n.age);
    if (a >= 0 && b > a) recap.grew.push({ ...sim(n), from: o.age, to: n.age });
  }

  // Couples: by pair, as the save has them now against before.
  const pairs = (edges: readonly Edge[], type: Edge['type'], saveOnly: boolean) =>
    new Map(
      edges
        .filter((e) => e.type === type && (!saveOnly || edgeSourceOf(e) !== 'planned'))
        .map((e) => [uKey(e.a, e.b), e] as const),
    );
  for (const type of ['marriage', 'romance'] as const) {
    const then = pairs(before.edges, type, true);
    const plannedThen = pairs(before.edges, type, false);
    for (const [key, e] of pairs(after.edges, type, true)) {
      if (then.has(key)) continue;
      // A romance that became a marriage is news as the marriage only.
      if (type === 'romance' && pairs(after.edges, 'marriage', true).has(key)) continue;
      const a = now.get(e.a);
      const b = now.get(e.b);
      if (!a || !b) continue;
      const planned = plannedThen.has(key) || !!e.wasPlanned;
      recap.together.push({ a: sim(a), b: sim(b), type, planned });
      if (planned) {
        recap.plansDone += 1;
        recap.celebrate.push(a.id, b.id);
      }
    }
  }
  const divorcedThen = pairs(before.edges, 'divorced', false);
  for (const [key, e] of pairs(after.edges, 'divorced', false)) {
    const a = now.get(e.a);
    const b = now.get(e.b);
    if (!divorcedThen.has(key) && a && b) recap.apart.push({ a: sim(a), b: sim(b), type: 'divorced' });
  }
  const romanceNow = pairs(after.edges, 'romance', false);
  const marriedNow = pairs(after.edges, 'marriage', false);
  for (const [key, e] of pairs(before.edges, 'romance', true)) {
    if (romanceNow.has(key) || marriedNow.has(key)) continue;
    const a = now.get(e.a);
    const b = now.get(e.b);
    if (a && b) recap.apart.push({ a: sim(a), b: sim(b), type: 'breakup' });
  }
  // Prestige gained or lost, dynasty by dynasty, as the two saves have it.
  const p0 = before.saveGame?.prestige;
  const p1 = after.saveGame?.prestige;
  if (p0 && p1) {
    const names = dynastyNames([...after.nodes]);
    const changes = Object.entries(p1)
      .filter(([key, to]) => p0[key] !== undefined && p0[key] !== to)
      .map(([key, to]) => {
        // Two of one name are told apart by line: "Ngata (Leila’s line)".
        const known = names.get(key);
        const name = known ? dynastyLabelText(known) : (after.nodes.find((n) => dynastyKey(n) === key)?.dynasty ?? '');
        return { key, name, from: p0[key]!, to };
      })
      .filter((c) => c.name)
      .sort((x, y) => Math.abs(y.to - y.from) - Math.abs(x.to - x.from) || x.name.localeCompare(y.name));
    if (changes.length) recap.prestige = changes;
  }
  recap.celebrate = [...new Set(recap.celebrate)];
  return recap;
}

/** Anything happened that the recap would tell. */
export function recapHasNews(r: SaveRecap): boolean {
  return (
    r.born.length + r.together.length + r.apart.length + r.moved.length + r.grew.length + r.died.length + r.met + (r.prestige?.length ?? 0) > 0 ||
    !!r.seasons
  );
}

/** "3 days of play", "half a day of play", "a few hours of play". */
export function recapTimeText(days: number | null): string | null {
  if (days === null || days <= 0) return null;
  if (days < 0.25) return 'a few hours of play';
  if (days < 0.75) return 'half a day of play';
  const d = Math.round(days);
  return `${d === 1 ? '1 day' : `${d} days`} of play`;
}
