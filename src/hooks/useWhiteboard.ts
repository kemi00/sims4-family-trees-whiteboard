import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import seedData from '../data/whiteboard.json';
import { ADDED_HOUSEHOLD, AGES_H, DECEASED_STATE, FOCUS_SIM_K, STATUS_FLASH_MS, UEDIT } from '../lib/constants.ts';
import {
  AUTOSAVE_DEBOUNCE_MS,
  AUTOSAVE_KEY,
  boardMatchesBuiltIn,
  bootWhiteboardData,
  buildPersistPayload,
  createDraftGuard,
  toCore,
  type DraftGuard,
} from '../lib/autosave.ts';
import { trackAction } from '../lib/analytics.ts';
import { jsonLoadTargets, pinCoreToTargets, prepareLoadedNodes, saveImportCore, separateLoadOverlaps, shouldRepackOffsets, withReadableHouseholdNames } from '../lib/loadLayout.ts';
import { fileFilters, filterChangeNote, loadJsonRisk, type BoardFilters, type LoadJsonRisk } from '../lib/loadJsonRisk.ts';
import { mergeJsonIntoBoard } from '../lib/mergeJson.ts';
import {
  bbox,
  cardOriginAtViewportCenter,
  coreOffsetsAfterImportSeparation,
  coreOffsetsAfterWorldSeparation,
  introducedWorldNames,
  dominantWorldInViewport,
  snapHouseholdDelta,
  snapPosition,
  zoomFloor,
  zoomViewportAt,
  type SnapSticky,
} from '../lib/geometry.ts';
import { bucketNodes } from '../lib/nodeIndex.ts';
import {
  bloodVerts,
  computeEdgeRenderData,
  EMPTY_EDGE_DATA,
  hopD,
  RouteCache,
} from '../lib/routing.ts';
import {
  computeLayout,
  householdAddSpot,
  layoutBases,
  measureCard,
  OTHER_WORLD,
  rowPitch,
  spawnChildOrigin,
} from '../lib/layout.ts';
import { householdChrome, snapNodesToTiles, tileSnapOrigin } from '../lib/tiles.ts';
import { lineageIds } from '../lib/bloodline.ts';
import {
  buildConnectionLog,
  householdAgeUpLine,
  householdPlace,
  simName,
} from '../lib/connectionLog.ts';
import { fileStamp, isUserE, migrateWhiteboardData, nextEidc, ageUpPatch, isLaterSimAge, parentLinkMakesCycle, partneredIdSet, randomNewSimGender, sanitizeEdges, siblingsShareParents, worldColor } from '../lib/utils.ts';
import { parseSaveGame, type ParsedSave } from '../lib/savegame/parseSave.ts';
import {
  fillMissingSavePacks,
  hiddenPacksAfterImport,
  isStarterBoard,
  mergeSaveIntoBoard,
  seedNameKeysFromNodes,
  type SaveMergeResult,
} from '../lib/savegame/mergeSave.ts';
import type {
  BoardMultiSel,
  ConnectChoice,
  ConnSrc,
  DeceasedMark,
  Edge,
  Group,
  HouseholdAgeUp,
  HouseholdMove,
  PairStatus,
  Selection,
  ShowToggles,
  SimAgeUp,
  SimNode,
  Viewport,
  WhiteboardData,
  World,
} from '../types/whiteboard.ts';
import { indexPairStatus, mergePairStatus } from '../lib/pairStatus.ts';
import { withoutSecretLinks, withoutSecretStatus } from '../lib/secrets.ts';
import { familyOf, linksInView, type LinksView } from '../lib/family.ts';

const INITIAL_VIEW: Viewport = { tx: 40, ty: 40, k: 0.72 };

/** The link each connect choice adds, from the first sim clicked to the second (flip: the other way). */
const CONNECT_LINKS: Record<
  Exclude<ConnectChoice, 'coparents'>,
  { type: Edge['type']; flip?: true; secret?: true }
> = {
  marriage: { type: 'marriage' },
  romance: { type: 'romance' },
  secretromance: { type: 'romance', secret: true },
  divorced: { type: 'divorced' },
  parent: { type: 'parent' },
  secretparent: { type: 'parent', secret: true },
  childof: { type: 'parent', flip: true },
  secretchildof: { type: 'parent', flip: true, secret: true },
  sibling: { type: 'sibling' },
  custom: { type: 'custom' },
};

function simCentroid(
  ids: string[],
  byid: Record<string, SimNode>,
): { ids: string[]; x: number; y: number } | null {
  const pts = ids
    .map((id) => byid[id])
    .filter((n): n is SimNode => !!n);
  if (!pts.length) return null;
  return {
    ids: pts.map((n) => n.id),
    x: pts.reduce((s, n) => s + n.x + n.w / 2, 0) / pts.length,
    y: pts.reduce((s, n) => s + n.y + n.h / 2, 0) / pts.length,
  };
}

const LINKS_STATUS: Record<LinksView, string> = {
  all: 'Family links: all — parent, sibling, and partner lines',
  inside: 'Family links: only inside households — lines between households hide',
  none: 'Family links: hidden — cards stay, relationship lines hide',
};

const LAYER_STATUS: Record<keyof ShowToggles, { on: string; off: string }> = {
  groups: {
    on: 'Household boxes on — dashed boxes around each house',
    off: 'Household boxes off — house outlines hide',
  },
  worlds: {
    on: 'World boxes on — coloured frames around each world',
    off: 'World boxes off — world frames hide',
  },
};

type BoardSnap = {
  nodesCore: SimNode[];
  edges: Edge[];
  groups: Group[];
  householdMoves: HouseholdMove[];
  householdAgeUps: HouseholdAgeUp[];
  deceasedMarks: DeceasedMark[];
  simAgeUps: SimAgeUp[];
  pairStatus: PairStatus[];
  /** Set only by actions that change filters, so only their undo restores them. */
  filters?: BoardFilters;
};

/** Fields that change packing (generation rows, household tiles, world columns). */
const LAYOUT_PIN_KEYS: (keyof SimNode)[] = [
  'gid',
  'world',
  'hh',
  'age',
  'breed',
  'oplay',
  // Living sims are counted to order the world columns.
  'state',
];

export function useWhiteboard() {
  const seed = seedData as WhiteboardData;
  const bootRef = useRef<{
    fromDraft: boolean;
    repacked: boolean;
    data: WhiteboardData;
    stamp: string | null;
  } | null>(null);
  if (!bootRef.current) {
    const raw = bootWhiteboardData(seed);
    const migrated = migrateWhiteboardData(raw.data);
    const bootWorlds = migrated.worlds ?? seed.worlds;
    const named = withReadableHouseholdNames({
      core: fillMissingSavePacks(migrated.nodes, seed.nodes),
      groups: migrated.groups ?? seed.groups,
      worlds: bootWorlds,
      edges: sanitizeEdges(migrated.edges),
    });
    bootRef.current = {
      fromDraft: raw.fromDraft,
      repacked: raw.repacked,
      stamp: raw.stamp,
      data: {
        ...migrated,
        nodes: named.core,
        groups: named.groups,
        worlds: bootWorlds,
      },
    };
  }
  const boot = bootRef.current.data;
  const bootRepacked = bootRef.current.repacked;
  const bootFromDraft = bootRef.current.fromDraft;
  const [sourceFileName, setSourceFileName] = useState<string | null>(
    () => boot.sourceFileName ?? null,
  );
  /** True when the session started from (or still represents) a browser draft without a file name. */
  const [fromBrowserDraft, setFromBrowserDraft] = useState(bootFromDraft);
  /** Every write to the shared browser draft goes through this (see createDraftGuard). */
  const draftGuardRef = useRef<DraftGuard | null>(null);
  if (!draftGuardRef.current) {
    const tab = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
    draftGuardRef.current = createDraftGuard(tab, bootRef.current.stamp);
  }
  /** Another tab saved the board since this one loaded it, so this tab stopped saving. */
  const [staleTab, setStaleTab] = useState(false);
  const [nodesCore, setNodesCore] = useState<SimNode[]>(() =>
    boot.nodes.map((n) => toCore(n)),
  );
  const [edges, setEdges] = useState<Edge[]>(() =>
    sanitizeEdges(
      boot.edges.map((e) => ({
        ...e,
        source: e.source ?? (String(e.id).charAt(0) === 'u' ? 'planned' : 'seed'),
      })),
    ),
  );
  const [groups, setGroups] = useState<Group[]>(() =>
    (boot.groups ?? seed.groups).map((g) => ({ ...g })),
  );
  const [worlds] = useState<World[]>(seed.worlds);
  const [hiddenPacks, setHiddenPacks] = useState<Set<string>>(
    () => new Set(boot.hiddenPacks || []),
  );
  const [hiddenPlay, setHiddenPlay] = useState<Set<string>>(
    () => new Set(boot.hiddenPlay || []),
  );
  const [show, setShow] = useState<ShowToggles>({
    groups: true,
    worlds: true,
  });
  const [linksView, setLinksViewState] = useState<LinksView>('all');
  /** Highlight the selected sim's family (familyOf), whoever is selected. */
  const [familyFocus, setFamilyFocusState] = useState(false);
  const [viewport, setViewport] = useState<Viewport>(INITIAL_VIEW);
  const [sel, setSel] = useState<Selection>(null);
  const [connectMode, setConnectModeState] = useState(false);
  const [selectMode, setSelectModeState] = useState(false);
  const [multiSel, setMultiSel] = useState<BoardMultiSel | null>(null);
  const [connSrc, setConnSrc] = useState<ConnSrc>(null);
  const [snap, setSnap] = useState(true);
  const [hiAges, setHiAges] = useState<Set<string>>(
    () => new Set(boot.hiAges || []),
  );
  const [hiSingle, setHiSingle] = useState(() => !!boot.hiSingle);
  /** Hide secrets filter: secret lovers and secret parents stay off the board. */
  const [hideSecrets, setHideSecrets] = useState(() => !!boot.hideSecrets);
  const [bloodlineId, setBloodlineId] = useState<string | null>(() => {
    if (boot.bloodlineId && boot.nodes.some((n) => n.id === boot.bloodlineId)) {
      return boot.bloodlineId;
    }
    return null;
  });
  const [status, setStatus] = useState('');
  const [fastRoute, setFastRoute] = useState(false);
  const [skipRoute, setSkipRoute] = useState(false);
  const [editNodeId, setEditNodeId] = useState<string | null>(null);
  const [gamesOpen, setGamesOpen] = useState(false);
  const [agesOpen, setAgesOpen] = useState(false);
  const [playOpen, setPlayOpen] = useState(false);
  const [connectMenu, setConnectMenu] = useState<{
    a: string;
    b: string;
    x: number;
    y: number;
  } | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [householdMoves, setHouseholdMoves] = useState<HouseholdMove[]>(
    () => boot.householdMoves ?? [],
  );
  const [householdAgeUps, setHouseholdAgeUps] = useState<HouseholdAgeUp[]>(
    () => boot.householdAgeUps ?? [],
  );
  const [deceasedMarks, setDeceasedMarks] = useState<DeceasedMark[]>(
    () => boot.deceasedMarks ?? [],
  );
  const [simAgeUps, setSimAgeUps] = useState<SimAgeUp[]>(
    () => boot.simAgeUps ?? [],
  );
  /** Relationship statuses from the last save import, for link labels. */
  const [pairStatus, setPairStatus] = useState<PairStatus[]>(
    () => boot.pairStatus ?? [],
  );
  const pairIndex = useMemo(
    () => indexPairStatus(hideSecrets ? withoutSecretStatus(pairStatus) : pairStatus),
    [pairStatus, hideSecrets],
  );
  const [saveImport, setSaveImport] = useState<{
    merge: SaveMergeResult;
    parsed: ParsedSave;
    /** The board is still the starter roster, so Replace is picked. */
    starter: boolean;
  } | null>(null);
  const [pendingLoadJson, setPendingLoadJson] = useState<{
    file: File;
    /** Read once up front, so confirming does not re-read the file. */
    text: string;
    svgWidth: number;
    svgHeight: number;
    risk: LoadJsonRisk;
    /** File is too old to restore card placements; the board gets re-packed. */
    willRepack: boolean;
    /** How merging would change the filters on screen; null when it would not. */
    filtersNote: string | null;
  } | null>(null);
  const [searchHits, setSearchHits] = useState<string[]>([]);
  const [searchHitIndex, setSearchHitIndex] = useState(0);
  const [infantHouseMenu, setInfantHouseMenu] = useState<{
    pa: string;
    pb: string;
    rx: number;
    ry: number;
    x: number;
    y: number;
  } | null>(null);
  const eidcRef = useRef(
    nextEidc(
      boot.edges,
      100000,
      [
        ...(boot.householdMoves ?? []).map((m) => m.id),
        ...(boot.householdAgeUps ?? []).map((a) => a.id),
        ...(boot.deceasedMarks ?? []).map((m) => m.id),
        ...(boot.simAgeUps ?? []).map((a) => a.id),
      ],
    ),
  );
  const undoRef = useRef<BoardSnap[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const statusFlashRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectModeRef = useRef(connectMode);
  connectModeRef.current = connectMode;
  const viewAnchorRef = useRef<{
    ids: string[];
    x: number;
    y: number;
  } | null>(null);

  /** Positions and card sizes are derived on every render from layout rules. */
  const nodes = useMemo(() => {
    const laid = computeLayout(nodesCore, worlds, edges);
    return snap ? snapNodesToTiles(laid) : laid;
  }, [nodesCore, worlds, edges, snap]);

  const byid = useMemo(() => {
    const m: Record<string, SimNode> = {};
    nodes.forEach((n) => {
      m[n.id] = n;
    });
    return m;
  }, [nodes]);

  const frameSim = useCallback(
    (n: SimNode, svgWidth: number, svgHeight: number) => {
      const k = FOCUS_SIM_K;
      setViewport({
        k,
        tx: svgWidth / 2 - (n.x + n.w / 2) * k,
        ty: svgHeight / 2 - (n.y + n.h / 2) * k,
      });
    },
    [],
  );

  /**
   * New family links reflow household packing. If cards still shifted after
   * ox/oy pinning, pan so the linked sims stay on screen.
   */
  useLayoutEffect(() => {
    const lock = viewAnchorRef.current;
    if (!lock) return;
    const next = simCentroid(lock.ids, byid);
    if (!next) {
      viewAnchorRef.current = null;
      return;
    }
    const dx = lock.x - next.x;
    const dy = lock.y - next.y;
    viewAnchorRef.current = null;
    if (dx === 0 && dy === 0) return;
    setViewport((v) => ({
      ...v,
      tx: v.tx + dx * v.k,
      ty: v.ty + dy * v.k,
    }));
  }, [byid]);

  const packVis = useCallback(
    (n: SimNode) => !!n && !hiddenPacks.has(n.pack),
    [hiddenPacks],
  );

  const playVis = useCallback(
    (n: SimNode) => !!n && !hiddenPlay.has(n.oplay),
    [hiddenPlay],
  );

  /** Combined pack + playability visibility for canvas rendering. */
  const nodeVis = useCallback(
    (n: SimNode) => packVis(n) && playVis(n),
    [packVis, playVis],
  );

  /**
   * Links as the board shows them. Hide secrets drops secret ones here, for
   * drawing, labels, the log and bloodline — but layout still uses every
   * link, so turning the filter on or off never moves a card.
   */
  const shownEdges = useMemo(
    () => (hideSecrets ? withoutSecretLinks(edges) : edges),
    [edges, hideSecrets],
  );
  const hasSecrets = useMemo(() => edges.some((e) => e.secret), [edges]);

  // Routes from the last pass; an edit re-routes only the links it can reach.
  const familyId =
    familyFocus && sel?.type === 'node' && byid[sel.id] ? sel.id : null;
  const family = useMemo(
    () => (familyId ? familyOf(familyId, shownEdges) : null),
    [familyId, shownEdges],
  );
  /** The highlighted family, the sim included: everyone else dims. */
  const familyIds = useMemo(
    () => (family ? new Set([family.id, ...family.roles.keys()]) : null),
    [family],
  );
  /** Links drawn in the current view; a highlighted family's always are. */
  const viewEdges = useMemo(
    () => linksInView(shownEdges, (id) => byid[id]?.gid, linksView, family?.edgeIds),
    [shownEdges, byid, linksView, family],
  );

  const [routeCache] = useState(() => new RouteCache());
  const edgeData = useMemo(
    () =>
      skipRoute
        ? EMPTY_EDGE_DATA
        : computeEdgeRenderData({
            nodes,
            edges: viewEdges,
            groups,
            show,
            packVis: nodeVis,
            fastRoute,
            cache: routeCache,
          }),
    [nodes, viewEdges, groups, show, nodeVis, fastRoute, skipRoute, routeCache],
  );

  const nodeBuckets = useMemo(() => bucketNodes(nodes), [nodes]);

  const bloodVertsMemo = useMemo(
    () => bloodVerts(edgeData.blood),
    [edgeData.blood],
  );

  const visibleNodes = useMemo(
    () => nodes.filter(nodeVis),
    [nodes, nodeVis],
  );

  const liveWorlds = useMemo(
    () => new Set(visibleNodes.map((n) => n.world)),
    [visibleNodes],
  );

  const partneredIds = useMemo(() => partneredIdSet(shownEdges), [shownEdges]);

  const connectionLog = useMemo(
    () =>
      buildConnectionLog(
        shownEdges,
        byid,
        householdMoves,
        householdAgeUps,
        deceasedMarks,
        simAgeUps,
      ),
    [shownEdges, byid, householdMoves, householdAgeUps, deceasedMarks, simAgeUps],
  );

  const bloodlineIds = useMemo(
    () => (bloodlineId ? lineageIds(bloodlineId, shownEdges) : null),
    [bloodlineId, shownEdges],
  );

  const flashStatus = useCallback((msg: string) => {
    if (statusFlashRef.current != null) clearTimeout(statusFlashRef.current);
    setStatus(msg);
    statusFlashRef.current = setTimeout(() => {
      statusFlashRef.current = null;
      setStatus((cur) => {
        if (cur !== msg) return cur;
        return connectModeRef.current
          ? 'Connect: click the FIRST sim'
          : '';
      });
    }, STATUS_FLASH_MS);
  }, []);

  useEffect(() => {
    if (!bootRepacked) return;
    flashStatus(
      'Older save — board re-packed for the current layout. Download JSON to keep it.',
    );
  }, [bootRepacked, flashStatus]);

  const persistPayload = useCallback(
    () =>
      buildPersistPayload({
        nodesCore,
        edges,
        groups,
        hiddenPacks,
        hiddenPlay,
        hiAges,
        hiSingle,
        hideSecrets,
        bloodlineId,
        householdMoves,
        householdAgeUps,
        deceasedMarks,
        simAgeUps,
        pairStatus,
        connectionLog,
        sourceFileName,
      }),
    [
      nodesCore,
      edges,
      groups,
      hiddenPacks,
      hiddenPlay,
      hiAges,
      hiSingle,
      hideSecrets,
      bloodlineId,
      householdMoves,
      householdAgeUps,
      deceasedMarks,
      simAgeUps,
      pairStatus,
      connectionLog,
      sourceFileName,
    ],
  );

  const canResetBoard = useMemo(
    () => !boardMatchesBuiltIn(persistPayload(), seed),
    [persistPayload, seed],
  );

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      // A null key is another tab clearing all of storage.
      if (e.key !== null && e.key !== AUTOSAVE_KEY) return;
      if (e.key === null || draftGuardRef.current!.changedElsewhere(e.newValue)) {
        setStaleTab(true);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  /** Skip the immediate post-hydrate write; debounce later board edits. */
  const skipAutosaveRef = useRef(true);
  useEffect(() => {
    if (skipAutosaveRef.current) {
      skipAutosaveRef.current = false;
      return;
    }
    if (staleTab) return;
    const t = setTimeout(() => {
      const guard = draftGuardRef.current!;
      const payload = persistPayload();
      if (boardMatchesBuiltIn(payload, seed)) {
        if (guard.clear()) setFromBrowserDraft(false);
        else setStaleTab(true);
        return;
      }
      const result = guard.write(payload);
      if (result === 'stale') {
        setStaleTab(true);
        return;
      }
      if (result === 'ok') {
        if (!payload.sourceFileName) setFromBrowserDraft(true);
        flashStatus('Autosaved');
      } else if (result === 'quota')
        flashStatus('Autosave full — Download JSON to keep a copy');
      else flashStatus('Autosave failed');
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [persistPayload, flashStatus, seed, staleTab]);

  const reloadBoard = useCallback(() => window.location.reload(), []);

  const pushUndo = useCallback((opts?: { filters?: boolean }) => {
    undoRef.current.push({
      nodesCore: nodesCore.map((n) => ({ ...n })),
      edges: edges.map((e) => ({ ...e })),
      groups: groups.map((g) => ({ ...g })),
      householdMoves: householdMoves.map((m) => ({ ...m })),
      householdAgeUps: householdAgeUps.map((a) => ({ ...a })),
      deceasedMarks: deceasedMarks.map((d) => ({ ...d })),
      simAgeUps: simAgeUps.map((a) => ({ ...a })),
      pairStatus,
      filters: opts?.filters
        ? {
            hiddenPacks: [...hiddenPacks],
            hiddenPlay: [...hiddenPlay],
            hiAges: [...hiAges],
            hiSingle,
            hideSecrets,
          }
        : undefined,
    });
    setCanUndo(true);
  }, [nodesCore, edges, groups, householdMoves, householdAgeUps, deceasedMarks, simAgeUps, pairStatus, hiddenPacks, hiddenPlay, hiAges, hiSingle, hideSecrets]);

  const undo = useCallback(() => {
    const prev = undoRef.current.pop();
    if (!prev) return;
    setNodesCore(prev.nodesCore);
    setEdges(prev.edges);
    setGroups(prev.groups);
    setHouseholdMoves(prev.householdMoves);
    setHouseholdAgeUps(prev.householdAgeUps);
    setDeceasedMarks(prev.deceasedMarks);
    setSimAgeUps(prev.simAgeUps);
    setPairStatus(prev.pairStatus);
    if (prev.filters) {
      setHiddenPacks(new Set(prev.filters.hiddenPacks));
      setHiddenPlay(new Set(prev.filters.hiddenPlay));
      setHiAges(new Set(prev.filters.hiAges));
      setHiSingle(prev.filters.hiSingle);
      setHideSecrets(!!prev.filters.hideSecrets);
    }
    setCanUndo(undoRef.current.length > 0);
    setSel(null);
    setEditNodeId(null);
    setInfantHouseMenu(null);
    trackAction('/action/undo');
    flashStatus('Undone');
  }, [flashStatus]);

  const toggleShow = useCallback(
    (key: keyof ShowToggles) => {
      const on = !show[key];
      setShow((s) => ({ ...s, [key]: !s[key] }));
      flashStatus(on ? LAYER_STATUS[key].on : LAYER_STATUS[key].off);
    },
    [show, flashStatus],
  );

  const setLinksView = useCallback(
    (view: LinksView) => {
      setLinksViewState(view);
      trackAction(`/action/links/${view}`);
      flashStatus(LINKS_STATUS[view]);
    },
    [flashStatus],
  );

  const setFamilyFocus = useCallback((on: boolean) => {
    setFamilyFocusState(on);
    if (!on) return;
    // One sim's relatives at a time: a family highlight replaces Bloodline.
    setBloodlineId(null);
    trackAction('/action/family');
  }, []);

  const setConnectMode = useCallback(
    (on: boolean) => {
      setConnectModeState(on);
      if (on) {
        trackAction('/action/connect');
        setSelectModeState(false);
        setMultiSel(null);
      }
      setConnSrc(null);
      setConnectMenu(null);
      setInfantHouseMenu(null);
      if (on && sel?.type === 'node' && byid[sel.id]) {
        setConnSrc(sel.id);
        setStatus(
          `First sim: ${byid[sel.id]!.first} — now click the SECOND sim; drag the board to reach them (Esc to cancel)`,
        );
      } else {
        setStatus(on ? 'Connect: click the FIRST sim' : '');
      }
    },
    [sel, byid],
  );

  const setSelectMode = useCallback((on: boolean) => {
    setSelectModeState(on);
    if (on) {
      trackAction('/action/select');
      setConnectModeState(false);
      setConnSrc(null);
      setConnectMenu(null);
      setInfantHouseMenu(null);
      setStatus(
        'Select: box across 2+ worlds moves those worlds; inside one world, grab tags or sims. Hold Space to pan',
      );
    } else {
      setStatus('');
    }
  }, []);

  const clearMultiSel = useCallback(() => setMultiSel(null), []);

  const cancelConnect = useCallback(() => {
    setConnSrc(null);
    setConnectMenu(null);
    setInfantHouseMenu(null);
    setStatus(
      connectMode ? 'Connect: click the FIRST sim' : selectMode
        ? 'Select: box across 2+ worlds moves those worlds; inside one world, grab tags or sims. Hold Space to pan'
        : '',
    );
  }, [connectMode, selectMode]);

  const selectNode = useCallback((id: string) => {
    setMultiSel(null);
    setSel({ type: 'node', id });
  }, []);

  const selectLink = useCallback(
    (ids: string[]) => {
      setMultiSel(null);
      setSel({ type: 'link', ids });
      const idSet = new Set(ids.filter(Boolean));
      const hit = edges.find((e) => idSet.has(e.id));
      if (hit) trackAction(`/action/link/${hit.type}`);
    },
    [edges],
  );

  const clearSel = useCallback(() => setSel(null), []);

  const pinCardsToCurrentPlaces = useCallback(
    (nextEdges: Edge[], nextCore: SimNode[] = nodesCore) => {
      const bases = layoutBases(nextCore, worlds, nextEdges);
      const next = nextCore.map((n) => {
        const p = byid[n.id];
        const base = bases.get(n.id);
        if (!p || !base) return n;
        const ox = p.x - base.x;
        const oy = p.y - base.y;
        if (ox === (n.ox ?? 0) && oy === (n.oy ?? 0)) return n;
        return { ...n, ox, oy };
      });
      setNodesCore(next);
    },
    [nodesCore, worlds, byid],
  );

  const lockViewToSims = useCallback(
    (ids: string[]) => {
      const lock = simCentroid(ids, byid);
      if (lock) viewAnchorRef.current = lock;
    },
    [byid],
  );

  const freezeAfterEdgeChange = useCallback(
    (focusIds: string[], nextEdges: Edge[], nextCore?: SimNode[]) => {
      pinCardsToCurrentPlaces(nextEdges, nextCore);
      lockViewToSims(focusIds);
    },
    [pinCardsToCurrentPlaces, lockViewToSims],
  );

  /** Why `parent` → `child` can't be linked (they'd be their own ancestor), or null. */
  const parentCycleReason = useCallback(
    (parent: string, child: string) =>
      parentLinkMakesCycle(parent, child, edges)
        ? `${byid[parent]?.first ?? 'That sim'} already descends from ${byid[child]?.first ?? 'that sim'}`
        : null,
    [edges, byid],
  );

  /**
   * `secret`: a secret parent or secret lovers. When the same link is already
   * on the board, it is marked secret rather than drawn twice.
   */
  const addEdge = useCallback((a: string, b: string, type: Edge['type'], secret = false) => {
    if (type === 'sibling' && siblingsShareParents(a, b, edges)) return;
    let nextEdges: Edge[] | null = null;
    pushUndo();
    setEdges((e) => {
      const same = secret
        ? e.find(
            (x) =>
              x.type === type &&
              ((x.a === a && x.b === b) || (type !== 'parent' && x.a === b && x.b === a)),
          )
        : undefined;
      if (same) {
        nextEdges = e.map((x) => (x === same ? { ...x, secret: true as const } : x));
        return nextEdges;
      }
      const id = 'u' + eidcRef.current++;
      nextEdges = sanitizeEdges([
        ...e,
        {
          id,
          a,
          b,
          type,
          source: 'planned',
          createdAt: new Date().toISOString(),
          ...(secret ? { secret: true as const } : {}),
        },
      ]);
      return nextEdges;
    });
    if (nextEdges) freezeAfterEdgeChange([a, b], nextEdges);
  }, [edges, freezeAfterEdgeChange, pushUndo]);

  const deleteSelected = useCallback(() => {
    if (!sel) return;
    pushUndo();
    trackAction('/action/delete');
    if (sel.type === 'node') {
      const nextCore = nodesCore.filter((n) => n.id !== sel.id);
      const nextEdges = edges.filter(
        (e) => e.a !== sel.id && e.b !== sel.id,
      );
      pinCardsToCurrentPlaces(nextEdges, nextCore);
      setEdges(nextEdges);
      setHouseholdMoves((ms) => ms.filter((m) => m.simId !== sel.id));
      setDeceasedMarks((ms) => ms.filter((m) => m.simId !== sel.id));
      setSimAgeUps((ms) => ms.filter((m) => m.simId !== sel.id));
      if (editNodeId === sel.id) setEditNodeId(null);
      if (bloodlineId === sel.id) setBloodlineId(null);
    } else if (sel.type === 'link') {
      const nextEdges = edges.filter((e) => !sel.ids.includes(e.id));
      const ends = edges
        .filter((e) => sel.ids.includes(e.id))
        .flatMap((e) => [e.a, e.b]);
      freezeAfterEdgeChange(ends, nextEdges);
      setEdges(nextEdges);
    }
    setSel(null);
  }, [
    sel,
    editNodeId,
    bloodlineId,
    edges,
    nodesCore,
    pinCardsToCurrentPlaces,
    freezeAfterEdgeChange,
    pushUndo,
  ]);

  const addSim = useCallback((svgWidth: number, svgHeight: number) => {
    pushUndo();
    trackAction('/action/create-sim');
    const id = 'new' + eidcRef.current++;
    const world =
      dominantWorldInViewport(
        nodes,
        groups,
        nodeVis,
        viewport,
        svgWidth,
        svgHeight,
      ) ?? OTHER_WORLD;
    const hh = ADDED_HOUSEHOLD;
    const gid = `${world}||${hh}`;
    const color = worldColor(world, worlds);
    const neighbour =
      nodes.find((n) => n.world === world && n.nb && n.nb !== '-')?.nb ?? '-';
    const n: SimNode = {
      id,
      gid,
      first: 'New',
      sur: 'Sim',
      age: 'Young Adult',
      state: 'Sim',
      gender: randomNewSimGender(),
      hh,
      world,
      nb: neighbour,
      color,
      townie: false,
      oworld: world,
      onb: neighbour,
      ohh: hh,
      oplay: 'Resident',
      pack: '',
      ox: 0,
      oy: 0,
      x: 0,
      y: 0,
      w: 0,
      h: 0,
      added: true,
    };
    const size = measureCard(n);
    let { x, y } = cardOriginAtViewportCenter(
      viewport,
      svgWidth,
      svgHeight,
      size.w,
      size.h,
    );
    const pitch = rowPitch();
    for (let i = 0; i < nodes.length + 1; i++) {
      const hit = nodes.some(
        (o) =>
          x < o.x + o.w &&
          x + size.w > o.x &&
          y < o.y + o.h &&
          y + size.h > o.y,
      );
      if (!hit) break;
      y += pitch;
    }
    if (snap) {
      const t = tileSnapOrigin(x, y);
      x = t.x;
      y = t.y;
    }
    const nextCore = [...nodesCore, toCore(n)];
    const bases = layoutBases(nextCore, worlds, edges);
    const newBase = bases.get(id);
    const newOx = newBase ? x - newBase.x : x;
    const newOy = newBase ? y - newBase.y : y;
    setNodesCore(
      nextCore.map((node) => {
        if (node.id === id) return { ...node, ox: newOx, oy: newOy };
        const vis = byid[node.id];
        const base = bases.get(node.id);
        if (!vis || !base) return node;
        const ox = vis.x - base.x;
        const oy = vis.y - base.y;
        if (ox === (node.ox ?? 0) && oy === (node.oy ?? 0)) return node;
        return { ...node, ox, oy };
      }),
    );
    setGroups((gs) => {
      if (gs.some((g) => g.gid === gid)) return gs;
      return [
        ...gs,
        {
          gid,
          hh,
          world,
          nb: neighbour,
          color,
          x: 0,
          y: 0,
          w: 0,
          h: 0,
        },
      ];
    });
    setSel({ type: 'node', id });
  }, [worlds, nodes, nodesCore, groups, nodeVis, viewport, edges, byid, pushUndo, snap]);

  /**
   * The household tag's +: a new sim in that household, beside its last card
   * or in a row under its cards (householdAddSpot). Every other card keeps its
   * place, unless a new row runs the box into the one below; that one moves
   * down, as after a save merge. Returns the new sim's id.
   */
  const addSimToHousehold = useCallback(
    (gid: string): string | null => {
      const g = groups.find((x) => x.gid === gid);
      const home = nodes.filter((n) => n.gid === gid);
      const chrome = householdChrome(home, g);
      if (!g || !chrome) return null;
      pushUndo();
      trackAction('/action/add-household-sim');
      const id = 'new' + eidcRef.current++;
      const surnames = new Map<string, number>();
      for (const m of home) if (m.sur) surnames.set(m.sur, (surnames.get(m.sur) ?? 0) + 1);
      const sur = [...surnames].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Sim';
      const n: SimNode = {
        id,
        gid,
        first: 'New',
        sur,
        age: 'Young Adult',
        state: 'Sim',
        gender: randomNewSimGender(),
        hh: g.hh,
        world: g.world,
        nb: g.nb,
        color: g.color,
        townie: false,
        oworld: g.world,
        onb: g.nb,
        ohh: g.hh,
        oplay: 'Resident',
        pack: '',
        ox: 0,
        oy: 0,
        x: 0,
        y: 0,
        w: 0,
        h: 0,
        added: true,
      };
      const { x, y } = householdAddSpot(home, nodes, chrome.boxR);
      const nextCore = [...nodesCore, toCore(n)];
      const bases = layoutBases(nextCore, worlds, edges);
      const pinned = nextCore.map((node) => {
        const base = bases.get(node.id);
        if (node.id === id) {
          return base ? { ...node, ox: x - base.x, oy: y - base.y } : node;
        }
        const vis = byid[node.id];
        if (!vis || !base) return node;
        const ox = vis.x - base.x;
        const oy = vis.y - base.y;
        if (ox === (node.ox ?? 0) && oy === (node.oy ?? 0)) return node;
        return { ...node, ox, oy };
      });
      const laid = computeLayout(pinned, worlds, edges);
      setNodesCore(
        coreOffsetsAfterImportSeparation(
          pinned,
          snap ? snapNodesToTiles(laid) : laid,
          groups,
          nodes,
        ),
      );
      setSel({ type: 'node', id });
      setEditNodeId(id);
      flashStatus(`Added a sim to ${g.hh}: name them, then press Enter`);
      return id;
    },
    [groups, nodes, nodesCore, worlds, edges, byid, snap, pushUndo, flashStatus],
  );

  const updateNode = useCallback((id: string, patch: Partial<SimNode>) => {
    const prev = nodesCore.find((n) => n.id === id);
    const reflow =
      !!prev &&
      LAYOUT_PIN_KEYS.some(
        (k) => patch[k] !== undefined && patch[k] !== prev[k],
      );
    const apply = (ns: SimNode[]) =>
      ns.map((n) => {
        if (n.id !== id) return n;
        const next: SimNode = { ...n, ...patch };
        if (patch.x !== undefined || patch.y !== undefined) {
          const laid = byid[id];
          const packed = laid
            ? { x: laid.x - (laid.ox ?? 0), y: laid.y - (laid.oy ?? 0) }
            : layoutBases(ns, worlds, edges).get(id);
          if (packed) {
            const absX =
              patch.x !== undefined ? patch.x : packed.x + (n.ox ?? 0);
            const absY =
              patch.y !== undefined ? patch.y : packed.y + (n.oy ?? 0);
            next.ox = absX - packed.x;
            next.oy = absY - packed.y;
          }
        }
        return toCore(next);
      });
    if (reflow) pinCardsToCurrentPlaces(edges, apply(nodesCore));
    else setNodesCore(apply);
    const createdAt = new Date().toISOString();
    const toAge = patch.age;
    if (prev && toAge !== undefined && isLaterSimAge(prev.age, toAge)) {
      setSimAgeUps((ms) => [
        ...ms,
        {
          id: 'c' + eidcRef.current++,
          simId: id,
          createdAt,
          age: toAge,
          hh: prev.hh,
          nb: prev.nb,
          world: prev.world,
        },
      ]);
    }
    if (
      prev &&
      patch.state === DECEASED_STATE &&
      prev.state !== DECEASED_STATE
    ) {
      setDeceasedMarks((ms) => [
        ...ms,
        {
          id: 'd' + eidcRef.current++,
          simId: id,
          createdAt,
        },
      ]);
    }
  }, [nodesCore, worlds, edges, byid, pinCardsToCurrentPlaces]);

  const moveNodesByGid = useCallback(
    (
      gid: string,
      dx: number,
      dy: number,
      base: Record<string, { ox: number; oy: number }>,
    ) => {
      setNodesCore((ns) =>
        ns.map((n) => {
          const bb = base[n.id];
          if (n.gid === gid && bb)
            return { ...n, ox: bb.ox + dx, oy: bb.oy + dy };
          return n;
        }),
      );
    },
    [],
  );

  const moveNodesByWorld = useCallback(
    (
      world: string,
      dx: number,
      dy: number,
      base: Record<string, { ox: number; oy: number }>,
    ) => {
      setNodesCore((ns) =>
        ns.map((n) => {
          const bb = base[n.id];
          if (n.world === world && bb)
            return { ...n, ox: bb.ox + dx, oy: bb.oy + dy };
          return n;
        }),
      );
    },
    [],
  );

  /** Rigid move for a multi-selection (worlds, households, or cards). */
  const moveNodesByIds = useCallback(
    (
      ids: string[],
      dx: number,
      dy: number,
      base: Record<string, { ox: number; oy: number }>,
    ) => {
      const set = new Set(ids);
      setNodesCore((ns) =>
        ns.map((n) => {
          const bb = base[n.id];
          if (set.has(n.id) && bb)
            return { ...n, ox: bb.ox + dx, oy: bb.oy + dy };
          return n;
        }),
      );
    },
    [],
  );

  const snapDragPosition = useCallback(
    (n: SimNode, rawX: number, rawY: number, sticky: SnapSticky = { x: null, y: null }) =>
      snapPosition(rawX, rawY, n.w, n.h, nodes, n.id, snap, sticky),
    [snap, nodes],
  );

  const snapHouseholdDrag = useCallback(
    (originX: number, originY: number, dx: number, dy: number) =>
      snapHouseholdDelta(originX, originY, dx, dy, snap),
    [snap],
  );

  const snapNodeAction = useCallback(
    (n: SimNode) => {
      if (!snap) return;
      const { x, y } = snapPosition(n.x, n.y, n.w, n.h, nodes, n.id, true);
      updateNode(n.id, { x, y });
    },
    [snap, nodes, updateNode],
  );

  const makeChildOfCouple = useCallback(
    (pa: string, pb: string, childId: string) => {
      if (childId === pa || childId === pb) {
        cancelConnect();
        return;
      }
      const why = parentCycleReason(pa, childId) ?? parentCycleReason(pb, childId);
      if (why) {
        setConnSrc(null);
        setConnectMenu(null);
        flashStatus(`Not linked — ${why}. Click a sim for the next link`);
        return;
      }
      pushUndo();
      let nextEdges: Edge[] | null = null;
      setEdges((es) => {
        const bundleId = 'b' + eidcRef.current++;
        const createdAt = new Date().toISOString();
        const next = [...es];
        [pa, pb].forEach((p) => {
          const idx = next.findIndex(
            (e) => e.type === 'parent' && e.a === p && e.b === childId,
          );
          if (idx >= 0) {
            const existing = next[idx]!;
            if (isUserE(existing)) {
              next[idx] = {
                ...existing,
                bundleId,
                createdAt: existing.createdAt ?? createdAt,
              };
            }
            return;
          }
          next.push({
            id: 'u' + eidcRef.current++,
            a: p,
            b: childId,
            type: 'parent',
            source: 'planned',
            createdAt,
            bundleId,
          });
        });
        nextEdges = next;
        return next;
      });
      if (nextEdges) freezeAfterEdgeChange([pa, pb, childId], nextEdges);
      flashStatus(
        `Linked ✓ — ${byid[childId]?.first ?? 'Sim'} is now a child of ${byid[pa]?.first ?? ''} ＋ ${byid[pb]?.first ?? ''}. Click a sim for the next link`,
      );
      setConnSrc(null);
      setConnectMenu(null);
    },
    [byid, cancelConnect, flashStatus, freezeAfterEdgeChange, parentCycleReason, pushUndo],
  );

  const addInfantOfCouple = useCallback(
    (pa: string, pb: string, destGid: string, rx: number, _ry: number) => {
      const a = byid[pa];
      const b = byid[pb];
      if (!a || !b) return;
      pushUndo();
      const host = a.gid === destGid ? a : b.gid === destGid ? b : a;
      const g = groups.find((x) => x.gid === destGid);
      const dest = g
        ? {
            gid: g.gid,
            hh: g.hh,
            world: g.world,
            nb: g.nb,
            color: g.color,
          }
        : {
            gid: host.gid,
            hh: host.hh,
            world: host.world,
            nb: host.nb,
            color: host.color,
          };
      const id = 'new' + eidcRef.current++;
      const infant: SimNode = {
        id,
        gid: dest.gid,
        first: 'New',
        sur: 'Sim',
        age: 'Infant',
        state: 'Sim',
        gender: randomNewSimGender(),
        hh: dest.hh,
        world: dest.world,
        nb: dest.nb,
        color: dest.color,
        townie: false,
        oworld: dest.world,
        onb: dest.nb,
        ohh: dest.hh,
        oplay: 'Resident',
        pack: '',
        ox: 0,
        oy: 0,
        x: 0,
        y: 0,
        w: 0,
        h: 0,
        added: true,
      };
      const size = measureCard(infant);
      const siblings = nodes.filter((n) => {
        const fromA = edges.some(
          (e) => e.type === 'parent' && e.a === pa && e.b === n.id,
        );
        const fromB = edges.some(
          (e) => e.type === 'parent' && e.a === pb && e.b === n.id,
        );
        return fromA && fromB;
      });
      const { x, y } = spawnChildOrigin(
        Math.min(a.y, b.y),
        rx,
        size.w,
        siblings,
        nodes,
        snap,
      );
      const bundleId = 'b' + eidcRef.current++;
      const createdAt = new Date().toISOString();
      const nextEdges: Edge[] = [...edges];
      [pa, pb].forEach((p) => {
        nextEdges.push({
          id: 'u' + eidcRef.current++,
          a: p,
          b: id,
          type: 'parent',
          source: 'planned',
          createdAt,
          bundleId,
        });
      });
      const nextCore = [...nodesCore, toCore(infant)];
      const bases = layoutBases(nextCore, worlds, nextEdges);
      const newBase = bases.get(id);
      const newOx = newBase ? x - newBase.x : x;
      const newOy = newBase ? y - newBase.y : y;
      setNodesCore(
        nextCore.map((node) => {
          if (node.id === id) return { ...node, ox: newOx, oy: newOy };
          const vis = byid[node.id];
          const base = bases.get(node.id);
          if (!vis || !base) return node;
          const ox = vis.x - base.x;
          const oy = vis.y - base.y;
          if (ox === (node.ox ?? 0) && oy === (node.oy ?? 0)) return node;
          return { ...node, ox, oy };
        }),
      );
      setEdges(nextEdges);
      setSel({ type: 'node', id });
      setInfantHouseMenu(null);
      trackAction('/action/add-infant');
      flashStatus(
        `Linked ✓ — Infant added under ${byid[pa]?.first ?? ''} ＋ ${byid[pb]?.first ?? ''}.`,
      );
    },
    [byid, flashStatus, groups, nodes, nodesCore, worlds, edges, pushUndo, snap],
  );

  const requestInfantOfCouple = useCallback(
    (
      pa: string,
      pb: string,
      rx: number,
      ry: number,
      menuX: number,
      menuY: number,
    ) => {
      const a = byid[pa];
      const b = byid[pb];
      if (!a || !b) return;
      if (a.gid === b.gid) {
        addInfantOfCouple(pa, pb, a.gid, rx, ry);
        return;
      }
      setInfantHouseMenu({ pa, pb, rx, ry, x: menuX, y: menuY });
    },
    [byid, addInfantOfCouple],
  );

  const confirmInfantHouse = useCallback(
    (gid: string) => {
      if (!infantHouseMenu) return;
      addInfantOfCouple(
        infantHouseMenu.pa,
        infantHouseMenu.pb,
        gid,
        infantHouseMenu.rx,
        infantHouseMenu.ry,
      );
    },
    [infantHouseMenu, addInfantOfCouple],
  );

  const infantHouseChoices = useMemo(() => {
    if (!infantHouseMenu) return [];
    const a = byid[infantHouseMenu.pa];
    const b = byid[infantHouseMenu.pb];
    if (!a || !b) return [];
    const choice = (n: SimNode) => ({
      gid: n.gid,
      label: `${simName(n)} — ${householdPlace(n.hh, n.nb, n.world)}`,
    });
    const opts = [choice(a)];
    if (b.gid !== a.gid) opts.push(choice(b));
    return opts;
  }, [infantHouseMenu, byid]);

  const handleConnectClick = useCallback(
    (n: SimNode, clientX: number, clientY: number, stageRect: DOMRect) => {
      if (connSrc && typeof connSrc === 'object' && 'union' in connSrc) {
        makeChildOfCouple(connSrc.union[0], connSrc.union[1], n.id);
        return;
      }
      if (!connSrc) {
        setConnSrc(n.id);
        setStatus(
          'Connect: now click the SECOND sim; drag the board to reach them. Or click a ⚭/❤ to make this sim their child (Esc to cancel)',
        );
        return;
      }
      if (connSrc === n.id) return;
      setConnectMenu({
        a: connSrc as string,
        b: n.id,
        x: clientX - stageRect.left,
        y: clientY - stageRect.top,
      });
    },
    [connSrc, makeChildOfCouple],
  );

  const handleConnectUnion = useCallback(
    (ea: string, eb: string) => {
      if (!byid[ea] || !byid[eb]) return;
      if (connSrc && typeof connSrc === 'string') {
        makeChildOfCouple(ea, eb, connSrc);
        return;
      }
      setConnSrc({ union: [ea, eb] });
      setStatus(
        `Couple selected: ${byid[ea]!.first} ＋ ${byid[eb]!.first} — now click their CHILD (Esc to cancel)`,
      );
    },
    [byid, connSrc, makeChildOfCouple],
  );

  const confirmConnect = useCallback(
    (choice: ConnectChoice) => {
      if (!connectMenu) return;
      const { a, b } = connectMenu;
      if (choice === 'coparents') {
        // Sims who are not a couple and have a child: the child's two parent
        // links say it all, so the next sim clicked becomes that child.
        setConnectMenu(null);
        setConnSrc({ union: [a, b] });
        setStatus(
          `Co-parents: ${byid[a]?.first ?? ''} ＋ ${byid[b]?.first ?? ''} — now click their CHILD (Esc to cancel)`,
        );
        return;
      }
      const link = CONNECT_LINKS[choice];
      const [from, to] = link.flip ? [b, a] : [a, b];
      if (link.type === 'parent') {
        const why = parentCycleReason(from, to);
        if (why) {
          setConnectMenu(null);
          setConnSrc(null);
          flashStatus(`Not linked — ${why}. Click a sim for the next link`);
          return;
        }
      }
      addEdge(from, to, link.type, !!link.secret);
      setConnectMenu(null);
      flashStatus(
        link.secret && hideSecrets
          ? 'Linked ✓ — it is secret, so Hide secrets keeps it off the board. Click a sim for the next link'
          : 'Linked ✓ — click a sim for the next link',
      );
      setConnSrc(null);
    },
    [connectMenu, addEdge, byid, flashStatus, hideSecrets, parentCycleReason],
  );

  const fit = useCallback((svgWidth: number, svgHeight: number) => {
    const [x0, y0, x1, y1] = bbox(nodes, nodeVis);
    const w = x1 - x0;
    const h = y1 - y0;
    const k = Math.min(svgWidth / (w + 120), svgHeight / (h + 120), 1.1);
    setViewport({
      k,
      tx: (svgWidth - w * k) / 2 - x0 * k,
      ty: (svgHeight - h * k) / 2 - y0 * k,
    });
  }, [nodes, nodeVis]);

  /**
   * Fit once a board just set is laid out. A fit queued with setTimeout ran
   * with the old board's cards, so a Replace framed the board it replaced.
   */
  const fitNextRef = useRef<{ w: number; h: number } | null>(null);
  const fitWhenLaidOut = useCallback((svgWidth: number, svgHeight: number) => {
    fitNextRef.current = { w: svgWidth, h: svgHeight };
  }, []);
  useEffect(() => {
    const next = fitNextRef.current;
    if (!next) return;
    fitNextRef.current = null;
    fit(next.w, next.h);
  }, [fit]);

  /**
   * Frame a single world. Two differences from `fit`: the zoom cap is above 1 so
   * picking a small world magnifies it rather than just recentring the board,
   * and `insetRight` keeps the result clear of the legend panel, which would
   * otherwise cover the right edge of the very world that was just clicked.
   */
  const zoomToWorld = useCallback(
    (
      world: string,
      svgWidth: number,
      svgHeight: number,
      insetRight: number = 0,
    ) => {
      const inWorld = (n: SimNode) => nodeVis(n) && n.world === world;
      if (!nodes.some(inWorld)) return;
      const [x0, y0, x1, y1] = bbox(nodes, inWorld);
      const w = x1 - x0;
      const h = y1 - y0;
      const pad = 80;
      const availW = Math.max(svgWidth - insetRight, 240);
      const k = Math.min(
        availW / (w + pad * 2),
        svgHeight / (h + pad * 2),
        1.4,
      );
      setViewport({
        k,
        tx: (availW - w * k) / 2 - x0 * k,
        ty: (svgHeight - h * k) / 2 - y0 * k,
      });
    },
    [nodes, nodeVis],
  );

  const resetView = useCallback(() => setViewport(INITIAL_VIEW), []);

  const boardBounds = useMemo(() => bbox(nodes, nodeVis), [nodes, nodeVis]);
  /** Lowest zoom on a stage this size: low enough to show the whole board. */
  const minZoom = useCallback(
    (svgWidth: number, svgHeight: number) => zoomFloor(boardBounds, svgWidth, svgHeight),
    [boardBounds],
  );

  const zoomAt = useCallback(
    (f: number, cx: number, cy: number, svgRect: DOMRect) => {
      const floor = minZoom(svgRect.width, svgRect.height);
      setViewport((v) => zoomViewportAt(v, f, cx, cy, svgRect, floor));
    },
    [minZoom],
  );

  const focusLogEntry = useCallback(
    (ids: string[], svgWidth: number, svgHeight: number) => {
      setSel({ type: 'link', ids });
      const e = edges.find((x) => ids.includes(x.id));
      if (e) trackAction(`/action/link/${e.type}`);
      if (!e) return;
      const n =
        e.type === 'parent'
          ? (byid[e.b] ?? byid[e.a])
          : (byid[e.a] ?? byid[e.b]);
      if (n) frameSim(n, svgWidth, svgHeight);
    },
    [edges, byid, frameSim],
  );

  const focusSim = useCallback(
    (id: string, svgWidth: number, svgHeight: number) => {
      const n = byid[id];
      if (!n) return;
      setSel({ type: 'node', id });
      frameSim(n, svgWidth, svgHeight);
    },
    [byid, frameSim],
  );

  const searchSim = useCallback(
    (
      q: string,
      svgWidth: number,
      svgHeight: number,
      cycle: 0 | 1 | -1 = 0,
    ) => {
      const query = q.toLowerCase().trim();
      if (!query) {
        setSearchHits([]);
        setSearchHitIndex(0);
        return;
      }
      const hits = nodes
        .filter(
          (n) =>
            nodeVis(n) && `${n.first} ${n.sur}`.toLowerCase().includes(query),
        )
        .map((n) => n.id);
      if (!hits.length) {
        setSearchHits([]);
        setSearchHitIndex(0);
        return;
      }
      const next =
        cycle === 0
          ? 0
          : (((searchHitIndex + cycle) % hits.length) + hits.length) %
            hits.length;
      setSearchHits(hits);
      setSearchHitIndex(next);
      const n = byid[hits[next]!];
      if (n) {
        frameSim(n, svgWidth, svgHeight);
        // Only on Enter / next / prev — not every keystroke (cycle === 0).
        if (cycle !== 0) trackAction('/action/find-sim');
        setSel({ type: 'node', id: n.id });
      }
    },
    [nodes, nodeVis, byid, frameSim, searchHitIndex],
  );

  const boardSourceLabel = sourceFileName
    ? sourceFileName
    : fromBrowserDraft
      ? 'Browser draft'
      : 'Built-in board';

  const resetToBuiltInBoard = useCallback(
    (svgWidth: number, svgHeight: number) => {
      if (!draftGuardRef.current!.clear()) setStaleTab(true);
      const migrated = migrateWhiteboardData(seed);
      const seedEdges = sanitizeEdges(
        migrated.edges.map((e) => ({
          ...e,
          source:
            e.source ?? (String(e.id).charAt(0) === 'u' ? 'planned' : 'seed'),
        })),
      );
      setNodesCore(migrated.nodes.map((n) => toCore(n)));
      setEdges(seedEdges);
      setGroups((migrated.groups ?? seed.groups).map((g) => ({ ...g })));
      setHiddenPacks(new Set());
      setHiddenPlay(new Set());
      setHiAges(new Set());
      setHiSingle(false);
      setHideSecrets(false);
      setBloodlineId(null);
      setHouseholdMoves([]);
      setHouseholdAgeUps([]);
      setDeceasedMarks([]);
      setSimAgeUps([]);
      setPairStatus([]);
      setSourceFileName(null);
      setFromBrowserDraft(false);
      undoRef.current = [];
      setCanUndo(false);
      setSel(null);
      setEditNodeId(null);
      eidcRef.current = nextEidc(seedEdges, 100000);
      skipAutosaveRef.current = true;
      trackAction('/action/reset-board');
      flashStatus('Reset the board');
      fitWhenLaidOut(svgWidth, svgHeight);
    },
    [seed, flashStatus, fitWhenLaidOut],
  );

  const saveJson = useCallback(() => {
    const blob = new Blob(
      [JSON.stringify(persistPayload(), null, 1)],
      { type: 'application/json' },
    );
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `sims4_family_trees_${fileStamp()}.json`;
    a.click();
    trackAction('/action/save-json');
  }, [persistPayload]);

  const applyLoadedJson = useCallback(
    (
      file: File,
      text: string,
      svgWidth: number,
      svgHeight: number,
      keepBoardPositions = false,
    ) => {
      try {
        const parsed = JSON.parse(text) as WhiteboardData & {
          layoutEpoch?: number;
        };
        const d = migrateWhiteboardData(parsed);
        const loadedEdges = sanitizeEdges(d.edges);
        const prepared = prepareLoadedNodes(
          fillMissingSavePacks(d.nodes as SimNode[], seed.nodes),
          parsed.layoutEpoch,
          worlds,
          loadedEdges,
        );
        // Premade template ids become readable household names, nothing moves.
        const fileNamed = withReadableHouseholdNames({
          core: prepared.nodes,
          groups: (d.groups as Group[]) ?? groups,
          worlds,
          edges: loadedEdges,
        });
        const fileGroups = fileNamed.groups;
        const loadedCore = keepBoardPositions
          ? separateLoadOverlaps({
              core: pinCoreToTargets(
                jsonLoadTargets({
                  keepBoardPositions: true,
                  boardVisualById: byid,
                  fileCore: fileNamed.core,
                  fileEdges: loadedEdges,
                  worlds,
                }),
                fileNamed.core,
                worlds,
                loadedEdges,
              ),
              boardById: byid,
              edges: loadedEdges,
              groups: fileGroups,
              worlds,
              snap,
            })
          : fileNamed.core;
        setNodesCore(loadedCore);
        setEdges(loadedEdges);
        const loadedMoves = d.householdMoves ?? [];
        const loadedAgeUps = d.householdAgeUps ?? [];
        const loadedDeaths = d.deceasedMarks ?? [];
        const loadedSimAgeUps = d.simAgeUps ?? [];
        setHouseholdMoves(loadedMoves);
        setHouseholdAgeUps(loadedAgeUps);
        setDeceasedMarks(loadedDeaths);
        setSimAgeUps(loadedSimAgeUps);
        setPairStatus(d.pairStatus ?? []);
        eidcRef.current = nextEidc(
          loadedEdges,
          eidcRef.current,
          [
            ...loadedMoves.map((m) => m.id),
            ...loadedAgeUps.map((a) => a.id),
            ...loadedDeaths.map((m) => m.id),
            ...loadedSimAgeUps.map((a) => a.id),
          ],
        );
        undoRef.current = [];
        setCanUndo(false);
        if (d.groups) setGroups(fileGroups);
        setHiddenPacks(new Set(d.hiddenPacks || []));
        setHiddenPlay(new Set(d.hiddenPlay || []));
        setHiAges(new Set(d.hiAges || []));
        setHiSingle(!!d.hiSingle);
        setHideSecrets(!!d.hideSecrets);
        const loadedIds = new Set((d.nodes as SimNode[]).map((n) => n.id));
        setBloodlineId(
          d.bloodlineId && loadedIds.has(d.bloodlineId)
            ? d.bloodlineId
            : null,
        );
        setSel(null);
        setEditNodeId(null);
        setSourceFileName(file.name);
        setFromBrowserDraft(false);
        setPendingLoadJson(null);
        trackAction('/action/load-json');
        if (keepBoardPositions) {
          flashStatus(
            `Loaded ${file.name} — sims already on the board kept their positions.`,
          );
        } else if (prepared.repacked) {
          flashStatus(
            'Older save — board re-packed for the current layout. Download JSON to keep it.',
          );
        } else {
          flashStatus(`Loaded ${file.name}`);
        }
        setTimeout(() => {
          if (!keepBoardPositions && prepared.repacked) {
            // Fresh pack only. A loaded board may have user-overlapped worlds.
            setNodesCore((core) => {
              const laid = snap
                ? snapNodesToTiles(computeLayout(core, worlds, loadedEdges))
                : computeLayout(core, worlds, loadedEdges);
              return coreOffsetsAfterWorldSeparation(
                core,
                laid,
                fileGroups,
                () => true,
              );
            });
          }
          // Kept positions mean "leave my board as it is" — the view included.
          if (!keepBoardPositions) fit(svgWidth, svgHeight);
        }, 0);
      } catch {
        alert('Bad file');
        setPendingLoadJson(null);
      }
    },
    [fit, snap, worlds, groups, byid, flashStatus, seed.nodes],
  );

  /**
   * Read the file up front so the dialog can say whether it is too old to
   * restore placements. Knowing that after the board had already changed
   * would be no use — the point is to decide before anything happens.
   */
  const loadJson = useCallback(
    (file: File, svgWidth: number, svgHeight: number) => {
      const rd = new FileReader();
      rd.onload = () => {
        const text = String(rd.result ?? '');
        let willRepack = false;
        let filtersNote: string | null = null;
        try {
          const parsed = JSON.parse(text) as Parameters<typeof fileFilters>[0] & {
            layoutEpoch?: number;
          };
          willRepack = shouldRepackOffsets(parsed.layoutEpoch);
          filtersNote = filterChangeNote(
            {
              hiddenPacks: [...hiddenPacks],
              hiddenPlay: [...hiddenPlay],
              hiAges: [...hiAges],
              hiSingle,
              hideSecrets,
            },
            fileFilters(parsed),
          );
        } catch {
          // Unparseable: nothing to choose about, so say so straight away.
          applyLoadedJson(file, text, svgWidth, svgHeight);
          return;
        }
        const risk = loadJsonRisk(nodesCore, edges, {
          canUndo,
          sourceFileName,
          fromBrowserDraft,
        });
        // Always ask, even over the untouched starter board: which card
        // positions win is a choice there too (see LoadJsonDialog).
        setPendingLoadJson({
          file,
          text,
          svgWidth,
          svgHeight,
          risk,
          willRepack,
          filtersNote,
        });
      };
      rd.readAsText(file);
    },
    [
      nodesCore,
      edges,
      canUndo,
      sourceFileName,
      fromBrowserDraft,
      hiddenPacks,
      hiddenPlay,
      hiAges,
      hiSingle,
      hideSecrets,
      applyLoadedJson,
    ],
  );

  const cancelLoadJson = useCallback(() => setPendingLoadJson(null), []);

  const confirmReplaceJson = useCallback((keepBoardPositions: boolean) => {
    const pending = pendingLoadJson;
    if (!pending) return;
    applyLoadedJson(
      pending.file,
      pending.text,
      pending.svgWidth,
      pending.svgHeight,
      keepBoardPositions,
    );
  }, [pendingLoadJson, applyLoadedJson]);

  const confirmMergeJson = useCallback((keepBoardPositions: boolean) => {
    const pending = pendingLoadJson;
    if (!pending) return;
    try {
        const parsed = JSON.parse(pending.text) as WhiteboardData & {
          layoutEpoch?: number;
        };
        const d = migrateWhiteboardData(parsed);
        const incomingEdges = sanitizeEdges(d.edges);
        const prepared = prepareLoadedNodes(
          fillMissingSavePacks(d.nodes as SimNode[], seed.nodes),
          parsed.layoutEpoch,
          worlds,
          incomingEdges,
        );
        const fileNamed = withReadableHouseholdNames({
          core: prepared.nodes,
          groups: (d.groups as Group[]) ?? [],
          worlds,
          edges: incomingEdges,
        });
        pushUndo({ filters: true });
        const merged = mergeJsonIntoBoard({
          boardNodes: nodesCore,
          boardEdges: edges,
          boardGroups: groups,
          incomingNodes: fileNamed.core,
          incomingEdges,
          incomingGroups: fileNamed.groups,
          keepBoardPositions,
        });
        // New sims and links move layout bases, so pin cards to real screen
        // positions rather than trusting the raw ox/oy the merge copied.
        const pinned = pinCoreToTargets(
          jsonLoadTargets({
            keepBoardPositions,
            boardVisualById: byid,
            fileCore: fileNamed.core,
            fileEdges: incomingEdges,
            worlds,
          }),
          merged.nodes,
          worlds,
          merged.edges,
        );
        setNodesCore(
          keepBoardPositions
            ? separateLoadOverlaps({
                core: pinned,
                boardById: byid,
                edges: merged.edges,
                groups: merged.groups,
                worlds,
                snap,
              })
            : pinned,
        );
        setEdges(merged.edges);
        setGroups(merged.groups);
        eidcRef.current = nextEidc(merged.edges, eidcRef.current);
        if (d.pairStatus?.length) {
          setPairStatus((prev) => mergePairStatus(prev, d.pairStatus!));
        }
        if (d.householdMoves?.length) {
          setHouseholdMoves((prev) => {
            const seen = new Set(prev.map((m) => m.id));
            const extra = d.householdMoves!.filter((m) => !seen.has(m.id));
            return extra.length ? [...prev, ...extra] : prev;
          });
        }
        const incomingFilters = fileFilters(d);
        if (pending.filtersNote && incomingFilters) {
          setHiddenPacks(new Set(incomingFilters.hiddenPacks));
          setHiddenPlay(new Set(incomingFilters.hiddenPlay));
          setHiAges(new Set(incomingFilters.hiAges));
          setHiSingle(incomingFilters.hiSingle);
          setHideSecrets(!!incomingFilters.hideSecrets);
        }
        setSourceFileName(pending.file.name);
        setFromBrowserDraft(false);
        setPendingLoadJson(null);
        setSel(null);
        trackAction('/action/load-json');
        const s = merged.summary;
        flashStatus(
          `JSON merged — ${s.nodesUpdated} updated, ${s.nodesAdded} added, ${s.relationshipsOverwritten} relationships overwritten.${pending.filtersNote ? ' Filters now match the file.' : ''} Download JSON to keep it.`,
        );
        setTimeout(() => {
          setNodesCore((core) => {
            // Kept positions were already fitted around the board above.
            if (keepBoardPositions) return core;
            const movable = introducedWorldNames(nodesCore, core);
            if (!movable.size) return core;
            const laid = snap
              ? snapNodesToTiles(computeLayout(core, worlds, merged.edges))
              : computeLayout(core, worlds, merged.edges);
            return coreOffsetsAfterWorldSeparation(
              core,
              laid,
              merged.groups,
              () => true,
              movable,
            );
          });
          // Kept positions mean "leave my board as it is" — the view included.
          if (!keepBoardPositions) fit(pending.svgWidth, pending.svgHeight);
        }, 0);
    } catch {
      alert('Bad file');
      setPendingLoadJson(null);
    }
  }, [
    pendingLoadJson,
    nodesCore,
    edges,
    groups,
    worlds,
    byid,
    snap,
    pushUndo,
    flashStatus,
    fit,
    seed.nodes,
  ]);

  const applySaveBoard = useCallback(
    (
      result: SaveMergeResult,
      svgWidth: number,
      svgHeight: number,
      mode: 'merge' | 'replace',
    ) => {
      if (mode === 'replace') {
        undoRef.current = [];
        setCanUndo(false);
        setHouseholdMoves([]);
        setHouseholdAgeUps([]);
        setDeceasedMarks([]);
        setSimAgeUps([]);
        setHiddenPlay(new Set());
        setHiAges(new Set());
        setHiSingle(false);
      setHideSecrets(false);
        setBloodlineId(null);
        setFromBrowserDraft(false);
        setSourceFileName(null);
      } else {
        pushUndo();
      }
      setEdges(result.edges);
      setGroups(result.groups);
      setPairStatus(result.pairStatus);
      setNodesCore(
        saveImportCore({
          mode,
          boardById: byid,
          nodes: result.nodes,
          edges: result.edges,
          groups: result.groups,
          worlds,
          snap,
          rehomed: new Set(result.rehomed),
        }),
      );
      eidcRef.current = nextEidc(result.edges, eidcRef.current);
      const s = result.summary;
      const wasHidden = mode === 'replace' ? new Set<string>() : hiddenPacks;
      const nextHidden = hiddenPacksAfterImport({
        hidden: wasHidden,
        hidePacks: s.hidePacks,
        before: mode === 'replace' ? [] : nodesCore.map((n) => n.pack),
        after: result.nodes.map((n) => n.pack),
      });
      setHiddenPacks(nextHidden);
      const off = [...nextHidden].filter((p) => !wasHidden.has(p));
      const on = [...wasHidden].filter((p) => !nextHidden.has(p));
      const games = [
        off.length ? ` Switched off in Filters, not in your save: ${off.join(', ')}.` : '',
        on.length ? ` Switched back on: ${on.join(', ')}.` : '',
      ].join('');
      setSaveImport(null);
      setSel(null);
      setEditNodeId(null);
      trackAction('/action/load-save');
      flashStatus(
        mode === 'replace'
          ? `Board replaced from save — ${result.nodes.length} cards.${games} Download JSON to keep it.`
          : `Save merged — ${s.matched} updated, ${s.added} added.${games} Download JSON to keep this merge.`,
      );
      fitWhenLaidOut(svgWidth, svgHeight);
    },
    [byid, worlds, pushUndo, flashStatus, fitWhenLaidOut, snap, hiddenPacks, nodesCore],
  );

  const previewSave = useCallback((file: File) => {
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const buf = new Uint8Array(rd.result as ArrayBuffer);
        const parsed = parseSaveGame(buf);
        let n = eidcRef.current;
        const merge = mergeSaveIntoBoard({
          nodes: nodesCore,
          edges,
          groups,
          worlds,
          pairStatus,
          parsed,
          seedNameKeys: seedNameKeysFromNodes(seed.nodes),
          packReference: seed.nodes,
          rosterEdges: seed.edges,
          movedByHand: new Set(householdMoves.map((m) => m.simId)),
          now: new Date().toISOString(),
          nextEdgeId: () => 'v' + n++,
        });
        setSaveImport({ merge, parsed, starter: isStarterBoard(nodesCore, seed.nodes) });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Could not read that save';
        alert(msg);
      }
    };
    rd.readAsArrayBuffer(file);
  }, [nodesCore, edges, groups, worlds, pairStatus, seed.nodes, seed.edges, householdMoves]);

  const confirmSaveImport = useCallback(
    (svgWidth: number, svgHeight: number) => {
      if (!saveImport) return;
      applySaveBoard(saveImport.merge, svgWidth, svgHeight, 'merge');
    },
    [saveImport, applySaveBoard],
  );

  const confirmSaveReplace = useCallback(
    (svgWidth: number, svgHeight: number) => {
      if (!saveImport) return;
      let n = eidcRef.current;
      const replaced = mergeSaveIntoBoard({
        nodes: [],
        edges: [],
        groups: [],
        worlds,
        parsed: saveImport.parsed,
        seedNameKeys: seedNameKeysFromNodes(seed.nodes),
        packReference: seed.nodes,
        rosterEdges: seed.edges,
        now: new Date().toISOString(),
        nextEdgeId: () => 'v' + n++,
      });
      // Switch off the games the dialog said it would: the preview's list,
      // measured against the board as well as the roster. Games stay listed
      // in Filters with no sims, so one you don't have shows there, off.
      applySaveBoard(
        {
          ...replaced,
          summary: { ...replaced.summary, hidePacks: saveImport.merge.summary.hidePacks },
        },
        svgWidth,
        svgHeight,
        'replace',
      );
    },
    [saveImport, worlds, seed.nodes, seed.edges, applySaveBoard],
  );

  const cancelSaveImport = useCallback(() => setSaveImport(null), []);

  const togglePack = useCallback((pack: string, visible: boolean) => {
    setHiddenPacks((s) => {
      const next = new Set(s);
      if (visible) next.delete(pack);
      else next.add(pack);
      return next;
    });
  }, []);

  const toggleAge = useCallback((age: string) => {
    setHiAges((s) => {
      const next = new Set(s);
      if (next.has(age)) next.delete(age);
      else next.add(age);
      return next;
    });
  }, []);

  const toggleSingle = useCallback(() => {
    setHiSingle((on) => !on);
  }, []);

  const moveSimToHousehold = useCallback(
    (
      nodeId: string,
      world: string,
      houseGid: string | '__new',
      newName?: string,
    ) => {
      const n = byid[nodeId];
      if (!n) return;
      let dest: {
        gid: string;
        hh: string;
        world: string;
        nb: string;
        color: string;
      } | null = null;
      if (houseGid === '__new') {
        const name = (newName || '').trim();
        if (!name) return;
        const gid = world + '||' + name;
        dest = {
          gid,
          hh: name,
          world,
          nb: '-',
          color: worldColor(world, worlds),
        };
        setGroups((gs) => {
          if (gs.find((g) => g.gid === gid)) return gs;
          return [
            ...gs,
            {
              gid,
              hh: name,
              world,
              nb: '-',
              color: dest!.color,
              x: 0,
              y: 0,
              w: 0,
              h: 0,
            },
          ];
        });
      } else {
        const g = groups.find((x) => x.gid === houseGid);
        if (!g) return;
        dest = {
          gid: g.gid,
          hh: g.hh,
          world: g.world,
          nb: g.nb,
          color: g.color,
        };
      }
      if (dest.gid === n.gid) {
        setEditNodeId(null);
        return;
      }
      pushUndo();
      const patch: Partial<SimNode> = {
        gid: dest.gid,
        hh: dest.hh,
        world: dest.world,
        color: dest.color,
      };
      if (n.added) {
        patch.oworld = dest.world;
        patch.ohh = dest.hh;
        patch.oplay = 'Resident';
        patch.townie = false;
        if (houseGid === '__new') patch.onb = '-';
        else {
          const m0 = nodes.find(
            (x) =>
              x.gid === dest!.gid &&
              x.id !== nodeId &&
              x.onb &&
              x.onb !== '-',
          );
          if (m0) patch.onb = m0.onb;
        }
      }
      setHouseholdMoves((ms) => [
        ...ms,
        {
          id: 'h' + eidcRef.current++,
          simId: nodeId,
          createdAt: new Date().toISOString(),
          fromGid: n.gid,
          fromHh: n.hh,
          fromWorld: n.world,
          fromNb: n.nb,
          toGid: dest.gid,
          toHh: dest.hh,
          toWorld: dest.world,
          toNb: dest.nb,
        },
      ]);
      updateNode(nodeId, patch);
      setEditNodeId(null);
    },
    [byid, groups, nodes, updateNode, worlds, pushUndo],
  );

  const ageUpHousehold = useCallback(
    (gid: string) => {
      const members = nodesCore.filter((n) => n.gid === gid);
      if (!members.length) return;
      const nextById = new Map<string, Partial<SimNode>>();
      for (const n of members) {
        const patch = ageUpPatch(n);
        if (!patch) continue;
        nextById.set(n.id, patch);
      }
      if (!nextById.size) {
        flashStatus('No one in this household can age up.');
        return;
      }
      pushUndo();
      const nextCore = nodesCore.map((n) => {
        const patch = nextById.get(n.id);
        return patch ? { ...n, ...patch } : n;
      });
      pinCardsToCurrentPlaces(edges, nextCore);
      const g = groups.find((x) => x.gid === gid);
      const sample = members[0]!;
      const hh = g?.hh ?? sample.hh;
      const nb = g?.nb ?? sample.nb;
      const world = g?.world ?? sample.world;
      const createdAt = new Date().toISOString();
      const diedIds = [...nextById.entries()]
        .filter(([, patch]) => patch.state === DECEASED_STATE)
        .map(([id]) => id);
      setHouseholdAgeUps((es) => [
        ...es,
        {
          id: 'a' + eidcRef.current++,
          createdAt,
          gid,
          hh,
          nb,
          world,
          simIds: [...nextById.keys()],
        },
      ]);
      if (diedIds.length) {
        setDeceasedMarks((ms) => [
          ...ms,
          ...diedIds.map((simId) => ({
            id: 'd' + eidcRef.current++,
            simId,
            createdAt,
            cause: 'ageUp' as const,
          })),
        ]);
      }
      trackAction('/action/age-up');
      flashStatus(householdAgeUpLine(hh, nb, world));
    },
    [
      nodesCore,
      edges,
      groups,
      pinCardsToCurrentPlaces,
      pushUndo,
      flashStatus,
    ],
  );

  const toggleBloodline = useCallback(() => {
    if (sel?.type === 'node') {
      if (bloodlineId === sel.id) {
        setBloodlineId(null);
      } else {
        setBloodlineId(sel.id);
        // One sim's relatives at a time: Bloodline replaces a family highlight.
        setFamilyFocusState(false);
        trackAction('/action/bloodline');
      }
      return;
    }
    if (bloodlineId) {
      setBloodlineId(null);
      return;
    }
    flashStatus('Select a sim first, then Bloodline.');
  }, [sel, bloodlineId, flashStatus]);

  const toggleHideSecrets = useCallback(() => {
    const on = !hideSecrets;
    setHideSecrets(on);
    // A selected secret link would leave a label pointing at nothing.
    if (on && sel?.type === 'link' && edges.some((e) => e.secret && sel.ids.includes(e.id))) {
      setSel(null);
    }
    if (on) trackAction('/action/hide-secrets');
    flashStatus(
      on
        ? 'Secrets hidden — secret lovers and secret parents are off the board. They stay in your file.'
        : 'Secrets shown',
    );
  }, [hideSecrets, sel, edges, flashStatus]);

  const togglePlay = useCallback((oplay: string, visible: boolean) => {
    setHiddenPlay((s) => {
      const next = new Set(s);
      if (visible) next.delete(oplay);
      else next.add(oplay);
      return next;
    });
  }, []);

  // Every game, the roster's too, so one with no sims on the board (one you
  // don't have, switched off by a save import) stays listed and can be
  // switched on, rather than vanishing.
  const packs = useMemo(
    () =>
      [
        ...new Set(
          [...nodes.map((n) => n.pack), ...seed.nodes.map((n) => n.pack), ...hiddenPacks].filter(
            Boolean,
          ),
        ),
      ].sort((a, b) => (a === 'Base Game' ? -1 : b === 'Base Game' ? 1 : a.localeCompare(b))),
    [nodes, hiddenPacks, seed.nodes],
  );
  /** Cards on the board from each game. */
  const packCounts = useMemo(() => {
    const out = new Map<string, number>();
    for (const n of nodes) if (n.pack) out.set(n.pack, (out.get(n.pack) ?? 0) + 1);
    return out;
  }, [nodes]);
  /** Each game's colour: its world's, from the board or else the roster. */
  const packColors = useMemo(() => {
    const out = new Map<string, string>();
    for (const n of [...nodes, ...seed.nodes]) if (n.pack && !out.has(n.pack)) out.set(n.pack, n.color);
    return out;
  }, [nodes, seed.nodes]);

  const playabilities = useMemo(
    () =>
      [...new Set(nodesCore.map((n) => n.oplay).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b),
      ),
    [nodesCore],
  );

  const isSelLink = useCallback(
    (ids: string[]) =>
      sel?.type === 'link' && ids.some((i) => sel.ids.includes(i)),
    [sel],
  );

  const searchHitSet = useMemo(() => new Set(searchHits), [searchHits]);

  return {
    nodes,
    edges,
    groups,
    worlds,
    hiddenPacks,
    hiddenPlay,
    show,
    viewport,
    sel,
    multiSel,
    setMultiSel,
    clearMultiSel,
    connectMode,
    selectMode,
    setSelectMode,
    connSrc,
    snap,
    hiAges,
    hiSingle,
    bloodlineId,
    bloodlineIds,
    linksView,
    setLinksView,
    familyFocus,
    setFamilyFocus,
    family,
    familyIds,
    partneredIds,
    status,
    fastRoute,
    editNodeId,
    setEditNodeId,
    gamesOpen,
    setGamesOpen,
    agesOpen,
    setAgesOpen,
    playOpen,
    setPlayOpen,
    connectMenu,
    setConnectMenu,
    infantHouseMenu,
    setInfantHouseMenu,
    infantHouseChoices,
    requestInfantOfCouple,
    confirmInfantHouse,
    logOpen,
    setLogOpen,
    connectionLog,
    byid,
    packVis,
    playVis,
    nodeVis,
    nodeBuckets,
    edgeData,
    shownEdges,
    hideSecrets,
    hasSecrets,
    toggleHideSecrets,
    pairIndex,
    bloodVerts: bloodVertsMemo,
    hopD,
    visibleNodes,
    liveWorlds,
    packs,
    packCounts,
    packColors,
    playabilities,
    UEDIT,
    AGES_H,
    toggleShow,
    setConnectMode,
    cancelConnect,
    selectNode,
    selectLink,
    clearSel,
    addEdge,
    parentCycleReason,
    deleteSelected,
    addSim,
    addSimToHousehold,
    updateNode,
    pushUndo,
    canUndo,
    undo,
    ageUpHousehold,
    toggleBloodline,
    setBloodlineId,
    moveNodesByGid,
    moveNodesByWorld,
    moveNodesByIds,
    snapDragPosition,
    snapHouseholdDrag,
    snapNodeAction,
    handleConnectClick,
    handleConnectUnion,
    confirmConnect,
    fit,
    zoomToWorld,
    resetView,
    zoomAt,
    minZoom,
    focusLogEntry,
    focusSim,
    searchSim,
    searchHits,
    searchHitIndex,
    searchHitSet,
    sourceFileName,
    boardSourceLabel,
    canResetBoard,
    staleTab,
    reloadBoard,
    resetToBuiltInBoard,
    saveJson,
    loadJson,
    cancelLoadJson,
    confirmReplaceJson,
    confirmMergeJson,
    pendingLoadJson,
    previewSave,
    confirmSaveImport,
    confirmSaveReplace,
    cancelSaveImport,
    saveImport,
    togglePack,
    togglePlay,
    setHiddenPlay,
    toggleAge,
    toggleSingle,
    setHiAges,
    setHiSingle,
    setHiddenPacks,
    moveSimToHousehold,
    isSelLink,
    setSnap,
    setStatus,
    setFastRoute,
    setSkipRoute,
    setViewport,
  };
}

export type WhiteboardApi = ReturnType<typeof useWhiteboard>;
