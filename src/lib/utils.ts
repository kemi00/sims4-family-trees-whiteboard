import { chainPlannedHeirs } from './succession.ts';
import { isOngoingCouple } from './coupleStory.ts';
import type { ChronicleEntry } from './chronicle.ts';
import { MAGIC_REALM, homeWorld, realmGid } from './realm.ts';
import { isUnhousedGid } from './unhoused.ts';
import { AGES_H, DECEASED_STATE, GENDER_CHIPS, HI_DESCENDANTS, HI_DYNASTY_CHIPS, HI_FAMILY_CHIPS, HI_MARRIED, HI_NO_CHILDREN, HI_NO_SIBLINGS, HI_NOT_BORN, HI_ROMANCE, HI_SIBLINGS, hiDynastyChip, householdChipRange, HI_AGE_UNSET, HI_GAME_CHIPS, HI_IN_GAME, HI_NO_DYNASTY, HI_PLANNED, LEGACY_NOT_IN_WORLD, NEW_SIM_GENDERS, NOT_IN_WORLD, type HiDynastyRole } from './constants.ts';
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
 * each generation into one line of succession (chainPlannedHeirs). Cards
 * and households keep a world name the layout needs to place them as they
 * were; prepareLoadedBoard moves the Magic Realm's into Glimmerbrook.
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
  chronicle?: ChronicleEntry[];
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
    // Records of households in the Magic Realm when it was a world name
    // Glimmerbrook's neighbourhood; the cards move with the layout (realmIntoGlimmerbrook).
    householdMoves: d.householdMoves?.map((m) => ({
      ...m,
      fromGid: realmGid(gid(m.fromGid)),
      fromWorld: homeWorld(world(m.fromWorld)),
      ...(m.fromWorld === MAGIC_REALM ? { fromNb: MAGIC_REALM } : {}),
      toGid: realmGid(gid(m.toGid)),
      toWorld: homeWorld(world(m.toWorld)),
      ...(m.toWorld === MAGIC_REALM ? { toNb: MAGIC_REALM } : {}),
    })),
    householdAgeUps: d.householdAgeUps?.map((a) => ({
      ...a,
      gid: realmGid(gid(a.gid)),
      world: homeWorld(world(a.world)),
    })),
    ...(d.saveGame ? { saveGame: withStanding(d.saveGame) } : {}),
    ...(d.chronicle ? { chronicle: d.chronicle.map(withPerkPoints) } : {}),
  };
}

/** The save's details as the board keeps them now: last-played box in Glimmerbrook, perk points by name. */
function withStanding(g: SaveGameInfo | null): SaveGameInfo | null {
  if (!g) return g;
  const out = g.lastPlayedGid ? { ...g, lastPlayedGid: realmGid(g.lastPlayedGid) } : g;
  // Before 2026-11-20 the board called a dynasty's perk points its prestige.
  const old = (out as SaveGameInfo & { prestige?: Record<string, number> }).prestige;
  if (!old) return out;
  const { prestige: _was, ...rest } = out as SaveGameInfo & { prestige?: unknown };
  return {
    ...rest,
    dynastyStanding: rest.dynastyStanding ?? Object.fromEntries(Object.entries(old).map(([key, perkPoints]) => [key, { perkPoints }])),
  };
}

/**
 * A story entry kept before 2026-11-20, when the board called a dynasty's
 * perk points its prestige: that news is about perk points, so it is told
 * as such. Entries since then are returned as they are.
 */
export function withPerkPoints(e: ChronicleEntry): ChronicleEntry {
  const old = (e.recap as { prestige?: { key: string; name: string; from: number; to: number }[] } | undefined)?.prestige;
  if (!e.recap || !old) return e;
  const { prestige: _was, ...rest } = e.recap as NonNullable<ChronicleEntry['recap']> & { prestige?: unknown };
  const perks = old.map((p) => ({ key: p.key, name: p.name, pointsFrom: p.from, pointsTo: p.to }));
  return { ...e, recap: { ...rest, perks: [...(rest.perks ?? []), ...perks] } };
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
 * A couple the game still has that a passing ended: one of the two, or both,
 * passed away. A couple link says who is together now, so a passing ends it
 * (a parent link says whose child someone is, which a passing never changes).
 * The one left is single (widowed): there is nothing to divorce or break up,
 * and no plan it stands in the way of. The board keeps the link, very faded,
 * as their history.
 */
export function endedByPassing(e: Pick<Edge, 'type' | 'a' | 'b'>, isDead: (id: string) => boolean): boolean {
  return (e.type === 'marriage' || e.type === 'romance') && (isDead(e.a) || isDead(e.b));
}

/**
 * Current partners: marriage or romance. Divorced alone does not count, nor
 * a couple with a planned divorce or breakup: the board is the plan. With
 * `alive`, a partner who has died doesn't count either: the widowed are single.
 */
export function partneredIdSet(edges: Edge[], alive: (id: string) => boolean = () => true): Set<string> {
  const ids = new Set<string>();
  for (const e of edges) {
    if (!isOngoingCouple(e, edges)) continue;
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

/** Sims with a living sibling: explicit links or a shared parent, including
 * half-siblings, adopted children and planned babies. Parents may be deceased. */
export function siblingIdSet(edges: Edge[], alive: (id: string) => boolean = () => true): Set<string> {
  const ids = new Set<string>();
  const children = new Map<string, Set<string>>();
  for (const e of edges) {
    if (e.a === e.b) continue;
    if (e.type === 'sibling' && alive(e.a) && alive(e.b)) {
      ids.add(e.a);
      ids.add(e.b);
    } else if (e.type === 'parent' && alive(e.b)) {
      const family = children.get(e.a) ?? new Set<string>();
      family.add(e.b);
      children.set(e.a, family);
    }
  }
  for (const family of children.values()) if (family.size > 1) for (const id of family) ids.add(id);
  return ids;
}

/**
 * A sim's place in a dynasty as the board has it, future heirs included: their role,
 * `member` for one with none, or null outside any dynasty. One planned to
 * leave is out; pets are never in one.
 */
export function dynastyStanding(n: SimNode): HiDynastyRole | null {
  if (!n.dynasty || n.species || n.dynastyPlan === 'none') return null;
  if (n.heirAfter) return 'heir';
  return n.dynastyRole ?? 'member';
}

const NO_IDS: ReadonlySet<string> = new Set();

/** Who the chips that aren't a field on the card pick out. */
export type HighlightSets = {
  /** Married or in a romance: Single leaves them out. */
  partnered: ReadonlySet<string>;
  /** Married: Married picks them, In a romance the rest of the partnered. */
  married?: ReadonlySet<string>;
  /** Sims with a living descendant, planned babies counted: Descendants picks them, No descendants the rest. */
  descendants?: ReadonlySet<string>;
  /** Sims with a living sibling: Siblings picks them, No siblings the rest. */
  siblings?: ReadonlySet<string>;
  /** Planned babies, not born yet. */
  unborn?: ReadonlySet<string>;
  /** Planned sims, not in your game yet (isPlannedSim): In your game › Not yet picks them, Yes the rest. */
  planned?: ReadonlySet<string>;
  /** Each household's living sims and pets, planned ones too, by its box (householdSizes): the household size range. */
  householdSizes?: ReadonlyMap<string, number>;
};

/**
 * Age/species chips OR with each other, Not born yet and Age not set among
 * them; gender chips OR with each other and AND with that set, and so do the
 * dynasty chips (None among them). The family chips come in groups, each
 * narrowing the rest: Single, In a romance and Married; Descendants and No
 * descendants; Siblings and No siblings; and In your game, Yes and Not yet.
 * Within a group they add up, so both sides of a pair is everyone. The
 * household size range narrows the rest, counting everyone at home, planned
 * babies and pets too, as the game's limit does. Pets ignore family,
 * household and dynasty chips, and only glow for their species chip, which a
 * gender chip narrows like it does ages. The deceased never match.
 */
export function isHighlightMatch(
  n: SimNode,
  hi: ReadonlySet<string>,
  hiSingle: boolean,
  { partnered, married = NO_IDS, descendants = NO_IDS, siblings = NO_IDS, unborn = NO_IDS, planned = NO_IDS, householdSizes }: HighlightSets,
): boolean {
  if (hi.size === 0 && !hiSingle) return true;
  if (n.state === DECEASED_STATE) return false;
  let genders = 0;
  let roles = 0;
  let family = 0;
  const ranges: { min: number; max: number | null }[] = [];
  for (const h of hi) {
    if (GENDER_CHIPS.has(h)) genders++;
    else if (HI_DYNASTY_CHIPS.has(h)) roles++;
    else if (HI_FAMILY_CHIPS.has(h) || HI_GAME_CHIPS.has(h)) family++;
    else {
      const range = householdChipRange(h);
      if (range) ranges.push(range);
    }
  }
  const kinds = hi.size - genders - roles - family - ranges.length;
  const genderOk = genders === 0 || hi.has(n.gender);
  if (isPet(n)) return !!n.species && hi.has(n.species) && genderOk;
  // Each sim is in one life stage chip: its own, Not born yet, or Age not set.
  const staged = hasLifeStage(n);
  const notBorn = !staged && unborn.has(n.id);
  const ageOk =
    kinds === 0 ||
    (staged && hi.has(n.age)) ||
    (hi.has(HI_NOT_BORN) && notBorn) ||
    (hi.has(HI_AGE_UNSET) && !staged && !notBorn);
  // Each group: no pick is everyone; picks add up within it.
  const group = (picks: [boolean, boolean][]) => !picks.some(([on]) => on) || picks.some(([on, ok]) => on && ok);
  const isPartnered = partnered.has(n.id);
  const isMarried = married.has(n.id);
  const partnerOk = group([
    [hiSingle, !isPartnered],
    [hi.has(HI_ROMANCE), isPartnered && !isMarried],
    [hi.has(HI_MARRIED), isMarried],
  ]);
  const kidsOk = group([
    [hi.has(HI_DESCENDANTS), descendants.has(n.id)],
    [hi.has(HI_NO_CHILDREN), !descendants.has(n.id)],
  ]);
  const siblingsOk = group([
    [hi.has(HI_SIBLINGS), siblings.has(n.id)],
    [hi.has(HI_NO_SIBLINGS), !siblings.has(n.id)],
  ]);
  const gameOk = group([
    [hi.has(HI_IN_GAME), !planned.has(n.id)],
    [hi.has(HI_PLANNED), planned.has(n.id)],
  ]);
  const size = householdSizes?.get(n.gid);
  const sizeOk = !ranges.length || (size !== undefined && ranges.some((r) => size >= r.min && (r.max === null || size <= r.max)));
  const standing = roles ? dynastyStanding(n) : null;
  const roleOk = roles === 0 || (standing ? hi.has(hiDynastyChip(standing)) : hi.has(HI_NO_DYNASTY));
  return ageOk && genderOk && partnerOk && kidsOk && siblingsOk && gameOk && sizeOk && roleOk;
}

/** Married to a sim who is alive, now (their story's last step): the Married highlight. */
export function marriedIdSet(edges: Edge[], alive: (id: string) => boolean = () => true): Set<string> {
  const ids = new Set<string>();
  for (const e of edges) {
    if (e.type !== 'marriage' || !isOngoingCouple(e, edges) || !alive(e.a) || !alive(e.b)) continue;
    ids.add(e.a);
    ids.add(e.b);
  }
  return ids;
}

/**
 * Sims with a living descendant: a child, a grandchild and on down, planned
 * babies counted. A sim whose only child passed away but left a grandchild
 * still has one.
 */
export function descendantIdSet(edges: Edge[], alive: (id: string) => boolean = () => true): Set<string> {
  const parentsOf = new Map<string, string[]>();
  for (const e of edges) {
    if (e.type !== 'parent' || e.a === e.b) continue;
    parentsOf.set(e.b, [...(parentsOf.get(e.b) ?? []), e.a]);
  }
  const ids = new Set<string>();
  for (const child of parentsOf.keys()) {
    if (!alive(child)) continue;
    const stack = [...(parentsOf.get(child) ?? [])];
    while (stack.length) {
      const p = stack.pop()!;
      if (ids.has(p)) continue;
      ids.add(p);
      stack.push(...(parentsOf.get(p) ?? []));
    }
  }
  return ids;
}

/** A life stage the board knows: Infant to Elder. A planned sim with none chosen, or an unknown, has none. */
export function hasLifeStage(n: Pick<SimNode, 'age'>): boolean {
  return (AGES_H as readonly string[]).includes(n.age);
}

/**
 * Each household's living sims and pets, by its box, planned ones too (a
 * baby not born yet among them): what the game counts toward its limit of
 * eight, once your plans happen. The deceased don't count, and the
 * Unhoused sims boxes are no household.
 */
export function householdSizes(nodes: readonly SimNode[]): Map<string, number> {
  const sizes = new Map<string, number>();
  for (const n of nodes) {
    if (n.state === DECEASED_STATE || isUnhousedGid(n.gid)) continue;
    sizes.set(n.gid, (sizes.get(n.gid) ?? 0) + 1);
  }
  return sizes;
}

/** Lowercase, trimmed and without accents, for search: "ananou" finds "Ánanou". */
export function fold(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
}
