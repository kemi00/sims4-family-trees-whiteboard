import {
  cardName,
  defaultChoice,
  moveToUndo,
  planConflicts,
  resolvePlanConflict,
  slotSuggestions,
  type PlanChoice,
  type PlanConflict,
  type SlotCandidate,
  type SlotSuggestion,
} from './plan.ts';
import type { SaveMergeResult } from './savegame/mergeSave.ts';
import { edgeSourceOf } from './utils.ts';
import type { ParsedSave } from './savegame/parseSave.ts';
import type { Edge, EdgeType, HouseholdMove, SimNode } from '../types/whiteboard.ts';

/**
 * A planned child of a couple the game went against. Who could fill it
 * depends on what you choose for the couple, so the review asks about it
 * inside the couple's card, after that choice.
 */
export type PlannedChildReview = {
  slotId: string;
  /** Its planned parents (Beatrice, Dirk), and theirs once you follow the game (Beatrice, Adekoya). */
  parents: string[];
  followParents: string[];
  /** Sims new in this save who could be it if you follow the game, or keep your plan. */
  follow: SlotCandidate[];
  keep: SlotCandidate[];
  /** Dropping the plan removes the planned card: nothing else links to it. */
  dropRemoves: boolean;
};

/** Your plan against a save about to be merged: what the import's review step shows. */
export type SavePlanReview = {
  /** Planned links this save goes against, on the board as merged. */
  conflicts: PlanConflict[];
  /** Each conflict's couple link type, for "the planned marriage". */
  linkTypes: Record<string, EdgeType>;
  /** Your note on each conflict's planned link: why you planned it, to help decide. */
  notes: Record<string, string>;
  /** Each conflict's planned children that are planned sims. */
  children: Record<string, PlannedChildReview[]>;
  /** Planned sims this save's new sims could fill, outside any conflict. */
  suggestions: SlotSuggestion[];
  /** For each conflict, a move made for the plan that following the game takes back. */
  moves: Record<string, HouseholdMove>;
  /** Names on the merged board, by card id: who the review talks about. */
  names: Record<string, string>;
  /** First names (a planned sim's card name), for "planned child of Beatrice & Dirk". */
  firsts: Record<string, string>;
  /** Genders, for "her planned father". */
  genders: Record<string, string>;
  /** Board ids → save sim ids, to tell whose parents a save overrules. */
  saveIds: Record<string, string>;
  /** Planned links the review doesn't otherwise mention, which stay as they are. */
  stillPlanned: number;
};

/** What you chose in Your plan: planned sim → save sim, and each conflict's choice. */
export type PlanChoices = {
  matches: Record<string, string>;
  resolve: Record<string, PlanChoice | 'later'>;
};

const parentsInto = (edges: Edge[], id: string) =>
  edges.filter((e) => e.type === 'parent' && e.b === id).map((e) => e.a);

export function planReview(
  merge: SaveMergeResult,
  parsed: ParsedSave,
  nodes: SimNode[],
  edges: Edge[],
  moves: HouseholdMove[],
): SavePlanReview {
  const conflicts = planConflicts(merge.nodes, merge.edges);
  const byMove: Record<string, HouseholdMove> = {};
  const linkTypes: Record<string, EdgeType> = {};
  const notes: Record<string, string> = {};
  for (const c of conflicts) {
    const m = moveToUndo(c, merge.nodes, moves);
    if (m) byMove[c.edgeId] = m;
    const link = merge.edges.find((e) => e.id === c.edgeId);
    if (link) linkTypes[c.edgeId] = link.type;
    if (link?.note) notes[c.edgeId] = link.note;
  }
  const names: Record<string, string> = {};
  const firsts: Record<string, string> = {};
  const genders: Record<string, string> = {};
  const saveIds: Record<string, string> = {};
  for (const n of merge.nodes) {
    names[n.id] = cardName(n);
    firsts[n.id] = n.first.trim() || cardName(n);
    genders[n.id] = n.gender;
    if (n.saveSimId) saveIds[n.id] = n.saveSimId;
  }
  // Suggestions look at the board before the merge, where this save's new
  // sims aren't yet, so they can be offered.
  const all = slotSuggestions({ nodes, edges, parsed });
  const bySlot = new Map(all.map((s) => [s.slotId, s]));
  const onBoard = new Set(nodes.map((n) => n.id));
  const children: Record<string, PlannedChildReview[]> = {};
  const nested = new Set<string>();
  for (const c of conflicts) {
    const slots = c.children.filter((id) => onBoard.has(id) && !nested.has(id) && isSlot(nodes, id));
    if (!slots.length) continue;
    // The partner the game chose may be new in this save.
    const extra = c.partner && !onBoard.has(c.partner) ? merge.nodes.filter((n) => n.id === c.partner) : [];
    const followed = resolvePlanConflict([...nodes, ...extra], edges, c, 'follow', counter(), '');
    const ifFollowed = new Map(
      slotSuggestions({ nodes: [...nodes, ...extra], edges: followed.edges, parsed }).map((s) => [s.slotId, s]),
    );
    const dropped = resolvePlanConflict(merge.nodes, merge.edges, c, 'drop', counter(), '');
    children[c.edgeId] = slots.map((slotId) => {
      nested.add(slotId);
      return {
        slotId,
        parents: parentsInto(merge.edges, slotId),
        followParents: parentsInto(followed.edges, slotId),
        follow: ifFollowed.get(slotId)?.candidates ?? [],
        keep: (bySlot.get(slotId)?.candidates ?? []).filter((x) => x.all),
        dropRemoves: !dropped.nodes.some((n) => n.id === slotId),
      };
    });
  }
  const suggestions = all.filter((s) => !nested.has(s.slotId));
  // A conflict covers its planned couple and their planned children's links;
  // a planned sim up for filling covers its own.
  const covered = new Set<string>();
  for (const c of conflicts) {
    covered.add(c.edgeId);
    for (const e of merge.edges) {
      if (e.type === 'parent' && c.children.includes(e.b) && (e.a === c.a || e.a === c.b)) covered.add(e.id);
    }
  }
  const slots = new Set([...all.map((x) => x.slotId), ...nested]);
  const stillPlanned = merge.edges.filter(
    (e) => edgeSourceOf(e) === 'planned' && !covered.has(e.id) && !slots.has(e.a) && !slots.has(e.b),
  ).length;
  return {
    conflicts,
    linkTypes,
    notes,
    children,
    suggestions,
    moves: byMove,
    names,
    firsts,
    genders,
    saveIds,
    stillPlanned,
  };
}

function isSlot(nodes: SimNode[], id: string): boolean {
  const n = nodes.find((x) => x.id === id);
  return !!n?.added && !n.saveSimId;
}

/** Throwaway ids for a what-if resolve. */
function counter(): () => string {
  let i = 0;
  return () => `whatif${i++}`;
}

/** Who could fill a conflict's planned child, under the choice made for the conflict. */
export function childCandidates(k: PlannedChildReview, choice: PlanChoice | 'later'): SlotCandidate[] {
  return choice === 'follow' ? k.follow : choice === 'keep' ? k.keep : [];
}

/**
 * The planned parents a save sim overrules when it fills a planned sim:
 * with two parents in the save, a planned parent who is neither goes.
 */
export function overruledBy(
  candidate: SlotCandidate,
  plannedParents: string[],
  saveIds: Record<string, string>,
): string[] {
  if (candidate.parents.length < 2) return [];
  return plannedParents.filter((p) => !candidate.parents.includes(saveIds[p] ?? ''));
}

/** The matches that count: a conflict's planned child only under a choice that offers its pick. */
export function effectiveMatches(plan: SavePlanReview, choices: PlanChoices): Record<string, string> {
  const out: Record<string, string> = {};
  const take = (slotId: string, list: SlotCandidate[]) => {
    const pick = choices.matches[slotId];
    if (pick && list.some((x) => x.saveSimId === pick)) out[slotId] = pick;
  };
  for (const s of plan.suggestions) take(s.slotId, s.candidates);
  for (const c of plan.conflicts) {
    for (const k of plan.children[c.edgeId] ?? []) take(k.slotId, childCandidates(k, choices.resolve[c.edgeId] ?? 'later'));
  }
  return out;
}

/** The sure match for each planned sim, under the choices made so far. */
export function sureMatches(plan: SavePlanReview, resolve: PlanChoices['resolve']): Record<string, string> {
  const out: Record<string, string> = {};
  const take = (slotId: string, list: SlotCandidate[]) => {
    const sure = list.find((x) => x.sure);
    if (sure) out[slotId] = sure.saveSimId;
  };
  for (const s of plan.suggestions) take(s.slotId, s.candidates);
  for (const c of plan.conflicts) {
    for (const k of plan.children[c.edgeId] ?? []) take(k.slotId, childCandidates(k, resolve[c.edgeId] ?? 'later'));
  }
  return out;
}

/**
 * A new choice for a conflict. Its planned children's picks are kept, so
 * trying another choice and coming back finds them again; one the new
 * choice doesn't offer just doesn't count (see effectiveMatches). Matching
 * for you fills in the sure one where there is no pick yet.
 */
export function withConflictChoice(
  plan: SavePlanReview,
  choices: PlanChoices,
  edgeId: string,
  choice: PlanChoice | 'later',
  auto: boolean,
): PlanChoices {
  const resolve = { ...choices.resolve, [edgeId]: choice };
  const matches = { ...choices.matches };
  for (const k of plan.children[edgeId] ?? []) {
    const list = childCandidates(k, choice);
    const pick = matches[k.slotId];
    if (pick && list.some((x) => x.saveSimId === pick)) continue;
    const sure = auto ? list.find((x) => x.sure) : undefined;
    if (sure) matches[k.slotId] = sure.saveSimId;
  }
  return { matches, resolve };
}

/** " 2 planned sims filled. 1 plan off track." after a merge. */
export function planNote(filled: number, off: number): string {
  return [
    filled ? ` ${filled} planned ${filled === 1 ? 'sim' : 'sims'} filled.` : '',
    off ? ` ${off} ${off === 1 ? 'plan' : 'plans'} off track.` : '',
  ].join('');
}

/** Where this browser remembers "Match the sure ones for me". */
export const AUTO_MATCH_KEY = 'plan-auto-match';

export function readAutoMatch(): boolean {
  try {
    return localStorage.getItem(AUTO_MATCH_KEY) !== '0';
  } catch {
    return true;
  }
}

/** The review's starting choices: each conflict's default, and sure matches when matching for you. */
export function initialPlanChoices(plan: SavePlanReview, auto: boolean): PlanChoices {
  const resolve: PlanChoices['resolve'] = {};
  for (const c of plan.conflicts) resolve[c.edgeId] = defaultChoice(c);
  return { matches: auto ? sureMatches(plan, resolve) : {}, resolve };
}
