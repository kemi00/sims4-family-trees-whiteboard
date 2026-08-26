import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { border, unionAtPoint, unionGeom, type SnapSticky } from '../lib/geometry.ts';
import { tileSnapOrigin } from '../lib/tiles.ts';
import {
  CARD_H,
  CARD_MIN_W,
  DRAG_SLOP_PX,
  EDGE_HIT_SCREEN_PX,
  LONG_PRESS_MS,
  TILE,
} from '../lib/constants.ts';
import { isUserE, siblingsShareParents } from '../lib/utils.ts';
import type { WhiteboardApi } from '../hooks/useWhiteboard.ts';
import { useCompactChrome } from '../hooks/useCompactChrome.ts';
import type { SimNode } from '../types/whiteboard.ts';
import { BloodlineBanner } from './BloodlineBanner.tsx';
import { ConnectMenu } from './ConnectMenu.tsx';
import { EdgeLayer } from './EdgeLayer.tsx';
import { GroupLayer } from './GroupLayer.tsx';
import { Hint } from './Hint.tsx';
import { InfantHouseMenu } from './InfantHouseMenu.tsx';
import { Legend } from './Legend.tsx';
import { Minimap } from './Minimap.tsx';
import { SimEditor } from './SimEditor.tsx';
import { SimNodeView } from './SimNode.tsx';
import { ViewControls } from './ViewControls.tsx';
import { WorldLayer } from './WorldLayer.tsx';

type Props = {
  wb: WhiteboardApi;
  svgRef: React.RefObject<SVGSVGElement | null>;
  stageRef: React.RefObject<HTMLDivElement | null>;
};

/** Chrome on #stage that owns its own wheel (scroll), not board zoom. */
const STAGE_WHEEL_SCROLL_SEL =
  '#legend, .legend-chip, .editor, .menu, .bloodline-banner, .minimap';

export function WhiteboardStage({ wb, svgRef, stageRef }: Props) {
  const compact = useCompactChrome();
  const [guides, setGuides] = useState<{ gx: number[]; gy: number[] } | null>(
    null,
  );
  const [placement, setPlacement] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);
  const [tempLine, setTempLine] = useState<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  } | null>(null);
  const [editorPos, setEditorPos] = useState({ left: 0, top: 0 });
  const editorRef = useRef<HTMLDivElement>(null);

  const panRef = useRef<{
    x: number;
    y: number;
    tx: number;
    ty: number;
    armed: boolean;
  } | null>(null);
  const dragRef = useRef<{
    n: SimNode;
    dx: number;
    dy: number;
    sticky: SnapSticky;
    sx: number;
    sy: number;
    armed: boolean;
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

  const { tx, ty, k } = wb.viewport;

  const toWorld = useCallback(
    (sx: number, sy: number) => {
      const r = svgRef.current!.getBoundingClientRect();
      return [(sx - r.left - tx) / k, (sy - r.top - ty) / k] as [number, number];
    },
    [tx, ty, k, svgRef],
  );

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

    const nx = r.left + tx + n.x * k;
    const ny = r.top + ty + n.y * k;
    const nw = n.w * k;

    let left = nx + nw + gap;
    if (left + ew > vw - pad) left = nx - ew - gap;
    if (left + ew > vw - pad) left = vw - ew - pad;
    if (left < pad) left = pad;

    let top = ny;
    if (top + eh > vh - pad) top = vh - eh - pad;
    if (top < pad) top = pad;

    setEditorPos({ left, top });
  }, [wb.editNodeId, wb.byid, tx, ty, k, svgRef]);

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
      let dy = ev.deltaY;
      if (ev.deltaMode === 1) dy *= 16;
      else if (ev.deltaMode === 2) dy *= 400;
      const step = ev.ctrlKey ? 0.01 : 0.0032;
      dy = Math.max(-80, Math.min(80, dy));
      const r = svgRef.current!.getBoundingClientRect();
      wbRef.current.zoomAt(Math.exp(-dy * step), ev.clientX, ev.clientY, r);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [stageRef, svgRef]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const chromeSel =
      '.viewctl, #legend, #hint, #hintIcon, .editor, .menu, #status, .legend-chip, .bloodline-banner, .minimap';
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
          wbRef.current.zoomAt(
            Math.pow(s / gscale, 3.2),
            gev.clientX,
            gev.clientY,
            r,
          );
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
  }, [stageRef, svgRef]);

  // Fit exactly once, as soon as the stage has been laid out. This must not
  // depend on wb.fit: that identity changes on every node edit, and observing
  // again would refit mid-drag (ResizeObserver fires on observe) and throw away
  // whatever the user had zoomed or panned to.
  const fitRef = useRef(wb.fit);
  fitRef.current = wb.fit;
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => {
      const r = svgRef.current?.getBoundingClientRect();
      return r?.width && r.height ? r : null;
    };
    const first = measure();
    if (first) {
      fitRef.current(first.width, first.height);
      return;
    }
    const ro = new ResizeObserver(() => {
      const r = measure();
      if (!r) return;
      ro.disconnect();
      fitRef.current(r.width, r.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [stageRef, svgRef]);

  const userEdgeIds = useRef(new Set<string>());
  userEdgeIds.current = new Set(wb.edges.filter(isUserE).map((e) => e.id));

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
    panRef.current = null;
    movedRef.current = false;
    setGuides(null);
    setPlacement(null);
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
      k: wbRef.current.viewport.k,
    };
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
    const nk = Math.min(4, Math.max(0.06, pinch.k * (dist / pinch.dist)));
    const r = svg.getBoundingClientRect();
    wbRef.current.setViewport({
      k: nk,
      tx: midX - r.left - pinch.worldX * nk,
      ty: midY - r.top - pinch.worldY * nk,
    });
  };

  const pastSlop = (sx: number, sy: number, x: number, y: number) =>
    Math.hypot(x - sx, y - sy) >= DRAG_SLOP_PX;

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
      t.closest('.whandle')
    )
      return;
    if (wb.connectMode) {
      connectTapRef.current = true;
      return;
    }
    if (wb.infantHouseMenu) wb.setInfantHouseMenu(null);
    wb.clearSel();
    panRef.current = {
      x: ev.clientX,
      y: ev.clientY,
      tx,
      ty,
      armed: false,
    };
  };

  const onSvgPointerMove = (ev: ReactPointerEvent) => {
    if (pointersRef.current.has(ev.pointerId)) {
      pointersRef.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    }
    if (pinchRef.current && pointersRef.current.size >= 2) {
      updatePinch();
      return;
    }
    if (leftoverRef.current != null) return;

    if (worldDragRef.current) {
      const d = worldDragRef.current;
      if (!d.armed) {
        if (!pastSlop(d.px, d.py, ev.clientX, ev.clientY)) return;
        d.armed = true;
      }
      const [wx, wy] = toWorld(ev.clientX, ev.clientY);
      const dx = wx - d.sx;
      const dy = wy - d.sy;
      const snapped = wb.snapHouseholdDrag(d.originX, d.originY, dx, dy);
      wb.moveNodesByWorld(
        d.world,
        snapped?.dx ?? dx,
        snapped?.dy ?? dy,
        d.base,
      );
      setGuides(snapped?.guides ?? null);
      return;
    }
    if (hhDragRef.current) {
      const d = hhDragRef.current;
      if (!d.armed) {
        if (!pastSlop(d.px, d.py, ev.clientX, ev.clientY)) return;
        d.armed = true;
      }
      const [wx, wy] = toWorld(ev.clientX, ev.clientY);
      const dx = wx - d.sx;
      const dy = wy - d.sy;
      const snapped = wb.snapHouseholdDrag(d.originX, d.originY, dx, dy);
      wb.moveNodesByGid(
        d.gid,
        snapped?.dx ?? dx,
        snapped?.dy ?? dy,
        d.base,
      );
      setGuides(snapped?.guides ?? null);
      return;
    }
    if (dragRef.current) {
      const d = dragRef.current;
      if (!d.armed) {
        if (!pastSlop(d.sx, d.sy, ev.clientX, ev.clientY)) return;
        d.armed = true;
        clearLongPress();
      }
      const [wx, wy] = toWorld(ev.clientX, ev.clientY);
      wb.setFastRoute(true);
      const rawX = wx - d.dx;
      const rawY = wy - d.dy;
      if (wb.snap) {
        wb.updateNode(d.n.id, { x: rawX, y: rawY });
        const t = tileSnapOrigin(rawX, rawY);
        setPlacement({ x: t.x, y: t.y, w: d.n.w || CARD_MIN_W, h: d.n.h || CARD_H });
        setGuides({ gx: [t.x, t.x + (d.n.w || CARD_MIN_W)], gy: [t.y, t.y + (d.n.h || CARD_H)] });
      } else {
        const snapped = wb.snapDragPosition(d.n, rawX, rawY, d.sticky);
        d.sticky = snapped.sticky;
        wb.updateNode(d.n.id, { x: snapped.x, y: snapped.y });
        setGuides(null);
        setPlacement(null);
      }
      movedRef.current = true;
      return;
    }
    if (panRef.current) {
      const p = panRef.current;
      if (!p.armed) {
        if (!pastSlop(p.x, p.y, ev.clientX, ev.clientY)) return;
        p.armed = true;
      }
      wb.setViewport({
        k,
        tx: p.tx + (ev.clientX - p.x),
        ty: p.ty + (ev.clientY - p.y),
      });
    }
    if (wb.connSrc) updateTemp(ev.clientX, ev.clientY);
  };

  const finishNodePointer = (wasMoved: boolean, n: SimNode) => {
    wb.setFastRoute(false);
    setGuides(null);
    setPlacement(null);
    if (wasMoved) {
      const cur = wb.byid[n.id];
      if (cur) wb.snapNodeAction(cur);
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
      worldDragRef.current != null;
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
      cancelObjectDrags();
      return;
    }

    if (leftoverRef.current === ev.pointerId) {
      leftoverRef.current = null;
      return;
    }

    if (hhDragRef.current || worldDragRef.current) {
      setGuides(null);
      setPlacement(null);
      hhDragRef.current = null;
      worldDragRef.current = null;
      wb.enforceWorldSeparation();
    }
    if (dragRef.current) {
      const n = dragRef.current.n;
      const wasMoved = movedRef.current;
      dragRef.current = null;
      finishNodePointer(wasMoved, n);
      return;
    }
    panRef.current = null;
    if (connectTapRef.current && pointersRef.current.size === 0) {
      connectTapRef.current = false;
      wb.cancelConnect();
    }
  };

  const onNodePointerDown = (ev: ReactPointerEvent, n: SimNode) => {
    ev.stopPropagation();
    rememberPointer(ev);
    captureSvg(ev.pointerId);

    if (pointersRef.current.size >= 2) {
      beginPinch();
      return;
    }
    if (wb.connectMode) {
      const [wx, wy] = toWorld(ev.clientX, ev.clientY);
      const union = unionAtPoint(wx, wy, wb.edgeData.unions);
      if (union) {
        wb.handleConnectUnion(union.a, union.b);
        return;
      }
      const sr = stageRef.current!.getBoundingClientRect();
      wb.handleConnectClick(n, ev.clientX, ev.clientY, sr);
      return;
    }
    const [wx, wy] = toWorld(ev.clientX, ev.clientY);
    dragRef.current = {
      n,
      dx: wx - n.x,
      dy: wy - n.y,
      sticky: { x: null, y: null },
      sx: ev.clientX,
      sy: ev.clientY,
      armed: false,
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
  };

  const onHandlePointer = (ev: ReactPointerEvent) => {
    rememberPointer(ev);
    captureSvg(ev.pointerId);
    if (pointersRef.current.size >= 2) beginPinch();
  };

  const sortedNodes = [...wb.visibleNodes];
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

  return (
    <div id="stage" ref={stageRef}>
      <svg
        id="svg"
        ref={svgRef}
        onPointerDown={onSvgPointerDown}
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
        <g
          id="scene"
          data-vp={JSON.stringify(wb.viewport)}
          transform={`translate(${tx},${ty}) scale(${k})`}
        >
          {wb.snap && (
            <rect
              x={-20000}
              y={-20000}
              width={40000}
              height={40000}
              fill="url(#tilegrid)"
              pointerEvents="none"
            />
          )}
          <WorldLayer
            nodes={wb.nodes}
            groups={wb.groups}
            worlds={wb.worlds}
            show={wb.show.worlds}
            zoom={k}
            packVis={wb.nodeVis}
            onWorldDragStart={(world, sx, sy, base, ev) => {
              onHandlePointer(ev);
              if (pinchRef.current || pointersRef.current.size >= 2) return;
              const members = wb.nodes.filter((n) => n.world === world);
              worldDragRef.current = {
                world,
                sx,
                sy,
                originX: members.length ? Math.min(...members.map((n) => n.x)) : 0,
                originY: members.length ? Math.min(...members.map((n) => n.y)) : 0,
                base,
                px: ev.clientX,
                py: ev.clientY,
                armed: false,
              };
            }}
          />
          <GroupLayer
            groups={wb.groups}
            nodes={wb.nodes}
            show={wb.show.groups}
            packVis={wb.nodeVis}
            onHouseholdDragStart={(gid, sx, sy, base, ev) => {
              onHandlePointer(ev);
              if (pinchRef.current || pointersRef.current.size >= 2) return;
              const members = wb.nodes.filter((n) => n.gid === gid);
              hhDragRef.current = {
                gid,
                sx,
                sy,
                originX: members.length ? Math.min(...members.map((n) => n.x)) : 0,
                originY: members.length ? Math.min(...members.map((n) => n.y)) : 0,
                base,
                px: ev.clientX,
                py: ev.clientY,
                armed: false,
              };
            }}
            onAgeUp={(gid) => wb.ageUpHousehold(gid)}
          />
          <EdgeLayer
            blood={wb.edgeData.blood}
            bloodVerts={wb.bloodVerts}
            hopD={wb.hopD}
            unions={wb.edgeData.unions}
            customs={wb.edgeData.customs}
            userEdgeIds={userEdgeIds.current}
            isSelLink={wb.isSelLink}
            connectMode={wb.connectMode}
            hitStroke={EDGE_HIT_SCREEN_PX / k}
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
                  wb.edges.find(
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
            {guides && wb.snap && (
              <>
                {guides.gx.map((x, i) => (
                  <line
                    key={`gx-${i}`}
                    x1={x}
                    y1={-1e6}
                    x2={x}
                    y2={1e6}
                    stroke="#1b6cd6"
                    strokeWidth={1}
                    strokeDasharray="4 4"
                    opacity={0.5}
                  />
                ))}
                {guides.gy.map((y, i) => (
                  <line
                    key={`gy-${i}`}
                    x1={-1e6}
                    y1={y}
                    x2={1e6}
                    y2={y}
                    stroke="#1b6cd6"
                    strokeWidth={1}
                    strokeDasharray="4 4"
                    opacity={0.5}
                  />
                ))}
              </>
            )}
            {placement && wb.snap && (
              <g pointerEvents="none">
                <rect
                  x={placement.x}
                  y={placement.y}
                  width={TILE}
                  height={TILE}
                  fill="#1b6cd61a"
                  stroke="none"
                />
                <rect
                  x={placement.x + TILE}
                  y={placement.y}
                  width={TILE}
                  height={TILE}
                  fill="#1b6cd61a"
                  stroke="none"
                />
                <rect
                  x={placement.x}
                  y={placement.y}
                  width={placement.w}
                  height={placement.h}
                  rx={11}
                  fill="none"
                  stroke="#1b6cd6"
                  strokeWidth={2.4}
                  strokeDasharray="7 5"
                />
              </g>
            )}
          </g>
          <g id="lNodes">
            {sortedNodes.map((n) => (
              <SimNodeView
                key={n.id}
                node={n}
                selected={wb.sel?.type === 'node' && wb.sel.id === n.id}
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
        </g>
      </svg>
      {wb.status && (
        <div id="status" role="status" aria-live="polite" style={{ display: 'block' }}>
          {wb.status}
        </div>
      )}
      {wb.bloodlineId && (
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
          onConfirm={(type) => {
            if (type === 'parent')
              wb.confirmConnect('parent');
            else wb.confirmConnect(type);
          }}
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
        onPickWorld={(world) => {
          const r = svgRef.current?.getBoundingClientRect();
          const lg = legendRef.current?.getBoundingClientRect();
          const inset =
            !compact && r && lg ? Math.max(r.right - lg.left, 0) : 0;
          wb.zoomToWorld(world, r?.width ?? 800, r?.height ?? 600, inset);
        }}
      />
      <Hint />
      <Minimap wb={wb} svgRef={svgRef} />
      <ViewControls wb={wb} svgRef={svgRef} />
      {editNode && (
        <SimEditor
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
        />
      )}
    </div>
  );
}
