import { isUnhousedGid } from './unhoused.ts';
import type { Edge, SimNode } from '../types/whiteboard.ts';

/**
 * Which family links the board draws: all of them, only those inside a
 * household (a household's own tree stays, the lines across the board go),
 * or none. Other links are not family links and always show.
 */
export type LinksView = 'all' | 'inside' | 'none';

const FAMILY_LINK = new Set<Edge['type']>(['marriage', 'romance', 'divorced', 'parent', 'sibling']);

/** The links to route for `view`. `keep`: links that show whatever the view (a highlighted family). */
export function linksInView(
  edges: Edge[],
  gidOf: (id: string) => string | undefined,
  view: LinksView,
  keep?: ReadonlySet<string> | null,
): Edge[] {
  if (view === 'all') return edges;
  return edges.filter((e) => {
    if (!FAMILY_LINK.has(e.type) || keep?.has(e.id)) return true;
    if (view === 'none') return false;
    const g = gidOf(e.a);
    return g !== undefined && g === gidOf(e.b);
  });
}

/** What a relative is to the sim, strongest first when one is two things. */
export type FamilyRole = 'partner' | 'ex' | 'parent' | 'child' | 'sibling' | 'coparent' | 'other';

const ROLE_ORDER: FamilyRole[] = ['partner', 'ex', 'parent', 'child', 'sibling', 'coparent', 'other'];

export type Family = {
  id: string;
  /** Every relative, by what they are to the sim. */
  roles: Map<string, FamilyRole>;
  /** The links that tie the sim to them, to draw and highlight. */
  edgeIds: Set<string>;
};

/**
 * A sim's family on the board: everyone one of their own links reaches —
 * partners, exes, parents, children, siblings, other links — plus siblings
 * through a shared parent and the other parent of each child. Those last two
 * have no link to the sim, so the board does not draw one; the links that
 * show them (the parent's line to the sibling, the co-parent's to the child)
 * are highlighted instead. Ancestors and descendants further out are what
 * Bloodline shows.
 */
export function familyOf(id: string, edges: Edge[]): Family {
  const roles = new Map<string, FamilyRole>();
  const edgeIds = new Set<string>();
  const add = (other: string, role: FamilyRole, edge: Edge) => {
    edgeIds.add(edge.id);
    if (other === id) return;
    const had = roles.get(other);
    if (!had || ROLE_ORDER.indexOf(role) < ROLE_ORDER.indexOf(had)) roles.set(other, role);
  };
  const parentsOf = new Map<string, Edge[]>();
  const childrenOf = new Map<string, Edge[]>();
  for (const e of edges) {
    if (e.type !== 'parent') continue;
    parentsOf.set(e.b, [...(parentsOf.get(e.b) ?? []), e]);
    childrenOf.set(e.a, [...(childrenOf.get(e.a) ?? []), e]);
  }
  for (const e of edges) {
    if (e.a !== id && e.b !== id) continue;
    const other = e.a === id ? e.b : e.a;
    if (e.type === 'marriage' || e.type === 'romance') add(other, 'partner', e);
    else if (e.type === 'divorced') add(other, 'ex', e);
    else if (e.type === 'parent') add(other, e.b === id ? 'parent' : 'child', e);
    else if (e.type === 'sibling') add(other, 'sibling', e);
    else add(other, 'other', e);
  }
  for (const up of parentsOf.get(id) ?? []) {
    for (const down of childrenOf.get(up.a) ?? []) add(down.b, 'sibling', down);
  }
  for (const down of childrenOf.get(id) ?? []) {
    for (const up of parentsOf.get(down.b) ?? []) add(up.a, 'coparent', up);
  }
  return { id, roles, edgeIds };
}

const ROLE_WORDS: Record<FamilyRole, [string, string]> = {
  partner: ['partner', 'partners'],
  ex: ['ex', 'exes'],
  parent: ['parent', 'parents'],
  child: ['child', 'children'],
  sibling: ['sibling', 'siblings'],
  coparent: ['co-parent', 'co-parents'],
  other: ['other link', 'other links'],
};

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * The banner's counts for a family, over the relatives the filters show:
 * sims, the households they live in (the Unhoused sims box is not one), and
 * what they are to the sim.
 */
export function familySummary(
  family: Family,
  byid: Record<string, SimNode>,
  shown: (n: SimNode) => boolean,
): { sims: string; homes: string; roles: string; hidden: number } {
  const gids = new Set<string>();
  const tally = new Map<FamilyRole, number>();
  let sims = 0;
  let unhoused = 0;
  let hidden = 0;
  for (const [rid, role] of family.roles) {
    const n = byid[rid];
    if (!n) continue;
    if (!shown(n)) {
      hidden += 1;
      continue;
    }
    sims += 1;
    tally.set(role, (tally.get(role) ?? 0) + 1);
    if (isUnhousedGid(n.gid)) unhoused += 1;
    else gids.add(n.gid);
  }
  const homes =
    count(gids.size, 'household', 'households') + (unhoused ? ` and ${unhoused} unhoused` : '');
  const roles = ROLE_ORDER.filter((r) => tally.get(r))
    .map((r) => count(tally.get(r)!, ...ROLE_WORDS[r]))
    .join(', ');
  return { sims: count(sims, 'sim', 'sims'), homes, roles, hidden };
}
