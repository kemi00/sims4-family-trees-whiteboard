import { DECEASED_STATE } from './constants.ts';
import type { ChronicleEntry } from './chronicle.ts';
import { isPlannedSim } from './plan.ts';
import { edgeSourceOf, uKey } from './utils.ts';
import type { Edge, SimNode } from '../types/whiteboard.ts';

/**
 * Looking back: the board as it was right after upload `at` of the
 * chronicle, worked out by taking back, newest first, what every later
 * upload said happened. Sims born or met since are hidden, as are planned
 * sims and links (plans aren't the game's story); birthdays since are
 * taken back; sims who died since are alive; couples formed since are
 * hidden and couples ended since are together again. Cards stay where
 * they are on the board. Moves since aren't shown: the board keeps the
 * places you arranged.
 */
export type PastView = {
  /** The upload looked at: its index in the chronicle. */
  at: number;
  /** Cards that weren't there then. */
  hidden: Set<string>;
  /** Life stages then, where they differ from now. */
  ageOf: Map<string, string>;
  /** Sims who were still alive then. */
  alive: Set<string>;
  /** Couples that came later: hidden, by pair and type. */
  laterCouples: Set<string>;
  /** Couples that ended later: drawn as they were. */
  formerCouples: Edge[];
};

const coupleKey = (a: string, b: string, type: string) => `${uKey(a, b)}|${type}`;

/** The board right after chronicle upload `at`; null for the latest, which is now. */
export function pastView(entries: readonly ChronicleEntry[], at: number, nodes: readonly SimNode[]): PastView | null {
  if (at < 0 || at >= entries.length - 1) return null;
  const view: PastView = { at, hidden: new Set(), ageOf: new Map(), alive: new Set(), laterCouples: new Set(), formerCouples: [] };
  for (const n of nodes) if (isPlannedSim(n)) view.hidden.add(n.id);
  // Newest first, so a sim who grew twice ends at the stage they were first.
  for (let i = entries.length - 1; i > at; i--) {
    const r = entries[i]!.recap;
    if (!r) continue;
    for (const b of r.born) view.hidden.add(b.id);
    for (const id of r.metIds ?? []) view.hidden.add(id);
    // Sims and pets who joined a household since weren't on the board yet.
    for (const a of r.arrivals ?? []) view.hidden.add(a.sim.id);
    for (const g of r.grew) view.ageOf.set(g.id, g.from);
    for (const d of r.died) view.alive.add(d.id);
    for (const t of r.together) view.laterCouples.add(coupleKey(t.a.id, t.b.id, t.type));
    for (const t of r.apart) {
      // A divorce since: the divorced link is later, the marriage was then.
      if (t.type === 'divorced') view.laterCouples.add(coupleKey(t.a.id, t.b.id, 'divorced'));
      const was = t.type === 'divorced' ? 'marriage' : 'romance';
      if (!view.laterCouples.has(coupleKey(t.a.id, t.b.id, was))) {
        view.formerCouples.push({ id: `past:${t.a.id}:${t.b.id}`, a: t.a.id, b: t.b.id, type: was, source: 'save' });
      }
    }
  }
  return view;
}

/** The links to draw looking back: the game's, as they were then. */
export function pastEdges(edges: readonly Edge[], view: PastView): Edge[] {
  const kept = edges.filter(
    (e) =>
      edgeSourceOf(e) !== 'planned' &&
      !view.hidden.has(e.a) &&
      !view.hidden.has(e.b) &&
      !((e.type === 'marriage' || e.type === 'romance' || e.type === 'divorced') && view.laterCouples.has(coupleKey(e.a, e.b, e.type))),
  );
  const have = new Set(kept.map((e) => coupleKey(e.a, e.b, e.type)));
  return [...kept, ...view.formerCouples.filter((e) => !have.has(coupleKey(e.a, e.b, e.type)))];
}

/** A card as it was then: its stage, and alive if it died since. */
export function pastNode(n: SimNode, view: PastView): SimNode {
  const age = view.ageOf.get(n.id);
  const alive = view.alive.has(n.id) && n.state === DECEASED_STATE;
  if (!age && !alive) return n;
  return { ...n, ...(age ? { age } : {}), ...(alive ? { state: n.species ? 'Pet' : 'Sim' } : {}) };
}
