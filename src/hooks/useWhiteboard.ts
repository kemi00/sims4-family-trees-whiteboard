import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import seedData from '../data/whiteboard.json';
import { ADDED_HOUSEHOLD, AGES_H, DECEASED_STATE, FOCUS_SIM_K, STATUS_FLASH_MS, UEDIT, ZOOM_MAX, ZOOM_MIN } from '../lib/constants.ts';
import {
  bbox,
  cardOriginAtViewportCenter,
  coreOffsetsAfterWorldSeparation,
  dominantWorldInViewport,
  snapHouseholdDelta,
  snapPosition,
  type SnapSticky,
} from '../lib/geometry.ts';
import {
  computeLayout,
  layoutBases,
  measureCard,
  offsetsForNewGids,
  OTHER_WORLD,
  rowPitch,
  spawnChildOrigin,
} from '../lib/layout.ts';
import { snapNodesToTiles, tileSnapOrigin } from '../lib/tiles.ts';
import { bloodVerts, computeEdgeRenderData, hopD } from '../lib/routing.ts';
import { lineageIds } from '../lib/bloodline.ts';
import {
  buildConnectionLog,
  householdAgeUpLine,
  householdPlace,
  simName,
} from '../lib/connectionLog.ts';
import { fileStamp, isUserE, migrateWhiteboardData, nextEidc, ageUpPatch, isLaterSimAge, partneredIdSet, randomNewSimGender, sanitizeEdges, siblingsShareParents, worldColor } from '../lib/utils.ts';
import { parseSaveGame } from '../lib/savegame/parseSave.ts';
import {
  mergeSaveIntoBoard,
  seedNameKeysFromNodes,
  type SaveMergeResult,
} from '../lib/savegame/mergeSave.ts';
import type {
  ConnSrc,
  DeceasedMark,
  Edge,
  Group,
  HouseholdAgeUp,
  HouseholdMove,
  Selection,
  ShowToggles,
  SimAgeUp,
  SimNode,
  Viewport,
  WhiteboardData,
  World,
} from '../types/whiteboard.ts';

const INITIAL_VIEW: Viewport = { tx: 40, ty: 40, k: 0.72 };

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

const LAYER_STATUS: Record<keyof ShowToggles, { on: string; off: string }> = {
  seed: {
    on: 'Family links on — parent, sibling, and partner lines',
    off: 'Family links off — cards stay, relationship lines hide',
  },
  groups: {
    on: 'Household boxes on — dashed boxes around each house',
    off: 'Household boxes off — house outlines hide',
  },
  worlds: {
    on: 'World boxes on — coloured frames around each world',
    off: 'World boxes off — world frames hide',
  },
};

/** Strip derived geometry — only semantic fields and drag offsets are persisted. */
function toCore(n: SimNode): SimNode {
  const { x, y, w, h, ...rest } = n;
  return { ...rest, ox: rest.ox ?? 0, oy: rest.oy ?? 0, x: 0, y: 0, w: 0, h: 0 };
}

type BoardSnap = {
  nodesCore: SimNode[];
  edges: Edge[];
  groups: Group[];
  householdMoves: HouseholdMove[];
  householdAgeUps: HouseholdAgeUp[];
  deceasedMarks: DeceasedMark[];
  simAgeUps: SimAgeUp[];
};

/** Fields that change packing (generation rows, household tiles, world columns). */
const LAYOUT_PIN_KEYS: (keyof SimNode)[] = [
  'gid',
  'world',
  'hh',
  'age',
  'breed',
  'oplay',
];

export function useWhiteboard() {
  const data = seedData as WhiteboardData;
  const [nodesCore, setNodesCore] = useState<SimNode[]>(() =>
    data.nodes.map((n) => toCore(n)),
  );
  const [edges, setEdges] = useState<Edge[]>(() =>
    sanitizeEdges(
      data.edges.map((e) => ({
        ...e,
        source: e.source ?? (String(e.id).charAt(0) === 'u' ? 'planned' : 'seed'),
      })),
    ),
  );
  const [groups, setGroups] = useState<Group[]>(() =>
    data.groups.map((g) => ({ ...g })),
  );
  const [worlds] = useState<World[]>(data.worlds);
  const [hiddenPacks, setHiddenPacks] = useState<Set<string>>(new Set());
  const [hiddenPlay, setHiddenPlay] = useState<Set<string>>(new Set());
  const [show, setShow] = useState<ShowToggles>({
    seed: true,
    groups: true,
    worlds: true,
  });
  const [viewport, setViewport] = useState<Viewport>(INITIAL_VIEW);
  const [sel, setSel] = useState<Selection>(null);
  const [connectMode, setConnectModeState] = useState(false);
  const [connSrc, setConnSrc] = useState<ConnSrc>(null);
  const [snap, setSnap] = useState(true);
  const [hiAges, setHiAges] = useState<Set<string>>(new Set());
  const [hiSingle, setHiSingle] = useState(false);
  const [bloodlineId, setBloodlineId] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [fastRoute, setFastRoute] = useState(false);
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
  const [householdMoves, setHouseholdMoves] = useState<HouseholdMove[]>([]);
  const [householdAgeUps, setHouseholdAgeUps] = useState<HouseholdAgeUp[]>([]);
  const [deceasedMarks, setDeceasedMarks] = useState<DeceasedMark[]>([]);
  const [simAgeUps, setSimAgeUps] = useState<SimAgeUp[]>([]);
  const [saveImport, setSaveImport] = useState<SaveMergeResult | null>(null);
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
  const eidcRef = useRef(100000);
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

  const edgeData = useMemo(
    () =>
      computeEdgeRenderData({
        nodes,
        edges,
        groups,
        show,
        packVis: nodeVis,
        fastRoute,
      }),
    [nodes, edges, groups, show, nodeVis, fastRoute],
  );

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

  const partneredIds = useMemo(() => partneredIdSet(edges), [edges]);

  const connectionLog = useMemo(
    () =>
      buildConnectionLog(
        edges,
        byid,
        householdMoves,
        householdAgeUps,
        deceasedMarks,
        simAgeUps,
      ),
    [edges, byid, householdMoves, householdAgeUps, deceasedMarks, simAgeUps],
  );

  const bloodlineIds = useMemo(
    () => (bloodlineId ? lineageIds(bloodlineId, edges) : null),
    [bloodlineId, edges],
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

  const pushUndo = useCallback(() => {
    undoRef.current.push({
      nodesCore: nodesCore.map((n) => ({ ...n })),
      edges: edges.map((e) => ({ ...e })),
      groups: groups.map((g) => ({ ...g })),
      householdMoves: householdMoves.map((m) => ({ ...m })),
      householdAgeUps: householdAgeUps.map((a) => ({ ...a })),
      deceasedMarks: deceasedMarks.map((d) => ({ ...d })),
      simAgeUps: simAgeUps.map((a) => ({ ...a })),
    });
    setCanUndo(true);
  }, [nodesCore, edges, groups, householdMoves, householdAgeUps, deceasedMarks, simAgeUps]);

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
    setCanUndo(undoRef.current.length > 0);
    setSel(null);
    setEditNodeId(null);
    setInfantHouseMenu(null);
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

  const setConnectMode = useCallback(
    (on: boolean) => {
      setConnectModeState(on);
      setConnSrc(null);
      setConnectMenu(null);
      setInfantHouseMenu(null);
      if (on && sel?.type === 'node' && byid[sel.id]) {
        setConnSrc(sel.id);
        setStatus(
          `First sim: ${byid[sel.id]!.first} — now click the SECOND sim (Esc to cancel)`,
        );
      } else {
        setStatus(on ? 'Connect: click the FIRST sim' : '');
      }
    },
    [sel, byid],
  );

  const cancelConnect = useCallback(() => {
    setConnSrc(null);
    setConnectMenu(null);
    setInfantHouseMenu(null);
    setStatus(
      connectMode ? 'Connect: click the FIRST sim' : '',
    );
  }, [connectMode]);

  const selectNode = useCallback((id: string) => {
    setSel({ type: 'node', id });
  }, []);

  const selectLink = useCallback((ids: string[]) => {
    setSel({ type: 'link', ids });
  }, []);

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

  const addEdge = useCallback((a: string, b: string, type: Edge['type']) => {
    if (type === 'sibling' && siblingsShareParents(a, b, edges)) return;
    let nextEdges: Edge[] | null = null;
    pushUndo();
    setEdges((e) => {
      const id = 'u' + eidcRef.current++;
      nextEdges = sanitizeEdges([
        ...e,
        { id, a, b, type, source: 'planned', createdAt: new Date().toISOString() },
      ]);
      return nextEdges;
    });
    if (nextEdges) freezeAfterEdgeChange([a, b], nextEdges);
  }, [edges, freezeAfterEdgeChange, pushUndo]);

  const deleteSelected = useCallback(() => {
    if (!sel) return;
    pushUndo();
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
          const base = layoutBases(ns, worlds, edges).get(id);
          if (base) {
            const absX =
              patch.x !== undefined ? patch.x : base.x + (n.ox ?? 0);
            const absY =
              patch.y !== undefined ? patch.y : base.y + (n.oy ?? 0);
            next.ox = absX - base.x;
            next.oy = absY - base.y;
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
  }, [nodesCore, worlds, edges, pinCardsToCurrentPlaces]);

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

  /** Push world frames apart by whole tiles; persists via ox/oy. */
  const enforceWorldSeparation = useCallback(() => {
    setNodesCore((core) => {
      const laid = snap
        ? snapNodesToTiles(computeLayout(core, worlds, edges))
        : computeLayout(core, worlds, edges);
      return coreOffsetsAfterWorldSeparation(core, laid, groups, () => true);
    });
  }, [snap, worlds, edges, groups]);

  const makeChildOfCouple = useCallback(
    (pa: string, pb: string, childId: string) => {
      if (childId === pa || childId === pb) {
        cancelConnect();
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
    [byid, cancelConnect, flashStatus, freezeAfterEdgeChange, pushUndo],
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
          'Connect: now click the SECOND sim — or click a ⚭/❤ to make this sim their child (Esc to cancel)',
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
    (type: string) => {
      if (!connectMenu) return;
      const { a, b } = connectMenu;
      if (type === 'childof') addEdge(b, a, 'parent');
      else addEdge(a, b, type as Edge['type']);
      setConnectMenu(null);
      flashStatus('Linked ✓ — click a sim for the next link');
      setConnSrc(null);
    },
    [connectMenu, addEdge, flashStatus],
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

  const zoomAt = useCallback(
    (f: number, cx: number, cy: number, svgRect: DOMRect) => {
      setViewport((v) => {
        const nk = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v.k * f));
        if (nk === v.k) return v;
        const mx = cx - svgRect.left;
        const my = cy - svgRect.top;
        return {
          k: nk,
          tx: mx - (mx - v.tx) * (nk / v.k),
          ty: my - (my - v.ty) * (nk / v.k),
        };
      });
    },
    [],
  );

  const focusLogEntry = useCallback(
    (ids: string[], svgWidth: number, svgHeight: number) => {
      setSel({ type: 'link', ids });
      const e = edges.find((x) => ids.includes(x.id));
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
        setSel({ type: 'node', id: n.id });
      }
    },
    [nodes, nodeVis, byid, frameSim, searchHitIndex],
  );

  const saveJson = useCallback(() => {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            nodes: nodesCore.map(toCore),
            edges,
            groups,
            hiddenPacks: [...hiddenPacks],
            hiddenPlay: [...hiddenPlay],
            hiAges: [...hiAges],
            hiSingle,
            bloodlineId,
            householdMoves,
            householdAgeUps,
            deceasedMarks,
            simAgeUps,
            connectionLog: connectionLog.map((entry) => entry.text),
          },
          null,
          1,
        ),
      ],
      { type: 'application/json' },
    );
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `sims4_family_trees_${fileStamp()}.json`;
    a.click();
  }, [nodesCore, edges, groups, hiddenPacks, hiddenPlay, hiAges, hiSingle, bloodlineId, householdMoves, householdAgeUps, deceasedMarks, simAgeUps, connectionLog]);

  const loadJson = useCallback(
    (file: File, svgWidth: number, svgHeight: number) => {
      const rd = new FileReader();
      rd.onload = () => {
        try {
          const d = migrateWhiteboardData(JSON.parse(rd.result as string));
          setNodesCore((d.nodes as SimNode[]).map(toCore));
          const loadedEdges = sanitizeEdges(d.edges);
          setEdges(loadedEdges);
          const loadedMoves = d.householdMoves ?? [];
          const loadedAgeUps = d.householdAgeUps ?? [];
          const loadedDeaths = d.deceasedMarks ?? [];
          const loadedSimAgeUps = d.simAgeUps ?? [];
          setHouseholdMoves(loadedMoves);
          setHouseholdAgeUps(loadedAgeUps);
          setDeceasedMarks(loadedDeaths);
          setSimAgeUps(loadedSimAgeUps);
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
          if (d.groups) setGroups(d.groups);
          setHiddenPacks(new Set(d.hiddenPacks || []));
          setHiddenPlay(new Set(d.hiddenPlay || []));
          setHiAges(new Set(d.hiAges || []));
          setHiSingle(!!d.hiSingle);
          const loadedIds = new Set((d.nodes as SimNode[]).map((n) => n.id));
          setBloodlineId(
            d.bloodlineId && loadedIds.has(d.bloodlineId)
              ? d.bloodlineId
              : null,
          );
          setSel(null);
          setEditNodeId(null);
          // Separate after state commits so layout uses the loaded groups/edges.
          setTimeout(() => {
            setNodesCore((core) => {
              const laid = snap
                ? snapNodesToTiles(computeLayout(core, worlds, loadedEdges))
                : computeLayout(core, worlds, loadedEdges);
              return coreOffsetsAfterWorldSeparation(
                core,
                laid,
                (d.groups as Group[]) ?? groups,
                () => true,
              );
            });
            fit(svgWidth, svgHeight);
          }, 0);
        } catch {
          alert('Bad file');
        }
      };
      rd.readAsText(file);
    },
    [fit, snap, worlds, groups],
  );

  const previewSave = useCallback((file: File) => {
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const buf = new Uint8Array(rd.result as ArrayBuffer);
        const parsed = parseSaveGame(buf);
        let n = eidcRef.current;
        const merged = mergeSaveIntoBoard({
          nodes: nodesCore,
          edges,
          groups,
          worlds,
          parsed,
          seedNameKeys: seedNameKeysFromNodes(data.nodes),
          now: new Date().toISOString(),
          nextEdgeId: () => 'v' + n++,
        });
        setSaveImport(merged);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Could not read that save';
        alert(msg);
      }
    };
    rd.readAsArrayBuffer(file);
  }, [nodesCore, edges, groups, worlds, data.nodes]);

  const confirmSaveImport = useCallback(
    (svgWidth: number, svgHeight: number) => {
      if (!saveImport) return;
      pushUndo();
      setEdges(saveImport.edges);
      setGroups(saveImport.groups);
      const mergedCore = offsetsForNewGids(
        byid,
        saveImport.nodes.map(toCore),
        worlds,
        saveImport.edges,
      );
      const laid = snap
        ? snapNodesToTiles(computeLayout(mergedCore, worlds, saveImport.edges))
        : computeLayout(mergedCore, worlds, saveImport.edges);
      setNodesCore(
        coreOffsetsAfterWorldSeparation(
          mergedCore,
          laid,
          saveImport.groups,
          () => true,
        ),
      );
      eidcRef.current = nextEidc(saveImport.edges, eidcRef.current);
      const s = saveImport.summary;
      if (s.hidePacks.length) {
        setHiddenPacks((prev) => {
          const next = new Set(prev);
          for (const p of s.hidePacks) next.add(p);
          return next;
        });
      }
      setSaveImport(null);
      setSel(null);
      flashStatus(
        s.hidePacks.length
          ? `Save merged — ${s.matched} updated, ${s.added} added. Hidden ${s.hidePacks.length} games not in this save.`
          : `Save merged — ${s.matched} updated, ${s.added} added, ${s.confirmed} links confirmed, ${s.newLinks} new links, ${s.stillPlanned} still planned.`,
      );
      setTimeout(() => fit(svgWidth, svgHeight), 0);
    },
    [saveImport, byid, worlds, pushUndo, flashStatus, fit, snap],
  );

  const cancelSaveImport = useCallback(() => setSaveImport(null), []);

  const exportPng = useCallback(
    (svgEl: SVGSVGElement) => {
      const [x0, y0, x1, y1] = bbox(nodes, nodeVis);
      const pad = 40;
      const W = Math.max(1, x1 - x0 + pad * 2);
      const H = Math.max(1, y1 - y0 + pad * 2);
      const clone = svgEl.cloneNode(true) as SVGSVGElement;
      const sc = clone.querySelector('#scene');
      if (!sc) return;
      sc.setAttribute(
        'transform',
        `translate(${-x0 + pad},${-y0 + pad})`,
      );
      clone.setAttribute('width', String(W));
      clone.setAttribute('height', String(H));
      clone.setAttribute('viewBox', `0 0 ${W} ${H}`);
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      const bg = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'rect',
      );
      bg.setAttribute('x', '0');
      bg.setAttribute('y', '0');
      bg.setAttribute('width', String(W));
      bg.setAttribute('height', String(H));
      bg.setAttribute('fill', '#f4f1e8');
      sc.parentNode?.insertBefore(bg, sc);
      const xml =
        '<?xml version="1.0" encoding="UTF-8"?>' +
        new XMLSerializer().serializeToString(clone);
      const svgBlob = new Blob([xml], {
        type: 'image/svg+xml;charset=utf-8',
      });
      const url = URL.createObjectURL(svgBlob);
      const img = new Image();
      const fail = (why: string) => {
        URL.revokeObjectURL(url);
        alert(why);
      };
      img.onerror = () => fail('Could not render the PNG.');
      img.onload = () => {
        const cap = 8192;
        const s = Math.min(2, cap / W, cap / H);
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.floor(W * s));
        c.height = Math.max(1, Math.floor(H * s));
        const ctx = c.getContext('2d');
        if (!ctx) {
          fail('Could not create a PNG canvas.');
          return;
        }
        ctx.scale(s, s);
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        c.toBlob((b) => {
          if (!b) {
            alert(
              'PNG export failed — the board is too large for this browser. Hide unused games in Filters and try again.',
            );
            return;
          }
          const a = document.createElement('a');
          const href = URL.createObjectURL(b);
          a.href = href;
          a.download = `sims4_family_trees_${fileStamp()}.png`;
          a.click();
          setTimeout(() => URL.revokeObjectURL(href), 4000);
        }, 'image/png');
      };
      img.src = url;
    },
    [nodes, nodeVis],
  );

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
      setBloodlineId((cur) => (cur === sel.id ? null : sel.id));
      return;
    }
    if (bloodlineId) {
      setBloodlineId(null);
      return;
    }
    flashStatus('Select a sim first, then Bloodline.');
  }, [sel, bloodlineId, flashStatus]);

  const togglePlay = useCallback((oplay: string, visible: boolean) => {
    setHiddenPlay((s) => {
      const next = new Set(s);
      if (visible) next.delete(oplay);
      else next.add(oplay);
      return next;
    });
  }, []);

  const packs = useMemo(
    () =>
      [...new Set(nodes.map((n) => n.pack).filter(Boolean))].sort((a, b) =>
        a === 'Base Game' ? -1 : b === 'Base Game' ? 1 : a.localeCompare(b),
      ),
    [nodes],
  );

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
    connectMode,
    connSrc,
    snap,
    hiAges,
    hiSingle,
    bloodlineId,
    bloodlineIds,
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
    edgeData,
    bloodVerts: bloodVertsMemo,
    hopD,
    visibleNodes,
    liveWorlds,
    packs,
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
    deleteSelected,
    addSim,
    updateNode,
    pushUndo,
    canUndo,
    undo,
    ageUpHousehold,
    toggleBloodline,
    setBloodlineId,
    moveNodesByGid,
    moveNodesByWorld,
    snapDragPosition,
    snapHouseholdDrag,
    snapNodeAction,
    enforceWorldSeparation,
    handleConnectClick,
    handleConnectUnion,
    confirmConnect,
    fit,
    zoomToWorld,
    resetView,
    zoomAt,
    focusLogEntry,
    focusSim,
    searchSim,
    searchHits,
    searchHitIndex,
    searchHitSet,
    saveJson,
    loadJson,
    previewSave,
    confirmSaveImport,
    cancelSaveImport,
    saveImport,
    exportPng,
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
    setViewport,
  };
}

export type WhiteboardApi = ReturnType<typeof useWhiteboard>;
