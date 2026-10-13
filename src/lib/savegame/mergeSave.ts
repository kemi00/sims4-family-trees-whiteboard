import { DECEASED_STATE, UNHOUSED_HH } from '../constants.ts';
import { OTHER_WORLD } from '../layout.ts';
import { isUnhousedGid, unhousedGid } from '../unhoused.ts';
import { edgeSourceOf, sanitizeEdges, uKey, worldColor } from '../utils.ts';
import type {
  Edge,
  EdgeType,
  Group,
  PairStatus,
  SimNode,
  World,
} from '../../types/whiteboard.ts';
import {
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
  /** Sims moved into the box that holds the rest of their save household. */
  rejoined: string[];
  /** Sims the game generated, put in the Unhoused sims box. */
  unhoused: string[];
  /** Sims with no home lot moved out of a world into Not in any world. */
  toNotInWorld: string[];
  /** Unknown cards added for family-tree relatives with no sim (see treeRelatives). */
  relatives: string[];
  /** Board cards this save has no sim or relative for; Merge leaves them as they are. */
  notInSave: number;
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
  /** Sims the player moved to another household by hand; Merge keeps them there. */
  movedByHand?: ReadonlySet<string>;
  now: string;
  nextEdgeId: () => string;
};

export type SaveMergeResult = {
  nodes: SimNode[];
  edges: Edge[];
  groups: Group[];
  pairStatus: PairStatus[];
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
  sim: ParsedSaveSim,
  fromSave: boolean,
  home: BoardHome,
  pack: string,
  /** The premade's roster card: what the save leaves out comes from it. */
  roster?: SimNode,
): SimNode {
  const made = plainSaveNode(sim, fromSave, home, pack);
  if (!roster || !!roster.species !== !!sim.species) return made;
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
  sim: ParsedSaveSim,
  fromSave: boolean,
  home: BoardHome,
  pack: string,
): SimNode {
  return {
    id: `s${sim.saveSimId}`,
    gid: home.gid,
    first: sim.first,
    sur: sim.last,
    age: sim.age,
    state: sim.species ? 'Pet' : 'Sim',
    gender: sim.gender,
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
  };
}

function patchMatched(n: SimNode, sim: ParsedSaveSim, fromSave: boolean): SimNode {
  const next: SimNode = {
    ...n,
    first: sim.first || n.first,
    sur: sim.last || n.sur,
    saveSimId: sim.saveSimId,
  };
  if (sim.age) next.age = sim.age;
  if (sim.gender) next.gender = sim.gender;
  if (sim.species) {
    next.species = sim.species;
    next.state = 'Pet';
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

/** First name on a relative's card: the save holds no name for them. */
export const UNKNOWN_FIRST = 'Unknown';

function relativeNode(r: ShownRelative, home: BoardHome): SimNode {
  return {
    id: `t${r.treeId}`,
    gid: home.gid,
    first: UNKNOWN_FIRST,
    sur: r.kin.sur,
    age: 'Unknown',
    state: r.deceased ? DECEASED_STATE : 'Sim',
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

export function mergeSaveIntoBoard(input: SaveMergeInput): SaveMergeResult {
  const { parsed, seedNameKeys, now, nextEdgeId, worlds } = input;
  const nodes = input.nodes.map((n) => ({ ...n }));
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
  const unmatched: ParsedSaveSim[] = [];
  /** Save household id → its sims matched to board cards. */
  const byHousehold = new Map<string, { sim: ParsedSaveSim; id: string }[]>();
  const unhousedMatched: string[] = [];
  let matched = 0;
  let added = 0;
  let fromSaveCount = 0;

  for (const sim of parsed.sims) {
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
      const patched = patchMatched(found, sim, !onRoster);
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
  const cardAt = new Map(nodes.map((n, i) => [n.id, i]));
  const simOnBoard = (saveId: string) => {
    const id = saveIdToBoard.get(saveId);
    return id === undefined ? undefined : nodes[cardAt.get(id)!];
  };
  const shown = treeRelatives(parsed.relatives ?? [], parsed.rels, simOnBoard);
  const byTreeId = new Map(nodes.filter((n) => n.treeId).map((n) => [n.treeId!, n.id]));
  for (const r of shown) {
    const home = homeOf(r.kin);
    let id = byTreeId.get(r.treeId);
    if (!id) {
      const placeholders = (byName.get(nameKey(UNKNOWN_FIRST, r.kin.sur)) ?? []).filter(
        (n) => !claimed.has(n.id) && !n.saveSimId && !n.treeId,
      );
      if (placeholders.length === 1) {
        const i = cardAt.get(placeholders[0]!.id)!;
        let card: SimNode = { ...nodes[i]!, treeId: r.treeId };
        if (r.gender) card.gender = r.gender;
        if (r.deceased) card.state = DECEASED_STATE;
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

  const rehomed = [...rehomedSims, ...relativesMoved];
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

  const applyRel = (rel: ParsedSaveRel) => {
    const a = saveIdToBoard.get(rel.a);
    const b = saveIdToBoard.get(rel.b);
    if (!a || !b) return;
    const type = rel.type as EdgeType;
    if (rel.secret) secretKeys.add(pairKey(type, a, b));
    if (type === 'parent') {
      const existing = byPair.get(pairKey('parent', a, b));
      if (existing) {
        if (existing.source === 'planned') {
          existing.source = 'save';
          confirmed += 1;
        }
        if (rel.secret) existing.secret = true;
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
    const drop = (list: SourcedEdge[]) => {
      for (const extra of list) {
        const i = edges.indexOf(extra);
        if (i >= 0) edges.splice(i, 1);
      }
    };
    if (settled.length) {
      if (planned.length) {
        drop(planned);
        confirmed += planned.length;
      }
      if (rel.secret) {
        for (const u of settled) if (u.type === 'romance') u.secret = true;
      }
      return;
    }
    if (planned.length) {
      const keep = planned[0]!;
      keep.source = 'save';
      keep.type = type;
      if (rel.secret) keep.secret = true;
      confirmed += 1;
      drop(planned.slice(1));
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

  // A secret the game has since revealed (or never had) drops its flag, but
  // only between sims in this save — the save says nothing about the rest.
  const inSave = new Set(saveIdToBoard.values());
  for (const e of edges) {
    if (!e.secret || !inSave.has(e.a) || !inSave.has(e.b)) continue;
    if (!secretKeys.has(pairKey(e.type, e.a, e.b))) delete e.secret;
  }

  const pairStatus: PairStatus[] = (input.pairStatus ?? []).filter(
    (p) => !inSave.has(p.a) || !inSave.has(p.b),
  );
  for (const p of parsed.pairs ?? []) {
    const a = saveIdToBoard.get(p.a);
    const b = saveIdToBoard.get(p.b);
    if (a && b && a !== b) pairStatus.push({ a, b, tags: [...p.tags] });
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
  const groups = input.groups.filter((g) => !vacated.has(g.gid));
  const gids = new Set(groups.map((g) => g.gid));
  for (const n of nodes) {
    if (gids.has(n.gid)) continue;
    gids.add(n.gid);
    groups.push({
      gid: n.gid,
      hh: n.hh,
      world: n.world,
      nb: n.nb,
      color: n.color,
      x: 0,
      y: 0,
      w: 0,
      h: 0,
    });
  }

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
  const hidePacks = packsNotInSaveWorlds(input.nodes, worldsFromParsed(parsed));

  return {
    nodes,
    edges: sanitizeEdges(edges),
    groups,
    pairStatus,
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
      rejoined: rejoined.map(nameOf),
      unhoused: unhousedIds.map(nameOf),
      toNotInWorld: toNotInWorld.map(nameOf),
      relatives: relativesAdded.map(nameOf),
      notInSave: input.nodes.filter((n) => !claimed.has(n.id)).length,
    },
  };
}
