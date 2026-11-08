import { DECEASED_STATE, GENDERS } from './constants.ts';
import { edgeSourceOf } from './utils.ts';
import type { ParsedSave, ParsedSaveSim } from './savegame/parseSave.ts';
import type { Edge, EdgeType, HouseholdMove, SimNode } from '../types/whiteboard.ts';

/**
 * Your plan against your game. A plan is what you add on the board and the
 * save does not have yet: violet links, and planned sims (added cards). Each
 * save either confirms a piece of it (the link turns gray, a planned sim is
 * filled by the real one), leaves it planned, or goes another way. This
 * module finds the last, applies what you choose for it, and matches
 * planned sims to the sims a save brings.
 */

/** A planned sim: added on the board and not yet filled by a sim from a save. */
export function isPlannedSim(n: Pick<SimNode, 'added' | 'saveSimId'>): boolean {
  return !!n.added && !n.saveSimId;
}

/** The life stage of a planned sim that is not in the game yet. */
export const NOT_YET_AGE = 'Unknown';

/** A gender the plan leaves open. */
export const GENDER_NOT_KNOWN = '-';

/**
 * The name a card shows: its name, or for a planned sim with no first name,
 * its plan label and surname ("Firstborn Dreamer"), else its number among the
 * planned sims of that surname ("Planned (2) Le Chien"), so no two read alike.
 */
export function cardName(n: Pick<SimNode, 'first' | 'sur' | 'planLabel' | 'planNo' | 'added' | 'saveSimId'>): string {
  const name = `${n.first} ${n.sur}`.trim();
  if (n.first.trim() || !isPlannedSim(n)) return name;
  const label = n.planLabel?.trim() || (n.planNo ? `Planned (${n.planNo})` : 'Planned');
  return `${label} ${n.sur}`.trim();
}

/**
 * Roles set by hand before roles were plans: a role with no dynasty can only
 * have come from the board, so it becomes a plan to join one ('member').
 * Returns the same array when nothing changes.
 */
export function markHandSetRoles(nodes: SimNode[]): SimNode[] {
  if (!nodes.some((n) => n.dynastyRole && !n.dynasty && !n.dynastyPlan)) return nodes;
  return nodes.map((n) => (n.dynastyRole && !n.dynasty && !n.dynastyPlan ? { ...n, dynastyPlan: 'member' as const } : n));
}

/**
 * The shortest name that still tells a sim apart: their first name, else
 * their plan label, else last name and number ("Le Chien (1)").
 */
export function shortName(n: Pick<SimNode, 'first' | 'sur' | 'planLabel' | 'planNo' | 'added' | 'saveSimId'>): string {
  const first = n.first.trim();
  if (first) return first;
  const label = n.planLabel?.trim();
  if (label) return label;
  const sur = n.sur.trim();
  return n.planNo && isPlannedSim(n) ? `${sur} (${n.planNo})` : sur;
}

/**
 * Whose child a planned sim is, for its card, longest first so the card
 * can take the first that fits: "Child of Jules ＋ Bess", "Jules ＋ Bess".
 */
export function parentsLines(parents: SimNode[]): string[] {
  if (!parents.length) return [];
  const who = parents.map(shortName).join(' ＋ ');
  return [`Child of ${who}`, who];
}

/**
 * Numbers every planned sim that goes by its surname (no first name, no plan
 * label) and has no number yet, or one another planned sim of its surname
 * already has (after a rename): the next number for that surname, oldest
 * card first. Numbers stay once given: naming, filling or deleting one
 * leaves the others as they are. Returns the same array when nothing changes.
 */
export function numberPlannedSims(nodes: SimNode[]): SimNode[] {
  const fold = (s: string) => s.trim().toLocaleLowerCase();
  const order = (id: string) => Number(id.replace(/\D+/g, '')) || 0;
  const taken = new Map<string, Set<number>>();
  const top = new Map<string, number>();
  for (const n of nodes) {
    if (!n.planNo) continue;
    const k = fold(n.sur);
    top.set(k, Math.max(top.get(k) ?? 0, n.planNo));
  }
  const need: SimNode[] = [];
  for (const n of [...nodes].sort((a, b) => order(a.id) - order(b.id))) {
    if (!isPlannedSim(n)) continue;
    const k = fold(n.sur);
    const used = taken.get(k) ?? new Set<number>();
    taken.set(k, used);
    if (n.planNo && !used.has(n.planNo)) used.add(n.planNo);
    else if (!n.first.trim() && !n.planLabel?.trim()) need.push(n);
  }
  if (!need.length) return nodes;
  const given = new Map<string, number>();
  for (const n of need) {
    const k = fold(n.sur);
    const no = (top.get(k) ?? 0) + 1;
    top.set(k, no);
    given.set(n.id, no);
  }
  return nodes.map((n) => (given.has(n.id) ? { ...n, planNo: given.get(n.id)! } : n));
}

/** "Not born yet" for a planned child, "Not in the game yet" for anyone else planned. */
export function notYetText(plannedChild: boolean): string {
  return plannedChild ? 'Not born yet' : 'Not in the game yet';
}

const COUPLE: ReadonlySet<EdgeType> = new Set(['marriage', 'romance']);

export type PlanConflictKind = 'marriedElsewhere' | 'datingElsewhere' | 'deceased' | 'otherParents';

/** A planned link the game went against. */
export type PlanConflict = {
  /** The planned link: a couple, or a parent → child. */
  edgeId: string;
  kind: PlanConflictKind;
  a: string;
  b: string;
  /** Who the game paired with someone else, and that someone. */
  sim?: string;
  partner?: string;
  /** Who died. */
  dead?: string;
  /** The planned couple's planned children. */
  children: string[];
  /** The game rules the plan out (a marriage, a death, two other parents); dating may pass. */
  strong: boolean;
};

/**
 * Planned links the game went against, worked out from the board each time:
 *
 * - a planned couple where one of them is married to someone else in the
 *   save (Beatrice planned with Dirk, married to Adekoya): ruled out;
 * - one where one of them dates or is engaged to someone else: may pass;
 * - one where one of them has died;
 * - a planned parent of a sim the save gives two other parents.
 *
 * A planned couple's planned children go with it. Links kept with "Keep my
 * plan" are left out.
 */
export function planConflicts(nodes: SimNode[], edges: Edge[]): PlanConflict[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const planned = (e: Edge) => edgeSourceOf(e) === 'planned';
  const settledWith = new Map<string, { type: EdgeType; other: string }[]>();
  const parentsOf = new Map<string, Edge[]>();
  for (const e of edges) {
    if (e.type === 'parent') {
      parentsOf.set(e.b, [...(parentsOf.get(e.b) ?? []), e]);
    } else if (!planned(e) && COUPLE.has(e.type)) {
      settledWith.set(e.a, [...(settledWith.get(e.a) ?? []), { type: e.type, other: e.b }]);
      settledWith.set(e.b, [...(settledWith.get(e.b) ?? []), { type: e.type, other: e.a }]);
    }
  }
  const dead = (id: string) => byId.get(id)?.state === DECEASED_STATE;
  const out: PlanConflict[] = [];
  /** Parent links already covered by their couple's conflict. */
  const covered = new Set<string>();
  for (const u of edges) {
    if (!COUPLE.has(u.type) || !planned(u) || u.plan === 'kept') continue;
    if (!byId.has(u.a) || !byId.has(u.b)) continue;
    const children: string[] = [];
    for (const [child, links] of parentsOf) {
      const fromA = links.find((p) => p.a === u.a);
      const fromB = links.find((p) => p.a === u.b);
      if (!fromA || !fromB || (!planned(fromA) && !planned(fromB))) continue;
      children.push(child);
    }
    const base = { edgeId: u.id, a: u.a, b: u.b, children };
    let found: Omit<PlanConflict, 'edgeId' | 'a' | 'b' | 'children'> | null = null;
    const gone = [u.a, u.b].find(dead);
    if (gone) found = { kind: 'deceased', dead: gone, strong: true };
    for (const type of ['marriage', 'romance'] as const) {
      if (found) break;
      for (const [sim, other] of [
        [u.a, u.b],
        [u.b, u.a],
      ] as const) {
        const with_ = (settledWith.get(sim) ?? []).find((s) => s.type === type && s.other !== other);
        if (!with_) continue;
        found =
          type === 'marriage'
            ? { kind: 'marriedElsewhere', sim, partner: with_.other, strong: true }
            : { kind: 'datingElsewhere', sim, partner: with_.other, strong: false };
        break;
      }
    }
    if (!found) continue;
    out.push({ ...base, ...found });
    for (const child of children) {
      for (const p of parentsOf.get(child) ?? []) if (p.a === u.a || p.a === u.b) covered.add(p.id);
    }
  }
  for (const e of edges) {
    if (e.type !== 'parent' || !planned(e) || e.plan === 'kept' || covered.has(e.id)) continue;
    const others = (parentsOf.get(e.b) ?? []).filter((p) => !planned(p) && p.a !== e.a);
    if (others.length < 2) continue;
    out.push({ edgeId: e.id, kind: 'otherParents', a: e.a, b: e.b, children: [], strong: true });
  }
  return out;
}

/** What to do about a plan the game went against. */
export type PlanChoice = 'follow' | 'keep' | 'drop';

/**
 * Applies a choice:
 *
 * - Keep my plan: the link stays violet and is no longer flagged.
 * - Drop it: the planned link goes, with the couple's planned children's
 *   links to them, and a planned child left with no links at all.
 * - Follow the game: the planned couple goes, and its planned children are
 *   planned with the partner the game chose instead (or keep only the living
 *   parent); a planned parent of a sim with two other parents goes.
 */
export function resolvePlanConflict(
  nodes: SimNode[],
  edges: Edge[],
  c: PlanConflict,
  choice: PlanChoice,
  makeId: () => string,
  now: string,
): { nodes: SimNode[]; edges: Edge[] } {
  if (choice === 'keep') {
    return { nodes, edges: edges.map((e) => (e.id === c.edgeId ? { ...e, plan: 'kept' as const } : e)) };
  }
  if (c.kind === 'otherParents') {
    return { nodes, edges: edges.filter((e) => e.id !== c.edgeId) };
  }
  const children = new Set(c.children);
  const plannedFrom = (e: Edge, who: ReadonlySet<string>) =>
    e.type === 'parent' && children.has(e.b) && who.has(e.a) && edgeSourceOf(e) === 'planned';
  let next = edges.filter((e) => e.id !== c.edgeId);
  if (choice === 'drop' || c.kind === 'deceased') {
    const leaving = choice === 'drop' ? new Set([c.a, c.b]) : new Set([c.dead!]);
    next = next.filter((e) => !plannedFrom(e, leaving));
  } else {
    // Their children are now planned with the partner the game chose.
    const left = c.sim === c.a ? c.b : c.a;
    const chosen = c.partner!;
    const out: Edge[] = [];
    for (const e of next) {
      if (!plannedFrom(e, new Set([left]))) {
        out.push(e);
        continue;
      }
      const has = next.some((x) => x.type === 'parent' && x.a === chosen && x.b === e.b);
      if (!has) out.push({ ...e, id: makeId(), a: chosen, createdAt: now });
    }
    next = out;
  }
  // A planned child no link reaches any more is no part of the plan.
  const linked = new Set(next.flatMap((e) => [e.a, e.b]));
  const keepNodes = nodes.filter((n) => !(children.has(n.id) && isPlannedSim(n) && !linked.has(n.id)));
  return { nodes: keepNodes.length === nodes.length ? nodes : keepNodes, edges: next };
}

/**
 * A planned couple's partner who was moved by hand into the other's
 * household for the plan, while the game went another way: following the
 * game takes them back (Beatrice, moved in with Dirk, married Adekoya).
 */
export function moveToUndo(
  c: PlanConflict,
  nodes: SimNode[],
  moves: HouseholdMove[],
): HouseholdMove | null {
  if (c.kind !== 'marriedElsewhere' && c.kind !== 'datingElsewhere') return null;
  const other = c.sim === c.a ? c.b : c.a;
  const theirs = nodes.find((n) => n.id === other)?.gid;
  const last = [...moves].reverse().find((m) => m.simId === c.sim);
  return last && theirs && last.toGid === theirs ? last : null;
}

/** A sim from the save that could fill a planned sim. */
export type SlotCandidate = {
  saveSimId: string;
  name: string;
  /** "Daughter of Beatrice & Adekoya", "Married Oscar Flex". */
  why: string;
  /** The only one that fits, by both planned parents or a marriage. */
  sure: boolean;
  gender: string;
  /** A child's parents in the save, by save sim id. */
  parents: string[];
  /** A child of every planned parent; a spouse always is. */
  all: boolean;
};

export type SlotSuggestion = {
  slotId: string;
  kind: 'child' | 'spouse';
  /** Board ids of its planned parents, or of its planned partners. */
  of: string[];
  candidates: SlotCandidate[];
};

const fullName = (s: Pick<ParsedSaveSim, 'first' | 'last'>) => `${s.first} ${s.last}`.trim();

/**
 * Sims a save brings that could fill each planned sim, likeliest first. A
 * planned child is matched by its planned parents: a sim new in this save
 * with both of them as parents is sure when it is the only one; one parent
 * makes a candidate. A known gender and being born in play break ties. A
 * planned spouse is matched through their planned partner: someone new in
 * this save married to them is sure when there is only one. `picks` are the
 * planned sims filled so far, so a planned spouse of a planned child counts.
 */
export function slotSuggestions(opts: {
  nodes: SimNode[];
  edges: Edge[];
  parsed: Pick<ParsedSave, 'sims' | 'rels'>;
  picks?: ReadonlyMap<string, string>;
}): SlotSuggestion[] {
  const { nodes, edges, parsed } = opts;
  const picks = opts.picks ?? new Map<string, string>();
  const onBoard = new Set(nodes.flatMap((n) => (n.saveSimId ? [n.saveSimId] : [])));
  const fresh = parsed.sims.filter((s) => !onBoard.has(s.saveSimId) && !s.species);
  const sim = new Map(parsed.sims.map((s) => [s.saveSimId, s]));
  const saveParents = new Map<string, string[]>();
  const savePartners = new Map<string, { id: string; married: boolean }[]>();
  for (const r of parsed.rels) {
    if (r.type === 'parent') saveParents.set(r.b, [...(saveParents.get(r.b) ?? []), r.a]);
    else if (r.type === 'marriage' || r.type === 'romance') {
      const married = r.type === 'marriage';
      savePartners.set(r.a, [...(savePartners.get(r.a) ?? []), { id: r.b, married }]);
      savePartners.set(r.b, [...(savePartners.get(r.b) ?? []), { id: r.a, married }]);
    }
  }
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const bySaveId = new Map(nodes.flatMap((n) => (n.saveSimId ? [[n.saveSimId, n] as const] : [])));
  const saveIdOf = (boardId: string) => byId.get(boardId)?.saveSimId ?? picks.get(boardId);
  // The save's name for them, else the board's.
  const firstOf = (id: string) => sim.get(id)?.first ?? bySaveId.get(id)?.first ?? '';
  const nameOf = (id: string) => {
    const s = sim.get(id);
    if (s) return fullName(s);
    const n = bySaveId.get(id);
    return n ? `${n.first} ${n.sur}`.trim() : '';
  };
  const firstNames = (ids: string[]) => ids.map(firstOf).filter(Boolean).join(' & ');
  const out: SlotSuggestion[] = [];
  for (const slot of nodes) {
    if (!isPlannedSim(slot)) continue;
    const parentIds = edges.filter((e) => e.type === 'parent' && e.b === slot.id).map((e) => e.a);
    const plannedParents = new Set(parentIds.map(saveIdOf).filter((id): id is string => !!id));
    const knownGender = (GENDERS as readonly string[]).includes(slot.gender) ? slot.gender : '';
    if (plannedParents.size) {
      const scored = fresh
        .map((s) => {
          const parents = saveParents.get(s.saveSimId) ?? [];
          return { s, parents, overlap: parents.filter((p) => plannedParents.has(p)).length };
        })
        .filter((x) => x.overlap > 0);
      if (!scored.length) continue;
      const best = Math.max(...scored.map((x) => x.overlap));
      const top = scored.filter((x) => x.overlap === best);
      const fits = (x: (typeof scored)[number]) => !knownGender || x.s.gender === knownGender;
      const sureOne = top.length === 1 && best === plannedParents.size && fits(top[0]!);
      scored.sort(
        (x, y) =>
          y.overlap - x.overlap ||
          Number(fits(y)) - Number(fits(x)) ||
          Number(!!y.s.bornInPlay) - Number(!!x.s.bornInPlay) ||
          fullName(x.s).localeCompare(fullName(y.s)),
      );
      out.push({
        slotId: slot.id,
        kind: 'child',
        of: parentIds,
        candidates: scored.map((x) => ({
          saveSimId: x.s.saveSimId,
          name: fullName(x.s),
          why: `${x.s.gender === 'Female' ? 'Daughter' : x.s.gender === 'Male' ? 'Son' : 'Child'} of ${firstNames(x.parents)}`,
          sure: sureOne && x === top[0],
          gender: x.s.gender,
          parents: x.parents,
          all: x.overlap === plannedParents.size,
        })),
      });
      continue;
    }
    const partners = edges
      .filter((e) => COUPLE.has(e.type) && (e.a === slot.id || e.b === slot.id))
      .map((e) => (e.a === slot.id ? e.b : e.a));
    const candidates: SlotCandidate[] = [];
    for (const p of partners) {
      const pid = saveIdOf(p);
      if (!pid) continue;
      const theirs = (savePartners.get(pid) ?? []).filter((x) => !onBoard.has(x.id) && sim.has(x.id));
      const sure = theirs.length === 1 && theirs[0]!.married;
      for (const x of theirs) {
        const s = sim.get(x.id)!;
        candidates.push({
          saveSimId: x.id,
          name: fullName(s),
          why: `${x.married ? 'Married' : 'Partner of'} ${nameOf(pid)}`,
          sure,
          gender: s.gender,
          parents: [],
          all: true,
        });
      }
    }
    if (candidates.length) out.push({ slotId: slot.id, kind: 'spouse', of: partners, candidates });
  }
  return out;
}

/** A planned sim as it stood, for `plannedAs`. */
export function plannedSnapshot(slot: SimNode, at: string): NonNullable<SimNode['plannedAs']> {
  return {
    label: cardName(slot),
    first: slot.first,
    sur: slot.sur,
    gender: slot.gender,
    age: slot.age,
    ...(slot.planLabel ? { planLabel: slot.planLabel } : {}),
    ...(slot.planNo ? { planNo: slot.planNo } : {}),
    gid: slot.gid,
    hh: slot.hh,
    world: slot.world,
    nb: slot.nb,
    color: slot.color,
    at,
  };
}

const pairOf = (e: Edge) => (e.type === 'parent' ? `${e.a}>${e.b}` : [e.a, e.b].sort().join('|'));

/**
 * One link per kind and pair, where a sim and their planned stand-in became
 * one card: the save's wins and counts as the plan done.
 */
function collapseLinks(edges: Edge[]): Edge[] {
  const out: Edge[] = [];
  const at = new Map<string, number>();
  for (const e of edges) {
    if (e.a === e.b) continue;
    const key = `${e.type}:${pairOf(e)}`;
    const i = at.get(key);
    if (i === undefined) {
      at.set(key, out.length);
      out.push(e);
      continue;
    }
    const kept = out[i]!;
    const keptPlanned = edgeSourceOf(kept) === 'planned';
    const thisPlanned = edgeSourceOf(e) === 'planned';
    if (keptPlanned && !thisPlanned) out[i] = { ...e, wasPlanned: true };
    else if (!keptPlanned && thisPlanned) out[i] = { ...kept, wasPlanned: true };
  }
  return out;
}

/**
 * Planned parent links a save overrules. Your save is the truth about who a
 * sim's parents are: once it gives a filled sim two, a planned parent who
 * is neither of them goes (Dirk, planned father of the baby Beatrice had
 * with Adekoya).
 */
export function overruledParentLinks(edges: Edge[], simIds: Iterable<string>): Edge[] {
  const ids = new Set(simIds);
  const into = new Map<string, Edge[]>();
  for (const e of edges) {
    if (e.type === 'parent' && ids.has(e.b)) into.set(e.b, [...(into.get(e.b) ?? []), e]);
  }
  const out: Edge[] = [];
  for (const links of into.values()) {
    if (links.filter((e) => edgeSourceOf(e) !== 'planned').length < 2) continue;
    out.push(...links.filter((e) => edgeSourceOf(e) === 'planned'));
  }
  return out;
}

/**
 * A planned sim's planned dynasty role, for the sim from the save that fills
 * it: kept as a plan while the save has them in no dynasty or in the same one
 * with another role, as a save import does (syncDynasty).
 */
function plannedRoleFor(slot: SimNode, real: SimNode): Partial<SimNode> {
  if (slot.dynastyPlan !== 'member' && slot.dynastyPlan !== 'role') return {};
  const same =
    !!real.dynasty &&
    (slot.dynastyId && real.dynastyId ? slot.dynastyId === real.dynastyId : slot.dynasty === real.dynasty);
  if (same) {
    return real.dynastyRole === slot.dynastyRole
      ? {}
      : { dynastyRole: slot.dynastyRole, dynastyPlan: 'role' };
  }
  return {
    dynasty: slot.dynasty,
    dynastyId: slot.dynastyId,
    dynastyRef: slot.dynastyRef,
    dynastyRole: slot.dynastyRole,
    dynastyPlan: 'member',
  };
}

/**
 * "This is …": a sim from the save fills a planned sim by hand. The real
 * sim's card stays where the game puts them and takes over the planned
 * sim's links; theirs from the save win where both have one, and a planned
 * parent they overrule goes (`overruled`). The planned card goes,
 * remembered in `plannedAs` for Unlink.
 */
export function linkPlannedSim(
  nodes: SimNode[],
  edges: Edge[],
  slotId: string,
  realId: string,
  now: string,
): { nodes: SimNode[]; edges: Edge[]; overruled: string[] } {
  const slot = nodes.find((n) => n.id === slotId);
  const real = nodes.find((n) => n.id === realId);
  if (!slot || !real || !isPlannedSim(slot) || isPlannedSim(real) || slotId === realId) {
    return { nodes, edges, overruled: [] };
  }
  const swap = (id: string) => (id === slotId ? realId : id);
  const moved = collapseLinks(edges.map((e) => (e.a === slotId || e.b === slotId ? { ...e, a: swap(e.a), b: swap(e.b) } : e)));
  const gone = overruledParentLinks(moved, [realId]);
  const overruled = gone.map((e) => e.a);
  const snapshot = plannedSnapshot(slot, now);
  if (overruled.length) snapshot.parents = overruled;
  return {
    nodes: nodes
      .filter((n) => n.id !== slotId)
      .map((n) => (n.id === realId ? { ...n, ...plannedRoleFor(slot, n), plannedAs: snapshot } : n)),
    edges: gone.length ? moved.filter((e) => !gone.includes(e)) : moved,
    overruled,
  };
}

/**
 * Undoes a fill: the planned sim comes back, with the planned links on this
 * sim, a planned copy of each the save confirmed, and the planned parents
 * the save overruled. The sim from the save stays as they are.
 */
export function unlinkPlannedSim(
  nodes: SimNode[],
  edges: Edge[],
  id: string,
  makeNodeId: () => string,
  makeEdgeId: () => string,
): { nodes: SimNode[]; edges: Edge[]; plannedId: string | null } {
  const real = nodes.find((n) => n.id === id);
  const was = real?.plannedAs;
  if (!real || !was) return { nodes, edges, plannedId: null };
  const pid = makeNodeId();
  const planned: SimNode = {
    id: pid,
    gid: was.gid,
    first: was.first,
    sur: was.sur,
    age: was.age,
    state: 'Sim',
    gender: was.gender,
    hh: was.hh,
    world: was.world,
    nb: was.nb,
    color: was.color,
    townie: false,
    oworld: was.world,
    onb: was.nb,
    ohh: was.hh,
    oplay: 'Resident',
    pack: '',
    ox: 0,
    oy: 0,
    x: 0,
    y: 0,
    w: 0,
    h: 0,
    added: true,
    ...(was.planLabel ? { planLabel: was.planLabel } : {}),
    ...(was.planNo ? { planNo: was.planNo } : {}),
  };
  const swap = (x: string) => (x === id ? pid : x);
  const next: Edge[] = [];
  for (const e of edges) {
    const touches = e.a === id || e.b === id;
    if (!touches) {
      next.push(e);
    } else if (edgeSourceOf(e) === 'planned') {
      next.push({ ...e, a: swap(e.a), b: swap(e.b) });
    } else if (e.wasPlanned) {
      const { wasPlanned: _done, ...settled } = e;
      next.push(settled);
      next.push({ ...settled, id: makeEdgeId(), a: swap(e.a), b: swap(e.b), source: 'planned' });
    } else {
      next.push(e);
    }
  }
  const alive = new Set(nodes.map((n) => n.id));
  for (const p of was.parents ?? []) {
    if (!alive.has(p) || next.some((e) => e.type === 'parent' && e.a === p && e.b === pid)) continue;
    next.push({ id: makeEdgeId(), a: p, b: pid, type: 'parent', source: 'planned' });
  }
  const { plannedAs: _was, ...rest } = real;
  return {
    nodes: [...nodes.map((n) => (n.id === id ? rest : n)), planned],
    edges: next,
    plannedId: pid,
  };
}

/** How the plan stands: links still planned, done (a save confirmed them) and off plan. */
export function planProgress(edges: Edge[], conflicts: PlanConflict[]): { planned: number; done: number; offPlan: number } {
  const off = new Set(conflicts.map((c) => c.edgeId));
  let planned = 0;
  let done = 0;
  for (const e of edges) {
    if (e.wasPlanned) done += 1;
    else if (edgeSourceOf(e) === 'planned' && !off.has(e.id)) planned += 1;
  }
  return { planned, done, offPlan: off.size };
}

/**
 * What the game did instead, in a sentence: "Beatrice married Adekoya, not
 * Dirk as planned."
 */
export function conflictText(c: PlanConflict, nameOf: (id: string) => string): string {
  const other = c.sim === c.a ? c.b : c.a;
  switch (c.kind) {
    case 'marriedElsewhere':
      return `${nameOf(c.sim!)} married ${nameOf(c.partner!)}, not ${nameOf(other)} as planned.`;
    case 'datingElsewhere':
      return `${nameOf(c.sim!)} is with ${nameOf(c.partner!)}, not ${nameOf(other)} as planned.`;
    case 'deceased':
      return `${nameOf(c.dead!)} has died, so ${nameOf(c.a)} and ${nameOf(c.b)} can’t be a couple.`;
    case 'otherParents':
      return `Your save gives ${nameOf(c.b)} two other parents, not ${nameOf(c.a)}.`;
  }
}

/** The choice to start from: follow a marriage or a death; leave dating to you. */
export function defaultChoice(c: PlanConflict): PlanChoice | 'later' {
  return c.strong ? 'follow' : 'later';
}

/** Off-plan marks for the board: the links, and each sim's reason. */
export function offPlanMarks(
  conflicts: PlanConflict[],
  nameOf: (id: string) => string,
): { edges: Set<string>; sims: Map<string, string> } {
  const edges = new Set<string>();
  const sims = new Map<string, string>();
  for (const c of conflicts) {
    edges.add(c.edgeId);
    const why = `Off plan: ${conflictText(c, nameOf)}`;
    for (const id of [c.a, c.b, ...c.children]) if (!sims.has(id)) sims.set(id, why);
  }
  return { edges, sims };
}
