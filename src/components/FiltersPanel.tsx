import { CaretRight, GameController, IdentificationBadge, LockSimple, Skull, UsersFour, UsersThree, type Icon } from '../icons.ts';
import { ROYALTY_AND_LEGACY } from '../lib/packs.ts';
import type { WhiteboardApi } from '../hooks/useWhiteboard.ts';
import { trackAction } from '../lib/analytics.ts';
import { REACH_NOUN } from '../lib/bloodline.ts';
import { simName } from '../lib/connectionLog.ts';
import { filterCounts } from '../lib/filterCount.ts';
import { AgesPanel } from './AgesPanel.tsx';
import { ToggleRow } from './ToggleRow.tsx';
import { BarPanel } from './BarPanel.tsx';
import { GamesPanel } from './GamesPanel.tsx';
import { PlayabilityPanel } from './PlayabilityPanel.tsx';

function bloodlineNote(wb: WhiteboardApi): string {
  if (wb.bloodlineId) {
    const node = wb.byid[wb.bloodlineId];
    const whose = wb.bloodlineReach === 'both' ? 'ancestors and descendants' : REACH_NOUN[wb.bloodlineReach];
    return `Showing ${node ? simName(node) : 'this sim'}’s ${whose}. Turn it off, or Clear on its banner, to end it.`;
  }
  if (wb.sel?.type === 'node') return 'Dims everyone outside the line of the sim you picked. Choose children, all descendants or ancestors too on the banner.';
  return 'Pick a sim on the board first, then this dims everyone outside their line: children, descendants or ancestors too.';
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
 * Filters and Highlight, in the bar's panel. Filters hide: secrets, the
 * deceased, then Games and packs and Play, each opening inside with a way
 * back. Highlight (its own bar button) lights up: a sim's family, a
 * bloodline, life stages and singles.
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
        // Opened from the highlight's list: back goes to the list. From the bar, it is a panel of its own.
        {...(backToList ? { back: { label: 'Back to the list', onBack: backToList } } : {})}
        onClose={close}
      >
        <h3 className="fpanel__title">A family</h3>
        <div className="fpanel__list">
          <ToggleRow
            icon={UsersFour}
            label="A sim's family"
            note={wb.familyFocus ? 'Select any sim; pick close or extended family on the banner.' : 'Select any sim to light up their family; the rest dim.'}
            on={wb.familyFocus}
            onClick={() => wb.setFamilyFocus(!wb.familyFocus)}
          />
          <ToggleRow
            icon={UsersThree}
            label="Bloodline"
            note={bloodlineNote(wb)}
            on={!!wb.bloodlineId}
            disabled={!(wb.bloodlineId || wb.sel?.type === 'node')}
            onClick={wb.toggleBloodline}
          />
        </div>
        <h3 className="fpanel__title">Life stages and more</h3>
        <AgesPanel
          nodes={wb.nodes}
          sets={wb.highlightSets}
          hiAges={wb.hiAges}
          hiSingle={wb.hiSingle}
          packVis={wb.nodeVis}
          onToggle={wb.toggleAge}
          onToggleSingle={wb.toggleSingle}
          onSetRange={wb.setHouseholdRange}
          limit={wb.householdLimit}
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
      description={counts.hiding ? `${counts.hiding} on` : 'What the board hides'}
      onClose={close}
    >
      <h3 className="fpanel__title">Show and hide</h3>
      <div className="fpanel__list">
        {/* Secrets come with Royalty & Legacy: without it, no toggle for what can't be there. */}
        {(wb.hasGame(ROYALTY_AND_LEGACY) || wb.hasSecrets || wb.hideSecrets) && (
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
        )}
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
      </div>
    </BarPanel>
  );
}
