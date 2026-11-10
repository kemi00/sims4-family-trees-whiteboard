import { DECEASED_STATE } from './constants.ts';
import { dynastyKey } from './generations.ts';
import type { Edge, SimNode } from '../types/whiteboard.ts';

/**
 * Heirs planned generations ahead. A dynasty has one head and one heir at a
 * time: when the head goes, the heir takes over and a new heir is named. A
 * sim planned as heir after another (`heirAfter`) is that next heir: Olivia,
 * heir after Eric, becomes heir once Eric is head, and her daughter can be
 * planned as heir after her.
 */

export type LinePlace = {
  id: string;
  place: 'head' | 'heir' | 'later';
  /** Not in the save yet: a planned role, or any heir after another. */
  planned: boolean;
};

const plannedRole = (n: SimNode) => n.dynastyPlan === 'member' || n.dynastyPlan === 'role';

/** A sim who can stand in a dynasty's line: alive, a sim, and not planned to leave. */
function inLine(n: SimNode, key: string): boolean {
  return dynastyKey(n) === key && !n.species && n.state !== DECEASED_STATE && n.dynastyPlan !== 'none';
}

/**
 * A dynasty's line of succession as the plan has it: its head, its heir,
 * then each heir planned after the one before. A planned head or heir
 * stands before the game's, as the plan replaces them.
 */
export function successionLine(nodes: SimNode[], key: string): LinePlace[] {
  const members = nodes.filter((n) => inLine(n, key));
  const holder = (role: 'head' | 'heir') =>
    members.find((n) => n.dynastyRole === role && plannedRole(n)) ?? members.find((n) => n.dynastyRole === role);
  const head = holder('head');
  const heir = holder('heir');
  const line: LinePlace[] = [];
  if (head) line.push({ id: head.id, place: 'head', planned: plannedRole(head) });
  if (heir) line.push({ id: heir.id, place: 'heir', planned: plannedRole(heir) });
  const seen = new Set(line.map((p) => p.id));
  let last = line[line.length - 1];
  while (last) {
    const before = last.id;
    const next = members.find((n) => n.heirAfter === before && !seen.has(n.id));
    if (!next) break;
    seen.add(next.id);
    last = { id: next.id, place: 'later', planned: true };
    line.push(last);
  }
  return line;
}

/** `me` without a place in line: no head or heir role, no heir after anyone. */
function outOfLine(me: SimNode): SimNode {
  const { heirAfter: _after, ...rest } = me;
  return rest.dynastyRole === 'head' || rest.dynastyRole === 'heir' ? { ...rest, dynastyRole: undefined } : rest;
}

/**
 * Who `meId` can be planned as heir after, in dynasty `key`: its heir and
 * each heir planned after them, in order, as the line stands without
 * `meId` (so never anyone who comes after them). Nothing while the dynasty
 * has no heir.
 */
export function heirAfterChoices(nodes: SimNode[], meId: string, key: string): string[] {
  const line = successionLine(
    nodes.map((n) => (n.id === meId ? outOfLine(n) : n)),
    key,
  );
  return line.filter((p) => p.place !== 'head').map((p) => p.id);
}

/** The other sim in dynasty `key` planned as heir after `beforeId`, whom a new pick replaces. */
export function heirAfterHolder(nodes: SimNode[], beforeId: string, key: string, meId: string): SimNode | null {
  return nodes.find((n) => n.id !== meId && n.heirAfter === beforeId && dynastyKey(n) === key) ?? null;
}

/**
 * The board with `me` as the editor would save them: a planned head or heir
 * takes the role from another plan (the game's holder keeps it until a save
 * says otherwise), and an heir after someone takes that place from whoever
 * had it. For showing the line before saving.
 */
export function withSuccessionChoice(nodes: SimNode[], me: SimNode): SimNode[] {
  const key = dynastyKey(me);
  const sole = me.dynastyRole === 'head' || me.dynastyRole === 'heir' ? me.dynastyRole : null;
  return nodes.map((x) => {
    if (x.id === me.id) return me;
    if (!key || dynastyKey(x) !== key) return x;
    let out = x;
    if (sole && x.dynastyRole === sole && (!plannedRole(me) || plannedRole(x))) out = { ...out, dynastyRole: undefined };
    if (me.heirAfter && x.heirAfter === me.heirAfter) {
      const { heirAfter: _gone, ...rest } = out;
      out = rest;
    }
    return out;
  });
}

/** `n` as the dynasty's planned heir, their heir-after plan done. */
function asPlannedHeir(n: SimNode): SimNode {
  if (!n.dynasty || n.dynastyPlan === 'none') return n;
  return { ...n, dynastyRole: 'heir', dynastyPlan: n.dynastyPlan === 'member' ? 'member' : 'role' };
}

/**
 * After a save: the line moves up. A sim planned as heir after someone the
 * save now has as head becomes the planned heir, a plan like any other
 * role, unless the dynasty already has a planned heir. One after someone
 * who has died takes that sim's place: after whoever they were after, or
 * heir. One the save has as heir already is done; a plan whose sim is gone
 * from the board, or who has died themself, ends. The same array back when
 * nothing moves.
 */
export function advanceSuccession(nodes: SimNode[]): SimNode[] {
  let out = nodes;
  // A death moves a chain one place per pass.
  for (let pass = 0; pass < 16; pass++) {
    const byId = new Map(out.map((n) => [n.id, n]));
    const plannedHeir = new Set(
      out.filter((n) => n.dynastyRole === 'heir' && plannedRole(n) && n.state !== DECEASED_STATE).map((n) => dynastyKey(n)),
    );
    let changed = false;
    const next = out.map((n) => {
      if (!n.heirAfter) return n;
      const { heirAfter: before, ...rest } = n;
      const p = byId.get(before);
      const done = n.dynastyRole === 'heir' && !n.dynastyPlan;
      if (done || !p || n.state === DECEASED_STATE) {
        changed = true;
        return rest;
      }
      if (p.state === DECEASED_STATE) {
        if (p.heirAfter && byId.has(p.heirAfter)) {
          changed = true;
          return { ...rest, heirAfter: p.heirAfter };
        }
        // With another heir already planned, it waits for you to choose.
        if (plannedHeir.has(dynastyKey(n))) return n;
        changed = true;
        return asPlannedHeir(rest);
      }
      const isHead = p.dynastyRole === 'head' && !p.dynastyPlan && dynastyKey(p) === dynastyKey(n);
      if (isHead && !plannedHeir.has(dynastyKey(n))) {
        changed = true;
        return asPlannedHeir(rest);
      }
      return n;
    });
    if (!changed) break;
    out = next;
  }
  return out;
}

/** Whether `before`, whom `n` is planned as heir after, is head in the save: the plan can be done. */
export function heirAfterReady(n: SimNode, before: SimNode | undefined): boolean {
  return !!before && before.dynastyRole === 'head' && !before.dynastyPlan && dynastyKey(before) === dynastyKey(n);
}

/**
 * Boards from before heirs could be planned after one another planned an
 * heir at each generation (Eric, his daughter Olivia, her baby), though a
 * dynasty has one heir. Each planned heir with a planned heir among their
 * forebears becomes heir after the nearest of them, the eldest staying
 * heir. Two planned heirs after the same forebear (sisters) are left as
 * they are, for you to order; so are planned heirs with none above them.
 * The same array back when nothing changes.
 */
export function chainPlannedHeirs(nodes: SimNode[], edges: Edge[]): SimNode[] {
  const heirs = new Map<string, SimNode[]>();
  for (const n of nodes) {
    if (n.dynastyRole !== 'heir' || !plannedRole(n) || n.species || n.state === DECEASED_STATE) continue;
    const key = dynastyKey(n);
    if (key) heirs.set(key, [...(heirs.get(key) ?? []), n]);
  }
  const lists = [...heirs.values()].filter((l) => l.length > 1);
  if (!lists.length) return nodes;
  const parents = new Map<string, string[]>();
  for (const e of edges) if (e.type === 'parent') parents.set(e.b, [...(parents.get(e.b) ?? []), e.a]);
  /** Whether `a` is a forebear of `b` on the board. */
  const forebear = (a: string, b: string) => {
    const seen = new Set<string>();
    const todo = [...(parents.get(b) ?? [])];
    while (todo.length) {
      const x = todo.pop()!;
      if (x === a) return true;
      if (seen.has(x)) continue;
      seen.add(x);
      todo.push(...(parents.get(x) ?? []));
    }
    return false;
  };
  const after = new Map<string, string>();
  for (const list of lists) {
    const nearest = new Map<string, string>();
    for (const h of list) {
      const above = list.filter((x) => x !== h && forebear(x.id, h.id));
      // The nearest: every other planned heir above them is above this one too.
      const near = above.filter((x) => above.every((y) => y === x || forebear(y.id, x.id)));
      if (near.length === 1) nearest.set(h.id, near[0]!.id);
    }
    const shared = new Map<string, number>();
    for (const before of nearest.values()) shared.set(before, (shared.get(before) ?? 0) + 1);
    for (const [id, before] of nearest) if (shared.get(before) === 1) after.set(id, before);
  }
  if (!after.size) return nodes;
  return nodes.map((n) => {
    const before = after.get(n.id);
    if (!before) return n;
    // Joining the dynasty stays a plan; a member of it in the game has no role till then.
    const { dynastyRole: _role, ...rest } = n;
    if (n.dynastyPlan === 'member') return { ...rest, heirAfter: before };
    const { dynastyPlan: _plan, ...game } = rest;
    return { ...game, heirAfter: before };
  });
}
