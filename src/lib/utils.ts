import { chainPlannedHeirs } from './succession.ts';
import { AGES_H, DECEASED_STATE, GENDER_CHIPS, HI_DYNASTY_CHIPS, HI_NO_CHILDREN, HI_NOT_BORN, hiDynastyChip, LEGACY_NOT_IN_WORLD, NEW_SIM_GENDERS, NOT_IN_WORLD, type HiDynastyRole } from './constants.ts';
import type {
  DeceasedMark,
  Edge,
  Group,
  HouseholdAgeUp,
  HouseholdMove,
  PairStatus,
  Point,
  SaveGameInfo,
  SimAgeUp,
  SimNode,
  World,
  SimPronouns,
} from '../types/whiteboard.ts';

export const uKey = (a: string, b: string): string =>
  [a, b].slice().sort().join('|');

export const isUserE = (e: Edge): boolean => {
  if (e.source) return e.source === 'planned';
  return String(e.id).charAt(0) === 'u';
};

/** Longest note a link or move keeps. */
export const NOTE_MAX = 500;

/** A note as stored: trimmed and capped, or undefined when there is none. */
export function cleanNote(text: string | undefined): string | undefined {
  const t = (text ?? '').trim().slice(0, NOTE_MAX).trim();
  return t || undefined;
}

/**
 * Notes of links that become one (a plan and the save's link for it), each
 * once, on their own lines. Undefined when none has a note.
 */
export function joinNotes(...notes: (string | undefined)[]): string | undefined {
  const seen: string[] = [];
  for (const n of notes) {
    const t = n?.trim();
    if (t && !seen.includes(t)) seen.push(t);
  }
  return seen.length ? seen.join('\n') : undefined;
}

/** `{ note }` to spread into a link, or nothing when there is no note. */
export function withNote(note: string | undefined): { note?: string } {
  return note ? { note } : {};
}

export function edgeSourceOf(e: Edge): 'seed' | 'save' | 'planned' {
  if (e.source) return e.source;
  return String(e.id).charAt(0) === 'u' ? 'planned' : 'seed';
}

/**
 * Next counter for `u…` / `b…` / `h…` / `a…` / `c…` / `d…` ids. Uses the highest numeric suffix already
 * present so a loaded save does not collide with new links.
 */
export function nextEidc(
  edges: Edge[],
  fallback: number,
  extraIds: string[] = [],
): number {
  let max = fallback;
  const consider = (raw: string | undefined) => {
    if (!raw) return;
    const ch = raw.charAt(0);
    if (ch !== 'u' && ch !== 'b' && ch !== 'h' && ch !== 'a' && ch !== 'c' && ch !== 'd' && ch !== 'v') return;
    const n = Number(raw.slice(1));
    if (!Number.isFinite(n) || n < max) return;
    max = n + 1;
  };
  for (const e of edges) {
    consider(e.id);
    consider(e.bundleId);
  }
  extraIds.forEach(consider);
  return max;
}

export const esc = (s: unknown): string =>
  (s == null ? '' : String(s))
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

export const ptsStr = (pts: Point[]): string =>
  pts.map((p) => `${p[0]},${p[1]}`).join(' ');

/**
 * Timestamp for download filenames, as yyyy-mm-dd_hh-mm-ss on a 24-hour clock.
 * Deliberately local time: the name should match the clock on the wall when
 * the file was saved, not UTC. Zero-padded so names sort chronologically, and
 * second-precision so two saves in the same minute stay distinct files.
 */
export const fileStamp = (d: Date = new Date()): string => {
  const p = (n: number): string => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
    `_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`
  );
};

export const simplify = (pts: Point[]): Point[] => {
  if (pts.length < 3) return pts;
  const o: Point[] = [pts[0]!];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = o[o.length - 1]!;
    const b = pts[i]!;
    const c = pts[i + 1]!;
    const col =
      (Math.abs(a[0] - b[0]) < 1 && Math.abs(b[0] - c[0]) < 1) ||
      (Math.abs(a[1] - b[1]) < 1 && Math.abs(b[1] - c[1]) < 1);
    if (!col) o.push(b);
  }
  o.push(pts[pts.length - 1]!);
  return o;
};

/** A world name as the board uses it now; older names of Not in any world map onto it. */
export function currentWorldName(w: string): string {
  return (LEGACY_NOT_IN_WORLD as readonly string[]).includes(w) ? NOT_IN_WORLD : w;
}

/** A household id with an older name of Not in any world as its world part, renamed. */
export function currentGid(g: string): string {
  for (const old of LEGACY_NOT_IN_WORLD) {
    if (g.startsWith(`${old}||`)) return `${NOT_IN_WORLD}||${g.slice(old.length + 2)}`;
  }
  return g;
}

export const worldColor = (w: string, worlds: World[]): string => {
  const name = currentWorldName(w);
  const x = worlds.find((o) => o.name === name);
  return x ? x.color : '#9aa0a6';
};

/** Parent ids for each child, from parent edges (a → b). */
export function parentsOfFromEdges(edges: Edge[]): Record<string, string[]> {
  const parentsOf: Record<string, string[]> = {};
  edges.forEach((e) => {
    if (e.type !== 'parent') return;
    (parentsOf[e.b] = parentsOf[e.b] || []).push(e.a);
  });
  return parentsOf;
}

export function parentSetKey(
  parentsOf: Record<string, string[]>,
  id: string,
): string {
  return (parentsOf[id] || []).slice().sort().join('|');
}

/** Same non-empty parent set — sibling link is implied by the parent fork. */
export function siblingsShareParents(
  a: string,
  b: string,
  edges: Edge[],
): boolean {
  const parentsOf = parentsOfFromEdges(edges);
  const ka = parentSetKey(parentsOf, a);
  const kb = parentSetKey(parentsOf, b);
  return !!ka && ka === kb;
}

/**
 * True when a new `parent` → `child` link would make a sim their own ancestor:
 * the parent is the child, or already descends from the child.
 */
export function parentLinkMakesCycle(
  parent: string,
  child: string,
  edges: Edge[],
): boolean {
  if (parent === child) return true;
  const kidsOf: Record<string, string[]> = {};
  edges.forEach((e) => {
    if (e.type === 'parent') (kidsOf[e.a] = kidsOf[e.a] || []).push(e.b);
  });
  const seen = new Set([child]);
  const stack = [child];
  while (stack.length) {
    for (const kid of kidsOf[stack.pop()!] || []) {
      if (kid === parent) return true;
      if (seen.has(kid)) continue;
      seen.add(kid);
      stack.push(kid);
    }
  }
  return false;
}

/** Drop parent edges that contradict a union link between the same pair. */
export function pruneContradictoryParentEdges(edges: Edge[]): Edge[] {
  const unionPairs = new Set(
    edges
      .filter((e) =>
        ['marriage', 'romance', 'divorced'].includes(e.type),
      )
      .map((e) => uKey(e.a, e.b)),
  );
  return edges.filter((e) => {
    if (e.type !== 'parent') return true;
    return !unionPairs.has(uKey(e.a, e.b));
  });
}

/** A sim's pronouns as people write them: they/them, xie/xem. */
export function pronounsLabel(p: SimPronouns): string {
  return p.object && p.object !== p.subject ? `${p.subject}/${p.object}` : p.subject;
}

/**
 * "the Munch household", in a sentence. A household whose name starts with
 * "The" (The Nectar Making Duo) keeps its own: never "the The …".
 */
export function theHousehold(hh: string, name: (s: string) => string = (s) => s): string {
  return /^the\s/i.test(hh) ? `${name(hh)} household` : `the ${name(hh)} household`;
}

/** Sanitize relationship edges used for layout and routing. */
export function sanitizeEdges(edges: Edge[]): Edge[] {
  return pruneImpliedSiblingEdges(pruneContradictoryParentEdges(edges));
}

/** Drop sibling edges when both sims already share the same parents on the board. */
export function pruneImpliedSiblingEdges(edges: Edge[]): Edge[] {
  const parentsOf = parentsOfFromEdges(edges);
  return edges.filter((e) => {
    if (e.type !== 'sibling') return true;
    const ka = parentSetKey(parentsOf, e.a);
    const kb = parentSetKey(parentsOf, e.b);
    return !ka || ka !== kb;
  });
}

/**
 * Rename legacy world labels in loaded saves, and turn heirs planned at
 * each generation into one line of succession (chainPlannedHeirs).
 */
export function migrateWhiteboardData(d: {
  nodes: SimNode[];
  edges: Edge[];
  groups?: Group[];
  worlds?: World[];
  hiddenPacks?: string[];
  hiddenPlay?: string[];
  hiAges?: string[];
  hiSingle?: boolean;
  hideSecrets?: boolean;
  hideDeceased?: boolean;
  bloodlineId?: string | null;
  householdMoves?: HouseholdMove[];
  householdAgeUps?: HouseholdAgeUp[];
  deceasedMarks?: DeceasedMark[];
  simAgeUps?: SimAgeUp[];
  pairStatus?: PairStatus[];
  saveGame?: SaveGameInfo | null;
}): typeof d {
  const world = currentWorldName;
  const gid = currentGid;
  return {
    ...d,
    nodes: chainPlannedHeirs(
      d.nodes.map((n) => ({
        ...n,
        world: world(n.world),
        oworld: n.oworld ? world(n.oworld) : n.oworld,
        gid: gid(n.gid),
      })),
      d.edges,
    ),
    groups: d.groups?.map((g) => ({
      ...g,
      world: world(g.world),
      gid: gid(g.gid),
    })),
    worlds: d.worlds?.map((w) => ({ ...w, name: world(w.name) })),
    edges: sanitizeEdges(
      d.edges.map((e) => ({
        ...e,
        source: e.source ?? (String(e.id).charAt(0) === 'u' ? 'planned' : 'seed'),
      })),
    ),
    householdMoves: d.householdMoves?.map((m) => ({
      ...m,
      fromGid: gid(m.fromGid),
      fromWorld: world(m.fromWorld),
      toGid: gid(m.toGid),
      toWorld: world(m.toWorld),
    })),
    householdAgeUps: d.householdAgeUps?.map((a) => ({
      ...a,
      gid: gid(a.gid),
      world: world(a.world),
    })),
  };
}

export const cssesc = (s: string): string =>
  typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
    ? CSS.escape(s)
    : s.replace(/["\\]/g, '\\$&');

export function isPet(n: SimNode): boolean {
  return !!n.species || n.state === 'Pet';
}

export function randomNewSimGender(): (typeof NEW_SIM_GENDERS)[number] {
  const i = Math.floor(Math.random() * NEW_SIM_GENDERS.length);
  return NEW_SIM_GENDERS[i]!;
}

/** Next rung on AGES_H, or null when the age is unknown, last, or not a sim age. */
export function nextSimAge(age: string): string | null {
  const i = (AGES_H as readonly string[]).indexOf(age);
  if (i < 0 || i >= AGES_H.length - 1) return null;
  return AGES_H[i + 1] ?? null;
}

/** True when `to` is a later sim life stage than `from` on AGES_H. */
export function isLaterSimAge(from: string, to: string): boolean {
  const a = (AGES_H as readonly string[]).indexOf(from);
  const b = (AGES_H as readonly string[]).indexOf(to);
  return a >= 0 && b >= 0 && b > a;
}

/**
 * One household age-up step. Elders become Deceased (age stays Elder).
 * Pets, already-deceased, and ages not on the sim ladder stay put.
 */
export function ageUpPatch(n: SimNode): Partial<SimNode> | null {
  if (isPet(n)) return null;
  if (n.state === DECEASED_STATE) return null;
  const last = AGES_H[AGES_H.length - 1];
  if (last && n.age === last) return { state: DECEASED_STATE };
  const age = nextSimAge(n.age);
  if (!age) return null;
  return { age };
}

export function canAgeUp(n: SimNode): boolean {
  return ageUpPatch(n) != null;
}

/**
 * Current partners: marriage or romance. Divorced alone does not count, nor
 * a couple with a planned divorce or breakup: the board is the plan. With
 * `alive`, a partner who has died doesn't count either: the widowed are single.
 */
export function partneredIdSet(edges: Edge[], alive: (id: string) => boolean = () => true): Set<string> {
  const ids = new Set<string>();
  for (const e of edges) {
    if ((e.type !== 'marriage' && e.type !== 'romance') || e.ending) continue;
    if (!alive(e.a) || !alive(e.b)) continue;
    ids.add(e.a);
    ids.add(e.b);
  }
  return ids;
}

export function isUnpartnered(id: string, edges: Edge[]): boolean {
  return !partneredIdSet(edges).has(id);
}

/**
 * Sims who have a child on the board, planned babies included. With `alive`,
 * only living children count.
 */
export function parentIdSet(edges: Edge[], alive: (id: string) => boolean = () => true): Set<string> {
  const ids = new Set<string>();
  for (const e of edges) if (e.type === 'parent' && alive(e.b)) ids.add(e.a);
  return ids;
}

/**
 * A sim's place in a dynasty as the board has it, plan included: their role,
 * `member` for one with none, or null outside any dynasty. One planned to
 * leave is out; pets are never in one.
 */
export function dynastyStanding(n: SimNode): HiDynastyRole | null {
  if (!n.dynasty || n.species || n.dynastyPlan === 'none') return null;
  return n.dynastyRole ?? 'member';
}

const NO_IDS: ReadonlySet<string> = new Set();

/** Who the chips that aren't a field on the card pick out. */
export type HighlightSets = {
  /** Married or in a romance: Single leaves them out. */
  partnered: ReadonlySet<string>;
  /** Sims with a child: No children leaves them out. */
  parents?: ReadonlySet<string>;
  /** Planned babies, not born yet. */
  unborn?: ReadonlySet<string>;
};

/**
 * Age/species chips OR with each other, Not born yet among them; gender
 * chips OR with each other and AND with that set, and so do the dynasty role
 * chips. Single and No children each narrow on their own. Pets ignore
 * Single, No children and dynasty roles, and only glow for their species
 * chip, which a gender chip narrows like it does ages. The deceased never
 * match.
 */
export function isHighlightMatch(
  n: SimNode,
  hi: ReadonlySet<string>,
  hiSingle: boolean,
  { partnered, parents = NO_IDS, unborn = NO_IDS }: HighlightSets,
): boolean {
  if (hi.size === 0 && !hiSingle) return true;
  if (n.state === DECEASED_STATE) return false;
  let genders = 0;
  let roles = 0;
  for (const h of hi) {
    if (GENDER_CHIPS.has(h)) genders++;
    else if (HI_DYNASTY_CHIPS.has(h)) roles++;
  }
  const noKids = hi.has(HI_NO_CHILDREN);
  const kinds = hi.size - genders - roles - (noKids ? 1 : 0);
  const genderOk = genders === 0 || hi.has(n.gender);
  if (isPet(n)) return !!n.species && hi.has(n.species) && genderOk;
  const ageOk = kinds === 0 || hi.has(n.age) || (hi.has(HI_NOT_BORN) && unborn.has(n.id));
  const singleOk = !hiSingle || !partnered.has(n.id);
  const kidsOk = !noKids || !parents.has(n.id);
  const standing = roles ? dynastyStanding(n) : null;
  const roleOk = roles === 0 || (!!standing && hi.has(hiDynastyChip(standing)));
  return ageOk && genderOk && singleOk && kidsOk && roleOk;
}

/** Lowercase, trimmed and without accents, for search: "ananou" finds "Ánanou". */
export function fold(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
}
