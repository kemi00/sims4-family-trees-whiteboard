import { CaretRight, Check, GameController, Highlighter, IdentificationBadge, LockSimple, Skull, UsersThree, type Icon } from '../icons.ts';
import type { WhiteboardApi } from '../hooks/useWhiteboard.ts';
import { trackAction } from '../lib/analytics.ts';
import { simName } from '../lib/connectionLog.ts';
import { filterCounts } from '../lib/filterCount.ts';
import { AgesPanel } from './AgesPanel.tsx';
import { BarPanel } from './BarPanel.tsx';
import { GamesPanel } from './GamesPanel.tsx';
import { PlayabilityPanel } from './PlayabilityPanel.tsx';

function bloodlineNote(wb: WhiteboardApi): string {
  if (wb.bloodlineId) {
    const node = wb.byid[wb.bloodlineId];
    return `Showing ${node ? simName(node) : 'this sim'}’s ancestors and descendants. Turn it off to show everyone.`;
  }
  if (wb.sel?.type === 'node') return 'Dims everyone who isn’t an ancestor or descendant of the sim you picked.';
  return 'Pick a sim on the board first, then this dims everyone outside their ancestors and descendants.';
}

/** An on/off filter: its name, what it does, a check while on. */
function ToggleRow({
  icon: Glyph,
  label,
  note,
  on,
  disabled,
  onClick,
}: {
  icon: Icon;
  label: string;
  note: string;
  on: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" role="switch" aria-checked={on} disabled={disabled} className="fpanel__row" onClick={onClick}>
      <Glyph aria-hidden="true" />
      <span className="fpanel__text">
        {label}
        <small>{note}</small>
      </span>
      {on && <Check className="fpanel__end" weight="bold" aria-hidden="true" />}
    </button>
  );
}

/** A filter with choices of its own: it opens inside the panel. */
function ViewRow({ icon: Glyph, label, note, onClick }: { icon: Icon; label: string; note: string; onClick: () => void }) {
  return (
    <button type="button" className="fpanel__row" onClick={onClick}>
      <Glyph aria-hidden="true" />
      <span className="fpanel__text">
        {label}
        <small>{note}</small>
      </span>
      <CaretRight className="fpanel__end" aria-hidden="true" />
    </button>
  );
}

/**
 * Filters, in the bar's panel: the on/off filters first, then Games and
 * packs, Play and Highlight, each opening inside the panel with a way back.
 */
export function FiltersPanel({ wb, backToList }: { wb: WhiteboardApi; backToList?: () => void }) {
  const counts = filterCounts(wb);
  const close = () => {
    wb.setFiltersOpen(false);
    wb.setGamesOpen(false);
    wb.setPlayOpen(false);
    wb.setAgesOpen(false);
  };
  const back = (setView: (open: boolean) => void) => ({
    label: 'Back to Filters',
    onBack: () => {
      wb.setFiltersOpen(true);
      setView(false);
    },
  });
  const open = (setView: (open: boolean) => void, path: string) => {
    trackAction(path);
    setView(true);
  };

  if (wb.gamesOpen) {
    return (
      <BarPanel
        id="filters"
        className="gpanel fpanel"
        title="Games and packs"
        description="Show or hide each game’s sims"
        back={back(wb.setGamesOpen)}
        onClose={close}
      >
        <GamesPanel
          packs={wb.packs}
          hiddenPacks={wb.hiddenPacks}
          counts={wb.packCounts}
          colors={wb.packColors}
          onToggle={wb.togglePack}
          onAll={() => wb.setHiddenPacks(new Set())}
          onNone={() => wb.setHiddenPacks(new Set(wb.packs))}
        />
      </BarPanel>
    );
  }
  if (wb.playOpen) {
    return (
      <BarPanel
        id="filters"
        className="gpanel fpanel"
        title="Play"
        description="Show or hide sims by how you play them"
        back={back(wb.setPlayOpen)}
        onClose={close}
      >
        <PlayabilityPanel
          playabilities={wb.playabilities}
          hiddenPlay={wb.hiddenPlay}
          nodes={wb.nodes}
          onToggle={wb.togglePlay}
          onAll={() => wb.setHiddenPlay(new Set())}
          onNone={() => wb.setHiddenPlay(new Set(wb.playabilities))}
        />
      </BarPanel>
    );
  }
  if (wb.agesOpen) {
    return (
      <BarPanel
        id="filters"
        className="gpanel fpanel"
        title="Highlight"
        description="Light up the sims you pick; the rest dim"
        // Opened from the highlight's list: back goes to the list.
        back={backToList ? { label: 'Back to the list', onBack: backToList } : back(wb.setAgesOpen)}
        onClose={close}
      >
        <AgesPanel
          nodes={wb.nodes}
          partnered={wb.partneredIds}
          parents={wb.parentIds}
          hiAges={wb.hiAges}
          hiSingle={wb.hiSingle}
          unborn={wb.plannedChildIds}
          packVis={wb.nodeVis}
          onToggle={wb.toggleAge}
          onToggleSingle={wb.toggleSingle}
          onClear={() => {
            wb.setHiAges(new Set());
            wb.setHiSingle(false);
          }}
        />
      </BarPanel>
    );
  }
  return (
    <BarPanel
      id="filters"
      className="gpanel fpanel"
      title="Filters"
      description={counts.total ? `${counts.total} on` : 'What the board shows'}
      onClose={close}
    >
      <h3 className="fpanel__title">Show and hide</h3>
      <div className="fpanel__list">
        <ToggleRow
          icon={UsersThree}
          label="Bloodline"
          note={bloodlineNote(wb)}
          on={!!wb.bloodlineId}
          disabled={!(wb.bloodlineId || wb.sel?.type === 'node')}
          onClick={wb.toggleBloodline}
        />
        <ToggleRow
          icon={LockSimple}
          label="Hide secrets"
          note={
            wb.hasSecrets || wb.hideSecrets
              ? 'Secret lovers and secret parents, for screenshots without spoilers. They stay in your file.'
              : 'No secrets on this board. Secret lovers and secret parents come from your save.'
          }
          on={wb.hideSecrets}
          disabled={!wb.hasSecrets && !wb.hideSecrets}
          onClick={wb.toggleHideSecrets}
        />
        <ToggleRow
          icon={Skull}
          label="Hide deceased"
          note={
            wb.hasDeceased || wb.hideDeceased
              ? 'Their cards keep their places, and they stay in your file.'
              : 'No deceased sims on this board.'
          }
          on={wb.hideDeceased}
          disabled={!wb.hasDeceased && !wb.hideDeceased}
          onClick={wb.toggleHideDeceased}
        />
      </div>
      <h3 className="fpanel__title">Narrow down</h3>
      <div className="fpanel__list">
        <ViewRow
          icon={GameController}
          label="Games and packs"
          note={counts.games ? `${counts.games} hidden` : 'Every game shown'}
          onClick={() => open(wb.setGamesOpen, '/action/filters/games')}
        />
        <ViewRow
          icon={IdentificationBadge}
          label="Play"
          note={counts.play ? `${counts.play} hidden` : 'Everyone shown'}
          onClick={() => open(wb.setPlayOpen, '/action/filters/play')}
        />
        <ViewRow
          icon={Highlighter}
          label="Highlight"
          note={counts.highlight ? `${counts.highlight} picked` : 'Nothing highlighted'}
          onClick={() => open(wb.setAgesOpen, '/action/filters/highlight')}
        />
      </div>
    </BarPanel>
  );
}
