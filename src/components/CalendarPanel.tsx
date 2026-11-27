import { useRef } from 'react';
import { useSheet } from '../hooks/useSheet.ts';
import { useCompactChrome } from '../hooks/useCompactChrome.ts';
import type { PlannerCalendar, SaveGameInfo } from '../types/whiteboard.ts';
import { CalendarControl } from './CalendarControl.tsx';
import { CloseButton } from './CloseButton.tsx';
import { SheetGrabber } from './SheetGrabber.tsx';

type Props = {
  anchorRect: DOMRect | null;
  calendar: PlannerCalendar | null;
  onCalendar: (cal: PlannerCalendar | null) => void;
  game?: SaveGameInfo | null;
  onClose: () => void;
};

/** ⋮ → Calendar years: the board's calendar, hung from the ⋮ as Credits is; a bottom sheet on a phone. */
export function CalendarPanel({ anchorRect, calendar, onCalendar, game, onClose }: Props) {
  const compact = useCompactChrome();
  const ref = useRef<HTMLDivElement>(null);
  const drawer = useSheet(ref, { enabled: compact, head: '.gph' });
  if (!compact && !anchorRect) return null;
  const desktopPos = (() => {
    if (compact || !anchorRect) return {};
    const w = 320;
    let left = anchorRect.right - w;
    if (left + w > window.innerWidth - 6) left = window.innerWidth - w - 6;
    if (left < 6) left = 6;
    return { left, top: anchorRect.bottom + 6, width: w };
  })();
  return (
    <div
      ref={ref}
      id="calendar-panel"
      className={compact ? 'gpanel calendar-panel gpanel--sheet' : 'gpanel calendar-panel'}
      style={{ display: 'block', ...desktopPos }}
      role="dialog"
      aria-label="Calendar years"
    >
      <SheetGrabber sheet={drawer} what="Calendar years" />
      <div className="gph">
        <b>Calendar years</b>
        <CloseButton label="Close calendar years" onClick={onClose} />
      </div>
      <CalendarControl calendar={calendar} onCalendar={onCalendar} game={game ?? null} />
    </div>
  );
}
