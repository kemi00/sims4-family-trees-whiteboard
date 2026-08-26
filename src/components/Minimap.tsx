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
import type { WhiteboardApi } from '../hooks/useWhiteboard.ts';

type Props = {
  wb: WhiteboardApi;
  svgRef: RefObject<SVGSVGElement | null>;
};

function useElementSize(ref: RefObject<Element | null>): {
  w: number;
  h: number;
} {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => {
      const r = el.getBoundingClientRect();
      setSize((prev) =>
        prev.w === r.width && prev.h === r.height
          ? prev
          : { w: r.width, h: r.height },
      );
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

/**
 * Overview of the whole board with the current view drawn on top.
 * Click or drag to pan; wheel zooms toward that world point.
 */
export function Minimap({ wb, svgRef }: Props) {
  const mapRef = useRef<SVGSVGElement>(null);
  const wbRef = useRef(wb);
  wbRef.current = wb;
  const mapSize = useElementSize(mapRef);
  const stageSize = useElementSize(svgRef);
  const fitRef = useRef(minimapFit({ l: 0, t: 0, r: 1, b: 1 }, 1, 1, 0));

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
    for (const name of wb.liveWorlds) {
      if (!name || name === '—') continue;
      const frame = worldFrame(name, wb.nodes, wb.groups, wb.nodeVis);
      if (!frame) continue;
      out.push({ name, ...frame, color: worldColor(name, wb.worlds) });
    }
    return out;
  }, [wb.liveWorlds, wb.nodes, wb.groups, wb.nodeVis, wb.worlds]);

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
      wb.setViewport(
        viewportCenteredOn(
          local.x,
          local.y,
          wb.viewport.k,
          stageSize.w,
          stageSize.h,
        ),
      );
    },
    [stageSize.h, stageSize.w, wb],
  );

  useEffect(() => {
    const el = mapRef.current;
    if (!el) return;
    const onWheelNative = (ev: WheelEvent) => {
      ev.preventDefault();
      ev.stopPropagation();
      const api = wbRef.current;
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
      api.setViewport(
        zoomTowardWorld(api.viewport, local.x, local.y, Math.exp(-dy * step)),
      );
    };
    el.addEventListener('wheel', onWheelNative, { passive: false });
    return () => el.removeEventListener('wheel', onWheelNative);
  }, []);

  const onPointerDown = (ev: ReactPointerEvent<SVGSVGElement>) => {
    ev.stopPropagation();
    ev.preventDefault();
    ev.currentTarget.setPointerCapture(ev.pointerId);
    panFromEvent(ev);
  };

  const onPointerMove = (ev: ReactPointerEvent<SVGSVGElement>) => {
    if (!ev.currentTarget.hasPointerCapture(ev.pointerId)) return;
    panFromEvent(ev);
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
        {wb.visibleNodes.map((n) => {
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
