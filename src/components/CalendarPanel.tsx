import type { PlannerCalendar, SaveGameInfo } from '../types/whiteboard.ts';
import { BoardSettingPanel } from './BoardSettingPanel.tsx';
import { CalendarControl } from './CalendarControl.tsx';

type Props = {
  anchorRect: DOMRect | null;
  calendar: PlannerCalendar | null;
  onCalendar: (cal: PlannerCalendar | null) => void;
  game?: SaveGameInfo | null;
  onClose: () => void;
};

/** ⋮ → Calendar years: the board's calendar in its own panel. */
export function CalendarPanel({ anchorRect, calendar, onCalendar, game, onClose }: Props) {
  return (
    <BoardSettingPanel id="calendar-panel" title="Calendar years" anchorRect={anchorRect} onClose={onClose}>
      <CalendarControl calendar={calendar} onCalendar={onCalendar} game={game ?? null} />
    </BoardSettingPanel>
  );
}
