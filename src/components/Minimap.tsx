import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import {
  MINIMAP_PAD,
  MINIMAP_VIEW_MIN,
} from '../lib/constants.ts';
import {
  bbox,
  viewportWorldRect,
  worldFrame,
} from '../lib/geometry.ts';
import {
  mappedViewRect,
  minimapFit,
  minimapToWorld,
  viewportCenteredOn,
  worldToMinimap,
  zoomTowardWorld,
} from '../lib/minimap.ts';
import { worldColor } from '../lib/utils.ts';
import type { LiveCamera } from '../lib/liveScene.ts';
import type { WhiteboardApi } from '../hooks/useWhiteboard.ts';

type Props = {
  wb: WhiteboardApi;
  svgRef: RefObject<SVGSVGElement | null>;
  camera: LiveCamera;
};

function useElementSize(ref: RefObject<Element | null>): {
  w: number;
  h: number;
} {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    /*
     * Read from the observer entry rather than getBoundingClientRect(). The
     * board is a ~8k element SVG, so measuring it from inside an effect forces
     * a synchronous full-document layout before the browser has painted once.
     * ResizeObserver delivers the same box after the browser's own layout step.
     */
    const ro = new ResizeObserver(([entry]) => {
      const r = entry?.contentRect;
      if (!r) return;
      setSize((prev) =>
        prev.w === r.width && prev.h === r.height
          ? prev
          : { w: r.width, h: r.height },
      );
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

/**
 * Overview of the whole board with the current view drawn on top.
 * Click or drag to pan; wheel zooms toward that world point.
 */
export function Minimap({ wb, svgRef, camera }: Props) {
  const mapRef = useRef<SVGSVGElement>(null);
  const wbRef = useRef(wb);
  wbRef.current = wb;
  const cameraRef = useRef(camera);
  cameraRef.current = camera;
  const mapSize = useElementSize(mapRef);
  const stageSize = useElementSize(svgRef);
  const fitRef = useRef(minimapFit({ l: 0, t: 0, r: 1, b: 1 }, 1, 1, 0));
  const panRafRef = useRef(0);
  const panPendingRef = useRef<{ clientX: number; clientY: number } | null>(
    null,
  );
  const wheelIdleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Before the first measure every blob would land on a bogus 1×1 fit. */
  const measured = mapSize.w > 0 && mapSize.h > 0;

  const board = useMemo(() => {
    const [l, t, r, b] = bbox(wb.nodes, wb.nodeVis);
    return { l, t, r, b };
  }, [wb.nodes, wb.nodeVis]);

  const fit = useMemo(
    () => minimapFit(board, mapSize.w || 1, mapSize.h || 1, MINIMAP_PAD),
    [board, mapSize.w, mapSize.h],
  );
  fitRef.current = fit;

  const worlds = useMemo(() => {
    const out: {
      name: string;
      l: number;
      t: number;
      r: number;
      b: number;
      color: string;
    }[] = [];
    if (!measured) return out;
    for (const name of wb.liveWorlds) {
      if (!name || name === '—') continue;
      const frame = worldFrame(
        name,
        wb.nodes,
        wb.groups,
        wb.nodeVis,
        wb.nodeBuckets,
      );
      if (!frame) continue;
      out.push({ name, ...frame, color: worldColor(name, wb.worlds) });
    }
    return out;
  }, [
    measured,
    wb.liveWorlds,
    wb.nodes,
    wb.groups,
    wb.nodeVis,
    wb.nodeBuckets,
    wb.worlds,
  ]);

  const blobs = measured ? wb.visibleNodes : [];

  const view = useMemo(() => {
    if (!stageSize.w || !stageSize.h) return null;
    const world = viewportWorldRect(wb.viewport, stageSize.w, stageSize.h);
    return mappedViewRect(world, fit, MINIMAP_VIEW_MIN);
  }, [wb.viewport, stageSize.w, stageSize.h, fit]);

  const selectedId = wb.sel?.type === 'node' ? wb.sel.id : null;
  const searchId = wb.searchHits[wb.searchHitIndex] ?? null;

  const panFromEvent = useCallback(
    (ev: { clientX: number; clientY: number }) => {
      const map = mapRef.current;
      if (!map || !stageSize.w || !stageSize.h) return;
      const r = map.getBoundingClientRect();
      const local = minimapToWorld(
        ev.clientX - r.left,
        ev.clientY - r.top,
        fitRef.current,
      );
      const live = cameraRef.current.read();
      cameraRef.current.apply(
        viewportCenteredOn(
          local.x,
          local.y,
          live.k,
          stageSize.w,
          stageSize.h,
        ),
      );
    },
    [stageSize.h, stageSize.w],
  );

  const schedulePanFromEvent = useCallback(
    (ev: { clientX: number; clientY: number }) => {
      panPendingRef.current = { clientX: ev.clientX, clientY: ev.clientY };
      if (panRafRef.current) return;
      panRafRef.current = requestAnimationFrame(() => {
        panRafRef.current = 0;
        const pending = panPendingRef.current;
        panPendingRef.current = null;
        if (pending) panFromEvent(pending);
      });
    },
    [panFromEvent],
  );

  useEffect(() => {
    const el = mapRef.current;
    if (!el) return;
    const onWheelNative = (ev: WheelEvent) => {
      ev.preventDefault();
      ev.stopPropagation();
      const r = el.getBoundingClientRect();
      const local = minimapToWorld(
        ev.clientX - r.left,
        ev.clientY - r.top,
        fitRef.current,
      );
      let dy = ev.deltaY;
      if (ev.deltaMode === 1) dy *= 16;
      else if (ev.deltaMode === 2) dy *= 400;
      const step = ev.ctrlKey ? 0.01 : 0.0032;
      dy = Math.max(-80, Math.min(80, dy));
      const live = cameraRef.current.read();
      cameraRef.current.beginNav();
      cameraRef.current.apply(
        zoomTowardWorld(live, local.x, local.y, Math.exp(-dy * step)),
      );
      if (wheelIdleRef.current) clearTimeout(wheelIdleRef.current);
      wheelIdleRef.current = setTimeout(() => {
        wheelIdleRef.current = null;
        cameraRef.current.commit();
      }, 150);
    };
    el.addEventListener('wheel', onWheelNative, { passive: false });
    return () => el.removeEventListener('wheel', onWheelNative);
  }, []);

  const onPointerDown = (ev: ReactPointerEvent<SVGSVGElement>) => {
    ev.stopPropagation();
    ev.preventDefault();
    ev.currentTarget.setPointerCapture(ev.pointerId);
    camera.beginNav();
    panFromEvent(ev);
  };

  const onPointerMove = (ev: ReactPointerEvent<SVGSVGElement>) => {
    if (!ev.currentTarget.hasPointerCapture(ev.pointerId)) return;
    schedulePanFromEvent(ev);
  };

  const onPointerUp = (ev: ReactPointerEvent<SVGSVGElement>) => {
    if (!ev.currentTarget.hasPointerCapture(ev.pointerId)) return;
    if (panRafRef.current) {
      cancelAnimationFrame(panRafRef.current);
      panRafRef.current = 0;
    }
    const pending = panPendingRef.current;
    panPendingRef.current = null;
    if (pending) panFromEvent(pending);
    camera.commit();
  };

  return (
    <div className="minimap">
      <svg
        ref={mapRef}
        className="minimap__svg"
        role="img"
        aria-label="Board map. Click or drag to move the view."
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {worlds.map((w) => {
          const p = worldToMinimap(w.l, w.t, fit);
          return (
            <rect
              key={w.name}
              x={p.x}
              y={p.y}
              width={Math.max(1, (w.r - w.l) * fit.scale)}
              height={Math.max(1, (w.b - w.t) * fit.scale)}
              rx={Math.max(2, 8 * fit.scale)}
              fill={`${w.color}33`}
              stroke={`${w.color}99`}
              strokeWidth={1}
            />
          );
        })}
        {blobs.map((n) => {
          const p = worldToMinimap(n.x, n.y, fit);
          const current = n.id === selectedId || n.id === searchId;
          return (
            <rect
              key={n.id}
              x={p.x}
              y={p.y}
              width={Math.max(1, n.w * fit.scale)}
              height={Math.max(1, n.h * fit.scale)}
              fill={current ? '#1b6cd6' : n.color || '#8a7f63'}
              opacity={current ? 1 : 0.85}
            />
          );
        })}
        {view ? (
          <rect
            className="minimap__view"
            x={view.x}
            y={view.y}
            width={view.w}
            height={view.h}
            fill="#1b6cd626"
            stroke="#1b6cd6"
            strokeWidth={1.5}
          />
        ) : null}
      </svg>
    </div>
  );
}
