import type { WhiteboardApi } from '../hooks/useWhiteboard.ts';

/**
 * Tabs over a panel, for a place with more than one page: Play (Up next,
 * Worlds in numbers) and Story (the story, the Log, the Gazette). The page
 * shown is pressed; a tab may open a window of its own (the Gazette).
 */
export function PanelTabs({ label, tabs }: { label: string; tabs: { id: string; label: string; on: boolean; onSelect: () => void }[] }) {
  return (
    <div className="ptabs" role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button key={t.id} type="button" role="tab" aria-selected={t.on} className="ptabs__tab" onClick={t.on ? undefined : t.onSelect}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

/** Play's pages: who to play next (and this week), and the worlds in numbers. */
export function PlayTabs({ wb }: { wb: WhiteboardApi }) {
  return (
    <PanelTabs
      label="Play"
      tabs={[
        {
          id: 'upnext',
          label: 'Up next',
          on: wb.upNextOpen,
          onSelect: () => {
            wb.setWorldStatsOpen(false);
            wb.setUpNextOpen(true);
          },
        },
        {
          id: 'worlds',
          label: 'Worlds in numbers',
          on: wb.worldStatsOpen,
          onSelect: () => {
            wb.setUpNextOpen(false);
            wb.setWorldStatsOpen(true);
          },
        },
      ]}
    />
  );
}

/** Story's pages: what happened in your game, the Log of your own edits, and the Gazette. */
export function StoryTabs({ wb }: { wb: WhiteboardApi }) {
  return (
    <PanelTabs
      label="Story"
      tabs={[
        {
          id: 'story',
          label: 'Story',
          on: !!wb.chronicleView,
          onSelect: () => {
            wb.setLogOpen(false);
            wb.setChronicleView({ label: 'your board', ids: null });
          },
        },
        {
          id: 'log',
          label: wb.connectionLog.length ? `Log (${wb.connectionLog.length})` : 'Log',
          on: wb.logOpen,
          onSelect: () => {
            wb.setChronicleView(null);
            wb.setLogOpen(true);
          },
        },
        { id: 'gazette', label: 'Gazette', on: false, onSelect: () => wb.setGazetteOpen(true) },
      ]}
    />
  );
}
