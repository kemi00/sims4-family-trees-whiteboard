import { dynastyKey } from './generations.ts';
import type { Edge, SimNode } from '../types/whiteboard.ts';

export type FamilyDynasty = {
  key: string;
  /** Who links the sim to it: "mother", "spouse". */
  people: { id: string; rel: string }[];
};

function relation(type: Edge['type'], kin: SimNode): string {
  if (type === 'marriage') return 'spouse';
  if (type === 'romance') return 'partner';
  return kin.gender === 'Female' ? 'mother' : kin.gender === 'Male' ? 'father' : 'parent';
}

/**
 * The dynasties a sim's own family is in, for the top of the Dynasty menu:
 * their parents' first, then their partners'. Among the parents', the one
 * their last name carries leads (Heir Dreamer: the Dreamers, not their
 * mother's Capps), then a head's or heir's. A parent planned out of their
 * dynasty doesn't count; one planned into one does.
 */
export function familyDynasties(id: string, nodes: SimNode[], edges: Edge[]): FamilyDynasty[] {
  const byId = new Map(nodes.map((x) => [x.id, x]));
  const me = byId.get(id);
  if (!me || me.species) return [];
  const sur = me.sur.trim().toLowerCase();
  const rank = (x: SimNode) =>
    x.dynasty!.trim().toLowerCase() === sur ? 0 : x.dynastyRole === 'head' || x.dynastyRole === 'heir' ? 1 : 2;
  const kin = (types: Edge['type'][], other: (e: Edge) => string | null) =>
    edges
      .filter((e) => types.includes(e.type))
      .flatMap((e) => {
        const x = byId.get(other(e) ?? '');
        return x && x.id !== id && x.dynasty && x.dynastyPlan !== 'none' && dynastyKey(x)
          ? [{ x, rel: relation(e.type, x) }]
          : [];
      })
      .sort((a, b) => rank(a.x) - rank(b.x));
  const out = new Map<string, FamilyDynasty>();
  const parents = kin(['parent'], (e) => (e.b === id ? e.a : null));
  const partners = kin(['marriage', 'romance'], (e) => (e.a === id ? e.b : e.b === id ? e.a : null));
  for (const { x, rel } of [...parents, ...partners]) {
    const key = dynastyKey(x)!;
    const had = out.get(key);
    if (had) {
      if (!had.people.some((p) => p.id === x.id)) had.people.push({ id: x.id, rel });
    } else out.set(key, { key, people: [{ id: x.id, rel }] });
  }
  return [...out.values()];
}

/**
 * A dynasty only the plan has: every sim with it is planned into it, none
 * has it from a save. Only such a dynasty can be renamed on the board; a
 * game dynasty takes its name from the save.
 */
export function isPlannedOnlyDynasty(nodes: SimNode[], name: string): boolean {
  const key = `name:${name}`;
  const members = nodes.filter((n) => dynastyKey(n) === key);
  return members.length > 0 && members.every((n) => n.dynastyPlan === 'member');
}

/** Another dynasty on the board already goes by `name` (any case), so renaming one to it would merge them. */
export function dynastyNameTaken(nodes: SimNode[], name: string, except: string): boolean {
  const want = name.trim().toLowerCase();
  return nodes.some((n) => !!n.dynasty && n.dynasty !== except && n.dynasty.trim().toLowerCase() === want);
}

/**
 * Planned-only dynasty `from` renamed `to` on every current member's card,
 * and in what is kept by its key (a first head, a picked Gen 1). The same
 * array back when there is nothing to rename or the dynasty is the game's.
 */
export function renamePlannedDynasty(nodes: SimNode[], from: string, to: string): SimNode[] {
  const name = to.trim();
  if (!name || name === from || !isPlannedOnlyDynasty(nodes, from)) return nodes;
  const was = `name:${from}`;
  const now = `name:${name}`;
  return nodes.map((n) => {
    const patch: Partial<SimNode> = {};
    if (dynastyKey(n) === was) patch.dynasty = name;
    if (n.firstHeadOf === was) patch.firstHeadOf = now;
    if (n.genRootOf === was) patch.genRootOf = now;
    return Object.keys(patch).length ? { ...n, ...patch } : n;
  });
}
