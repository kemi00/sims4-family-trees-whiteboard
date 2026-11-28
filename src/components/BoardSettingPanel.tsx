import { useRef, type ReactNode } from 'react';
import type { Icon } from '../icons.ts';
import { CaretRight } from '../icons.ts';
import { useSheet } from '../hooks/useSheet.ts';
import { useCompactChrome } from '../hooks/useCompactChrome.ts';
import { CloseButton } from './CloseButton.tsx';
import { SheetGrabber } from './SheetGrabber.tsx';

type Props = {
  /** The panel's id, so ⋮ knows a phone's sheet of it folds rather than closes. */
  id: string;
  title: string;
  anchorRect: DOMRect | null;
  onClose: () => void;
  children: ReactNode;
};

/**
 * A board setting's own panel (Calendar years, Life stage lengths): hung
 * from the ⋮ as Credits is, a bottom sheet on a phone. Opened from ⋮ or
 * from its row in Your save.
 */
export function BoardSettingPanel({ id, title, anchorRect, onClose, children }: Props) {
  const compact = useCompactChrome();
  const ref = useRef<HTMLDivElement>(null);
  const drawer = useSheet(ref, { enabled: compact, head: '.gph' });
  if (!compact && !anchorRect) return null;
  const desktopPos = (() => {
    if (compact || !anchorRect) return {};
    const w = 340;
    let left = anchorRect.right - w;
    if (left + w > window.innerWidth - 6) left = window.innerWidth - w - 6;
    if (left < 6) left = 6;
    return { left, top: anchorRect.bottom + 6, width: w };
  })();
  return (
    <div
      ref={ref}
      id={id}
      className={compact ? 'gpanel board-setting gpanel--sheet' : 'gpanel board-setting'}
      style={{ display: 'block', ...desktopPos }}
      role="dialog"
      aria-label={title}
    >
      <SheetGrabber sheet={drawer} what={title} />
      <div className="gph">
        <b>{title}</b>
        <CloseButton label={`Close ${title.toLowerCase()}`} onClick={onClose} />
      </div>
      {children}
    </div>
  );
}

/** A board setting summed up in one row (Your save › On the board), opening its panel. */
export function SettingRow({ icon: Glyph, title, summary, onOpen }: { icon: Icon; title: string; summary: string; onOpen: () => void }) {
  return (
    <button type="button" className="calrow" aria-haspopup="dialog" onClick={onOpen}>
      <Glyph aria-hidden="true" />
      <span className="pop__stack">
        {title}
        <span className="pop__sub">{summary}</span>
      </span>
      <CaretRight className="calrow__end" aria-hidden="true" />
    </button>
  );
}
