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
export type FamilyRole =
  | 'partner'
  | 'ex'
  | 'parent'
  | 'child'
  | 'sibling'
  | 'coparent'
  | 'grandparent'
  | 'grandchild'
  | 'auntuncle'
  | 'cousin'
  | 'stepparent'
  | 'stepchild'
  | 'stepsibling'
  | 'other';

const ROLE_ORDER: FamilyRole[] = [
  'partner',
  'ex',
  'parent',
  'child',
  'sibling',
  'coparent',
  'grandparent',
  'grandchild',
  'auntuncle',
  'cousin',
  'stepparent',
  'stepchild',
  'stepsibling',
  'other',
];

/**
 * How far the family reaches. Close: one step from the sim. Extended adds
 * grandparents, grandchildren, aunts and uncles, first cousins, and the
 * step-family their parents' and their own partners bring.
 */
export type FamilyScope = 'close' | 'extended';

export type Family = {
  id: string;
  scope: FamilyScope;
  /** Every relative, by what they are to the sim. */
  roles: Map<string, FamilyRole>;
  /** The links that tie the sim to them, to draw and highlight. */
  edgeIds: Set<string>;
};

const PARTNER = new Set<Edge['type']>(['marriage', 'romance']);

/**
 * A sim's family on the board. Close family is everyone one of their own
 * links reaches — partners, exes, parents, children, siblings, other links —
 * plus siblings through a shared parent (half-siblings too) and the other
 * parent of each child. Extended family adds, through parent links:
 * grandparents, grandchildren, aunts and uncles (a parent's siblings), and
 * first cousins (their children); and through partners: step-parents (a
 * parent's partner), step-children (a partner's children) and step-siblings
 * (a step-parent's children who share no parent with the sim).
 *
 * Most of these have no link to the sim, so the board draws none; the links
 * that show them (a grandparent's line to the parent, a parent's to a
 * sibling) are highlighted instead. Bloodline reaches further up and down.
 */
export function familyOf(id: string, edges: Edge[], scope: FamilyScope = 'close'): Family {
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
  const linksOf = new Map<string, Edge[]>();
  for (const e of edges) {
    for (const end of [e.a, e.b]) linksOf.set(end, [...(linksOf.get(end) ?? []), e]);
    if (e.type !== 'parent') continue;
    parentsOf.set(e.b, [...(parentsOf.get(e.b) ?? []), e]);
    childrenOf.set(e.a, [...(childrenOf.get(e.a) ?? []), e]);
  }
  const parents = (x: string) => parentsOf.get(x) ?? [];
  const children = (x: string) => childrenOf.get(x) ?? [];
  const linked = (x: string, types: ReadonlySet<Edge['type']>) =>
    (linksOf.get(x) ?? []).filter((e) => types.has(e.type));
  const otherEnd = (e: Edge, x: string) => (e.a === x ? e.b : e.a);

  for (const e of linksOf.get(id) ?? []) {
    const other = otherEnd(e, id);
    if (PARTNER.has(e.type)) add(other, 'partner', e);
    else if (e.type === 'divorced') add(other, 'ex', e);
    else if (e.type === 'parent') add(other, e.b === id ? 'parent' : 'child', e);
    else if (e.type === 'sibling') add(other, 'sibling', e);
    else add(other, 'other', e);
  }
  for (const up of parents(id)) {
    for (const down of children(up.a)) add(down.b, 'sibling', down);
  }
  for (const down of children(id)) {
    for (const up of parents(down.b)) add(up.a, 'coparent', up);
  }
  if (scope === 'close') return { id, scope, roles, edgeIds };

  const myParents = new Set(parents(id).map((e) => e.a));
  const myChildren = new Set(children(id).map((e) => e.b));
  const SIBLING = new Set<Edge['type']>(['sibling']);
  const auntsUncles = new Set<string>();
  for (const up of parents(id)) {
    const p = up.a;
    for (const up2 of parents(p)) {
      add(up2.a, 'grandparent', up2);
      for (const side of children(up2.a)) {
        if (side.b === p) continue;
        add(side.b, 'auntuncle', side);
        auntsUncles.add(side.b);
      }
    }
    for (const s of linked(p, SIBLING)) {
      add(otherEnd(s, p), 'auntuncle', s);
      auntsUncles.add(otherEnd(s, p));
    }
  }
  for (const down of children(id)) {
    for (const down2 of children(down.b)) add(down2.b, 'grandchild', down2);
  }
  for (const au of auntsUncles) {
    for (const down of children(au)) add(down.b, 'cousin', down);
  }
  const stepParents = new Set<string>();
  for (const p of myParents) {
    for (const pe of linked(p, PARTNER)) {
      const sp = otherEnd(pe, p);
      if (myParents.has(sp) || sp === id) continue;
      add(sp, 'stepparent', pe);
      stepParents.add(sp);
    }
  }
  for (const pe of linked(id, PARTNER)) {
    for (const down of children(otherEnd(pe, id))) {
      if (!myChildren.has(down.b)) add(down.b, 'stepchild', down);
    }
  }
  for (const sp of stepParents) {
    for (const down of children(sp)) {
      if (parents(down.b).some((e) => myParents.has(e.a))) continue;
      add(down.b, 'stepsibling', down);
    }
  }
  return { id, scope, roles, edgeIds };
}

const ROLE_WORDS: Record<FamilyRole, [string, string]> = {
  partner: ['partner', 'partners'],
  ex: ['ex', 'exes'],
  parent: ['parent', 'parents'],
  child: ['child', 'children'],
  sibling: ['sibling', 'siblings'],
  coparent: ['co-parent', 'co-parents'],
  grandparent: ['grandparent', 'grandparents'],
  grandchild: ['grandchild', 'grandchildren'],
  auntuncle: ['aunt or uncle', 'aunts or uncles'],
  cousin: ['cousin', 'cousins'],
  stepparent: ['step-parent', 'step-parents'],
  stepchild: ['step-child', 'step-children'],
  stepsibling: ['step-sibling', 'step-siblings'],
  other: ['other link', 'other links'],
};

/** Words for a tally: a parent's sibling is an aunt or an uncle when the board knows which. */
const WORDS: Record<string, [string, string]> = {
  ...ROLE_WORDS,
  aunt: ['aunt', 'aunts'],
  uncle: ['uncle', 'uncles'],
};
const WORD_ORDER = ROLE_ORDER.flatMap((r) => (r === 'auntuncle' ? ['aunt', 'uncle', r] : [r]));

function wordFor(role: FamilyRole, n: SimNode): string {
  if (role !== 'auntuncle') return role;
  return n.gender === 'Female' ? 'aunt' : n.gender === 'Male' ? 'uncle' : role;
}

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
  const tally = new Map<string, number>();
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
    const word = wordFor(role, n);
    tally.set(word, (tally.get(word) ?? 0) + 1);
    if (isUnhousedGid(n.gid)) unhoused += 1;
    else gids.add(n.gid);
  }
  const homes =
    count(gids.size, 'household', 'households') + (unhoused ? ` and ${unhoused} unhoused` : '');
  const roles = WORD_ORDER.filter((w) => tally.get(w))
    .map((w) => count(tally.get(w)!, ...WORDS[w]!))
    .join(', ');
  return { sims: count(sims, 'sim', 'sims'), homes, roles, hidden };
}
