import {
  ArrowCounterClockwise,
  CornersOut,
  GridFour,
  Minus,
  Plus,
  Selection,
} from '@phosphor-icons/react';
import type { WhiteboardApi } from '../hooks/useWhiteboard.ts';
import { ToolButton } from './ToolButton.tsx';

type Props = {
  wb: WhiteboardApi;
  svgRef: React.RefObject<SVGSVGElement | null>;
};

/**
 * Canvas tools live here (snap, select, zoom) — used while looking at the board,
 * not while reaching for the top bar.
 */
export function ViewControls({ wb, svgRef }: Props) {
  const zoomBy = (factor: number) => {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r) return;
    wb.zoomAt(factor, r.left + r.width / 2, r.top + r.height / 2, r);
  };

  const fit = () => {
    const r = svgRef.current?.getBoundingClientRect();
    wb.fit(r?.width ?? 800, r?.height ?? 600);
  };

  const zoomPct = Math.round(wb.viewport.k * 100);

  return (
    <div className="viewctl" role="group" aria-label="View controls">
      <ToolButton
        icon={GridFour}
        label={wb.snap ? 'Snap on' : 'Snap off'}
        pressed={wb.snap}
        onClick={() => wb.setSnap((s) => !s)}
      />
      <ToolButton
        icon={Selection}
        label={wb.selectMode ? 'Select on' : 'Select'}
        pressed={wb.selectMode}
        onClick={() => wb.setSelectMode(!wb.selectMode)}
      />
      <span className="viewctl__rule" aria-hidden="true" />
      <ToolButton icon={Minus} label="Zoom out" onClick={() => zoomBy(0.8)} />
      <output
        className="viewctl__zoom"
        aria-label={`Current zoom ${zoomPct}%`}
        data-tooltip={`${zoomPct}%`}
      >
        {zoomPct}%
      </output>
      <ToolButton icon={Plus} label="Zoom in" onClick={() => zoomBy(1.25)} />
      <span className="viewctl__rule" aria-hidden="true" />
      <ToolButton icon={CornersOut} label="Fit all" onClick={fit} />
      <ToolButton
        icon={ArrowCounterClockwise}
        label="Reset view"
        onClick={wb.resetView}
      />
    </div>
  );
}
