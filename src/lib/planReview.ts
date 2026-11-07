import {
  cardName,
  moveToUndo,
  planConflicts,
  slotSuggestions,
  type PlanChoice,
  type PlanConflict,
  type SlotSuggestion,
} from './plan.ts';
import type { SaveMergeResult } from './savegame/mergeSave.ts';
import { edgeSourceOf } from './utils.ts';
import type { ParsedSave } from './savegame/parseSave.ts';
import type { Edge, HouseholdMove, SimNode } from '../types/whiteboard.ts';

/** Your plan against a save about to be merged: what the import's review step shows. */
export type SavePlanReview = {
  /** Planned links this save goes against, on the board as merged. */
  conflicts: PlanConflict[];
  /** Planned sims this save's new sims could fill. */
  suggestions: SlotSuggestion[];
  /** For each conflict, a move made for the plan that following the game takes back. */
  moves: Record<string, HouseholdMove>;
  /** Names on the merged board, by card id: who the review talks about. */
  names: Record<string, string>;
  /** Planned links the review doesn't otherwise mention, which stay as they are. */
  stillPlanned: number;
};

/** What you chose in Your plan: planned sim → save sim, and each conflict's choice. */
export type PlanChoices = {
  matches: Record<string, string>;
  resolve: Record<string, PlanChoice | 'later'>;
};

export function planReview(
  merge: SaveMergeResult,
  parsed: ParsedSave,
  nodes: SimNode[],
  edges: Edge[],
  moves: HouseholdMove[],
): SavePlanReview {
  const conflicts = planConflicts(merge.nodes, merge.edges);
  const byMove: Record<string, HouseholdMove> = {};
  for (const c of conflicts) {
    const m = moveToUndo(c, merge.nodes, moves);
    if (m) byMove[c.edgeId] = m;
  }
  const names: Record<string, string> = {};
  for (const n of merge.nodes) names[n.id] = cardName(n);
  const suggestions = slotSuggestions({ nodes, edges, parsed });
  // A conflict covers its planned couple and their planned children's links;
  // a planned sim up for filling covers its own.
  const covered = new Set<string>();
  for (const c of conflicts) {
    covered.add(c.edgeId);
    for (const e of merge.edges) {
      if (e.type === 'parent' && c.children.includes(e.b) && (e.a === c.a || e.a === c.b)) covered.add(e.id);
    }
  }
  const slots = new Set(suggestions.map((x) => x.slotId));
  const stillPlanned = merge.edges.filter(
    (e) => edgeSourceOf(e) === 'planned' && !covered.has(e.id) && !slots.has(e.a) && !slots.has(e.b),
  ).length;
  return { conflicts, suggestions, moves: byMove, names, stillPlanned };
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

/** The review's starting choices: sure matches when auto-matching, each conflict's default. */
export function initialPlanChoices(plan: SavePlanReview, auto: boolean): PlanChoices {
  const matches: Record<string, string> = {};
  if (auto) {
    for (const s of plan.suggestions) {
      const sure = s.candidates.find((c) => c.sure);
      if (sure) matches[s.slotId] = sure.saveSimId;
    }
  }
  const resolve: PlanChoices['resolve'] = {};
  for (const c of plan.conflicts) resolve[c.edgeId] = c.strong ? 'follow' : 'later';
  return { matches, resolve };
}

