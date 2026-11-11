import { DECEASED_STATE, NON_BINARY, UNHOUSED_HH } from '../constants.ts';
import { advanceSuccession } from '../succession.ts';
import { cardName, isPlannedSim, overruledParentLinks, plannedSnapshot } from '../plan.ts';
import { dynastyKey, rememberFirstHeads } from '../generations.ts';
import { OTHER_WORLD } from '../layout.ts';
import { everyoneAges, frozenReason, playedAgingText, scaleOf } from '../lifeClock.ts';
import { isUnhousedGid, unhousedGid } from '../unhoused.ts';
import { lotKey, lotsIn, type GameLot } from '../places.ts';
import { edgeSourceOf, joinNotes, sanitizeEdges, uKey, worldColor } from '../utils.ts';
import type {
  Edge,
  EdgeType,
  Group,
  PairStatus,
  PairTag,
  SaveGameInfo,
  SimLife,
  SimNode,
  World,
} from '../../types/whiteboard.ts';
import {
  type ParsedGameInfo,
  readableHouseholdName,
  type ParsedSave,
  type ParsedSaveRel,
  type ParsedSaveSim,
  type ParsedTreeRelative,
} from './parseSave.ts';

export type SaveMergeSummary = {
  matched: number;
  added: number;
  fromSave: number;
  confirmed: number;
  newLinks: number;
  stillPlanned: number;
  skipped: string[];
  /** Board worlds whose names appear in the save. */
  saveWorlds: string[];
  /** World names in the save that are not a board world. */
  extraWorlds: string[];
  /** Packs whose dedicated board worlds are missing from the save. */
  hidePacks: string[];
  /** Parent links the save keeps secret (the family tree leaves them out). */
  secretParents: number;
  /** Pairs the save calls secret lovers. */
  secretLovers: number;
  /** Parent links the save marks adopted. */
  adoptions: number;
  /** Sims moved into the box that holds the rest of their save household. */
  rejoined: string[];
  /** Sims the game generated, put in the Unhoused sims box. */
  unhoused: string[];
  /** Sims with no home lot moved out of a world into Not in any world. */
  toNotInWorld: string[];
  /** Cards added for family-tree relatives with no sim (see treeRelatives). */
  relatives: string[];
  /** Unknown cards for such relatives that now have the game's name for them. */
  relativesNamed: string[];
  /** Cards for such relatives, already on the board, now marked deceased. */
  relativesDied: string[];
  /** Planned sims a sim from the save filled: "Heir Dreamer → Helena Capp". */
  slotsFilled: string[];
  /**
   * Married sims the board shows under their own surname, with the one the
   * game gives them from their spouse (see withOwnSurnames).
   */
  ownSurnames: { name: string; married: string }[];
  /** Board cards this save has no sim or relative for; Merge leaves them as they are. */
  notInSave: number;
  /** Game Options that differ from the board's last import ("Lifespan: Normal → Short"). */
  gameChanges: string[];
};

export type SaveMergeInput = {
  nodes: SimNode[];
  edges: Edge[];
  groups: Group[];
  worlds: World[];
  /** The board's statuses from earlier imports; this save's pairs replace theirs. */
  pairStatus?: PairStatus[];
  parsed: ParsedSave;
  seedNameKeys: Set<string>;
  /**
   * The built-in roster. A premade the board has no card for takes its game,
   * playability, life state and neighbourhood from its roster card, which the
   * save does not record; otherwise the roster's world → game pairing is the
   * fallback when the board has no sims in a world yet (always the case on
   * Replace).
   */
  packReference?: SimNode[];
  /** The roster's links, which name a relative the save keeps nameless (see rosterRelative). */
  rosterEdges?: Edge[];
  /** Sims the player moved to another household by hand; Merge keeps them there. */
  movedByHand?: ReadonlySet<string>;
  /**
   * Planned sims to fill, chosen in Your plan: save sim id → the planned
   * sim's card. That save sim takes the card over (see slotSuggestions).
   */
  slotMatches?: ReadonlyMap<string, string>;
  /** The game clock and options from the board's last import. */
  game?: SaveGameInfo | null;
  /** The save file's name, for the save details. */
  fileName?: string;
  now: string;
  nextEdgeId: () => string;
};

export type SaveMergeResult = {
  nodes: SimNode[];
  edges: Edge[];
  groups: Group[];
  pairStatus: PairStatus[];
  /** This save's clock and options; the board's own when the save has no clock. */
  saveGame: SaveGameInfo | null;
  /**
   * Board ids of cards this import moved to another box: sims rejoined or
   * unhoused, and placeholders that now stand for a family-tree relative.
   */
  rehomed: string[];
  summary: SaveMergeSummary;
};

export function foldName(s: string): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim()
    .toLowerCase()
    .replace(/[\u2018\u2019\u02bb\u02bc]/g, "'");
}

export function nameKey(first: string, sur: string): string {
  return `${foldName(first)}|${foldName(sur)}`;
}

/** Edit distance, capped at 2 (anything farther is treated as 2). */
export function nameDistance(a: string, b: string): number {
  if (a === b) return 0;
  const al = a.length;
  const bl = b.length;
  if (Math.abs(al - bl) > 1) return 2;
  if (!al) return Math.min(bl, 2);
  if (!bl) return Math.min(al, 2);
  const row = Array.from({ length: bl + 1 }, (_, j) => j);
  for (let i = 1; i <= al; i++) {
    let prev = row[0]!;
    row[0] = i;
    for (let j = 1; j <= bl; j++) {
      const cur = row[j]!;
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, prev + cost);
      prev = cur;
    }
  }
  return Math.min(row[bl]!, 2);
}

/**
 * The board is still the built-in starter roster: no card came from a save,
 * and most of the roster's cards are on it, wherever they were dragged.
 * Merging a save into it would keep every premade the game does not have.
 */
export function isStarterBoard(nodes: SimNode[], roster: SimNode[]): boolean {
  if (!roster.length || nodes.some((n) => n.saveSimId || n.treeId)) return false;
  const ids = new Set(nodes.map((n) => n.id));
  return roster.filter((r) => ids.has(r.id)).length * 2 >= roster.length;
}

/**
 * The starter roster as it shipped: a starter board (isStarterBoard) with no
 * card added or moved by hand. Nothing on it is the player's arrangement, so
 * a save merged into it is laid out afresh, as Replace is, rather than
 * fitted around where the starter's cards happened to be.
 */
export function isUntouchedStarter(nodes: SimNode[], roster: SimNode[]): boolean {
  if (!isStarterBoard(nodes, roster)) return false;
  const shipped = new Map(roster.map((r) => [r.id, r]));
  return nodes.every((n) => {
    const r = shipped.get(n.id);
    return !!r && (n.ox ?? 0) === (r.ox ?? 0) && (n.oy ?? 0) === (r.oy ?? 0);
  });
}

export function seedNameKeysFromNodes(nodes: SimNode[]): Set<string> {
  return new Set(nodes.map((n) => nameKey(n.first, n.sur)));
}

function householdKey(first: string, sur: string, hh: string): string {
  return `${nameKey(first, sur)}@${foldName(hh)}`;
}

function pairKey(type: EdgeType, a: string, b: string): string {
  if (type === 'parent') return `parent:${a}>${b}`;
  return `${type}:${uKey(a, b)}`;
}

type SourcedEdge = Edge & { source: 'seed' | 'save' | 'planned' };

const BINARY = new Set(['Male', 'Female']);

/**
 * A card's gender after an import. The save's pronouns decide it when the
 * player set some; without them the game only knows Female or Male, which
 * never turns a Non-Binary card (from the roster, or set by hand) binary.
 */
export function gameGender(board: string, sim: Pick<ParsedSaveSim, 'gender' | 'pronouns'>): string {
  if (!sim.gender) return board;
  if (sim.pronouns || board !== NON_BINARY) return sim.gender;
  return board;
}

/** A save sim as the board files it (see {@link withOwnSurnames}). */
type SaveSim = ParsedSaveSim & {
  /** The game's surname, a spouse's; `last` is then the sim's own. */
  marriedLast?: string;
};

/**
 * Married sims under their own surname. The game can give a sim their
 * spouse's (Cassandra Goth is Cassandra Vatore once she marries Caleb), and
 * a mod such as MC Command Center can do it to every married couple in the
 * save at once. A dynasty board follows the family a sim was born into, so
 * a sim whose surname is a spouse's keeps the one the board knows:
 *  - their card's, when the card has another surname (the board knew them
 *    before the wedding, or the name was changed there by hand);
 *  - their card's too when the card already has the married name as such
 *    (the player chose to show it);
 *  - otherwise, for a renamed premade, the roster's: the one roster card of
 *    that first name the save holds no sim for, that shares the sim's
 *    household, a parent or a spouse.
 * The game's surname goes along as `marriedLast`.
 */
function withOwnSurnames(
  parsed: ParsedSave,
  board: SimNode[],
  roster: SimNode[],
  rosterEdges: Edge[],
  seedNameKeys: Set<string>,
): SaveSim[] {
  const byId = new Map(parsed.sims.map((s) => [s.saveSimId, s]));
  const relativeName = new Map(
    (parsed.relatives ?? []).flatMap((r) => (r.name ? [[r.treeId, r.name] as const] : [])),
  );
  const fullName = (id: string) => {
    const s = byId.get(id);
    return foldName(s ? `${s.first} ${s.last}` : (relativeName.get(id) ?? ''));
  };
  const spouses = new Map<string, string[]>();
  const parents = new Map<string, string[]>();
  const add = (m: Map<string, string[]>, k: string, v: string) => m.set(k, [...(m.get(k) ?? []), v]);
  for (const r of parsed.rels) {
    if (r.type === 'parent') add(parents, r.b, r.a);
    else if (r.type === 'marriage' || r.type === 'divorced') {
      add(spouses, r.a, r.b);
      add(spouses, r.b, r.a);
    }
  }
  const rosterById = new Map(roster.map((n) => [n.id, n]));
  const rosterName = (id: string) => {
    const n = rosterById.get(id);
    return n ? foldName(`${n.first} ${n.sur}`) : '';
  };
  const rosterKin = (id: string, kind: 'parent' | 'spouse') =>
    rosterEdges.flatMap((e) => {
      if (kind === 'parent') return e.type === 'parent' && e.b === id ? [rosterName(e.a)] : [];
      if (e.type !== 'marriage' && e.type !== 'romance' && e.type !== 'divorced') return [];
      return e.a === id ? [rosterName(e.b)] : e.b === id ? [rosterName(e.a)] : [];
    });
  const cardOf = new Map(board.flatMap((n) => (n.saveSimId ? [[n.saveSimId, n] as const] : [])));
  const inSave = new Set(parsed.sims.map((s) => nameKey(s.first, s.last)));
  const taken = new Set<string>();

  return parsed.sims.map((sim): SaveSim => {
    const last = foldName(sim.last);
    const mine = spouses.get(sim.saveSimId) ?? [];
    const renamed = !!last && mine.some((id) => foldName(byId.get(id)?.last ?? '') === last);
    if (!renamed) return sim;
    const card = cardOf.get(sim.saveSimId);
    if (card?.sur.trim() && foldName(card.sur) !== last) {
      return { ...sim, last: card.sur, marriedLast: sim.last };
    }
    if (card?.marriedSur && foldName(card.marriedSur) === last) {
      return { ...sim, marriedLast: sim.last };
    }
    if (seedNameKeys.has(nameKey(sim.first, sim.last))) return sim;
    const first = foldName(sim.first);
    const hh = foldName(sim.household);
    const theirParents = new Set((parents.get(sim.saveSimId) ?? []).map(fullName).filter(Boolean));
    const theirSpouses = new Set(mine.map(fullName).filter(Boolean));
    const found = roster.filter(
      (r) =>
        foldName(r.first) === first &&
        !!r.sur.trim() &&
        foldName(r.sur) !== last &&
        (r.species ?? '') === (sim.species ?? '') &&
        // The save knows two genders; the roster also says Non-Binary (Celeste Capp).
        !(BINARY.has(r.gender) && BINARY.has(sim.gender) && r.gender !== sim.gender) &&
        !inSave.has(nameKey(r.first, r.sur)) &&
        !taken.has(r.id) &&
        ((!!hh && (foldName(r.ohh) === hh || foldName(r.hh) === hh)) ||
          rosterKin(r.id, 'parent').some((n) => theirParents.has(n)) ||
          rosterKin(r.id, 'spouse').some((n) => theirSpouses.has(n))),
    );
    if (found.length !== 1) return sim;
    taken.add(found[0]!.id);
    return { ...sim, last: found[0]!.sur, marriedLast: sim.last };
  });
}

type BoardHome = {
  gid: string;
  world: string;
  nb: string;
  hh: string;
  color: string;
};

function matchSaveSim(
  sim: ParsedSaveSim,
  bySaveId: Map<string, SimNode>,
  byName: Map<string, SimNode[]>,
  byNameHh: Map<string, SimNode[]>,
  byLast: Map<string, SimNode[]>,
  claimed: Set<string>,
): SimNode | 'ambiguous' | null {
  const hit = bySaveId.get(sim.saveSimId);
  if (hit && !claimed.has(hit.id)) return hit;
  const nk = nameKey(sim.first, sim.last);
  const named = (byName.get(nk) ?? []).filter((n) => !claimed.has(n.id));
  if (named.length === 1) return named[0]!;
  if (named.length > 1) {
    const hk = householdKey(sim.first, sim.last, sim.household);
    const housed = (byNameHh.get(hk) ?? []).filter((n) => !claimed.has(n.id));
    if (housed.length === 1) return housed[0]!;
    return 'ambiguous';
  }
  const last = foldName(sim.last);
  const first = foldName(sim.first);
  if (!last || !first) return null;
  const close = (byLast.get(last) ?? []).filter(
    (n) => !claimed.has(n.id) && nameDistance(foldName(n.first), first) <= 1,
  );
  if (close.length === 1) return close[0]!;
  if (close.length > 1) return 'ambiguous';
  return null;
}

function boardWorldName(simWorld: string | undefined, worlds: World[]): string {
  const name = (simWorld ?? '').trim();
  if (!name) return OTHER_WORLD;
  const exact = worlds.find((w) => w.name === name);
  if (exact) return exact.name;
  const folded = foldName(name);
  const close = worlds.filter(
    (w) => w.name !== OTHER_WORLD && foldName(w.name) === folded,
  );
  if (close.length === 1) return close[0]!.name;
  return OTHER_WORLD;
}

function homeKey(householdId: string, household: string, world: string): string {
  const hh = foldName(household) || foldName(householdId);
  if (!householdId || householdId === '0') return `0::${hh}::${foldName(world)}`;
  return `${householdId}::${hh}`;
}

/** Most common game among `nodes` in `world`, or '' when none is known. */
function packForWorld(world: string, nodes: SimNode[]): string {
  const counts = new Map<string, number>();
  for (const n of nodes) {
    if (n.world !== world || !n.pack) continue;
    counts.set(n.pack, (counts.get(n.pack) ?? 0) + 1);
  }
  let best = '';
  let nBest = 0;
  for (const [pack, n] of counts) {
    if (n > nBest) {
      best = pack;
      nBest = n;
    }
  }
  return best;
}

/**
 * Packs that only appear on board worlds the save does not list. Other-only
 * packs (no dedicated world) stay visible — the file has no pack table.
 */
export function packsNotInSaveWorlds(
  nodes: SimNode[],
  saveWorlds: string[],
): string[] {
  const save = new Set(saveWorlds.map((w) => foldName(w)));
  const byPack = new Map<string, Set<string>>();
  for (const n of nodes) {
    if (!n.pack || !n.world || n.world === OTHER_WORLD) continue;
    const set = byPack.get(n.pack) ?? new Set<string>();
    set.add(n.world);
    byPack.set(n.pack, set);
  }
  const hide: string[] = [];
  for (const [pack, packWorlds] of byPack) {
    const any = [...packWorlds].some((w) => save.has(foldName(w)));
    if (!any) hide.push(pack);
  }
  return hide.sort((a, b) => a.localeCompare(b));
}

/**
 * The Games filter after an import. Games the save shows you don't have
 * (`hidePacks`) are switched off, on top of those already off (`hidden`;
 * none on Replace, which starts the filters over). A game whose sims the
 * import brought to a board that had none is switched on instead: the save
 * has them, so you have the game now, and they should not arrive hidden.
 */
export function hiddenPacksAfterImport(opts: {
  hidden: Iterable<string>;
  hidePacks: string[];
  /** Games of the board's cards before the import, and after it. */
  before: Iterable<string>;
  after: Iterable<string>;
}): Set<string> {
  const before = new Set(opts.before);
  const next = new Set([...opts.hidden, ...opts.hidePacks]);
  for (const p of opts.after) if (!before.has(p)) next.delete(p);
  return next;
}

function worldsFromParsed(parsed: ParsedSave): string[] {
  if (parsed.worlds?.length) return parsed.worlds;
  const set = new Set<string>();
  for (const w of Object.values(parsed.householdWorld ?? {})) {
    if (w) set.add(w);
  }
  for (const s of parsed.sims) {
    if (s.world) set.add(s.world);
  }
  return [...set];
}

function saveWorldSummary(
  boardWorlds: World[],
  saveWorlds: string[],
): { saveWorlds: string[]; extraWorlds: string[] } {
  const save = new Set(saveWorlds.map((w) => foldName(w)));
  const matched = boardWorlds
    .map((w) => w.name)
    .filter((name) => name !== OTHER_WORLD && save.has(foldName(name)));
  const board = new Set(boardWorlds.map((w) => foldName(w.name)));
  const extra = saveWorlds.filter((name) => !board.has(foldName(name)));
  return { saveWorlds: matched, extraWorlds: extra };
}

/**
 * Game for a sim the save brings: the board's own pairing for its world,
 * else the reference roster's. Without the fallback, Replace (which starts
 * from an empty board) left every sim with no game and the Games filter
 * with nothing to list.
 */
function packForSaveSim(world: string, board: SimNode[], reference: SimNode[]): string {
  return packForWorld(world, board) || packForWorld(world, reference);
}

/**
 * Give save-imported sims that have no game one from their world, the same
 * way an import now does. Repairs boards replaced from a save before the
 * fallback existed. Sims added in the editor keep no game on purpose (hiding
 * a game never hides your own sims), so only save sims are touched.
 */
export function fillMissingSavePacks(nodes: SimNode[], reference: SimNode[]): SimNode[] {
  if (!nodes.some((n) => !n.pack && n.saveSimId)) return nodes;
  return nodes.map((n) => {
    if (n.pack || !n.saveSimId) return n;
    const pack = packForSaveSim(n.world, nodes, reference);
    return pack ? { ...n, pack } : n;
  });
}

/**
 * Readable names for households a save import named with a premade
 * template's internal id (see {@link readableHouseholdName}). Only the names
 * change — gid stays, so the household is the same one. Returns the same
 * arrays when nothing needs renaming.
 */
export function renameTemplateHouseholds(
  nodes: SimNode[],
  groups: Group[],
): { nodes: SimNode[]; groups: Group[] } {
  const fix = <T extends { hh: string }>(x: T): T => {
    const hh = readableHouseholdName(x.hh);
    return hh === x.hh ? x : { ...x, hh };
  };
  const odd = (s: string) => readableHouseholdName(s) !== s;
  return {
    nodes: nodes.some((n) => odd(n.hh) || odd(n.ohh))
      ? nodes.map((n) => {
          const next = fix(n);
          const ohh = readableHouseholdName(n.ohh);
          return ohh === n.ohh ? next : { ...next, ohh };
        })
      : nodes,
    groups: groups.some((g) => odd(g.hh)) ? groups.map(fix) : groups,
  };
}

function newSaveNode(
  sim: SaveSim,
  fromSave: boolean,
  home: BoardHome,
  pack: string,
  /** The premade's roster card: what the save leaves out comes from it. */
  roster?: SimNode,
): SimNode {
  const made = plainSaveNode(sim, fromSave, home, pack);
  if (!roster || (roster.species ?? '') !== (sim.species ?? '')) return made;
  return {
    ...made,
    state: sim.species ? made.state : roster.state,
    townie: roster.townie,
    oworld: roster.oworld,
    onb: roster.onb,
    ohh: roster.ohh,
    oplay: roster.oplay,
    pack: roster.pack || pack,
    ...(roster.breed ? { breed: roster.breed } : {}),
  };
}

function plainSaveNode(
  sim: SaveSim,
  fromSave: boolean,
  home: BoardHome,
  pack: string,
): SimNode {
  return {
    id: `s${sim.saveSimId}`,
    gid: home.gid,
    first: sim.first,
    sur: sim.last,
    ...(sim.marriedLast ? { marriedSur: sim.marriedLast } : {}),
    age: sim.age,
    state: sim.species ? 'Pet' : 'Sim',
    gender: sim.gender,
    ...(sim.pronouns ? { pronouns: sim.pronouns } : {}),
    hh: home.hh,
    world: home.world,
    nb: home.nb,
    color: home.color,
    townie: false,
    oworld: home.world,
    onb: home.nb,
    ohh: home.hh,
    oplay: 'Resident',
    pack,
    ox: 0,
    oy: 0,
    x: 0,
    y: 0,
    w: 0,
    h: 0,
    saveSimId: sim.saveSimId,
    fromSave: fromSave || undefined,
    species: sim.species,
    ...(sim.dynasty ? { dynasty: sim.dynasty } : {}),
    ...(sim.dynastyId ? { dynastyId: sim.dynastyId } : {}),
    ...(sim.dynastyRole ? { dynastyRole: sim.dynastyRole } : {}),
  };
}

/**
 * The game's dynasty and role on a card. A save that keeps dynasties is the
 * truth for its sims, so one it lists in none loses them; a save from before
 * Royalty & Legacy says nothing, and the card keeps what it has.
 *
 * A dynasty or role planned on the board (`dynastyPlan`) stands like a
 * violet link until a save shows it done: them in the planned dynasty with
 * the planned role, or, for one planned to leave, in none.
 */
export function syncDynasty(
  next: SimNode,
  sim: Pick<ParsedSaveSim, 'dynasty' | 'dynastyId' | 'dynastyRole'>,
  saveHasDynasties: boolean,
  /**
   * The game's dynasty ids the board had before this save. A dynasty planned
   * apart from another of its name (`dynastyRef`) isn't one of them: a sim
   * the save puts in one of those is in the other dynasty, not this one.
   */
  boardIds?: ReadonlySet<string>,
): void {
  if (!saveHasDynasties) return;
  const plan = next.dynastyPlan
    ? {
        kind: next.dynastyPlan,
        dynasty: next.dynasty,
        dynastyId: next.dynastyId,
        dynastyRef: next.dynastyRef,
        dynastyRole: next.dynastyRole,
      }
    : null;
  delete next.dynastyPlan;
  delete next.dynastyRef;
  if (sim.dynasty) next.dynasty = sim.dynasty;
  else delete next.dynasty;
  if (sim.dynastyId) next.dynastyId = sim.dynastyId;
  else delete next.dynastyId;
  if (sim.dynastyRole) next.dynastyRole = sim.dynastyRole;
  else delete next.dynastyRole;
  if (!plan) return;
  // To leave: done once the save has them in none.
  if (plan.kind === 'none') {
    if (sim.dynasty) next.dynastyPlan = 'none';
    return;
  }
  const fold = (s?: string) => (s ?? '').trim().toLocaleLowerCase();
  const same =
    !!sim.dynasty &&
    (plan.dynastyId && sim.dynastyId
      ? plan.dynastyId === sim.dynastyId
      : fold(plan.dynasty) === fold(sim.dynasty) && !(plan.dynastyRef && sim.dynastyId && boardIds?.has(sim.dynastyId)));
  if (same) {
    if ((sim.dynastyRole ?? undefined) === plan.dynastyRole) return;
    if (plan.dynastyRole) next.dynastyRole = plan.dynastyRole;
    else delete next.dynastyRole;
    next.dynastyPlan = 'role';
    return;
  }
  // Not in the planned dynasty yet: the plan stands.
  if (plan.dynasty) next.dynasty = plan.dynasty;
  else delete next.dynasty;
  if (plan.dynastyId) next.dynastyId = plan.dynastyId;
  else delete next.dynastyId;
  if (plan.dynastyRef) next.dynastyRef = plan.dynastyRef;
  if (plan.dynastyRole) next.dynastyRole = plan.dynastyRole;
  else delete next.dynastyRole;
  next.dynastyPlan = 'member';
}

/**
 * A dynasty only planned on the board (keyed by its name, or by its own
 * board id) that this save shows in the game: the members still only
 * planned into it follow those the save has in it, to the game's id, and so
 * does what is kept by its key (a first head, a picked Gen 1). Otherwise
 * the save's members and the planned ones would be two dynasties.
 */
export function followGameDynasties(before: SimNode[], after: SimNode[]): SimNode[] {
  const fold = (s?: string) => (s ?? '').trim().toLocaleLowerCase();
  const was = new Map<string, SimNode>();
  for (const n of before) if (n.dynasty && !n.dynastyId) was.set(n.id, n);
  const moved = new Map<string, { id: string; name: string }>();
  for (const n of after) {
    const old = was.get(n.id);
    if (!old || !n.dynastyId || !n.dynasty || n.dynastyPlan === 'member' || fold(old.dynasty) !== fold(n.dynasty)) continue;
    const key = dynastyKey(old)!;
    if (!moved.has(key)) moved.set(key, { id: n.dynastyId, name: n.dynasty });
  }
  if (!moved.size) return after;
  return after.map((n) => {
    const patch: Partial<SimNode> = {};
    const to = n.dynastyPlan === 'member' && !n.dynastyId ? moved.get(dynastyKey(n) ?? '') : undefined;
    if (to) {
      patch.dynasty = to.name;
      patch.dynastyId = to.id;
    }
    const head = n.firstHeadOf ? moved.get(n.firstHeadOf) : undefined;
    if (head) patch.firstHeadOf = `id:${head.id}`;
    const root = n.genRootOf ? moved.get(n.genRootOf) : undefined;
    if (root) patch.genRootOf = `id:${root.id}`;
    if (!Object.keys(patch).length) return n;
    const out: SimNode = { ...n, ...patch };
    if (to) delete out.dynastyRef;
    return out;
  });
}

function patchMatched(
  n: SimNode,
  sim: SaveSim,
  fromSave: boolean,
  /** The premade's roster card, for a breed the board's card lacks. */
  roster?: SimNode,
  saveHasDynasties = false,
  boardIds?: ReadonlySet<string>,
): SimNode {
  const next: SimNode = {
    ...n,
    first: sim.first || n.first,
    sur: sim.last || n.sur,
    saveSimId: sim.saveSimId,
  };
  if (sim.marriedLast) next.marriedSur = sim.marriedLast;
  else delete next.marriedSur;
  syncDynasty(next, sim, saveHasDynasties, boardIds);
  if (sim.age) next.age = sim.age;
  next.gender = gameGender(next.gender, sim);
  if (sim.pronouns) next.pronouns = sim.pronouns;
  else delete next.pronouns;
  if (sim.species) {
    next.species = sim.species;
    next.state = 'Pet';
    // A pet an earlier import took for a human (horses were) has no breed.
    if (!next.breed && roster?.breed && roster.species === sim.species) next.breed = roster.breed;
  }
  if (fromSave) {
    next.fromSave = true;
    next.added = undefined;
  }
  if (sim.household && n.hh !== sim.household && n.added) {
    const world = n.world || OTHER_WORLD;
    next.hh = sim.household;
    next.gid = `${world}||${sim.household}`;
    next.ohh = sim.household;
  }
  return next;
}

function rememberHome(map: Map<string, BoardHome>, sim: ParsedSaveSim, n: SimNode) {
  if (foldName(n.hh) !== foldName(sim.household)) return;
  const key = homeKey(sim.householdId, sim.household, n.world);
  if (map.has(key)) return;
  map.set(key, {
    gid: n.gid,
    world: n.world,
    nb: n.nb,
    hh: n.hh,
    color: n.color,
  });
}

function homeForNew(
  sim: ParsedSaveSim,
  worlds: World[],
  existingGids: Set<string>,
  hhHome: Map<string, BoardHome>,
  /** The sim's roster card, whose neighbourhood a new box in its world takes. */
  roster?: SimNode,
): BoardHome {
  const hh = sim.household.trim() || sim.last.trim() || 'Household';
  const world = boardWorldName(sim.world, worlds);
  const key = homeKey(sim.householdId, hh, world);
  const prior = hhHome.get(key);
  if (prior) return prior;
  let gid = `${world}||${hh}`;
  if (existingGids.has(gid)) {
    gid = `${world}||${hh}::${sim.householdId && sim.householdId !== '0' ? sim.householdId : sim.saveSimId}`;
  }
  const home: BoardHome = {
    gid,
    world,
    hh,
    nb: roster && roster.world === world && roster.nb ? roster.nb : '-',
    color: worldColor(world, worlds),
  };
  hhHome.set(key, home);
  existingGids.add(gid);
  return home;
}

/** `world`'s Unhoused sims box. */
function unhousedHome(world: string, worlds: World[]): BoardHome {
  return {
    gid: unhousedGid(world),
    world,
    hh: UNHOUSED_HH,
    nb: '-',
    color: worldColor(world, worlds),
  };
}

/**
 * `n`, a sim the game generated, moved into the Unhoused sims box. Its origin
 * household keeps the game's name for its family, so the editor can still
 * say where it is from, and a card the import made says Townie, not Resident.
 */
function moveIntoUnhoused(n: SimNode, home: BoardHome): SimNode {
  const next: SimNode = { ...n, ...home };
  if (n.ohh === n.hh && n.oworld === n.world) {
    next.oworld = home.world;
    next.onb = home.nb;
  }
  if (n.fromSave && n.oplay === 'Resident') next.oplay = 'Townie';
  return next;
}

function homeOf(n: SimNode): BoardHome {
  return { gid: n.gid, world: n.world, nb: n.nb, hh: n.hh, color: n.color };
}

/** `n` moved into `home`'s box. A sim whose origin was its old box moves origin too. */
function moveInto(n: SimNode, home: BoardHome): SimNode {
  const next: SimNode = { ...n, ...home };
  if (n.ohh === n.hh && n.oworld === n.world) {
    next.ohh = home.hh;
    next.oworld = home.world;
    next.onb = home.nb;
  }
  return next;
}

/**
 * Bring each save household's sims on the board into one box. Boards built
 * before households were read by household id gave a sim who was out
 * visiting when the game saved a box of its own; a move in the game since the
 * last import splits a household too. Each stray joins the box that already
 * holds most of its household — ties go to the box named like the household,
 * then the one in its home world, then the one the import made first (no
 * "::" suffix). Boxes are never split, and sims moved by hand stay put.
 * Returns the board ids moved and each household's box.
 */
function gatherHouseholds(
  nodes: SimNode[],
  byHousehold: Map<string, { sim: ParsedSaveSim; id: string }[]>,
  worlds: World[],
  movedByHand: ReadonlySet<string>,
  /** A new box, for a household with no box it may stay in. */
  newHome: (sim: ParsedSaveSim) => BoardHome,
): { moved: string[]; homes: Map<string, BoardHome> } {
  const at = new Map(nodes.map((n, i) => [n.id, i]));
  const moved: string[] = [];
  const homes = new Map<string, BoardHome>();
  for (const list of byHousehold.values()) {
    const free = list.filter((m) => !movedByHand.has(m.id));
    if (!free.length) continue;
    const { sim } = free[0]!;
    const homeWorld = boardWorldName(sim.world, worlds);
    const name = foldName(sim.household);
    const boxes = new Map<string, { count: number; n: SimNode; order: number }>();
    for (const { id } of free) {
      const n = nodes[at.get(id)!]!;
      // The Unhoused sims box is for sims the game generated, not households.
      if (isUnhousedGid(n.gid)) continue;
      // A household with no home lot lives in no world, as the game says.
      if (sim.unhoused && n.world !== OTHER_WORLD) continue;
      const box = boxes.get(n.gid);
      if (box) box.count += 1;
      else boxes.set(n.gid, { count: 1, n, order: boxes.size });
    }
    const rank = (b: { count: number; n: SimNode; order: number }) => [
      b.count,
      foldName(b.n.hh) === name ? 1 : 0,
      b.n.world === homeWorld ? 1 : 0,
      b.n.gid.includes('::') ? 0 : 1,
      -b.order,
    ];
    const target = [...boxes.values()].sort((a, b) => {
      const ra = rank(a);
      const rb = rank(b);
      for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return rb[i]! - ra[i]!;
      return 0;
    })[0]?.n;
    const home = target ? homeOf(target) : newHome(sim);
    homes.set(sim.householdId, home);
    for (const { id } of free) {
      const i = at.get(id)!;
      if (nodes[i]!.gid === home.gid) continue;
      nodes[i] = moveInto(nodes[i]!, home);
      moved.push(id);
    }
  }
  return { moved, homes };
}

/** A family-tree relative to show, and the sim whose household it joins. */
type ShownRelative = ParsedTreeRelative & { kin: SimNode };

/**
 * Family-tree relatives with no sim (see ParsedTreeRelative) that link sims
 * on the board: Felix Hoffman's father, between Felix and his grandfather
 * Bruno, or an ancestor two royal houses share. One who reaches only one sim
 * or relative adds nothing to see, so such relatives are dropped until every
 * one left links at least two. Each joins its nearest sim — its children
 * before its parents, its parents before its partners — whose household and
 * surname it takes.
 */
function treeRelatives(
  relatives: ParsedTreeRelative[],
  rels: ParsedSaveRel[],
  simOnBoard: (saveId: string) => SimNode | undefined,
): ShownRelative[] {
  if (!relatives.length) return [];
  const children = new Map<string, string[]>();
  const parents = new Map<string, string[]>();
  const partners = new Map<string, string[]>();
  const add = (m: Map<string, string[]>, k: string, v: string) => {
    const list = m.get(k) ?? [];
    if (!list.includes(v)) list.push(v);
    m.set(k, list);
  };
  for (const r of rels) {
    if (r.type === 'parent') {
      add(children, r.a, r.b);
      add(parents, r.b, r.a);
    } else {
      add(partners, r.a, r.b);
      add(partners, r.b, r.a);
    }
  }
  const near = (id: string) => [
    ...(children.get(id) ?? []),
    ...(parents.get(id) ?? []),
    ...(partners.get(id) ?? []),
  ];
  const kept = new Set(relatives.map((r) => r.treeId));
  const counts = (id: string) => simOnBoard(id) !== undefined || kept.has(id);
  for (let dropped = true; dropped; ) {
    dropped = false;
    for (const id of kept) {
      if (new Set(near(id).filter(counts)).size >= 2) continue;
      kept.delete(id);
      dropped = true;
    }
  }
  const kinOf = (start: string): SimNode | undefined => {
    const seen = new Set([start]);
    for (let level = [start]; level.length; ) {
      const next: string[] = [];
      for (const id of level) {
        for (const x of near(id)) {
          const sim = simOnBoard(x);
          if (sim) return sim;
          if (kept.has(x) && !seen.has(x)) {
            seen.add(x);
            next.push(x);
          }
        }
      }
      level = next;
    }
    return undefined;
  };
  const out: ShownRelative[] = [];
  for (const r of relatives) {
    if (!kept.has(r.treeId)) continue;
    const kin = kinOf(r.treeId);
    if (kin) out.push({ ...r, kin });
  }
  return out;
}

/**
 * The roster card for a relative the save keeps nameless: the one card whose
 * links to the board's sims, matched by name, are all the relative's. The
 * save keeps Colin Sullivan only as Eleanor Sullivan's son and Karmine
 * Luna's father; the roster has him as both. It takes two links at least,
 * and one card alone, so a lone parent is never guessed at. A named card
 * comes before a roster placeholder ("Unknown Elderberry"), which names no
 * one but can still say they died, as the premades' stories have it.
 */
function rosterRelative(
  r: ShownRelative,
  rels: ParsedSaveRel[],
  simOnBoard: (saveId: string) => SimNode | undefined,
  roster: SimNode[],
  rosterEdges: Edge[],
  /** A sim the save has: no relative is named after them. */
  inSave: (n: SimNode) => boolean,
): SimNode | undefined {
  const links: { kind: 'child' | 'parent' | 'partner'; sim: SimNode }[] = [];
  for (const rel of rels) {
    if (rel.a !== r.treeId && rel.b !== r.treeId) continue;
    const sim = simOnBoard(rel.a === r.treeId ? rel.b : rel.a);
    if (!sim || sim.treeId) continue;
    const kind = rel.type !== 'parent' ? 'partner' : rel.a === r.treeId ? 'child' : 'parent';
    links.push({ kind, sim });
  }
  if (links.length < 2 || !rosterEdges.length) return undefined;
  const idsByName = new Map<string, Set<string>>();
  for (const n of roster) {
    const k = nameKey(n.first, n.sur);
    idsByName.set(k, (idsByName.get(k) ?? new Set()).add(n.id));
  }
  const perLink: Set<string>[] = [];
  for (const { kind, sim } of links) {
    const ids = idsByName.get(nameKey(sim.first, sim.sur));
    if (!ids) return undefined;
    const here = new Set<string>();
    for (const e of rosterEdges) {
      if (e.type === 'parent') {
        if (kind === 'child' && ids.has(e.b)) here.add(e.a);
        if (kind === 'parent' && ids.has(e.a)) here.add(e.b);
      } else if (kind === 'partner' && e.type !== 'sibling' && e.type !== 'custom') {
        if (ids.has(e.a)) here.add(e.b);
        if (ids.has(e.b)) here.add(e.a);
      }
    }
    perLink.push(here);
  }
  const found = roster.filter((n) => perLink.every((ids) => ids.has(n.id)) && !inSave(n));
  const named = found.filter((n) => foldName(n.first) !== foldName(UNKNOWN_FIRST));
  if (named.length) return named.length === 1 ? named[0] : undefined;
  return found.length === 1 ? found[0] : undefined;
}

/** First name on a relative's card: the save holds no name for them. */
export const UNKNOWN_FIRST = 'Unknown';

/**
 * A relative's card name: the game's ("Cordelia Thebe II" is Cordelia, of
 * Thebe II, as the game splits Cordelia Thebe V's), else Unknown and the
 * family's surname. The game calls a few ancestors Unknown itself.
 */
function relativeName(r: ShownRelative): { first: string; sur: string } {
  const name = r.name?.trim() ?? '';
  if (!name || name === UNKNOWN_FIRST) return { first: UNKNOWN_FIRST, sur: r.kin.sur };
  const at = name.indexOf(' ');
  return at > 0 ? { first: name.slice(0, at), sur: name.slice(at + 1) } : { first: name, sur: '' };
}

function relativeNode(r: ShownRelative, home: BoardHome): SimNode {
  return {
    id: `t${r.treeId}`,
    gid: home.gid,
    ...relativeName(r),
    age: 'Unknown',
    state: r.deceased ? DECEASED_STATE : 'Sim',
    ...(r.deceased ? { diedOnImport: true as const } : {}),
    gender: r.gender,
    hh: home.hh,
    world: home.world,
    nb: home.nb,
    color: home.color,
    townie: true,
    oworld: home.world,
    onb: home.nb,
    ohh: home.hh,
    oplay: 'Townie',
    pack: r.kin.pack,
    ox: 0,
    oy: 0,
    x: 0,
    y: 0,
    w: 0,
    h: 0,
    treeId: r.treeId,
  };
}

/**
 * Whether the save's couple link (`saved`) shows a planned one done: the
 * same, or a romance now a marriage. A planned wedding is not done by an
 * engagement, nor a planned remarriage by the divorce before it.
 */
export function fulfilsPlan(planned: EdgeType, saved: EdgeType): boolean {
  return planned === saved || (planned === 'romance' && saved === 'marriage');
}

/**
 * The game lot each save household lives on, by the board box most of its
 * sims are in. The save names the lot by the game's id, which a building's
 * units share, and by name when it keeps one: that tells the units apart,
 * and households it names go first. A box whose world has no such lot (the
 * household moved there by hand) gets none.
 */
function saveHouseholdLots(
  sims: ParsedSaveSim[],
  saveIdToBoard: ReadonlyMap<string, string>,
  nodes: SimNode[],
): Map<string, GameLot> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const households = new Map<string, { hint: { hash: number; name?: string }; votes: Map<string, number> }>();
  for (const s of sims) {
    if (!s.lot || !s.householdId || s.householdId === '0' || s.unhoused) continue;
    const id = saveIdToBoard.get(s.saveSimId);
    const n = id === undefined ? undefined : byId.get(id);
    if (!n || isUnhousedGid(n.gid)) continue;
    const h = households.get(s.householdId) ?? { hint: s.lot, votes: new Map<string, number>() };
    h.votes.set(n.gid, (h.votes.get(n.gid) ?? 0) + 1);
    households.set(s.householdId, h);
  }
  const worldOf = new Map(nodes.map((n) => [n.gid, n.world]));
  const out = new Map<string, GameLot>();
  const held = new Set<string>();
  const ordered = [...households.values()].sort((a, b) => Number(!!b.hint.name) - Number(!!a.hint.name));
  for (const { hint, votes } of ordered) {
    const gid = [...votes].sort((a, b) => b[1] - a[1])[0]![0];
    const world = worldOf.get(gid);
    if (!world || out.has(gid)) continue;
    const units = lotsIn(world).filter((l) => l.hash === hint.hash && !held.has(lotKey(l)));
    const named = hint.name ? units.find((l) => foldName(l.name) === foldName(hint.name!)) : undefined;
    const lot = named ?? units[0];
    if (!lot) continue;
    out.set(gid, lot);
    held.add(lotKey(lot));
  }
  return out;
}

export function mergeSaveIntoBoard(input: SaveMergeInput): SaveMergeResult {
  const { parsed, seedNameKeys, now, nextEdgeId, worlds } = input;
  const nodes = input.nodes.map((n) => ({ ...n }));
  /** The game's dynasties the board knows already, by id. */
  const boardDynastyIds = new Set(input.nodes.flatMap((n) => (n.dynastyId ? [n.dynastyId] : [])));
  const bySaveId = new Map<string, SimNode>();
  const byName = new Map<string, SimNode[]>();
  const byNameHh = new Map<string, SimNode[]>();
  const byLast = new Map<string, SimNode[]>();
  const index = (n: SimNode) => {
    if (n.saveSimId) bySaveId.set(n.saveSimId, n);
    const nk = nameKey(n.first, n.sur);
    const list = byName.get(nk) ?? [];
    list.push(n);
    byName.set(nk, list);
    const hk = householdKey(n.first, n.sur, n.hh);
    const hlist = byNameHh.get(hk) ?? [];
    hlist.push(n);
    byNameHh.set(hk, hlist);
    const last = foldName(n.sur);
    const lasts = byLast.get(last) ?? [];
    lasts.push(n);
    byLast.set(last, lasts);
  };
  nodes.forEach(index);

  const rosterByName = new Map<string, SimNode | null>();
  for (const n of input.packReference ?? []) {
    const k = nameKey(n.first, n.sur);
    rosterByName.set(k, rosterByName.has(k) ? null : n);
  }
  const rosterOf = (sim: ParsedSaveSim) =>
    rosterByName.get(nameKey(sim.first, sim.last)) ?? undefined;

  const saveIdToBoard = new Map<string, string>();
  const claimed = new Set<string>();
  const hhHome = new Map<string, BoardHome>();
  const existingGids = new Set(nodes.map((n) => n.gid));
  const skipped: string[] = [];
  const unmatched: SaveSim[] = [];
  /** Save household id → its sims matched to board cards. */
  const byHousehold = new Map<string, { sim: ParsedSaveSim; id: string }[]>();
  const unhousedMatched: string[] = [];
  let matched = 0;
  let added = 0;
  let fromSaveCount = 0;

  const sims = withOwnSurnames(
    parsed,
    input.nodes,
    input.packReference ?? [],
    input.rosterEdges ?? [],
    seedNameKeys,
  );
  const filledSlots: string[] = [];
  const slotsFilled: string[] = [];
  /** Planned sims a sim from this save fills, by card id. */
  const claimedSlots: string[] = [];
  for (const sim of sims) {
    // A planned sim chosen for this one in Your plan: it fills that card.
    const slotId = input.slotMatches?.get(sim.saveSimId);
    const slot = slotId
      ? nodes.find((n) => n.id === slotId && isPlannedSim(n) && !claimed.has(n.id))
      : undefined;
    if (slot) {
      const i = nodes.indexOf(slot);
      const patched = patchMatched(slot, sim, true, rosterOf(sim), !!parsed.dynasties, boardDynastyIds);
      patched.plannedAs = plannedSnapshot(slot, now);
      delete patched.planLabel;
      nodes[i] = patched;
      claimedSlots.push(patched.id);
      claimed.add(patched.id);
      bySaveId.set(sim.saveSimId, patched);
      saveIdToBoard.set(sim.saveSimId, patched.id);
      if (patched.gid !== slot.gid) filledSlots.push(patched.id);
      slotsFilled.push(`${cardName(slot)} → ${sim.first} ${sim.last}`.trim());
      if (sim.householdId && sim.householdId !== '0' && !sim.unhoused) {
        const list = byHousehold.get(sim.householdId) ?? [];
        list.push({ sim, id: patched.id });
        byHousehold.set(sim.householdId, list);
      }
      matched += 1;
      fromSaveCount += 1;
      continue;
    }
    const found = matchSaveSim(sim, bySaveId, byName, byNameHh, byLast, claimed);
    if (found === 'ambiguous') {
      skipped.push(`${sim.first} ${sim.last}`.trim());
      continue;
    }
    if (found) {
      const onRoster =
        seedNameKeys.has(nameKey(found.first, found.sur)) ||
        seedNameKeys.has(nameKey(sim.first, sim.last));
      const i = nodes.findIndex((n) => n.id === found.id);
      const patched = patchMatched(found, sim, !onRoster, rosterOf(sim), !!parsed.dynasties, boardDynastyIds);
      // A premade by the save's name has no from-save mark, whatever an
      // earlier import thought: one under a married name got it.
      if (seedNameKeys.has(nameKey(sim.first, sim.last))) delete patched.fromSave;
      nodes[i] = patched;
      claimed.add(patched.id);
      bySaveId.set(sim.saveSimId, patched);
      saveIdToBoard.set(sim.saveSimId, patched.id);
      // A box a household may not stay in is no home for its newcomers.
      if (!isUnhousedGid(patched.gid) && (!sim.unhoused || patched.world === OTHER_WORLD)) {
        rememberHome(hhHome, sim, patched);
      }
      if (sim.unhoused && sim.generated) {
        unhousedMatched.push(patched.id);
      } else if (sim.householdId && sim.householdId !== '0') {
        const list = byHousehold.get(sim.householdId) ?? [];
        list.push({ sim, id: patched.id });
        byHousehold.set(sim.householdId, list);
      }
      matched += 1;
      if (patched.fromSave) fromSaveCount += 1;
      continue;
    }
    unmatched.push(sim);
  }

  const movedByHand = input.movedByHand ?? new Set<string>();
  const reference = input.packReference ?? [];
  const atIndex = new Map(nodes.map((n, i) => [n.id, i]));
  const unhousedIds: string[] = [];
  // Sims the game generated, with no home lot: one box in Not in any world.
  // One that sat in a world only stood on a lot there when the game saved.
  for (const id of unhousedMatched) {
    if (movedByHand.has(id)) continue;
    const i = atIndex.get(id)!;
    const n = nodes[i]!;
    const home = unhousedHome(OTHER_WORLD, worlds);
    if (n.gid === home.gid) continue;
    const next = moveIntoUnhoused(n, home);
    // A game taken from the world it left goes with it.
    if (n.world !== OTHER_WORLD) next.pack = packForSaveSim(OTHER_WORLD, nodes, reference);
    nodes[i] = next;
    existingGids.add(home.gid);
    unhousedIds.push(id);
  }

  const gathered = gatherHouseholds(
    nodes,
    byHousehold,
    worlds,
    movedByHand,
    (sim) => homeForNew(sim, worlds, existingGids, hhHome, rosterOf(sim)),
  );
  // New members join the box their household was gathered into, whatever the
  // box is called ("Grove" on the roster, "The Grove Family" in the save), so
  // merging the same save again finds nothing left to gather.
  for (const [householdId, home] of gathered.homes) {
    const sim = byHousehold.get(householdId)![0]!.sim;
    const hh = sim.household.trim() || sim.last.trim() || 'Household';
    hhHome.set(homeKey(householdId, hh, boardWorldName(sim.world, worlds)), home);
  }
  const rehomedSims = [...gathered.moved, ...unhousedIds];

  for (const sim of unmatched) {
    const isOriginal = !seedNameKeys.has(nameKey(sim.first, sim.last));
    const roster = rosterOf(sim);
    const home =
      sim.unhoused && sim.generated
        ? unhousedHome(OTHER_WORLD, worlds)
        : homeForNew(sim, worlds, existingGids, hhHome, roster);
    const made = newSaveNode(
      sim,
      isOriginal,
      home,
      packForSaveSim(home.world, nodes, input.packReference ?? []),
      roster,
    );
    const created = sim.generated ? { ...made, oplay: 'Townie' } : made;
    nodes.push(created);
    claimed.add(created.id);
    bySaveId.set(sim.saveSimId, created);
    saveIdToBoard.set(sim.saveSimId, created.id);
    index(created);
    added += 1;
    if (created.fromSave) fromSaveCount += 1;
  }

  // Relatives the family tree keeps with no sim. A card already standing for
  // one keeps its place; so does a roster placeholder of the same name
  // ("Unknown Hoffman"), which moves into its family's box if it sat apart.
  const relativesAdded: string[] = [];
  const relativesMoved: string[] = [];
  const relativesNamed: string[] = [];
  const relativesDied: string[] = [];
  const cardAt = new Map(nodes.map((n, i) => [n.id, i]));
  const simOnBoard = (saveId: string) => {
    const id = saveIdToBoard.get(saveId);
    return id === undefined ? undefined : nodes[cardAt.get(id)!];
  };
  const shown = treeRelatives(parsed.relatives ?? [], parsed.rels, simOnBoard);
  const byTreeId = new Map(nodes.filter((n) => n.treeId).map((n) => [n.treeId!, n.id]));
  for (const found of shown) {
    // Nameless in the save, named on the roster by the family it links.
    const onRoster =
      !found.name || found.name === UNKNOWN_FIRST
        ? rosterRelative(
            found,
            parsed.rels,
            simOnBoard,
            input.packReference ?? [],
            input.rosterEdges ?? [],
            (n) => (byName.get(nameKey(n.first, n.sur)) ?? []).some((c) => c.saveSimId),
          )
        : undefined;
    const r: ShownRelative = onRoster
      ? {
          ...found,
          name: `${onRoster.first} ${onRoster.sur}`.trim(),
          ...(found.deceased || onRoster.state === DECEASED_STATE || onRoster.state === 'Ghost'
            ? { deceased: true as const }
            : {}),
        }
      : found;
    const home = homeOf(r.kin);
    let id = byTreeId.get(r.treeId);
    // A card made before the board knew its name, never renamed by hand.
    const named = relativeName(r);
    if (id && named.first !== UNKNOWN_FIRST) {
      const i = cardAt.get(id)!;
      if (foldName(nodes[i]!.first) === foldName(UNKNOWN_FIRST)) {
        const card = nodes[i]!;
        // Named now; dead too, unless an import said so before and they were
        // brought back to life by hand since.
        const dies = r.deceased && !card.diedOnImport && (!card.state || card.state === 'Sim');
        nodes[i] = {
          ...card,
          ...named,
          ...(dies ? { state: DECEASED_STATE, diedOnImport: true as const } : {}),
        };
        relativesNamed.push(id);
      }
    }
    // A card from an earlier import, alive then: the save, what
    // inferTreeDeaths works out from it, or the roster's story now says they
    // died. Once only: a life state chosen by hand (a ghost, or alive again
    // after an import said dead) stays.
    if (id && r.deceased) {
      const i = cardAt.get(id)!;
      const card = nodes[i]!;
      if (!card.diedOnImport && (!card.state || card.state === 'Sim')) {
        nodes[i] = { ...card, state: DECEASED_STATE, diedOnImport: true };
        relativesDied.push(id);
      }
    }
    if (!id) {
      // A card standing for them already: the roster's own (Colin Sullivan
      // on a starter board), or its placeholder ("Unknown Hoffman").
      const free = (k: string) =>
        (byName.get(k) ?? []).filter((n) => !claimed.has(n.id) && !n.saveSimId && !n.treeId);
      const placeholders =
        named.first !== UNKNOWN_FIRST && free(nameKey(named.first, named.sur)).length
          ? free(nameKey(named.first, named.sur))
          : free(nameKey(UNKNOWN_FIRST, r.kin.sur));
      if (placeholders.length === 1) {
        const i = cardAt.get(placeholders[0]!.id)!;
        let card: SimNode = { ...nodes[i]!, treeId: r.treeId };
        if (named.first !== UNKNOWN_FIRST) {
          card = { ...card, ...named };
          relativesNamed.push(card.id);
        }
        // The tree knows two genders, so a Non-Binary card stays as it is.
        if (r.gender && card.gender !== NON_BINARY) card.gender = r.gender;
        if (r.deceased) card = { ...card, state: DECEASED_STATE, diedOnImport: true };
        if (card.gid !== home.gid && !movedByHand.has(card.id)) {
          card = moveInto(card, home);
          relativesMoved.push(card.id);
        }
        nodes[i] = card;
        id = card.id;
      }
    }
    if (!id) {
      const made = relativeNode(r, home);
      cardAt.set(made.id, nodes.length);
      nodes.push(made);
      relativesAdded.push(made.id);
      id = made.id;
    }
    claimed.add(id);
    saveIdToBoard.set(r.treeId, id);
  }

  const rehomed = [...rehomedSims, ...relativesMoved, ...filledSlots];
  const vacated = new Set(
    rehomed.map((id) => input.nodes.find((n) => n.id === id)!.gid),
  );
  for (const n of nodes) vacated.delete(n.gid);

  const edges: SourcedEdge[] = input.edges.map((e) => ({
    ...e,
    source: edgeSourceOf(e),
  }));
  const byPair = new Map<string, Edge>();
  for (const e of edges) byPair.set(pairKey(e.type, e.a, e.b), e);

  let confirmed = 0;
  let newLinks = 0;
  /** Links this save calls secret, by pairKey. Others lose a stale flag. */
  const secretKeys = new Set<string>();
  /** Parent links this save calls adopted, by pairKey. Others lose the flag. */
  const adoptedKeys = new Set<string>();

  const applyRel = (rel: ParsedSaveRel) => {
    const a = saveIdToBoard.get(rel.a);
    const b = saveIdToBoard.get(rel.b);
    if (!a || !b) return;
    const type = rel.type as EdgeType;
    if (rel.secret) secretKeys.add(pairKey(type, a, b));
    if (rel.adopted) adoptedKeys.add(pairKey(type, a, b));
    if (type === 'parent') {
      const existing = byPair.get(pairKey('parent', a, b));
      if (existing) {
        if (existing.source === 'planned') {
          existing.source = 'save';
          existing.wasPlanned = true;
          confirmed += 1;
        }
        if (rel.secret) existing.secret = true;
        if (rel.adopted) existing.adopted = true;
        return;
      }
      const edge: SourcedEdge = {
        id: nextEdgeId(),
        a,
        b,
        type: 'parent',
        source: 'save',
        createdAt: now,
        ...(rel.secret ? { secret: true as const } : {}),
        ...(rel.adopted ? { adopted: true as const } : {}),
      };
      edges.push(edge);
      byPair.set(pairKey('parent', a, b), edge);
      newLinks += 1;
      return;
    }
    const pair = uKey(a, b);
    const unions = edges.filter(
      (e) =>
        (e.type === 'marriage' || e.type === 'romance' || e.type === 'divorced') &&
        uKey(e.a, e.b) === pair,
    );
    const planned = unions.filter((e) => e.source === 'planned');
    const settled = unions.filter((e) => e.source !== 'planned');
    // Only the plans this link fulfils are done. A wedding planned for a
    // couple the save has engaged is still to come.
    const done = planned.filter((p) => fulfilsPlan(p.type, type));
    const drop = (list: SourcedEdge[]) => {
      for (const extra of list) {
        const i = edges.indexOf(extra);
        if (i >= 0) edges.splice(i, 1);
      }
    };
    // The save's link, on the board already. An engaged couple the save now
    // has married: their romance becomes the marriage.
    const same =
      settled.find((e) => e.type === type) ??
      (type === 'marriage' ? settled.find((e) => e.type === 'romance') : undefined);
    if (same) {
      if (same.type !== type) {
        same.type = type;
        delete same.secret;
      }
      if (done.length) {
        drop(done);
        same.wasPlanned = true;
        // Your reasons for the plan stay with the link the save confirmed.
        const note = joinNotes(same.note, ...done.map((p) => p.note));
        if (note) same.note = note;
        confirmed += done.length;
      }
      if (rel.secret) {
        for (const u of settled) if (u.type === 'romance') u.secret = true;
      }
      return;
    }
    if (done.length) {
      const keep = done[0]!;
      keep.source = 'save';
      keep.wasPlanned = true;
      delete keep.plan;
      keep.type = type;
      if (rel.secret) keep.secret = true;
      const note = joinNotes(...done.map((p) => p.note));
      if (note) keep.note = note;
      confirmed += 1;
      drop(done.slice(1));
      return;
    }
    // The board has the pair another way (divorced, say): it stays as it is.
    if (settled.length) {
      if (rel.secret) {
        for (const u of settled) if (u.type === 'romance') u.secret = true;
      }
      return;
    }
    const edge: SourcedEdge = {
      id: nextEdgeId(),
      a,
      b,
      type,
      source: 'save',
      createdAt: now,
      ...(rel.secret ? { secret: true as const } : {}),
    };
    edges.push(edge);
    byPair.set(pairKey(type, a, b), edge);
    newLinks += 1;
  };

  for (const rel of parsed.rels) applyRel(rel);

  // The save is the truth about a filled sim's parents: with two from it, a
  // planned parent who is neither of them goes, remembered for Unlink.
  for (const e of overruledParentLinks(edges, claimedSlots)) {
    edges.splice(edges.indexOf(e as SourcedEdge), 1);
    const i = nodes.findIndex((n) => n.id === e.b);
    const was = nodes[i]!.plannedAs!;
    nodes[i] = { ...nodes[i]!, plannedAs: { ...was, parents: [...(was.parents ?? []), e.a] } };
  }

  // A secret the game has since revealed (or never had) drops its flag, but
  // only between sims in this save — the save says nothing about the rest —
  // and not on a link still planned: that secret is the user's plan.
  const inSave = new Set(saveIdToBoard.values());
  for (const e of edges) {
    if (!e.secret || e.source === 'planned' || !inSave.has(e.a) || !inSave.has(e.b)) continue;
    if (!secretKeys.has(pairKey(e.type, e.a, e.b))) delete e.secret;
  }
  // So does an adoption the save no longer has, on the same terms.
  for (const e of edges) {
    if (!e.adopted || e.source === 'planned' || !inSave.has(e.a) || !inSave.has(e.b)) continue;
    if (!adoptedKeys.has(pairKey(e.type, e.a, e.b))) delete e.adopted;
  }

  const pairStatus: PairStatus[] = (input.pairStatus ?? []).filter(
    (p) => !inSave.has(p.a) || !inSave.has(p.b),
  );
  for (const p of parsed.pairs ?? []) {
    const a = saveIdToBoard.get(p.a);
    const b = saveIdToBoard.get(p.b);
    if (a && b && a !== b) pairStatus.push({ a, b, tags: [...p.tags] });
  }

  // A planned divorce or breakup the save shows done: a marriage becomes the
  // game's divorce (your note going with it), a romance goes. One the game
  // hasn't done yet stays planned.
  const tagsOf = new Map(pairStatus.map((p) => [uKey(p.a, p.b), p.tags]));
  const ROMANTIC: readonly PairTag[] = ['married', 'engaged', 'partners', 'secretLovers'];
  for (const e of [...edges]) {
    // A save read without relationship statuses can't say a couple ended.
    if (!e.ending || !parsed.pairs || !inSave.has(e.a) || !inSave.has(e.b)) continue;
    const tags = tagsOf.get(uKey(e.a, e.b)) ?? [];
    const note = joinNotes(e.note, e.ending.note);
    if (e.type === 'divorced' || (e.type === 'marriage' && !tags.includes('married'))) {
      const twin = edges.find((x) => x !== e && x.type === 'divorced' && uKey(x.a, x.b) === uKey(e.a, e.b));
      if (twin) {
        edges.splice(edges.indexOf(e), 1);
        twin.wasPlanned = true;
        if (note) twin.note = note;
      } else {
        e.type = 'divorced';
        e.source = 'save';
        e.wasPlanned = true;
        delete e.ending;
        delete e.secret;
        if (note) e.note = note;
      }
      confirmed += 1;
    } else if (e.type === 'romance' && !tags.some((t) => ROMANTIC.includes(t))) {
      edges.splice(edges.indexOf(e), 1);
      confirmed += 1;
    }
  }

  const parentsByChild = new Map<string, SourcedEdge[]>();
  for (const e of edges) {
    if (e.type !== 'parent' || e.source !== 'save') continue;
    const list = parentsByChild.get(e.b) ?? [];
    list.push(e);
    parentsByChild.set(e.b, list);
  }
  for (const parents of parentsByChild.values()) {
    if (parents.length < 2) continue;
    const bid = parents.find((p) => p.bundleId)?.bundleId ?? nextEdgeId();
    for (const p of parents) p.bundleId = bid;
  }

  const stillPlanned = edges.filter((e) => edgeSourceOf(e) === 'planned').length;
  const secretParents = edges.filter((e) => e.secret && e.type === 'parent').length;
  const secretLovers = edges.filter((e) => e.secret && e.type === 'romance').length;
  const adoptions = edges.filter((e) => e.adopted && e.type === 'parent').length;
  // Where each save household lives, on every card in its box: the game
  // says which lot, and so which neighbourhood. A box the save doesn't
  // place keeps what it had.
  const homeLots = saveHouseholdLots(sims, saveIdToBoard, nodes);
  for (let i = 0; i < nodes.length; i++) {
    const lot = homeLots.get(nodes[i]!.gid);
    if (lot && (nodes[i]!.lot !== lot.name || nodes[i]!.nb !== lot.nb)) {
      nodes[i] = { ...nodes[i]!, lot: lot.name, nb: lot.nb };
    }
  }
  const groups = input.groups
    .filter((g) => !vacated.has(g.gid))
    .map((g) => {
      const lot = homeLots.get(g.gid);
      return lot && (g.lot !== lot.name || g.nb !== lot.nb) ? { ...g, lot: lot.name, nb: lot.nb } : g;
    });
  const gids = new Set(groups.map((g) => g.gid));
  for (const n of nodes) {
    if (gids.has(n.gid)) continue;
    gids.add(n.gid);
    groups.push({
      gid: n.gid,
      hh: n.hh,
      world: n.world,
      nb: n.nb,
      ...(n.lot ? { lot: n.lot } : {}),
      color: n.color,
      x: 0,
      y: 0,
      w: 0,
      h: 0,
    });
  }

  if (parsed.game) {
    const played = new Set(parsed.game.playedHouseholds);
    const at = new Map(nodes.map((n, i) => [n.id, i]));
    for (const sim of sims) {
      const id = saveIdToBoard.get(sim.saveSimId);
      const i = id === undefined ? undefined : at.get(id);
      if (i === undefined) continue;
      const life = lifeFor(sim, parsed.game, played);
      if (life) nodes[i] = { ...nodes[i]!, life };
      else if (nodes[i]!.life) {
        const { life: _old, ...rest } = nodes[i]!;
        nodes[i] = rest;
      }
    }
  }
  if (parsed.dynasties) {
    const followed = followGameDynasties(input.nodes, nodes);
    if (followed !== nodes) nodes.splice(0, nodes.length, ...followed);
    const remembered = rememberFirstHeads(nodes);
    if (remembered !== nodes) nodes.splice(0, nodes.length, ...remembered);
    // A new head: the heir planned after them is the planned heir now.
    const advanced = advanceSuccession(nodes);
    if (advanced !== nodes) nodes.splice(0, nodes.length, ...advanced);
  }
  const saveGame = parsed.game
    ? saveGameFrom(parsed.game, sims, input.game ?? null, input.fileName, input.now)
    : (input.game ?? null);

  const nameOf = (id: string) => {
    const n = nodes.find((x) => x.id === id)!;
    return `${n.first} ${n.sur}`.trim();
  };
  const was = new Map(input.nodes.map((n) => [n.id, n]));
  const after = new Map(nodes.map((n) => [n.id, n]));
  const toNotInWorld = rehomedSims.filter(
    (id) => was.get(id)!.world !== OTHER_WORLD && after.get(id)!.world === OTHER_WORLD,
  );
  const rejoined = gathered.moved.filter((id) => !toNotInWorld.includes(id));
  const worldReport = saveWorldSummary(worlds, worldsFromParsed(parsed));
  // The roster pairs every game with its world, so a game the board has no
  // sims from (Journey to Batuu after a Replace) is still recognised.
  const hidePacks = packsNotInSaveWorlds(
    [...input.nodes, ...(input.packReference ?? [])],
    worldsFromParsed(parsed),
  );

  return {
    nodes,
    edges: sanitizeEdges(edges),
    groups,
    pairStatus,
    saveGame,
    rehomed,
    summary: {
      matched,
      added,
      fromSave: fromSaveCount,
      confirmed,
      newLinks,
      stillPlanned,
      skipped,
      saveWorlds: worldReport.saveWorlds,
      extraWorlds: worldReport.extraWorlds,
      hidePacks,
      secretParents,
      secretLovers,
      adoptions,
      rejoined: rejoined.map(nameOf),
      unhoused: unhousedIds.map(nameOf),
      toNotInWorld: toNotInWorld.map(nameOf),
      relatives: relativesAdded.map(nameOf),
      relativesNamed: relativesNamed.map(nameOf),
      relativesDied: relativesDied.map(nameOf),
      slotsFilled,
      ownSurnames: sims.flatMap((sim) => {
        const id = saveIdToBoard.get(sim.saveSimId);
        if (!id || !sim.marriedLast || foldName(sim.marriedLast) === foldName(sim.last)) return [];
        return [{ name: nameOf(id), married: sim.marriedLast }];
      }),
      notInSave: input.nodes.filter((n) => !claimed.has(n.id)).length,
      gameChanges: parsed.game && input.game ? gameChanges(input.game, saveGame!) : [],
    },
  };
}

/**
 * A sim's age facts from the save: their birth on the game clock, their days
 * into the stage in Normal-lifespan days, and why they were not aging, if so.
 * Pets and sims with no clock data have none.
 */
function lifeFor(sim: ParsedSaveSim, game: ParsedGameInfo, played: ReadonlySet<string>): SimLife | undefined {
  if (sim.species || !sim.age || sim.aliveTicks === undefined || sim.stageDays === undefined) return undefined;
  const frozen = frozenReason({
    played: played.has(sim.householdId),
    active: !!sim.householdId && sim.householdId === game.activeHouseholdId,
    playedAging: game.playedAging,
    unplayedAging: game.unplayedAging,
  });
  return {
    born: game.clock - sim.aliveTicks,
    stageDays: Math.round((sim.stageDays / scaleOf(game.lifespan)) * 1e4) / 1e4,
    stage: sim.age,
    ...(sim.newborn ? { newborn: true as const } : {}),
    ...(sim.bornInPlay ? { inPlay: true as const } : {}),
    at: game.clock,
    ...(frozen ? { frozen } : {}),
  };
}

/** Earlier active households the board remembers (SaveGameInfo.playedBefore). */
const PLAYED_BEFORE_KEPT = 24;

/** The board's record of the save's clock and options after this import. */
function saveGameFrom(
  game: ParsedGameInfo,
  sims: ParsedSaveSim[],
  prev: SaveGameInfo | null,
  fileName: string | undefined,
  now: string,
): SaveGameInfo {
  const active = game.activeHouseholdId
    ? sims.find((s) => s.householdId === game.activeHouseholdId)?.household
    : undefined;
  const next: SaveGameInfo = {
    ...(fileName ? { fileName } : {}),
    importedAt: now,
    clock: game.clock,
    ...(game.lifespan ? { lifespan: game.lifespan } : {}),
    ...(game.seasonDays ? { seasonDays: game.seasonDays } : {}),
    ...(game.playedAging ? { playedAging: game.playedAging } : {}),
    ...(game.unplayedAging !== undefined ? { unplayedAging: game.unplayedAging } : {}),
    ...(active ? { activeHousehold: active } : {}),
  };
  // Who was played at earlier imports, newest first, for Up next.
  const before = [prev?.activeHousehold, ...(prev?.playedBefore ?? [])].filter(
    (h): h is string => !!h && h !== active,
  );
  const playedBefore = [...new Set(before)].slice(0, PLAYED_BEFORE_KEPT);
  if (playedBefore.length) next.playedBefore = playedBefore;
  // From the first import where every household ages, sims at the same place
  // in life grow older together; the board keeps that moment until it ends.
  if (everyoneAges(next)) next.allAgingSince = prev?.allAgingSince ?? game.clock;
  return next;
}

/** Options that changed between two imports, in words. */
function gameChanges(prev: SaveGameInfo, next: SaveGameInfo): string[] {
  const out: string[] = [];
  const onOff = (v?: boolean) => (v === undefined ? 'unknown' : v ? 'On' : 'Off');
  if (prev.lifespan && next.lifespan && prev.lifespan !== next.lifespan) {
    out.push(`Sim Lifespan: ${prev.lifespan} → ${next.lifespan}`);
  }
  if (prev.seasonDays && next.seasonDays && prev.seasonDays !== next.seasonDays) {
    out.push(`Season Length: ${prev.seasonDays} → ${next.seasonDays} days`);
  }
  if (prev.playedAging && next.playedAging && prev.playedAging !== next.playedAging) {
    out.push(
      `Auto Age (Played Households): ${playedAgingText(prev.playedAging)} → ${playedAgingText(next.playedAging)}`,
    );
  }
  if (prev.unplayedAging !== undefined && next.unplayedAging !== undefined && prev.unplayedAging !== next.unplayedAging) {
    out.push(`Auto Age (Unplayed Households): ${onOff(prev.unplayedAging)} → ${onOff(next.unplayedAging)}`);
  }
  return out;
}
