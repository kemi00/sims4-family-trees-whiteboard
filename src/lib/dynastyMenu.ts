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
