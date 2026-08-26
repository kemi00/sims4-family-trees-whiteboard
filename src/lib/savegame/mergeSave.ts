import { OTHER_WORLD } from '../layout.ts';
import { edgeSourceOf, sanitizeEdges, uKey, worldColor } from '../utils.ts';
import type { Edge, EdgeType, Group, SimNode, World } from '../../types/whiteboard.ts';
import type { ParsedSave, ParsedSaveRel, ParsedSaveSim } from './parseSave.ts';

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
};

export type SaveMergeInput = {
  nodes: SimNode[];
  edges: Edge[];
  groups: Group[];
  worlds: World[];
  parsed: ParsedSave;
  seedNameKeys: Set<string>;
  now: string;
  nextEdgeId: () => string;
};

export type SaveMergeResult = {
  nodes: SimNode[];
  edges: Edge[];
  groups: Group[];
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

function newSaveNode(
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
    nb: '-',
    color: worldColor(world, worlds),
  };
  hhHome.set(key, home);
  existingGids.add(gid);
  return home;
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

  const saveIdToBoard = new Map<string, string>();
  const claimed = new Set<string>();
  const hhHome = new Map<string, BoardHome>();
  const existingGids = new Set(nodes.map((n) => n.gid));
  const skipped: string[] = [];
  const unmatched: ParsedSaveSim[] = [];
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
      rememberHome(hhHome, sim, patched);
      matched += 1;
      if (patched.fromSave) fromSaveCount += 1;
      continue;
    }
    unmatched.push(sim);
  }

  for (const sim of unmatched) {
    const isOriginal = !seedNameKeys.has(nameKey(sim.first, sim.last));
    const home = homeForNew(sim, worlds, existingGids, hhHome);
    const created = newSaveNode(
      sim,
      isOriginal,
      home,
      packForWorld(home.world, nodes),
    );
    nodes.push(created);
    claimed.add(created.id);
    bySaveId.set(sim.saveSimId, created);
    saveIdToBoard.set(sim.saveSimId, created.id);
    index(created);
    added += 1;
    if (created.fromSave) fromSaveCount += 1;
  }

  const edges: SourcedEdge[] = input.edges.map((e) => ({
    ...e,
    source: edgeSourceOf(e),
  }));
  const byPair = new Map<string, Edge>();
  for (const e of edges) byPair.set(pairKey(e.type, e.a, e.b), e);

  let confirmed = 0;
  let newLinks = 0;

  const applyRel = (rel: ParsedSaveRel) => {
    const a = saveIdToBoard.get(rel.a);
    const b = saveIdToBoard.get(rel.b);
    if (!a || !b) return;
    const type = rel.type as EdgeType;
    if (type === 'parent') {
      const existing = byPair.get(pairKey('parent', a, b));
      if (existing) {
        if (existing.source === 'planned') {
          existing.source = 'save';
          confirmed += 1;
        }
        return;
      }
      const edge: SourcedEdge = {
        id: nextEdgeId(),
        a,
        b,
        type: 'parent',
        source: 'save',
        createdAt: now,
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
      return;
    }
    if (planned.length) {
      const keep = planned[0]!;
      keep.source = 'save';
      keep.type = type;
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
    };
    edges.push(edge);
    byPair.set(pairKey(type, a, b), edge);
    newLinks += 1;
  };

  for (const rel of parsed.rels) applyRel(rel);

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
  const groups = [...input.groups];
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

  const worldReport = saveWorldSummary(worlds, worldsFromParsed(parsed));
  const hidePacks = packsNotInSaveWorlds(input.nodes, worldsFromParsed(parsed));

  return {
    nodes,
    edges: sanitizeEdges(edges),
    groups,
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
    },
  };
}
