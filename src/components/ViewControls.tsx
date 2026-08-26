import {
  ArrowCounterClockwise,
  CornersOut,
  GridFour,
  Minus,
  Plus,
} from '@phosphor-icons/react';
import type { WhiteboardApi } from '../hooks/useWhiteboard.ts';
import { ToolButton } from './ToolButton.tsx';

type Props = {
  wb: WhiteboardApi;
  svgRef: React.RefObject<SVGSVGElement | null>;
};

/**
 * View manipulation lives on the canvas rather than in the top bar: it is used
 * while looking at the board, not while reaching for a menu.
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

  return (
    <div className="viewctl" role="group" aria-label="View controls">
      <ToolButton
        icon={GridFour}
        label="Snap to tiles"
        pressed={wb.snap}
        onClick={() => wb.setSnap((s) => !s)}
      />
      <span className="viewctl__rule" aria-hidden="true" />
      <ToolButton icon={Minus} label="Zoom out" onClick={() => zoomBy(0.8)} />
      <output className="viewctl__zoom" aria-label="Current zoom">
        {Math.round(wb.viewport.k * 100)}%
      </output>
      <ToolButton icon={Plus} label="Zoom in" onClick={() => zoomBy(1.25)} />
      <span className="viewctl__rule" aria-hidden="true" />
      <ToolButton icon={CornersOut} label="Fit everything" onClick={fit} />
      <ToolButton
        icon={ArrowCounterClockwise}
        label="Reset the view"
        onClick={wb.resetView}
      />
    </div>
  );
}
