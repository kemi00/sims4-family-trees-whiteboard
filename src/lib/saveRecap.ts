import { DECEASED_STATE } from './constants.ts';
import { TICKS_PER_DAY } from './lifeClock.ts';
import { dynastyKey, dynastyLabelText, dynastyNames } from './generations.ts';
import { cardName, isPlannedSim } from './plan.ts';
import { isUnhousedGid } from './unhoused.ts';
import { edgeSourceOf, uKey } from './utils.ts';
import type { DynastyRole, Edge, SaveGameInfo, SimNode } from '../types/whiteboard.ts';

export type RecapSim = { id: string; name: string };

/** A dynasty as the story names it: its key, its name, and "Leila’s line" when two share it. */
export type RecapDynasty = { key: string; name: string; tag?: string };

/** "the Thebe dynasty", "the Ngata dynasty (Leila’s line)": a dynasty in a sentence. */
export function theDynasty(d: RecapDynasty): string {
  return `the ${d.name} dynasty${d.tag ? ` (${d.tag})` : ''}`;
}

/**
 * Dynasty news between two saves: a new head or heir (in place of whoever
 * held it, when they still live), no longer one, an outcast or no longer,
 * joining or leaving, a dynasty founded.
 */
export type DynastyNews = {
  kind: 'head' | 'heir' | 'outcast' | 'noLongerHead' | 'noLongerHeir' | 'noLongerOutcast' | 'joined' | 'left' | 'founded';
  sim: RecapSim;
  dynasty: RecapDynasty;
  /** Who held the role before, for "in place of". */
  replaced?: RecapSim;
  planned?: boolean;
};

/** Family news: an adoption, or a parent the family tree now shows. */
export type FamilyNews =
  | { kind: 'adopted'; parents: RecapSim[]; child: RecapSim; planned?: boolean }
  | { kind: 'parentFound'; parent: RecapSim; child: RecapSim; secret?: boolean };

/** A sim's life changing: a new life state, or a new name. */
export type LifeNews = { kind: 'state' | 'name' | 'renamed'; sim: RecapSim; from: string; to: string };

/** A household moving home together: to another lot, or another world. */
export type HomeNews = { hh: string; ids: string[]; to: string; from?: string };

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
  /** New heads, heirs and outcasts, joining and leaving (absent on older chronicle pages). */
  dynasty?: DynastyNews[];
  /** Adoptions, and parents the family tree now shows. */
  family?: FamilyNews[];
  /** New life states and names. */
  life?: LifeNews[];
  /** Households that moved home together. */
  homes?: HomeNews[];
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
  tellTheRest(before, after, recap, was, now, sim);
  recap.celebrate = [...new Set(recap.celebrate)];
  return recap;
}

/** "a vampire", "an alien": a life state in a sentence. */
function aState(state: string): string {
  const s = state.toLowerCase();
  return /^[aeiou]/.test(s) ? `an ${s}` : `a ${s}`;
}

/** The life states the story tells, as a sentence about `name`. */
export function lifeText(n: LifeNews): string {
  const name = n.sim.name;
  if (n.kind === 'name') return `${name} took the name ${n.to}`;
  if (n.kind === 'renamed') return `${n.from} is now called ${n.to}`;
  if (n.from === DECEASED_STATE && n.to !== 'Ghost') return `${name} came back to life`;
  if (n.to === 'Sim') return `${name} is no longer ${aState(n.from)}`;
  return `${name} became ${aState(n.to)}`;
}

/** A dynasty news item as a sentence: "Cordelia Thebe VI became heir of the Thebe dynasty, in place of Thiago Abrantes". */
export function dynastyText(d: DynastyNews): string {
  const the = theDynasty(d.dynasty);
  const instead = d.replaced ? `, in place of ${d.replaced.name}` : '';
  switch (d.kind) {
    case 'head':
      return `${d.sim.name} became head of ${the}${instead}`;
    case 'heir':
      return `${d.sim.name} became heir of ${the}${instead}`;
    case 'outcast':
      return `${d.sim.name} was made an outcast of ${the}`;
    case 'noLongerHead':
      return `${d.sim.name} is no longer head of ${the}`;
    case 'noLongerHeir':
      return `${d.sim.name} is no longer heir of ${the}`;
    case 'noLongerOutcast':
      return `${d.sim.name} is no longer an outcast of ${the}`;
    case 'joined':
      return `${d.sim.name} joined ${the}`;
    case 'left':
      return `${d.sim.name} left ${the}`;
    case 'founded':
      return `${d.sim.name} founded ${the}`;
  }
}

/** A family news item as a sentence: "Miko Ojo adopted Darling Walsh". */
export function familyText(f: FamilyNews): string {
  if (f.kind === 'adopted') return `${f.parents.map((p) => p.name).join(' and ')} adopted ${f.child.name}`;
  return `The family tree shows ${f.parent.name} as ${f.secret ? 'a secret parent' : 'a parent'} of ${f.child.name}`;
}

/** A household's move as a sentence: "The Capp household moved to 17 Bright Cliff in Ondarion". */
export function homeText(h: HomeNews): string {
  return `The ${h.hh} household moved to ${h.to}`;
}

/** A sim's role in a dynasty as the game has it, or undefined while a plan stands in for it. */
function gameRole(n: SimNode | undefined): { key: string; name: string; role: DynastyRole | 'member' } | null | undefined {
  if (!n) return undefined;
  // A planned sim, or a role or membership planned on the board: not the game's yet.
  if (isPlannedSim(n) || n.dynastyPlan === 'role' || n.dynastyPlan === 'member') return undefined;
  const key = dynastyKey(n);
  if (!key || !n.dynasty) return null;
  return { key, name: n.dynasty, role: n.dynastyRole ?? 'member' };
}

/** Planned on the board before the save showed it: a planned sim, role or membership. */
const wasPlanned = (n: SimNode | undefined) => !!n && (isPlannedSim(n) || n.dynastyPlan === 'role' || n.dynastyPlan === 'member');

/**
 * Everything else the save changed, planned or not: dynasty roles and
 * membership, adoptions and parents found, life states and names, and
 * households that moved home together. Each names every sim it is about,
 * so their stories (a sim's, a household's, a dynasty's) all tell it.
 */
function tellTheRest(
  before: Board,
  after: Board,
  recap: SaveRecap,
  was: Map<string, SimNode>,
  now: Map<string, SimNode>,
  sim: (n: SimNode) => RecapSim,
) {
  const names = dynastyNames([...after.nodes]);
  const dynastyOf = (key: string, fallback: string): RecapDynasty => {
    const known = names.get(key);
    return known ? { key, name: known.name, ...(known.tag ? { tag: known.tag } : {}) } : { key, name: fallback };
  };
  const dynasty: DynastyNews[] = [];
  const living = (n: SimNode | undefined) => !!n && n.state !== DECEASED_STATE;

  // Heads and heirs, dynasty by dynasty: who holds each now against before.
  const holders = (nodes: Map<string, SimNode>, role: DynastyRole) => {
    const out = new Map<string, SimNode>();
    for (const n of nodes.values()) {
      const r = gameRole(n);
      if (r && r.role === role) out.set(r.key, n);
    }
    return out;
  };
  // A dynasty is the same one when its key is, or, for one the board planned, its name.
  const before0 = new Set([...was.values()].flatMap((n) => {
    const r = gameRole(n);
    return r ? [r.key, `name:${r.name.toLowerCase()}`] : [];
  }));
  const knewDynasty = (key: string, name: string) => before0.has(key) || before0.has(`name:${name.toLowerCase()}`);
  const founded = new Set<string>();
  for (const n of now.values()) {
    const r = gameRole(n);
    if (r && r.role === 'head' && !knewDynasty(r.key, r.name) && was.has(n.id)) {
      founded.add(r.key);
      dynasty.push({ kind: 'founded', sim: sim(n), dynasty: dynastyOf(r.key, r.name), ...(wasPlanned(was.get(n.id)) ? { planned: true } : {}) });
    }
  }
  for (const role of ['head', 'heir'] as const) {
    const then = holders(was, role);
    const nowHeld = holders(now, role);
    for (const [key, n] of nowHeld) {
      if (founded.has(key) && role === 'head') continue;
      const old = then.get(key) ?? [...then.entries()].find(([k, o]) => o.dynasty?.toLowerCase() === n.dynasty?.toLowerCase() && !nowHeld.has(k))?.[1];
      if (old?.id === n.id) continue;
      // A newborn heir is told with the birth too; the heir news says whose place they took.
      const replaced = old && living(now.get(old.id)) ? sim(now.get(old.id)!) : undefined;
      dynasty.push({
        kind: role,
        sim: sim(n),
        dynasty: dynastyOf(key, n.dynasty ?? ''),
        ...(replaced ? { replaced } : {}),
        ...(wasPlanned(was.get(n.id)) && was.get(n.id)?.dynastyRole === role ? { planned: true } : {}),
      });
    }
    // Held before, by someone who lives and holds it no more, with no one in their place.
    for (const [key, o] of then) {
      const n = now.get(o.id);
      const r = gameRole(n);
      if (!n || !living(n) || r === undefined || (r && r.key === key && r.role === role)) continue;
      if (nowHeld.has(key)) continue;
      // An heir who became head is told as the new head.
      if (role === 'heir' && r && r.key === key && r.role === 'head') continue;
      dynasty.push({ kind: role === 'head' ? 'noLongerHead' : 'noLongerHeir', sim: sim(n), dynasty: dynastyOf(key, o.dynasty ?? '') });
    }
  }
  // Outcasts, and joining or leaving: sim by sim, as the game has them.
  for (const n of now.values()) {
    const o = was.get(n.id);
    if (!o || !living(n) || isPlannedSim(o)) continue;
    const r0 = gameRole(o);
    const r1 = gameRole(n);
    // A membership planned on the board, now in the game: joined, as planned.
    if (r0 === undefined && o.dynastyPlan === 'member' && r1 && !founded.has(r1.key)) {
      dynasty.push({ kind: 'joined', sim: sim(n), dynasty: dynastyOf(r1.key, r1.name), planned: true });
      continue;
    }
    if (r0 === undefined || r1 === undefined) continue;
    const same = !!r0 && !!r1 && (r0.key === r1.key || r0.name.toLowerCase() === r1.name.toLowerCase());
    if (same) {
      if (r1!.role === 'outcast' && r0!.role !== 'outcast') dynasty.push({ kind: 'outcast', sim: sim(n), dynasty: dynastyOf(r1!.key, r1!.name) });
      if (r0!.role === 'outcast' && r1!.role !== 'outcast') dynasty.push({ kind: 'noLongerOutcast', sim: sim(n), dynasty: dynastyOf(r1!.key, r1!.name) });
      continue;
    }
    if (r0) dynasty.push({ kind: 'left', sim: sim(n), dynasty: dynastyOf(r0.key, r0.name), ...(o.dynastyPlan === 'none' ? { planned: true } : {}) });
    if (r1 && !founded.has(r1.key)) dynasty.push({ kind: 'joined', sim: sim(n), dynasty: dynastyOf(r1.key, r1.name) });
  }
  if (dynasty.length) recap.dynasty = dynasty;

  // Adoptions and parents found: parent links the save has now and didn't before.
  const parentKey = (e: Edge) => `${e.a}>${e.b}`;
  const savedBefore = new Set(before.edges.filter((e) => e.type === 'parent' && edgeSourceOf(e) !== 'planned').map(parentKey));
  const plannedBefore = new Set(before.edges.filter((e) => e.type === 'parent' && edgeSourceOf(e) === 'planned').map(parentKey));
  const bornIds = new Set(recap.born.map((b) => b.id));
  const adoptedBy = new Map<string, { parents: RecapSim[]; planned: boolean }>();
  const family: FamilyNews[] = [];
  for (const e of after.edges) {
    if (e.type !== 'parent' || edgeSourceOf(e) === 'planned' || savedBefore.has(parentKey(e))) continue;
    const p = now.get(e.a);
    const c = now.get(e.b);
    if (!p || !c || bornIds.has(c.id)) continue;
    if (e.adopted) {
      const a = adoptedBy.get(c.id) ?? { parents: [], planned: false };
      a.parents.push(sim(p));
      if (plannedBefore.has(parentKey(e)) || e.wasPlanned) a.planned = true;
      adoptedBy.set(c.id, a);
    } else if (was.has(p.id) && was.has(c.id) && !p.treeId && !c.treeId) {
      // Both on the board before: the tree now shows a parent it didn't.
      family.push({ kind: 'parentFound', parent: sim(p), child: sim(c), ...(e.secret ? { secret: true } : {}) });
    }
  }
  for (const [child, a] of adoptedBy) {
    family.unshift({ kind: 'adopted', parents: a.parents, child: sim(now.get(child)!), ...(a.planned ? { planned: true } : {}) });
    if (a.planned) {
      recap.plansDone += 1;
      recap.celebrate.push(child, ...a.parents.map((p) => p.id));
    }
    // A child adopted from outside the board is the adoption's news, not a sim met.
    if (recap.metIds?.includes(child)) {
      recap.metIds = recap.metIds.filter((id) => id !== child);
      recap.met = Math.max(0, recap.met - 1);
    }
  }
  if (family.length) recap.family = family;

  // Life states and names.
  const life: LifeNews[] = [];
  for (const n of now.values()) {
    const o = was.get(n.id);
    if (!o || isPlannedSim(o) || isPlannedSim(n)) continue;
    // A passing is told as one; anything else that changes a sim's state is news.
    if (o.state !== n.state && n.state !== DECEASED_STATE) life.push({ kind: 'state', sim: sim(n), from: o.state, to: n.state });
    if (n.marriedSur && n.marriedSur !== o.marriedSur) life.push({ kind: 'name', sim: sim(n), from: o.marriedSur ?? o.sur, to: n.marriedSur });
    else if (`${o.first} ${o.sur}`.trim() !== `${n.first} ${n.sur}`.trim()) life.push({ kind: 'renamed', sim: sim(n), from: cardName(o), to: cardName(n) });
  }
  if (life.length) recap.life = life;

  // Households that moved home together: to another world, or another lot in theirs.
  const homes: HomeNews[] = [];
  const byGid = new Map<string, SimNode[]>();
  for (const n of now.values()) {
    const o = was.get(n.id);
    if (!o || isPlannedSim(n) || isUnhousedGid(n.gid) || isUnhousedGid(o.gid)) continue;
    if (o.hh !== n.hh || (o.world === n.world && (o.lot ?? '') === (n.lot ?? ''))) continue;
    if (!n.lot && o.world === n.world) continue;
    byGid.set(n.gid, [...(byGid.get(n.gid) ?? []), n]);
  }
  for (const [, mem] of byGid) {
    const n = mem[0]!;
    const o = was.get(n.id)!;
    const to = n.lot ? `${n.lot} in ${n.world}` : n.world;
    homes.push({ hh: n.hh, ids: mem.map((m) => m.id), to, ...(o.lot ? { from: `${o.lot} in ${o.world}` } : {}) });
  }
  if (homes.length) {
    recap.homes = homes;
    // A household that moved together is told as one move, not one per sim.
    const together = new Set(homes.flatMap((h) => h.ids));
    recap.moved = recap.moved.filter((m) => !together.has(m.id));
  }
}

/** Anything happened that the recap would tell. */
export function recapHasNews(r: SaveRecap): boolean {
  return (
    r.born.length +
      r.together.length +
      r.apart.length +
      r.moved.length +
      r.grew.length +
      r.died.length +
      r.met +
      (r.prestige?.length ?? 0) +
      (r.dynasty?.length ?? 0) +
      (r.family?.length ?? 0) +
      (r.life?.length ?? 0) +
      (r.homes?.length ?? 0) >
      0 ||
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
