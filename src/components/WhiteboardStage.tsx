import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { flushSync } from 'react-dom';
import { border, unionAtPoint, unionGeom, viewportWorldRect, wheelViewport, zoomViewportAt, type SnapSticky } from '../lib/geometry.ts';
import { householdChrome, tileSnapOrigin } from '../lib/tiles.ts';
import {
  CARD_H,
  CARD_MIN_W,
  DRAG_SLOP_PX,
  EDGE_HIT_SCREEN_PX,
  EDGE_SEL_SCREEN_PX,
  LABEL_MIN_K,
  LONG_PRESS_MS,
  TILE,
  ZOOM_MAX,
} from '../lib/constants.ts';
import {
  applyChromeTranslates,
  applyEdgeTranslates,
  applyNodeTranslates,
  applySceneTransform,
  clearDragChrome,
  paintDragChrome,
  restoreChromeTranslates,
  restoreEdgeTranslates,
  restoreNodeTranslates,
  sceneTransformAttr,
  type LiveCamera,
} from '../lib/liveScene.ts';
import {
  idsForMultiSel,
  multiSelContainsGid,
  multiSelContainsNode,
  multiSelContainsWorld,
  normalizeRect,
  resolveMarqueeSelection,
  type WorldRect,
} from '../lib/marquee.ts';
import {
  cullWindow,
  cullWindowStale,
  nodeInCull,
  parsePointList,
  pathInCull,
  tileGridRect,
} from '../lib/viewportCull.ts';
import {
  describeLinkSelection,
  type ChipObstacle,
} from '../lib/linkLabel.ts';
import { slug, trackAction } from '../lib/analytics.ts';
import { isUserE, siblingsShareParents } from '../lib/utils.ts';
import type { WhiteboardApi } from '../hooks/useWhiteboard.ts';
import { useCompactChrome } from '../hooks/useCompactChrome.ts';
import type { BoardMultiSel, SimNode } from '../types/whiteboard.ts';
import { BloodlineBanner } from './BloodlineBanner.tsx';
import { StaleTabBanner } from './StaleTabBanner.tsx';
import { ConnectMenu } from './ConnectMenu.tsx';
import { EdgeLayer } from './EdgeLayer.tsx';
import { GroupLayer } from './GroupLayer.tsx';
import { Hint } from './Hint.tsx';
import { InfantHouseMenu } from './InfantHouseMenu.tsx';
import { Legend } from './Legend.tsx';
import { LinkSelectionChip } from './LinkSelectionChip.tsx';
import { Minimap } from './Minimap.tsx';
import { SimEditor } from './SimEditor.tsx';
import { SimNodeView } from './SimNode.tsx';
import { ViewControls } from './ViewControls.tsx';
import { WorldLayer } from './WorldLayer.tsx';

type Props = {
  wb: WhiteboardApi;
  svgRef: React.RefObject<SVGSVGElement | null>;
  stageRef: React.RefObject<HTMLDivElement | null>;
  /** No dialog is open: a first visit may show the Getting around card. */
  tipsReady?: boolean;
};

/** Chrome on #stage that owns its own wheel (scroll), not board zoom. */
const STAGE_WHEEL_SCROLL_SEL =
  '#legend, #hint, .legend-chip, .editor, .menu, .bloodline-banner, .minimap';

export function WhiteboardStage({ wb, svgRef, stageRef, tipsReady }: Props) {
  const compact = useCompactChrome();
  const [tempLine, setTempLine] = useState<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  } | null>(null);
  const [marqueeBox, setMarqueeBox] = useState<{
    l: number;
    t: number;
    r: number;
    b: number;
  } | null>(null);
  const [stageSize, setStageSize] = useState({ w: 800, h: 600 });
  const stageSizeRef = useRef(stageSize);
  stageSizeRef.current = stageSize;
  /** Render window (see viewportCull). Moves with the live camera, not only on commit. */
  const [cullWin, setCullWin] = useState<WorldRect | null>(null);
  const cullWinRef = useRef<WorldRect | null>(null);
  /** Sims and households a live drag is moving — kept mounted wherever they are. */
  const [dragUnit, setDragUnit] = useState<{
    ids: ReadonlySet<string>;
    gids: ReadonlySet<string>;
  } | null>(null);
  const [viewFitted, setViewFitted] = useState(false);
  const [editorPos, setEditorPos] = useState({ left: 0, top: 0 });
  const editorRef = useRef<HTMLDivElement>(null);

  const panRef = useRef<{
    x: number;
    y: number;
    lastX: number;
    lastY: number;
    tx: number;
    ty: number;
    k: number;
    armed: boolean;
    /** Space or the middle button: only moves the view, even as a tap. */
    hand?: boolean;
  } | null>(null);
  /** Space held with the pointer over the board: every press pans (see onSvgPointerDownCapture). */
  const spaceHandRef = useRef(false);
  const dragRef = useRef<{
    n: SimNode;
    dx: number;
    dy: number;
    sticky: SnapSticky;
    sx: number;
    sy: number;
    originX: number;
    originY: number;
    lastX: number;
    lastY: number;
    base: Record<string, { ox: number; oy: number }>;
    armed: boolean;
    /** Pressed on the card's ⠇: a click opens the editor at once. */
    more: boolean;
  } | null>(null);
  const legendRef = useRef<HTMLDivElement>(null);
  const movedRef = useRef(false);
  const lastClickRef = useRef<{ id: string; t: number } | null>(null);
  const hhDragRef = useRef<{
    gid: string;
    sx: number;
    sy: number;
    originX: number;
    originY: number;
    lastDx: number;
    lastDy: number;
    ids: string[];
    base: Record<string, { ox: number; oy: number }>;
    px: number;
    py: number;
    armed: boolean;
  } | null>(null);
  const worldDragRef = useRef<{
    world: string;
    sx: number;
    sy: number;
    originX: number;
    originY: number;
    lastDx: number;
    lastDy: number;
    ids: string[];
    base: Record<string, { ox: number; oy: number }>;
    px: number;
    py: number;
    armed: boolean;
  } | null>(null);
  const marqueeRef = useRef<{
    x0: number;
    y0: number;
    x1: number;
    y1: number;
    px: number;
    py: number;
    armed: boolean;
  } | null>(null);
  const multiDragRef = useRef<{
    sel: BoardMultiSel;
    ids: string[];
    sx: number;
    sy: number;
    originX: number;
    originY: number;
    lastDx: number;
    lastDy: number;
    base: Record<string, { ox: number; oy: number }>;
    px: number;
    py: number;
    armed: boolean;
  } | null>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{
    dist: number;
    worldX: number;
    worldY: number;
    k: number;
  } | null>(null);
  const leftoverRef = useRef<number | null>(null);
  const connectTapRef = useRef(false);
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wbRef = useRef(wb);
  wbRef.current = wb;
  const sceneRef = useRef<SVGGElement>(null);
  const guidesHostRef = useRef<SVGGElement>(null);
  const viewportLiveRef = useRef(wb.viewport);
  const minZoomRef = useRef(wb.minZoom);
  minZoomRef.current = wb.minZoom;
  const viewportGestureRef = useRef(false);
  const navDepthRef = useRef(0);
  const panFrameRef = useRef(0);
  const pinchFrameRef = useRef(0);
  const wheelIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragFrameRef = useRef(0);
  const beginMultiDragRef = useRef<
    (
      sel: BoardMultiSel,
      wx: number,
      wy: number,
      ev: ReactPointerEvent,
    ) => boolean
  >(() => false);
  const dragPreviewRef = useRef<{
    origins: Record<string, { x: number; y: number }>;
    gids: string[];
    worlds: string[];
    dx: number;
    dy: number;
  } | null>(null);

  const { tx, ty, k } = wb.viewport;
  /**
   * Board type is sub-pixel below this zoom, so it is not drawn at all.
   * `viewFitted` keeps the very first render label-free: it runs at the
   * placeholder `INITIAL_VIEW` zoom, before the stage has been measured and
   * fitted, so any type it drew would be laid out and thrown away one frame
   * later — and shaping a few thousand `<text>` nodes is the single most
   * expensive thing on the board.
   */
  const labels = viewFitted && k >= LABEL_MIN_K;

  /**
   * Re-centre the render window once the (live) view nears its edge. A jump
   * past the overscan (minimap click, hard fling) mounts the new cards before
   * the browser paints, so the board never flashes empty.
   */
  const refreshCull = useCallback(
    (vp: { tx: number; ty: number; k: number }, inCommit: boolean) => {
      const { w, h } = stageSizeRef.current;
      const cur = cullWinRef.current;
      if (cur && !cullWindowStale(cur, vp, w, h)) return;
      const next = cullWindow(vp, w, h);
      cullWinRef.current = next;
      const v = viewportWorldRect(vp, w, h);
      const uncovered =
        !!cur && (v.l < cur.l || v.t < cur.t || v.r > cur.r || v.b > cur.b);
      if (uncovered && !inCommit) flushSync(() => setCullWin(next));
      else setCullWin(next);
    },
    [],
  );

  const applyVp = useCallback(
    (vp: { tx: number; ty: number; k: number }, inCommit = false) => {
      applySceneTransform(sceneRef.current, vp);
      viewportLiveRef.current = vp;
      refreshCull(vp, inCommit);
    },
    [refreshCull],
  );

  useEffect(() => {
    refreshCull(viewportLiveRef.current, false);
  }, [stageSize, refreshCull]);

  const setNavigating = useCallback((active: boolean) => {
    const stage = stageRef.current;
    if (!stage) return;
    if (active) {
      navDepthRef.current += 1;
      if (navDepthRef.current === 1) stage.classList.add('stage--navigating');
    } else {
      navDepthRef.current = Math.max(0, navDepthRef.current - 1);
      if (navDepthRef.current === 0) {
        stage.classList.remove('stage--navigating');
      }
    }
  }, [stageRef]);

  const endNavigation = useCallback(() => {
    navDepthRef.current = 0;
    stageRef.current?.classList.remove('stage--navigating');
  }, [stageRef]);

  const setDragging = useCallback(
    (active: boolean) => {
      stageRef.current?.classList.toggle('stage--dragging', active);
    },
    [stageRef],
  );

  /**
   * Space held over the board is the hand: presses pan in every mode until it
   * is let go (a quasimode, like Figma or Miro). Typing keeps its spaces, and
   * a button or field in a menu or the editor keeps Space for itself.
   */
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const set = (on: boolean) => {
      spaceHandRef.current = on;
      stage.classList.toggle('stage--hand', on);
    };
    const keepsSpace = (t: EventTarget | null) =>
      t instanceof HTMLElement &&
      (t.isContentEditable ||
        /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) ||
        (stage.contains(t) && !t.closest('svg')));
    const down = (ev: KeyboardEvent) => {
      if (ev.code !== 'Space' || ev.ctrlKey || ev.metaKey || ev.altKey) return;
      if (!spaceHandRef.current && (keepsSpace(ev.target) || !stage.matches(':hover'))) return;
      // No page scroll, and the toolbar button that still has focus is not pressed.
      ev.preventDefault();
      if (!spaceHandRef.current) set(true);
    };
    const up = (ev: KeyboardEvent) => {
      if (ev.code !== 'Space' || !spaceHandRef.current) return;
      ev.preventDefault();
      set(false);
    };
    const off = () => {
      if (spaceHandRef.current) set(false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', off);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', off);
    };
  }, [stageRef]);

  const readLiveViewport = useCallback(() => viewportLiveRef.current, []);

  const commitLiveViewport = useCallback(() => {
    wbRef.current.setViewport(viewportLiveRef.current);
    if (panRef.current?.armed || pinchRef.current) return;
    viewportGestureRef.current = false;
    endNavigation();
  }, [endNavigation]);

  const liveCamera = useMemo<LiveCamera>(
    () => ({
      read: readLiveViewport,
      apply: (vp) => {
        applyVp(vp);
      },
      commit: commitLiveViewport,
      beginNav: () => {
        viewportGestureRef.current = true;
        setNavigating(true);
      },
    }),
    [applyVp, commitLiveViewport, readLiveViewport, setNavigating],
  );

  const flushPanTransform = useCallback(() => {
    panFrameRef.current = 0;
    const p = panRef.current;
    if (!p?.armed) return;
    applyVp({
      k: p.k,
      tx: p.tx + (p.lastX - p.x),
      ty: p.ty + (p.lastY - p.y),
    });
  }, [applyVp]);

  const schedulePanTransform = useCallback(() => {
    if (panFrameRef.current) return;
    panFrameRef.current = requestAnimationFrame(flushPanTransform);
  }, [flushPanTransform]);

  useLayoutEffect(() => {
    if (viewportGestureRef.current) return;
    applyVp(wb.viewport, true);
  }, [wb.viewport, applyVp]);

  /* Only select-mode is React-owned. Navigating/dragging stay on classList in
     gesture handlers so a mid-gesture commit cannot flash-hide the SVG. */
  useLayoutEffect(() => {
    stageRef.current?.classList.toggle('stage--select', wb.selectMode);
  }, [wb.selectMode, stageRef]);

  const scheduleWheelViewport = useCallback(
    (vp: { tx: number; ty: number; k: number }) => {
      applyVp(vp);
      viewportGestureRef.current = true;
      setNavigating(true);
      if (wheelIdleTimerRef.current) clearTimeout(wheelIdleTimerRef.current);
      wheelIdleTimerRef.current = setTimeout(() => {
        wheelIdleTimerRef.current = null;
        commitLiveViewport();
      }, 150);
    },
    [applyVp, setNavigating, commitLiveViewport],
  );

  useEffect(() => {
    return () => {
      if (wheelIdleTimerRef.current) clearTimeout(wheelIdleTimerRef.current);
      if (panFrameRef.current) cancelAnimationFrame(panFrameRef.current);
      if (pinchFrameRef.current) cancelAnimationFrame(pinchFrameRef.current);
      if (dragFrameRef.current) cancelAnimationFrame(dragFrameRef.current);
    };
  }, []);

  const toWorld = useCallback(
    (sx: number, sy: number) => {
      const { tx: ltx, ty: lty, k: lk } = viewportLiveRef.current;
      const r = svgRef.current!.getBoundingClientRect();
      return [(sx - r.left - ltx) / lk, (sy - r.top - lty) / lk] as [
        number,
        number,
      ];
    },
    [svgRef],
  );

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const sync = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      setStageSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [stageRef]);

  const positionEditor = useCallback(() => {
    if (!wb.editNodeId || !wb.byid[wb.editNodeId]) return;
    const n = wb.byid[wb.editNodeId]!;
    const r = svgRef.current!.getBoundingClientRect();
    const pad = 8;
    const gap = 12;
    const ew = editorRef.current?.offsetWidth ?? 272;
    const eh = editorRef.current?.offsetHeight ?? 420;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const { tx: ltx, ty: lty, k: lk } = viewportLiveRef.current;
    const nx = r.left + ltx + n.x * lk;
    const ny = r.top + lty + n.y * lk;
    const nw = n.w * lk;

    let left = nx + nw + gap;
    if (left + ew > vw - pad) left = nx - ew - gap;
    if (left + ew > vw - pad) left = vw - ew - pad;
    if (left < pad) left = pad;

    let top = ny;
    if (top + eh > vh - pad) top = vh - eh - pad;
    if (top < pad) top = pad;

    setEditorPos({ left, top });
  }, [wb.editNodeId, wb.byid, svgRef]);

  useEffect(() => {
    positionEditor();
  }, [positionEditor, wb.viewport, wb.editNodeId]);

  useEffect(() => {
    const el = editorRef.current;
    if (!el || !wb.editNodeId) return;
    const ro = new ResizeObserver(() => positionEditor());
    ro.observe(el);
    return () => ro.disconnect();
  }, [wb.editNodeId, positionEditor]);

  useEffect(() => {
    if (!wb.editNodeId) return;
    const onResize = () => positionEditor();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [wb.editNodeId, positionEditor]);

  useEffect(() => {
    if (!wb.editNodeId) return;
    const onPointer = (ev: PointerEvent) => {
      const t = ev.target as Node;
      if (editorRef.current?.contains(t)) return;
      const active = document.activeElement;
      if (
        active &&
        editorRef.current?.contains(active) &&
        active.tagName === 'SELECT'
      ) {
        return;
      }
      wb.setEditNodeId(null);
    };
    document.addEventListener('pointerdown', onPointer, true);
    return () => document.removeEventListener('pointerdown', onPointer, true);
  }, [wb.editNodeId, wb.setEditNodeId]);

  // Drop the rubber-band line as soon as the link is confirmed, cancelled, or
  // the type menu takes over; otherwise it stays frozen on the last cursor spot.
  useEffect(() => {
    if (!wb.connSrc || wb.connectMenu) setTempLine(null);
  }, [wb.connSrc, wb.connectMenu]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (ev: WheelEvent) => {
      const t = ev.target as Element | null;
      if (t?.closest?.(STAGE_WHEEL_SCROLL_SEL)) return;
      ev.preventDefault();
      const r = svgRef.current!.getBoundingClientRect();
      const next = wheelViewport(
        viewportLiveRef.current,
        ev,
        r,
        minZoomRef.current(r.width, r.height),
      );
      if (next === viewportLiveRef.current) return;
      scheduleWheelViewport(next);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [stageRef, svgRef, scheduleWheelViewport]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const chromeSel =
      '.viewctl, #legend, #hint, #hintIcon, .editor, .menu, #status, #autosave-cue, .legend-chip, .bloodline-banner, .minimap';
    const onTouchStart = (ev: TouchEvent) => {
      const t = ev.target as Element | null;
      if (t?.closest?.(chromeSel)) return;
      ev.preventDefault();
    };
    el.addEventListener('touchstart', onTouchStart, { passive: false });
    return () => el.removeEventListener('touchstart', onTouchStart);
  }, [stageRef]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    type SafariGestureEvent = Event & {
      scale: number;
      clientX: number;
      clientY: number;
    };
    let gscale = 1;
    const onStart = (ev: Event) => {
      ev.preventDefault();
      gscale = (ev as SafariGestureEvent).scale || 1;
    };
    const onChange = (ev: Event) => {
      ev.preventDefault();
      if (pointersRef.current.size >= 2) return;
      const gev = ev as SafariGestureEvent;
      const s = gev.scale || 1;
      if (gscale > 0) {
        const r = svgRef.current?.getBoundingClientRect();
        if (r) {
          const next = zoomViewportAt(
            viewportLiveRef.current,
            Math.pow(s / gscale, 3.2),
            gev.clientX,
            gev.clientY,
            r,
            minZoomRef.current(r.width, r.height),
          );
          scheduleWheelViewport(next);
        }
      }
      gscale = s;
    };
    const onEnd = (ev: Event) => ev.preventDefault();
    el.addEventListener('gesturestart', onStart, { passive: false });
    el.addEventListener('gesturechange', onChange, { passive: false });
    el.addEventListener('gestureend', onEnd, { passive: false });
    return () => {
      el.removeEventListener('gesturestart', onStart);
      el.removeEventListener('gesturechange', onChange);
      el.removeEventListener('gestureend', onEnd);
    };
  }, [stageRef, svgRef, scheduleWheelViewport]);

  // Fit exactly once, as soon as the stage has been laid out. This must not
  // depend on wb.fit: that identity changes on every node edit, and observing
  // again would refit mid-drag (ResizeObserver fires on observe) and throw away
  // whatever the user had zoomed or panned to.
  const fitRef = useRef(wb.fit);
  fitRef.current = wb.fit;
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    // Measuring here with getBoundingClientRect() would force a synchronous
    // full-document layout of the whole board before the first paint. The
    // observer reports the same box off the browser's own layout pass.
    const ro = new ResizeObserver(([entry]) => {
      const r = entry?.contentRect;
      if (!r?.width || !r.height) return;
      ro.disconnect();
      fitRef.current(r.width, r.height);
      setViewFitted(true);
    });
    ro.observe(svg);
    return () => ro.disconnect();
  }, [svgRef]);

  const userEdgeIds = useRef(new Set<string>());
  userEdgeIds.current = new Set(wb.edges.filter(isUserE).map((e) => e.id));
  const edgeEndsById = useMemo(() => {
    const m = new Map<string, readonly [string, string]>();
    for (const e of wb.edges) m.set(e.id, [e.a, e.b]);
    return m;
  }, [wb.edges]);
  /** Links inside the render window, plus any a live drag is carrying. */
  const mountedEdges = useMemo(() => {
    const ed = wb.edgeData;
    if (!cullWin) return ed;
    const moving = dragUnit?.ids;
    const carried = (ends: readonly string[]) =>
      !!moving && ends.length > 0 && ends.every((id) => moving.has(id));
    const bloodEnds = (ids: string[] | undefined) =>
      (ids ?? []).flatMap((id) => edgeEndsById.get(id) ?? []);
    // Keep each mounted path's index in the full list: hop arcs are matched
    // against that list, and keys stay stable as paths scroll in and out.
    const bloodIdx: number[] = [];
    ed.blood.forEach((p, i) => {
      if (pathInCull(p.pts, cullWin) || carried(bloodEnds(p.ids))) bloodIdx.push(i);
    });
    return {
      ...ed,
      blood: bloodIdx.map((i) => ed.blood[i]!),
      bloodIdx,
      unions: ed.unions.filter(
        (u) => pathInCull(parsePointList(u.pts), cullWin) || carried([u.a, u.b]),
      ),
      customs: ed.customs.filter(
        (c) => pathInCull(c.pts, cullWin) || carried([c.a, c.b]),
      ),
      secrets: ed.secrets?.filter(
        (m) => pathInCull([m.at], cullWin) || carried(bloodEnds(m.ids)),
      ),
    };
  }, [wb.edgeData, cullWin, dragUnit, edgeEndsById]);
  const { worldById, gidById } = useMemo(() => {
    const worldById = new Map<string, string>();
    const gidById = new Map<string, string>();
    for (const n of wb.nodes) {
      if (n.world) worldById.set(n.id, n.world);
      if (n.gid) gidById.set(n.id, n.gid);
    }
    return { worldById, gidById };
  }, [wb.nodes]);

  const updateTemp = useCallback(
    (clientX: number, clientY: number) => {
      const [wx, wy] = toWorld(clientX, clientY);
      const cs = wb.connSrc;
      if (!cs) {
        setTempLine(null);
        return;
      }
      if (typeof cs === 'object' && 'union' in cs) {
        const A = wb.byid[cs.union[0]];
        const B = wb.byid[cs.union[1]];
        if (!A || !B) return;
        const g0 = unionGeom(A, B);
        setTempLine({ x1: g0.rx, y1: g0.ry, x2: wx, y2: wy });
        return;
      }
      const s = wb.byid[cs];
      if (!s) return;
      const p = border(s, wx, wy);
      setTempLine({ x1: p[0], y1: p[1], x2: wx, y2: wy });
    },
    [toWorld, wb],
  );

  const flushDragPreview = useCallback(() => {
    dragFrameRef.current = 0;
    const p = dragPreviewRef.current;
    const scene = sceneRef.current;
    if (!p || !scene) return;
    applyNodeTranslates(scene, p.origins, p.dx, p.dy);
    applyEdgeTranslates(scene, Object.keys(p.origins), p.dx, p.dy);
    // Chrome last: intra-world / intra-household ink is tagged data-world /
    // data-gid so it rides the same live translate as frames (WebKit-safe).
    applyChromeTranslates(scene, p.gids, p.worlds, p.dx, p.dy);
  }, []);

  const scheduleDragPreview = useCallback(
    (
      dx: number,
      dy: number,
      chrome?: {
        guides: { gx: number[]; gy: number[] } | null;
        placement: { x: number; y: number; w: number; h: number } | null;
        snap: boolean;
      },
    ) => {
      const p = dragPreviewRef.current;
      if (p) {
        p.dx = dx;
        p.dy = dy;
      }
      if (chrome) paintDragChrome(guidesHostRef.current, chrome);
      if (dragFrameRef.current) return;
      dragFrameRef.current = requestAnimationFrame(flushDragPreview);
    },
    [flushDragPreview],
  );

  const gidsForIds = useCallback((ids: string[]) => {
    const gids = new Set<string>();
    const byid = wbRef.current.byid;
    for (const id of ids) {
      const gid = byid[id]?.gid;
      if (gid) gids.add(gid);
    }
    return [...gids];
  }, []);

  const beginDragPreview = useCallback((
    ids: string[],
    chrome?: { gids?: string[]; worlds?: string[] },
  ) => {
    const wbNow = wbRef.current;
    const origins: Record<string, { x: number; y: number }> = {};
    for (const id of ids) {
      const n = wbNow.byid[id];
      if (n) origins[id] = { x: n.x, y: n.y };
    }
    dragPreviewRef.current = {
      origins,
      gids: chrome?.gids ?? [],
      worlds: chrome?.worlds ?? [],
      dx: 0,
      dy: 0,
    };
    setDragUnit({
      ids: new Set(ids),
      gids: new Set([...(chrome?.gids ?? []), ...gidsForIds(ids)]),
    });
    setDragging(true);
  }, [setDragging, gidsForIds]);

  const endDragPreview = useCallback(() => {
    if (dragFrameRef.current) {
      cancelAnimationFrame(dragFrameRef.current);
      dragFrameRef.current = 0;
    }
    const p = dragPreviewRef.current;
    const scene = sceneRef.current;
    if (p && scene) {
      restoreNodeTranslates(scene, p.origins);
      restoreChromeTranslates(scene, p.gids, p.worlds);
      restoreEdgeTranslates(scene);
    }
    dragPreviewRef.current = null;
    clearDragChrome(guidesHostRef.current);
    setDragUnit(null);
    setDragging(false);
  }, [setDragging]);

  const clearLongPress = () => {
    if (longPressRef.current != null) {
      clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
  };

  const captureSvg = (pointerId: number) => {
    try {
      svgRef.current?.setPointerCapture(pointerId);
    } catch {
      /* setPointerCapture can throw if the pointer is already gone */
    }
  };

  const rememberPointer = (ev: ReactPointerEvent) => {
    pointersRef.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
  };

  const forgetPointer = (pointerId: number) => {
    pointersRef.current.delete(pointerId);
  };

  const cancelObjectDrags = () => {
    clearLongPress();
    dragRef.current = null;
    hhDragRef.current = null;
    worldDragRef.current = null;
    marqueeRef.current = null;
    multiDragRef.current = null;
    panRef.current = null;
    movedRef.current = false;
    endDragPreview();
    setMarqueeBox(null);
  };

  const beginPinch = () => {
    cancelObjectDrags();
    leftoverRef.current = null;
    connectTapRef.current = false;
    const pts = [...pointersRef.current.values()];
    if (pts.length < 2) {
      pinchRef.current = null;
      return;
    }
    const a = pts[0]!;
    const b = pts[1]!;
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    if (dist < 1) return;
    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;
    const [worldX, worldY] = toWorld(midX, midY);
    pinchRef.current = {
      dist,
      worldX,
      worldY,
      k: viewportLiveRef.current.k,
    };
    viewportGestureRef.current = true;
    setNavigating(true);
  };

  const updatePinch = () => {
    const pinch = pinchRef.current;
    const svg = svgRef.current;
    if (!pinch || !svg) return;
    const pts = [...pointersRef.current.values()];
    if (pts.length < 2) return;
    const a = pts[0]!;
    const b = pts[1]!;
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    if (dist < 1) return;
    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;
    const r = svg.getBoundingClientRect();
    const floor = Math.min(minZoomRef.current(r.width, r.height), pinch.k);
    const nk = Math.min(ZOOM_MAX, Math.max(floor, pinch.k * (dist / pinch.dist)));
    applyVp({
      k: nk,
      tx: midX - r.left - pinch.worldX * nk,
      ty: midY - r.top - pinch.worldY * nk,
    });
  };

  const schedulePinchTransform = () => {
    if (pinchFrameRef.current) return;
    pinchFrameRef.current = requestAnimationFrame(() => {
      pinchFrameRef.current = 0;
      updatePinch();
    });
  };

  const pastSlop = (sx: number, sy: number, x: number, y: number) =>
    Math.hypot(x - sx, y - sy) >= DRAG_SLOP_PX;

  const beginMultiDrag = (
    sel: BoardMultiSel,
    wx: number,
    wy: number,
    ev: ReactPointerEvent,
  ) => {
    const ids = idsForMultiSel(sel, wb.nodes);
    if (!ids.length) return false;
    const members = ids
      .map((id) => wb.byid[id])
      .filter((n): n is SimNode => !!n);
    const base: Record<string, { ox: number; oy: number }> = {};
    for (const id of ids) {
      const n = wb.byid[id];
      if (n) base[id] = { ox: n.ox ?? 0, oy: n.oy ?? 0 };
    }
    multiDragRef.current = {
      sel,
      ids,
      sx: wx,
      sy: wy,
      originX: members.length ? Math.min(...members.map((n) => n.x)) : 0,
      originY: members.length ? Math.min(...members.map((n) => n.y)) : 0,
      lastDx: 0,
      lastDy: 0,
      base,
      px: ev.clientX,
      py: ev.clientY,
      armed: false,
    };
    return true;
  };
  beginMultiDragRef.current = beginMultiDrag;

  const onSvgPointerDown = (ev: ReactPointerEvent) => {
    if (ev.button !== 0) return;
    rememberPointer(ev);
    captureSvg(ev.pointerId);

    if (pointersRef.current.size >= 2) {
      beginPinch();
      return;
    }
    if (leftoverRef.current != null) return;

    const t = ev.target as Element;
    if (
      t.closest('.node') ||
      t.closest('.edge') ||
      t.closest('.hhandle') ||
      t.closest('.hh-ageup') ||
      t.closest('.hh-add') ||
      t.closest('.whandle')
    )
      return;
    // Connect links sims with clicks, so a drag on empty board is free to
    // pan to the second sim; a tap there still cancels the link.
    if (wb.connectMode) connectTapRef.current = true;
    else if (wb.infantHouseMenu) wb.setInfantHouseMenu(null);

    const wantMarquee = !wb.connectMode && (wb.selectMode || ev.shiftKey);
    if (wantMarquee) {
      const [wx, wy] = toWorld(ev.clientX, ev.clientY);
      marqueeRef.current = {
        x0: wx,
        y0: wy,
        x1: wx,
        y1: wy,
        px: ev.clientX,
        py: ev.clientY,
        armed: false,
      };
      setMarqueeBox(null);
      return;
    }

    // Pan — keep link/node selection until an empty click (unarmed pan up).
    beginPan(ev, false);
  };

  const beginPan = (ev: ReactPointerEvent, hand: boolean) => {
    const vp = viewportLiveRef.current;
    panRef.current = {
      x: ev.clientX,
      y: ev.clientY,
      lastX: ev.clientX,
      lastY: ev.clientY,
      tx: vp.tx,
      ty: vp.ty,
      k: vp.k,
      armed: false,
      hand,
    };
  };

  /**
   * Hold Space, or press the middle button, and any press pans — on a sim,
   * a tag or empty board, in every mode, Select and Connect included. Caught
   * on the way down, before the sim, tag or link under the pointer sees it.
   */
  const onSvgPointerDownCapture = (ev: ReactPointerEvent) => {
    const hand = ev.button === 1 || (ev.button === 0 && spaceHandRef.current);
    if (!hand) return;
    ev.stopPropagation();
    ev.preventDefault();
    rememberPointer(ev);
    captureSvg(ev.pointerId);
    if (pointersRef.current.size >= 2) {
      beginPinch();
      return;
    }
    if (leftoverRef.current != null) return;
    beginPan(ev, true);
  };

  const onSvgPointerMove = (ev: ReactPointerEvent) => {
    if (pointersRef.current.has(ev.pointerId)) {
      pointersRef.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    }
    if (pinchRef.current && pointersRef.current.size >= 2) {
      schedulePinchTransform();
      return;
    }
    if (leftoverRef.current != null) return;

    if (marqueeRef.current) {
      const m = marqueeRef.current;
      if (!m.armed) {
        if (!pastSlop(m.px, m.py, ev.clientX, ev.clientY)) return;
        m.armed = true;
      }
      const [wx, wy] = toWorld(ev.clientX, ev.clientY);
      m.x1 = wx;
      m.y1 = wy;
      setMarqueeBox(normalizeRect(m.x0, m.y0, m.x1, m.y1));
      return;
    }

    if (multiDragRef.current) {
      const d = multiDragRef.current;
      if (!d.armed) {
        if (!pastSlop(d.px, d.py, ev.clientX, ev.clientY)) return;
        d.armed = true;
        beginDragPreview(
          d.ids,
          d.sel.kind === 'households'
            ? { gids: d.sel.gids }
            : d.sel.kind === 'worlds'
              ? { worlds: d.sel.worlds, gids: gidsForIds(d.ids) }
              : undefined,
        );
      }
      const [wx, wy] = toWorld(ev.clientX, ev.clientY);
      const dx = wx - d.sx;
      const dy = wy - d.sy;
      const snapped = wb.snapHouseholdDrag(d.originX, d.originY, dx, dy);
      const ndx = snapped?.dx ?? dx;
      const ndy = snapped?.dy ?? dy;
      d.lastDx = ndx;
      d.lastDy = ndy;
      scheduleDragPreview(ndx, ndy, {
        guides: snapped?.guides ?? null,
        placement: null,
        snap: wb.snap,
      });
      return;
    }

    if (worldDragRef.current) {
      const d = worldDragRef.current;
      if (!d.armed) {
        if (!pastSlop(d.px, d.py, ev.clientX, ev.clientY)) return;
        d.armed = true;
        beginDragPreview(d.ids, {
          worlds: [d.world],
          gids: gidsForIds(d.ids),
        });
      }
      const [wx, wy] = toWorld(ev.clientX, ev.clientY);
      const dx = wx - d.sx;
      const dy = wy - d.sy;
      const snapped = wb.snapHouseholdDrag(d.originX, d.originY, dx, dy);
      const ndx = snapped?.dx ?? dx;
      const ndy = snapped?.dy ?? dy;
      d.lastDx = ndx;
      d.lastDy = ndy;
      scheduleDragPreview(ndx, ndy, {
        guides: snapped?.guides ?? null,
        placement: null,
        snap: wb.snap,
      });
      return;
    }
    if (hhDragRef.current) {
      const d = hhDragRef.current;
      if (!d.armed) {
        if (!pastSlop(d.px, d.py, ev.clientX, ev.clientY)) return;
        d.armed = true;
        beginDragPreview(d.ids, { gids: [d.gid] });
      }
      const [wx, wy] = toWorld(ev.clientX, ev.clientY);
      const dx = wx - d.sx;
      const dy = wy - d.sy;
      const snapped = wb.snapHouseholdDrag(d.originX, d.originY, dx, dy);
      const ndx = snapped?.dx ?? dx;
      const ndy = snapped?.dy ?? dy;
      d.lastDx = ndx;
      d.lastDy = ndy;
      scheduleDragPreview(ndx, ndy, {
        guides: snapped?.guides ?? null,
        placement: null,
        snap: wb.snap,
      });
      return;
    }
    if (dragRef.current) {
      const d = dragRef.current;
      if (!d.armed) {
        if (!pastSlop(d.sx, d.sy, ev.clientX, ev.clientY)) return;
        d.armed = true;
        clearLongPress();
        beginDragPreview([d.n.id]);
      }
      const [wx, wy] = toWorld(ev.clientX, ev.clientY);
      const rawX = wx - d.dx;
      const rawY = wy - d.dy;
      if (wb.snap) {
        const t = tileSnapOrigin(rawX, rawY);
        d.lastX = t.x;
        d.lastY = t.y;
        scheduleDragPreview(t.x - d.originX, t.y - d.originY, {
          guides: {
            gx: [t.x, t.x + (d.n.w || CARD_MIN_W)],
            gy: [t.y, t.y + (d.n.h || CARD_H)],
          },
          placement: {
            x: t.x,
            y: t.y,
            w: d.n.w || CARD_MIN_W,
            h: d.n.h || CARD_H,
          },
          snap: true,
        });
      } else {
        const snapped = wb.snapDragPosition(d.n, rawX, rawY, d.sticky);
        d.sticky = snapped.sticky;
        d.lastX = snapped.x;
        d.lastY = snapped.y;
        scheduleDragPreview(snapped.x - d.originX, snapped.y - d.originY, {
          guides: null,
          placement: null,
          snap: false,
        });
      }
      movedRef.current = true;
      return;
    }
    if (panRef.current) {
      const p = panRef.current;
      if (!p.armed) {
        if (!pastSlop(p.x, p.y, ev.clientX, ev.clientY)) return;
        p.armed = true;
        viewportGestureRef.current = true;
        setNavigating(true);
      }
      p.lastX = ev.clientX;
      p.lastY = ev.clientY;
      schedulePanTransform();
    }
    if (wb.connSrc) updateTemp(ev.clientX, ev.clientY);
  };

  const finishNodePointer = (wasMoved: boolean, n: SimNode, more = false) => {
    // The drop already wrote the snapped spot via moveNodesByIds. wb.byid is
    // still the pre-drag render, so snapping it here put the sim back.
    if (wasMoved) return;
    if (more) {
      lastClickRef.current = null;
      wb.selectNode(n.id);
      wb.setEditNodeId(n.id);
      positionEditor();
      return;
    }
    const now = performance.now();
    if (
      lastClickRef.current?.id === n.id &&
      now - lastClickRef.current.t < 380
    ) {
      lastClickRef.current = null;
      wb.setEditNodeId(n.id);
      positionEditor();
    } else {
      lastClickRef.current = { id: n.id, t: now };
      wb.selectNode(n.id);
    }
  };

  const onSvgPointerUp = (ev: ReactPointerEvent) => {
    const known =
      pointersRef.current.has(ev.pointerId) ||
      leftoverRef.current === ev.pointerId ||
      dragRef.current != null ||
      panRef.current != null ||
      pinchRef.current != null ||
      hhDragRef.current != null ||
      worldDragRef.current != null ||
      marqueeRef.current != null ||
      multiDragRef.current != null;
    if (!known) return;

    forgetPointer(ev.pointerId);
    clearLongPress();

    if (pinchRef.current) {
      if (pointersRef.current.size >= 2) {
        beginPinch();
        return;
      }
      pinchRef.current = null;
      leftoverRef.current =
        pointersRef.current.size === 1
          ? ([...pointersRef.current.keys()][0] ?? null)
          : null;
      if (pinchFrameRef.current) {
        cancelAnimationFrame(pinchFrameRef.current);
        pinchFrameRef.current = 0;
        updatePinch();
      }
      commitLiveViewport();
      cancelObjectDrags();
      return;
    }

    if (leftoverRef.current === ev.pointerId) {
      leftoverRef.current = null;
      return;
    }

    if (marqueeRef.current) {
      const m = marqueeRef.current;
      marqueeRef.current = null;
      setMarqueeBox(null);
      if (m.armed) {
        const rect = normalizeRect(m.x0, m.y0, m.x1, m.y1);
        const next = resolveMarqueeSelection(rect, {
          nodes: wb.nodes,
          groups: wb.groups,
          worlds: wb.worlds,
          zoom: viewportLiveRef.current.k,
          packVis: wb.nodeVis,
          showWorlds: wb.show.worlds,
          showGroups: wb.show.groups,
        });
        wb.clearSel();
        wb.setMultiSel(next);
        if (next) {
          const n =
            next.kind === 'worlds'
              ? next.worlds.length
              : next.kind === 'households'
                ? next.gids.length
                : next.ids.length;
          const label =
            next.kind === 'worlds'
              ? 'world'
              : next.kind === 'households'
                ? 'household'
                : 'sim';
          wb.setStatus(
            `Selected ${n} ${label}${n === 1 ? '' : 's'} — drag to move`,
          );
        } else {
          wb.setStatus(
            wb.selectMode
              ? 'Select: box across 2+ worlds moves those worlds; inside one world, grab tags or sims. Hold Space to pan'
              : '',
          );
        }
      } else if (wb.selectMode) {
        // Tap empty canvas in select mode clears the multi-selection.
        wb.clearMultiSel();
        wb.clearSel();
      }
      return;
    }

    if (multiDragRef.current) {
      const d = multiDragRef.current;
      if (d.armed) {
        endDragPreview();
        wb.moveNodesByIds(d.ids, d.lastDx, d.lastDy, d.base);
      }
      multiDragRef.current = null;
      return;
    }

    if (hhDragRef.current || worldDragRef.current) {
      const hh = hhDragRef.current;
      const world = worldDragRef.current;
      if (hh?.armed) {
        endDragPreview();
        wb.moveNodesByGid(hh.gid, hh.lastDx, hh.lastDy, hh.base);
      } else if (world?.armed) {
        endDragPreview();
        wb.moveNodesByWorld(world.world, world.lastDx, world.lastDy, world.base);
      }
      hhDragRef.current = null;
      worldDragRef.current = null;
    }
    if (dragRef.current) {
      const d = dragRef.current;
      const n = d.n;
      const wasMoved = movedRef.current;
      if (wasMoved) {
        endDragPreview();
        wb.moveNodesByIds(
          [n.id],
          d.lastX - d.originX,
          d.lastY - d.originY,
          d.base,
        );
      }
      dragRef.current = null;
      finishNodePointer(wasMoved, n, d.more);
      return;
    }
    if (panRef.current) {
      const p = panRef.current;
      panRef.current = null;
      if (p.armed) {
        if (panFrameRef.current) {
          cancelAnimationFrame(panFrameRef.current);
          panFrameRef.current = 0;
        }
        applyVp({
          k: p.k,
          tx: p.tx + (p.lastX - p.x),
          ty: p.ty + (p.lastY - p.y),
        });
        commitLiveViewport();
        // A pan in Connect keeps the half-made link.
        connectTapRef.current = false;
      } else if (!p.hand && !wb.connectMode) {
        wb.clearSel();
        wb.clearMultiSel();
      }
    }
    if (connectTapRef.current && pointersRef.current.size === 0) {
      connectTapRef.current = false;
      wb.cancelConnect();
    }
  };

  const onNodePointerDown = useCallback(
    (ev: ReactPointerEvent, n: SimNode) => {
      ev.stopPropagation();
      rememberPointer(ev);
      captureSvg(ev.pointerId);
      const wbNow = wbRef.current;

      if (pointersRef.current.size >= 2) {
        beginPinch();
        return;
      }
      if (wbNow.connectMode) {
        const [wx, wy] = toWorld(ev.clientX, ev.clientY);
        const union = unionAtPoint(wx, wy, wbNow.edgeData.unions);
        if (union) {
          wbNow.handleConnectUnion(union.a, union.b);
          return;
        }
        const sr = stageRef.current!.getBoundingClientRect();
        wbNow.handleConnectClick(n, ev.clientX, ev.clientY, sr);
        return;
      }
      const [wx, wy] = toWorld(ev.clientX, ev.clientY);
      if (multiSelContainsNode(wbNow.multiSel, n.id) && wbNow.multiSel) {
        beginMultiDragRef.current(wbNow.multiSel, wx, wy, ev);
        return;
      }
      wbNow.clearMultiSel();
      dragRef.current = {
        n,
        dx: wx - n.x,
        dy: wy - n.y,
        sticky: { x: null, y: null },
        sx: ev.clientX,
        sy: ev.clientY,
        originX: n.x,
        originY: n.y,
        lastX: n.x,
        lastY: n.y,
        base: { [n.id]: { ox: n.ox ?? 0, oy: n.oy ?? 0 } },
        armed: false,
        more: !!(ev.target as Element).closest?.('.node__more'),
      };
      movedRef.current = false;
      clearLongPress();
      if (ev.pointerType !== 'mouse') {
        longPressRef.current = setTimeout(() => {
          longPressRef.current = null;
          if (!dragRef.current || dragRef.current.armed) return;
          const node = dragRef.current.n;
          dragRef.current = null;
          wbRef.current.setEditNodeId(node.id);
          positionEditor();
        }, LONG_PRESS_MS);
      }
    },
    [toWorld, positionEditor, stageRef],
  );

  const onAgeUp = useCallback(
    (gid: string) => {
      wbRef.current.ageUpHousehold(gid);
    },
    [],
  );

  /** A sim added with a household's + opens to its name, ready to type. */
  const [nameFocusId, setNameFocusId] = useState<string | null>(null);
  const onAddSim = useCallback((gid: string) => {
    setNameFocusId(wbRef.current.addSimToHousehold(gid));
  }, []);

  const onHandlePointer = (ev: ReactPointerEvent) => {
    rememberPointer(ev);
    captureSvg(ev.pointerId);
    if (pointersRef.current.size >= 2) beginPinch();
  };

  const keepIds = new Set<string>(dragUnit?.ids ?? []);
  if (wb.sel?.type === 'node') keepIds.add(wb.sel.id);
  if (wb.multiSel?.kind === 'nodes') wb.multiSel.ids.forEach((id) => keepIds.add(id));
  if (wb.editNodeId) keepIds.add(wb.editNodeId);
  if (typeof wb.connSrc === 'string') keepIds.add(wb.connSrc);
  else if (wb.connSrc) wb.connSrc.union.forEach((id) => keepIds.add(id));
  const searchCurrentId = wb.searchHits[wb.searchHitIndex];
  if (searchCurrentId) keepIds.add(searchCurrentId);
  const sortedNodes = cullWin
    ? wb.visibleNodes.filter((n) => keepIds.has(n.id) || nodeInCull(n, cullWin))
    : [...wb.visibleNodes];
  if (wb.sel?.type === 'node') {
    const selId = wb.sel.id;
    const idx = sortedNodes.findIndex((n) => n.id === selId);
    if (idx >= 0) {
      const [n] = sortedNodes.splice(idx, 1);
      sortedNodes.push(n!);
    }
  }

  const editNode = wb.editNodeId ? wb.byid[wb.editNodeId] : null;
  const menu = wb.connectMenu;
  const connHighlight =
    typeof wb.connSrc === 'string' ? wb.connSrc : null;
  const selectedWorlds =
    wb.multiSel?.kind === 'worlds' ? new Set(wb.multiSel.worlds) : undefined;
  const selectedGids =
    wb.multiSel?.kind === 'households' ? new Set(wb.multiSel.gids) : undefined;
  const selectedNodeIds =
    wb.multiSel?.kind === 'nodes' ? new Set(wb.multiSel.ids) : undefined;
  const linkChip =
    wb.sel?.type === 'link'
      ? describeLinkSelection(
          wb.sel.ids,
          wb.shownEdges,
          wb.byid,
          wb.edgeData,
          wb.pairIndex,
        )
      : null;

  const linkChipObstacles: ChipObstacle[] = [];
  if (linkChip) {
    for (const n of wb.nodes) {
      if (!wb.nodeVis(n)) continue;
      linkChipObstacles.push({
        l: n.x,
        t: n.y,
        r: n.x + n.w,
        b: n.y + n.h,
      });
    }
    if (wb.show.groups) {
      for (const g0 of wb.groups) {
        const mem = wb.nodes.filter((n) => n.gid === g0.gid && wb.nodeVis(n));
        const chrome = householdChrome(mem, g0);
        if (!chrome) continue;
        // Name pill + Age up — the interactive household chrome band.
        linkChipObstacles.push({
          l: chrome.headerX,
          t: chrome.headerY,
          r: chrome.headerX + chrome.labelW,
          b: chrome.ageY + chrome.pillH,
        });
      }
    }
  }

  const onHouseholdDragStart = (
    gid: string,
    sx: number,
    sy: number,
    base: Record<string, { ox: number; oy: number }>,
    ev: ReactPointerEvent,
  ) => {
    onHandlePointer(ev);
    if (pinchRef.current || pointersRef.current.size >= 2) return;
    if (multiSelContainsGid(wb.multiSel, gid) && wb.multiSel) {
      beginMultiDrag(wb.multiSel, sx, sy, ev);
      return;
    }
    wb.clearMultiSel();
    const members = wb.nodes.filter((n) => n.gid === gid);
    const ids = members.map((n) => n.id);
    hhDragRef.current = {
      gid,
      sx,
      sy,
      originX: members.length ? Math.min(...members.map((n) => n.x)) : 0,
      originY: members.length ? Math.min(...members.map((n) => n.y)) : 0,
      lastDx: 0,
      lastDy: 0,
      ids,
      base,
      px: ev.clientX,
      py: ev.clientY,
      armed: false,
    };
  };

  return (
    <div id="stage" ref={stageRef}>
      <svg
        id="svg"
        ref={svgRef}
        onPointerDownCapture={onSvgPointerDownCapture}
        onPointerDown={onSvgPointerDown}
        // The middle button pans; stop the browser's autoscroll on it.
        onMouseDown={(ev) => {
          if (ev.button === 1) ev.preventDefault();
        }}
        onPointerMove={onSvgPointerMove}
        onPointerUp={onSvgPointerUp}
        onPointerCancel={onSvgPointerUp}
        onLostPointerCapture={onSvgPointerUp}
      >
        <defs>
          <clipPath id="tagclip">
            <rect x={0} y={0} width={CARD_MIN_W} height={CARD_H} rx={11} />
          </clipPath>
          <pattern
            id="tilegrid"
            width={TILE}
            height={TILE}
            patternUnits="userSpaceOnUse"
          >
            <path
              d={`M ${TILE} 0 L 0 0 0 ${TILE}`}
              fill="none"
              stroke="#b7b09e"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          </pattern>
        </defs>
        <g id="scene" ref={sceneRef} transform={sceneTransformAttr({ tx, ty, k })}>
          {wb.snap && (
            <rect
              className="stage-tilegrid"
              {...tileGridRect(cullWin)}
              fill="url(#tilegrid)"
              pointerEvents="none"
            />
          )}
          <WorldLayer
            mode="frames"
            nodes={wb.nodes}
            groups={wb.groups}
            worlds={wb.worlds}
            show={wb.show.worlds}
            zoom={k}
            packVis={wb.nodeVis}
            selectedWorlds={selectedWorlds}
            buckets={wb.nodeBuckets}
          />
          <GroupLayer
            mode="frames"
            groups={wb.groups}
            nodes={wb.nodes}
            show={wb.show.groups}
            labels={labels}
            packVis={wb.nodeVis}
            selectedGids={selectedGids}
            buckets={wb.nodeBuckets}
            cull={cullWin}
            keepGids={dragUnit?.gids}
            onHouseholdDragStart={onHouseholdDragStart}
            onAgeUp={onAgeUp}
          />
          <EdgeLayer
            blood={mountedEdges.blood}
            bloodIdx={'bloodIdx' in mountedEdges ? mountedEdges.bloodIdx : undefined}
            bloodVerts={wb.bloodVerts}
            hopD={wb.hopD}
            unions={mountedEdges.unions}
            customs={mountedEdges.customs}
            secrets={mountedEdges.secrets}
            endsById={edgeEndsById}
            worldById={worldById}
            gidById={gidById}
            userEdgeIds={userEdgeIds.current}
            isSelLink={wb.isSelLink}
            connectMode={wb.connectMode}
            hitStroke={EDGE_HIT_SCREEN_PX / k}
            selStroke={EDGE_SEL_SCREEN_PX / k}
            onLinkClick={(ids, ev) => {
              onHandlePointer(ev);
              if (pinchRef.current || pointersRef.current.size >= 2) return;
              wb.selectLink(ids);
            }}
            onUnionClick={(a, b, ev) => {
              onHandlePointer(ev);
              if (pinchRef.current || pointersRef.current.size >= 2) return;
              if (wb.connectMode) wb.handleConnectUnion(a, b);
              else
                wb.selectLink([
                  wb.shownEdges.find(
                    (e) =>
                      (e.a === a && e.b === b) || (e.a === b && e.b === a),
                  )?.id ?? '',
                ]);
            }}
            onAddInfant={(u, ev) => {
              onHandlePointer(ev);
              if (pinchRef.current || pointersRef.current.size >= 2) return;
              const sr = stageRef.current?.getBoundingClientRect();
              wb.requestInfantOfCouple(
                u.a,
                u.b,
                u.rx,
                u.ry,
                ev.clientX - (sr?.left ?? 0),
                ev.clientY - (sr?.top ?? 0),
              );
            }}
          />
          <g id="lTemp">
            {tempLine && (
              <line
                x1={tempLine.x1}
                y1={tempLine.y1}
                x2={tempLine.x2}
                y2={tempLine.y2}
                stroke="#1b6cd6"
                strokeWidth={2}
                strokeDasharray="5 5"
                pointerEvents="none"
              />
            )}
            {marqueeBox && (
              <rect
                className="marquee"
                x={marqueeBox.l}
                y={marqueeBox.t}
                width={marqueeBox.r - marqueeBox.l}
                height={marqueeBox.b - marqueeBox.t}
                fill="#1b6cd61a"
                stroke="#1b6cd6"
                strokeWidth={1.5}
                strokeDasharray="6 4"
                pointerEvents="none"
                vectorEffect="non-scaling-stroke"
              />
            )}
          </g>
          <g id="lGuides" ref={guidesHostRef} pointerEvents="none" />
          <g id="lNodes">
            {sortedNodes.map((n) => (
              <SimNodeView
                key={n.id}
                node={n}
                selected={
                  (wb.sel?.type === 'node' && wb.sel.id === n.id) ||
                  !!selectedNodeIds?.has(n.id)
                }
                groupSelected={
                  !!(
                    (selectedWorlds &&
                      n.world &&
                      selectedWorlds.has(n.world)) ||
                    (selectedGids && selectedGids.has(n.gid))
                  )
                }
                labels={labels}
                connectHighlight={connHighlight === n.id}
                searchHit={wb.searchHitSet.has(n.id)}
                searchCurrent={
                  wb.searchHits[wb.searchHitIndex] === n.id
                }
                hiAges={wb.hiAges}
                hiSingle={wb.hiSingle}
                partneredIds={wb.partneredIds}
                bloodlineIds={wb.bloodlineIds}
                onPointerDown={onNodePointerDown}
              />
            ))}
          </g>
          {/* Household name / Age up above edges so a selected link does not
              steal drags from tags the path crosses. */}
          <GroupLayer
            mode="handles"
            groups={wb.groups}
            nodes={wb.nodes}
            show={wb.show.groups}
            labels={labels}
            packVis={wb.nodeVis}
            selectedGids={selectedGids}
            buckets={wb.nodeBuckets}
            cull={cullWin}
            keepGids={dragUnit?.gids}
            onHouseholdDragStart={onHouseholdDragStart}
            onAgeUp={onAgeUp}
            onAddSim={onAddSim}
          />
          {/* World chips last so they paint above household tags + sim cards. */}
          <WorldLayer
            mode="handles"
            nodes={wb.nodes}
            groups={wb.groups}
            worlds={wb.worlds}
            show={wb.show.worlds}
            zoom={k}
            packVis={wb.nodeVis}
            selectedWorlds={selectedWorlds}
            buckets={wb.nodeBuckets}
            onWorldDragStart={(world, sx, sy, base, ev) => {
              onHandlePointer(ev);
              if (pinchRef.current || pointersRef.current.size >= 2) return;
              if (multiSelContainsWorld(wb.multiSel, world) && wb.multiSel) {
                beginMultiDrag(wb.multiSel, sx, sy, ev);
                return;
              }
              wb.clearMultiSel();
              const members = wb.nodes.filter((n) => n.world === world);
              worldDragRef.current = {
                world,
                sx,
                sy,
                originX: members.length ? Math.min(...members.map((n) => n.x)) : 0,
                originY: members.length ? Math.min(...members.map((n) => n.y)) : 0,
                lastDx: 0,
                lastDy: 0,
                ids: members.map((n) => n.id),
                base,
                px: ev.clientX,
                py: ev.clientY,
                armed: false,
              };
            }}
          />
        </g>
      </svg>
      {wb.status && (
        <div id="status" role="status" aria-live="polite" style={{ display: 'block' }}>
          {wb.status}
        </div>
      )}
      {linkChip && (
        <LinkSelectionChip
          info={linkChip}
          tx={tx}
          ty={ty}
          k={k}
          stageW={stageSize.w}
          stageH={stageSize.h}
          obstacles={linkChipObstacles}
        />
      )}
      <div id="autosave-cue">
        <span className="autosave-cue__label">
          {wb.staleTab ? 'Autosave paused' : 'Autosave on'}
        </span>
        <span className="autosave-cue__sep" aria-hidden="true">
          ·
        </span>
        <span
          className={
            wb.sourceFileName
              ? 'autosave-cue__file'
              : 'autosave-cue__file autosave-cue__file--muted'
          }
          title={wb.boardSourceLabel}
        >
          {wb.boardSourceLabel}
        </span>
        <button
          type="button"
          className="autosave-cue__reset"
          disabled={!wb.canResetBoard}
          title={
            wb.canResetBoard
              ? 'Restore the starter fodder board and clear the browser draft'
              : 'Already the starter fodder board'
          }
          onClick={() => {
            if (!wb.canResetBoard) return;
            if (
              !confirm(
                'Reset to the initial starter board (fodder roster)? This clears the browser draft and discards the current board. Download JSON first if you need a copy.',
              )
            ) {
              return;
            }
            const r = svgRef.current?.getBoundingClientRect();
            wb.resetToBuiltInBoard(r?.width ?? 800, r?.height ?? 600);
          }}
        >
          Reset the board
        </button>
      </div>
      {/* One banner at a time; a stale tab matters more than the bloodline view. */}
      {wb.staleTab ? (
        <StaleTabBanner onReload={wb.reloadBoard} onSaveJson={wb.saveJson} />
      ) : wb.bloodlineId && (
        <BloodlineBanner
          node={wb.byid[wb.bloodlineId]}
          onShowEveryone={() => wb.setBloodlineId(null)}
        />
      )}
      {menu && (
        <ConnectMenu
          aName={wb.byid[menu.a]?.first ?? ''}
          bName={wb.byid[menu.b]?.first ?? ''}
          left={menu.x}
          top={menu.y}
          hideSibling={siblingsShareParents(menu.a, menu.b, wb.edges)}
          blocked={{
            parent: wb.parentCycleReason(menu.a, menu.b) ?? undefined,
            childof: wb.parentCycleReason(menu.b, menu.a) ?? undefined,
          }}
          onConfirm={(type) => wb.confirmConnect(type)}
          onCancel={() => {
            wb.setConnectMenu(null);
            wb.cancelConnect();
          }}
        />
      )}
      {wb.infantHouseMenu && (
        <InfantHouseMenu
          left={wb.infantHouseMenu.x}
          top={wb.infantHouseMenu.y}
          options={wb.infantHouseChoices}
          onPick={wb.confirmInfantHouse}
          onCancel={() => wb.setInfantHouseMenu(null)}
        />
      )}
      <Legend
        ref={legendRef}
        worlds={wb.worlds}
        liveWorlds={wb.liveWorlds}
        hidden={wb.gamesOpen || wb.playOpen || wb.agesOpen}
        onPickWorld={(world) => {
          const r = svgRef.current?.getBoundingClientRect();
          const lg = legendRef.current?.getBoundingClientRect();
          const inset =
            !compact && r && lg ? Math.max(r.right - lg.left, 0) : 0;
          const worldSlug = slug(world);
          if (worldSlug) trackAction(`/action/world/${worldSlug}`);
          wb.zoomToWorld(world, r?.width ?? 800, r?.height ?? 600, inset);
        }}
      />
      <Hint introReady={tipsReady} />
      <Minimap wb={wb} svgRef={svgRef} camera={liveCamera} />
      <ViewControls wb={wb} svgRef={svgRef} />
      {editNode && (
        <SimEditor
          // One editor per sim: opening another resets the fields to theirs.
          key={editNode.id}
          node={editNode}
          worlds={wb.worlds}
          groups={wb.groups}
          nodes={wb.nodes}
          left={editorPos.left}
          top={editorPos.top}
          editorRef={editorRef}
          onLayout={positionEditor}
          onSave={(patch) => {
            wb.pushUndo();
            wb.updateNode(editNode.id, patch);
            wb.setEditNodeId(null);
          }}
          onMove={(world, houseGid, newName) => {
            wb.moveSimToHousehold(editNode.id, world, houseGid, newName);
          }}
          onClose={() => wb.setEditNodeId(null)}
          focusName={nameFocusId === editNode.id}
        />
      )}
    </div>
  );
}
