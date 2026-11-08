import { DECEASED_STATE } from './constants.ts';
import { dynastyKey, newDynastyRef } from './generations.ts';
import { fold } from './utils.ts';
import { cardName } from './plan.ts';
import type { DynastyRole, Edge, SimNode } from '../types/whiteboard.ts';

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
  const sur = fold(me.sur);
  const rank = (x: SimNode) =>
    fold(x.dynasty!) === sur ? 0 : x.dynastyRole === 'head' || x.dynastyRole === 'heir' ? 1 : 2;
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
export function isPlannedOnlyDynasty(nodes: SimNode[], key: string): boolean {
  const members = nodes.filter((n) => dynastyKey(n) === key);
  return members.length > 0 && members.every((n) => n.dynastyPlan === 'member');
}

/** The other dynasties on the board that go by `name`, in any case: their keys. */
export function dynastiesNamed(nodes: SimNode[], name: string, exceptKey = ''): string[] {
  const want = fold(name);
  if (!want) return [];
  const keys = new Set<string>();
  for (const n of nodes) {
    const key = dynastyKey(n);
    if (key && key !== exceptKey && fold(n.dynasty!) === want) keys.add(key);
  }
  return [...keys];
}

/**
 * The fields a card gets to start a new dynasty `name`: its own board id as
 * well when another dynasty already has the name, so the two stay apart.
 */
export function newDynastyFields(nodes: SimNode[], name: string, ref = newDynastyRef()): { dynasty: string; dynastyRef?: string } {
  const dynasty = name.trim();
  return dynastiesNamed(nodes, dynasty).length ? { dynasty, dynastyRef: ref } : { dynasty };
}

/**
 * Planned-only dynasty `key` renamed `to` on every current member's card,
 * and in what is kept by its key (a first head, a picked Gen 1). A name
 * another dynasty has is allowed: the dynasty then gets its own board id,
 * so the two stay apart. Back: the nodes and its key now; the same array
 * when there is nothing to rename or the dynasty is the game's.
 */
export function renamePlannedDynasty(nodes: SimNode[], key: string, to: string): { nodes: SimNode[]; key: string } {
  const name = to.trim();
  const from = nodes.find((n) => dynastyKey(n) === key)?.dynasty;
  if (!name || name === from || !isPlannedOnlyDynasty(nodes, key)) return { nodes, key };
  const ref = key.startsWith('name:') && dynastiesNamed(nodes, name, key).length ? newDynastyRef() : '';
  const now = ref ? `ref:${ref}` : key.startsWith('name:') ? `name:${name}` : key;
  const out = nodes.map((n) => {
    const patch: Partial<SimNode> = {};
    if (dynastyKey(n) === key) {
      patch.dynasty = name;
      if (ref) patch.dynastyRef = ref;
    }
    if (now !== key && n.firstHeadOf === key) patch.firstHeadOf = now;
    if (now !== key && n.genRootOf === key) patch.genRootOf = now;
    return Object.keys(patch).length ? { ...n, ...patch } : n;
  });
  return { nodes: out, key: now };
}

export type DynastyMember = {
  id: string;
  role?: DynastyRole;
  /** Planned into the dynasty, or into their role in it: not in a save yet. */
  planned: boolean;
  /** Planned out of it: the save still has them in it. */
  leaving: boolean;
  deceased: boolean;
};

export type DynastyRow = {
  key: string;
  name: string;
  /** Some member has it from a save; else only the plan has it. */
  inGame: boolean;
  /** Head, heir, the other living members A to Z, outcasts, then the deceased. */
  members: DynastyMember[];
  head?: DynastyMember;
  heir?: DynastyMember;
  /** Of a dynasty in the game: members only planned into it. */
  joining: number;
  leaving: number;
  deceased: number;
};

/**
 * Every dynasty on the board with its members (pets aside), for the
 * Dynasties panel: the game's and the planned ones, A to Z. Its head and
 * heir are the game's holders, or the planned ones when the game has none.
 */
export function dynastyIndex(nodes: SimNode[]): DynastyRow[] {
  const by = new Map<string, SimNode[]>();
  for (const n of nodes) {
    const key = dynastyKey(n);
    if (!key || !n.dynasty || n.species) continue;
    by.set(key, [...(by.get(key) ?? []), n]);
  }
  const rank = (m: DynastyMember) =>
    m.deceased ? 4 : m.role === 'head' ? 0 : m.role === 'heir' ? 1 : m.role === 'outcast' ? 3 : 2;
  const rows: DynastyRow[] = [];
  for (const [key, list] of by) {
    const name = new Map(list.map((n) => [n.id, cardName(n)]));
    const members = list
      .map(
        (n): DynastyMember => ({
          id: n.id,
          ...(n.dynastyRole ? { role: n.dynastyRole } : {}),
          planned: n.dynastyPlan === 'member' || n.dynastyPlan === 'role',
          leaving: n.dynastyPlan === 'none',
          deceased: n.state === DECEASED_STATE,
        }),
      )
      .sort((a, b) => rank(a) - rank(b) || Number(a.planned) - Number(b.planned) || name.get(a.id)!.localeCompare(name.get(b.id)!));
    // The game's holder first; a living one before the deceased.
    const holder = (role: DynastyRole) =>
      members.find((m) => m.role === role && !m.planned && !m.deceased) ??
      members.find((m) => m.role === role && !m.deceased) ??
      members.find((m) => m.role === role);
    const inGame = list.some((n) => n.dynastyPlan !== 'member');
    const head = holder('head');
    const heir = holder('heir');
    rows.push({
      key,
      name: list[0]!.dynasty!,
      inGame,
      members,
      ...(head ? { head } : {}),
      ...(heir ? { heir } : {}),
      joining: inGame ? list.filter((n) => n.dynastyPlan === 'member').length : 0,
      leaving: members.filter((m) => m.leaving).length,
      deceased: members.filter((m) => m.deceased).length,
    });
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name) || a.key.localeCompare(b.key));
}

/**
 * Planned-only dynasty `key` taken off every member's card, as picking No
 * dynasty takes it off one: the dynasty, its role and the plan go, and so
 * does what was kept by its key. The cards themselves stay. The same array
 * back when the dynasty is the game's or not on the board.
 */
export function removePlannedDynasty(nodes: SimNode[], key: string): SimNode[] {
  if (!isPlannedOnlyDynasty(nodes, key)) return nodes;
  return nodes.map((n) => {
    const member = dynastyKey(n) === key;
    if (!member && n.firstHeadOf !== key && n.genRootOf !== key) return n;
    const out: SimNode = { ...n };
    if (member) {
      delete out.dynasty;
      delete out.dynastyId;
      delete out.dynastyRef;
      delete out.dynastyRole;
      delete out.dynastyPlan;
    }
    if (out.firstHeadOf === key) delete out.firstHeadOf;
    if (out.genRootOf === key) delete out.genRootOf;
    return out;
  });
}
