import type {
  DeceasedMark,
  Edge,
  Group,
  HouseholdAgeUp,
  HouseholdMove,
  SimAgeUp,
  SimNode,
  WhiteboardData,
} from '../types/whiteboard.ts';
import { LAYOUT_EPOCH } from './constants.ts';
import { prepareLoadedNodes } from './loadLayout.ts';
import { migrateWhiteboardData } from './utils.ts';

/** localStorage key for the browser draft board. */
export const AUTOSAVE_KEY = 'sims4-family-trees:draft:v1';

/** Wait this long after the last board edit before writing. */
export const AUTOSAVE_DEBOUNCE_MS = 1500;

/** Board fields written by Download JSON and by autosave (plus `savedAt` on drafts). */
export type PersistPayload = {
  layoutEpoch: number;
  /** Last loaded whiteboard JSON filename, if any. */
  sourceFileName: string | null;
  nodes: SimNode[];
  edges: Edge[];
  groups: Group[];
  hiddenPacks: string[];
  hiddenPlay: string[];
  hiAges: string[];
  hiSingle: boolean;
  bloodlineId: string | null;
  householdMoves: HouseholdMove[];
  householdAgeUps: HouseholdAgeUp[];
  deceasedMarks: DeceasedMark[];
  simAgeUps: SimAgeUp[];
  connectionLog: string[];
};

export type AutosaveDraft = PersistPayload & { savedAt: string };

export type WriteDraftResult = 'ok' | 'quota' | 'error';

/** Strip derived geometry — only semantic fields and drag offsets are persisted. */
export function toCore(n: SimNode): SimNode {
  const { x: _x, y: _y, w: _w, h: _h, ...rest } = n;
  return { ...rest, ox: rest.ox ?? 0, oy: rest.oy ?? 0, x: 0, y: 0, w: 0, h: 0 };
}

export function buildPersistPayload(input: {
  nodesCore: SimNode[];
  edges: Edge[];
  groups: Group[];
  hiddenPacks: Iterable<string>;
  hiddenPlay: Iterable<string>;
  hiAges: Iterable<string>;
  hiSingle: boolean;
  bloodlineId: string | null;
  householdMoves: HouseholdMove[];
  householdAgeUps: HouseholdAgeUp[];
  deceasedMarks: DeceasedMark[];
  simAgeUps: SimAgeUp[];
  connectionLog: { text: string }[];
  sourceFileName: string | null;
}): PersistPayload {
  return {
    layoutEpoch: LAYOUT_EPOCH,
    sourceFileName: input.sourceFileName,
    nodes: input.nodesCore.map(toCore),
    edges: input.edges,
    groups: input.groups,
    hiddenPacks: [...input.hiddenPacks],
    hiddenPlay: [...input.hiddenPlay],
    hiAges: [...input.hiAges],
    hiSingle: input.hiSingle,
    bloodlineId: input.bloodlineId,
    householdMoves: input.householdMoves,
    householdAgeUps: input.householdAgeUps,
    deceasedMarks: input.deceasedMarks,
    simAgeUps: input.simAgeUps,
    connectionLog: input.connectionLog.map((entry) => entry.text),
  };
}

function nodeIdentity(n: SimNode) {
  return {
    id: n.id,
    gid: n.gid,
    first: n.first,
    sur: n.sur,
    age: n.age,
    state: n.state,
    gender: n.gender,
    hh: n.hh,
    world: n.world,
    nb: n.nb,
    color: n.color,
    townie: !!n.townie,
    oworld: n.oworld,
    onb: n.onb,
    ohh: n.ohh,
    oplay: n.oplay,
    pack: n.pack,
    ox: n.ox ?? 0,
    oy: n.oy ?? 0,
    species: n.species ?? null,
    breed: n.breed ?? null,
    added: !!n.added,
    saveSimId: n.saveSimId ?? null,
    fromSave: !!n.fromSave,
  };
}

function edgeIdentity(e: Edge) {
  return {
    id: e.id,
    a: e.a,
    b: e.b,
    type: e.type,
    source: e.source ?? (String(e.id).charAt(0) === 'u' ? 'planned' : 'seed'),
    createdAt: e.createdAt ?? null,
    bundleId: e.bundleId ?? null,
  };
}

/** Stable snapshot of the fields Reset the board would restore. */
export function boardIdentity(payload: PersistPayload): string {
  return JSON.stringify({
    sourceFileName: payload.sourceFileName,
    nodes: (payload.nodes ?? []).map(nodeIdentity).sort((a, b) => a.id.localeCompare(b.id)),
    edges: (payload.edges ?? []).map(edgeIdentity).sort((a, b) => a.id.localeCompare(b.id)),
    groups: (payload.groups ?? [])
      .map((g) => ({
        gid: g.gid,
        hh: g.hh,
        world: g.world,
        nb: g.nb,
        color: g.color,
      }))
      .sort((a, b) => a.gid.localeCompare(b.gid)),
    hiddenPacks: [...(payload.hiddenPacks ?? [])].sort(),
    hiddenPlay: [...(payload.hiddenPlay ?? [])].sort(),
    hiAges: [...(payload.hiAges ?? [])].sort(),
    hiSingle: !!payload.hiSingle,
    bloodlineId: payload.bloodlineId ?? null,
    householdMoves: payload.householdMoves ?? [],
    householdAgeUps: payload.householdAgeUps ?? [],
    deceasedMarks: payload.deceasedMarks ?? [],
    simAgeUps: payload.simAgeUps ?? [],
  });
}

/** Persist shape of the shipped fodder board (after the same migrate/toCore path as boot). */
export function persistPayloadFromSeed(seed: WhiteboardData): PersistPayload {
  const migrated = migrateWhiteboardData(seed);
  return buildPersistPayload({
    nodesCore: migrated.nodes.map(toCore),
    edges: migrated.edges,
    groups: (migrated.groups ?? []).map((g) => ({ ...g })),
    hiddenPacks: migrated.hiddenPacks ?? [],
    hiddenPlay: migrated.hiddenPlay ?? [],
    hiAges: migrated.hiAges ?? [],
    hiSingle: !!migrated.hiSingle,
    bloodlineId: migrated.bloodlineId ?? null,
    householdMoves: migrated.householdMoves ?? [],
    householdAgeUps: migrated.householdAgeUps ?? [],
    deceasedMarks: migrated.deceasedMarks ?? [],
    simAgeUps: migrated.simAgeUps ?? [],
    connectionLog: [],
    sourceFileName: null,
  });
}

/** True when Reset would be a no-op: current persist matches the built-in board. */
export function boardMatchesBuiltIn(
  payload: PersistPayload,
  seed: WhiteboardData,
): boolean {
  return boardIdentity(payload) === boardIdentity(persistPayloadFromSeed(seed));
}

function storage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

/** Read the browser draft, or null if missing / unreadable. */
export function readDraft(store: Storage | null = storage()): AutosaveDraft | null {
  if (!store) return null;
  try {
    const raw = store.getItem(AUTOSAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AutosaveDraft>;
    if (!parsed || !Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
      return null;
    }
    return parsed as AutosaveDraft;
  } catch {
    return null;
  }
}

/** Write the browser draft. Returns ok / quota / error. */
export function writeDraft(
  payload: PersistPayload,
  store: Storage | null = storage(),
  now: () => string = () => new Date().toISOString(),
): WriteDraftResult {
  if (!store) return 'error';
  const draft: AutosaveDraft = { ...payload, savedAt: now() };
  try {
    store.setItem(AUTOSAVE_KEY, JSON.stringify(draft));
    return 'ok';
  } catch (err) {
    const name =
      err && typeof err === 'object' && 'name' in err
        ? String((err as { name: string }).name)
        : '';
    if (name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED') {
      return 'quota';
    }
    return 'error';
  }
}

export function clearDraft(store: Storage | null = storage()): void {
  if (!store) return;
  try {
    store.removeItem(AUTOSAVE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Prefer the browser draft when present; otherwise the bundled seed.
 * Worlds always come from the seed (downloads do not carry the world palette).
 * Skewed pre-epoch drafts are re-packed so a broken Load does not stick forever.
 */
export function bootWhiteboardData(
  seed: WhiteboardData,
  store: Storage | null = storage(),
): { fromDraft: boolean; data: WhiteboardData; repacked: boolean } {
  const draft = readDraft(store);
  if (!draft) {
    return { fromDraft: false, data: seed, repacked: false };
  }
  // An autosave of the unaltered fodder board is not a user draft.
  if (boardMatchesBuiltIn(draft, seed)) {
    return { fromDraft: false, data: seed, repacked: false };
  }
  const prepared = prepareLoadedNodes(draft.nodes, draft.layoutEpoch, seed.worlds, draft.edges);
  return {
    fromDraft: true,
    repacked: prepared.repacked,
    data: {
      ...seed,
      layoutEpoch: LAYOUT_EPOCH,
      sourceFileName: draft.sourceFileName ?? null,
      nodes: prepared.nodes,
      edges: draft.edges,
      groups: draft.groups?.length ? draft.groups : seed.groups,
      hiddenPacks: draft.hiddenPacks,
      hiddenPlay: draft.hiddenPlay,
      hiAges: draft.hiAges,
      hiSingle: draft.hiSingle,
      bloodlineId: draft.bloodlineId,
      householdMoves: draft.householdMoves,
      householdAgeUps: draft.householdAgeUps,
      deceasedMarks: draft.deceasedMarks,
      simAgeUps: draft.simAgeUps,
      connectionLog: draft.connectionLog,
    },
  };
}
