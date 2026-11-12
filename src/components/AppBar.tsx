import {
  CalendarBlank,
  Check,
  BookOpenText,
  Crown,
  Eye,
  EyeSlash,
  Funnel,
  GameController,
  Globe,
  Highlighter,
  House,
  IdentificationBadge,
  LinkSimple,
  ListNumbers,
  LockSimple,
  MagicWand,
  MagnifyingGlass,
  Skull,
  ArrowClockwise,
  ArrowCounterClockwise,
  Scroll,
  TreeStructure,
  UserPlus,
  UsersFour,
  UsersThree,
  type Icon,
} from '../icons.ts';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { useCompactChrome } from '../hooks/useCompactChrome.ts';
import { useDropdownPosition } from '../hooks/useDropdownPosition.ts';
import type { WhiteboardApi } from '../hooks/useWhiteboard.ts';
import { trackAction } from '../lib/analytics.ts';
import { simName } from '../lib/connectionLog.ts';
import type { LinksView } from '../lib/family.ts';
import { saveChipText } from '../lib/lifeClock.ts';
import { REDO_KEYS, UNDO_KEYS, redoTip, undoTip } from '../lib/undoNames.ts';
import { StepTip } from './StepText.tsx';
import { OverflowMenu, type FoldedItem } from './OverflowMenu.tsx';
import { SaveDetails } from './SaveStatus.tsx';
import { ToolButton } from './ToolButton.tsx';

function bloodlineToolLabel(wb: WhiteboardApi): string {
  if (wb.bloodlineId) {
    const node = wb.byid[wb.bloodlineId];
    const name = node ? simName(node) : 'this sim';
    return `Showing ${name}'s bloodline. Click to show everyone.`;
  }
  if (wb.sel?.type === 'node') {
    return 'Dim everyone who is not an ancestor or descendant of the selected sim.';
  }
  return 'Select a sim, then Bloodline, to dim everyone outside their ancestors and descendants.';
}

/** The family-links views, in the menu's order: most shown to least. */
const LINK_VIEWS: { view: LinksView; icon: Icon; label: string; note?: string }[] = [
  { view: 'all', icon: TreeStructure, label: 'All' },
  {
    view: 'inside',
    icon: House,
    label: 'Only inside households',
    note: 'Lines between households hide',
  },
  { view: 'none', icon: EyeSlash, label: 'Hidden' },
];

/** What the board draws, in words: the View button's name and its More entry on a phone. */
function layersNote(wb: WhiteboardApi): string {
  const links = wb.familyFocus
    ? 'Highlighting a family'
    : wb.linksView === 'inside'
      ? 'Links inside households'
      : wb.linksView === 'none'
        ? 'Links hidden'
        : 'All links';
  const { groups, worlds } = wb.show;
  const boxes =
    groups && worlds
      ? 'household and world boxes'
      : groups
        ? 'household boxes'
        : worlds
          ? 'world boxes'
          : 'no boxes';
  return `${links} · ${boxes}`;
}

/**
 * Where a popover was opened from: its own button in the bar, or, on a
 * phone, the More menu that the button is folded into.
 */
type OpenedFrom = 'bar' | 'more';

/** Close a popover on a press outside `ref` (or `popRef`, if set) or on Escape. */
function useDismiss(
  open: boolean,
  ref: RefObject<HTMLElement | null>,
  close: () => void,
  popRef?: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (!open) return;
    const onPointer = (ev: PointerEvent) => {
      const t = ev.target as Node;
      if (!ref.current?.contains(t) && !popRef?.current?.contains(t)) close();
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape') return;
      ev.stopPropagation();
      close();
    };
    document.addEventListener('pointerdown', onPointer, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onPointer, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open, ref, close, popRef]);
}

type Props = {
  wb: WhiteboardApi;
  svgRef: RefObject<SVGSVGElement | null>;
  filtersBtnRef: RefObject<HTMLButtonElement | null>;
  logBtnRef: RefObject<HTMLButtonElement | null>;
  upNextBtnRef: RefObject<HTMLButtonElement | null>;
  dynastiesBtnRef: RefObject<HTMLButtonElement | null>;
  onDevUpdates: () => void;
  devUpdatesUnseen: boolean;
  /** Open search (⌘K or Ctrl+K does too). */
  onOpenFind: () => void;
  /** "⌘K" or "Ctrl+K", shown on the Search button. */
  findKeys: string;
};

export function AppBar({
  wb,
  svgRef,
  filtersBtnRef,
  logBtnRef,
  upNextBtnRef,
  dynastiesBtnRef,
  onDevUpdates,
  devUpdatesUnseen,
  onOpenFind,
  findKeys,
}: Props) {
  const compact = useCompactChrome();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersRef = useRef<HTMLDivElement>(null);
  const { popRef: filtersPopRef, style: filtersPopStyle } = useDropdownPosition(
    filtersOpen,
    filtersRef,
  );
  /** The More menu's wrapper: what popovers opened from it hang off. */
  const moreRef = useRef<HTMLDivElement>(null);
  const [linksFrom, setLinksFrom] = useState<OpenedFrom | null>(null);
  const linksOpen = linksFrom !== null;
  const linksRef = useRef<HTMLDivElement>(null);
  const { popRef: linksPopRef, style: linksPopStyle } = useDropdownPosition(
    linksOpen,
    linksFrom === 'more' ? moreRef : linksRef,
  );
  const closeLinks = useCallback(() => setLinksFrom(null), []);
  useDismiss(linksOpen, linksRef, closeLinks, linksPopRef);
  /**
   * A phone's status bar has no room for the save, so More lists it and its
   * details hang off the More button; wider screens show it in the status bar.
   */
  const [saveOpen, setSaveOpen] = useState(false);
  const { popRef: savePopRef, style: savePopStyle } = useDropdownPosition(saveOpen, moreRef);
  const closeSave = useCallback(() => setSaveOpen(false), []);
  useDismiss(saveOpen, moreRef, closeSave, savePopRef);

  // A game switched off with no sims on the board hides nothing, so it is
  // not an active filter (Games lists it, off, all the same).
  const hiddenCount = [...wb.hiddenPacks].filter((p) => wb.packCounts.get(p)).length;
  const playHidden = wb.hiddenPlay.size;
  const ageCount = wb.hiAges.size + (wb.hiSingle ? 1 : 0);
  const filterCount =
    hiddenCount +
    playHidden +
    ageCount +
    (wb.bloodlineId ? 1 : 0) +
    (wb.hideSecrets ? 1 : 0) +
    (wb.hideDeceased ? 1 : 0);
  const filterPanelOpen = wb.gamesOpen || wb.playOpen || wb.agesOpen;

  const svgSize = () => {
    const r = svgRef.current?.getBoundingClientRect();
    return { w: r?.width ?? 800, h: r?.height ?? 600 };
  };

  const addBtnRef = useRef<HTMLButtonElement>(null);
  const addNewSim = () => {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r) return;
    // With a pet pack on: a sim or a pet, from a menu under the button.
    const at = addBtnRef.current?.getBoundingClientRect();
    if (wb.petKinds.length && at) {
      wb.setAddMenu({ x: Math.max(8, at.left - r.left), y: Math.max(8, at.bottom - r.top + 6) });
      return;
    }
    wb.addSim(r.width, r.height);
  };

  const closeFilters = useCallback(() => setFiltersOpen(false), []);
  useDismiss(filtersOpen, filtersRef, closeFilters);

  const closeFilterPanels = () => {
    wb.setGamesOpen(false);
    wb.setPlayOpen(false);
    wb.setAgesOpen(false);
  };

  const toggleFilters = () => {
    if (filterPanelOpen) {
      closeFilterPanels();
      setFiltersOpen(false);
      return;
    }
    wb.setLogOpen(false);
    wb.setDynastiesOpen(false);
    closeLinks();
    closeSave();
    setFiltersOpen((o) => {
      if (!o) trackAction('/action/filters');
      return !o;
    });
  };

  const openGames = () => {
    setFiltersOpen(false);
    wb.setPlayOpen(false);
    wb.setAgesOpen(false);
    wb.setLogOpen(false);
    wb.setGamesOpen(!wb.gamesOpen);
  };
  const openPlay = () => {
    setFiltersOpen(false);
    wb.setGamesOpen(false);
    wb.setAgesOpen(false);
    wb.setLogOpen(false);
    wb.setPlayOpen(!wb.playOpen);
  };
  const openAges = () => {
    setFiltersOpen(false);
    wb.setGamesOpen(false);
    wb.setPlayOpen(false);
    wb.setLogOpen(false);
    wb.setAgesOpen(!wb.agesOpen);
  };
  const openUpNext = () => {
    setFiltersOpen(false);
    closeFilterPanels();
    wb.setLogOpen(false);
    wb.setDynastiesOpen(false);
    const next = !wb.upNextOpen;
    if (next) trackAction('/action/up-next');
    wb.setUpNextOpen(next);
  };
  /** The Chronicle, the whole board's story: from here as well as the save chip. */
  const storyOpen = !!wb.chronicleView && wb.chronicleView.ids === null;
  const openStory = () => {
    setFiltersOpen(false);
    closeFilterPanels();
    if (storyOpen) {
      wb.setChronicleView(null);
      return;
    }
    trackAction('/action/story');
    wb.setRecapOpen(false);
    wb.setChronicleView({ label: 'your board', ids: null });
  };

  const openDynasties = () => {
    setFiltersOpen(false);
    closeFilterPanels();
    wb.setLogOpen(false);
    wb.setUpNextOpen(false);
    const next = !wb.dynastiesOpen;
    if (next) trackAction('/action/dynasties');
    wb.setDynastiesOpen(next);
  };
  const openLog = () => {
    setFiltersOpen(false);
    closeFilterPanels();
    wb.setUpNextOpen(false);
    wb.setDynastiesOpen(false);
    const next = !wb.logOpen;
    if (next) trackAction('/action/log');
    wb.setLogOpen(next);
  };
  const onBloodline = () => {
    wb.toggleBloodline();
    setFiltersOpen(false);
  };
  const onHideSecrets = () => {
    wb.toggleHideSecrets();
    setFiltersOpen(false);
  };
  const onHideDeceased = () => {
    wb.toggleHideDeceased();
    setFiltersOpen(false);
  };
  const organise = () => {
    const { w, h } = svgSize();
    wb.organiseBoard(w, h);
  };
  const toggleLinks = (from: OpenedFrom) => {
    setFiltersOpen(false);
    closeSave();
    setLinksFrom((f) => (f ? null : from));
  };

  // Rare tools live in More on every screen: Organise and the Log. A phone
  // has room for the edit tools, search and More, so the rest of the bar
  // folds in there too, in the bar's order, each with the words its tooltip
  // or pressed state gives on a wider screen.
  const always: FoldedItem[] = [
    {
      id: 'organise',
      icon: MagicWand,
      label: 'Organise',
      note: 'Arrange the board like the starter one',
      onSelect: organise,
    },
    {
      id: 'log',
      icon: Scroll,
      label: wb.connectionLog.length ? `Log (${wb.connectionLog.length})` : 'Log',
      note: 'Links and household moves you added',
      onSelect: openLog,
    },
  ];
  const folded: FoldedItem[] = compact
    ? [
        // Redo has no room in the bar: it waits here while there is
        // something to put back.
        ...(wb.redoWhat
          ? [
              {
                id: 'redo',
                icon: ArrowClockwise,
                label: 'Redo',
                note: wb.redoWhat,
                onSelect: wb.redo,
              },
            ]
          : []),
        {
          id: 'upnext',
          icon: ListNumbers,
          label: 'Up next',
          note: 'A suggested order to play your households in',
          onSelect: openUpNext,
        },
        {
          id: 'dynasties',
          icon: Crown,
          label: 'Dynasties',
          note: 'Every dynasty, with its members',
          onSelect: openDynasties,
        },
        {
          id: 'story',
          icon: BookOpenText,
          label: 'Story',
          note: 'What happened in your game, upload by upload',
          onSelect: openStory,
        },
        {
          id: 'layers',
          icon: Eye,
          label: 'View',
          note: layersNote(wb),
          onSelect: () => toggleLinks('more'),
        },
        ...always,
        ...(wb.saveGame
          ? [
              {
                id: 'save',
                icon: CalendarBlank,
                label: 'Your save',
                note: saveChipText(wb.saveGame),
                onSelect: () => {
                  setFiltersOpen(false);
                  closeLinks();
                  setSaveOpen((o) => {
                    if (!o) trackAction('/action/save-details');
                    return !o;
                  });
                },
              },
            ]
          : []),
      ]
    : always;

  const linksMenu = (
    <div
      ref={linksPopRef}
      className="pop pop--links"
      role="menu"
      aria-label="View: family links and boxes"
      style={linksPopStyle}
    >
      <div className="pop__head" aria-hidden="true">
        Show family links
      </div>
      {LINK_VIEWS.map(({ view, icon: Glyph, label, note }) => {
        const on = wb.linksView === view;
        return (
          <button
            key={view}
            type="button"
            role="menuitemradio"
            aria-checked={on}
            onClick={() => {
              wb.setLinksView(view);
              closeLinks();
            }}
          >
            <Glyph aria-hidden="true" />
            <span className="pop__text">
              {label}
              {note && <small>{note}</small>}
            </span>
            {on && <Check className="pop__check" aria-hidden="true" />}
          </button>
        );
      })}
      <span className="pop__rule" aria-hidden="true" />
      <button
        type="button"
        role="menuitemcheckbox"
        aria-checked={wb.familyFocus}
        onClick={() => {
          wb.setFamilyFocus(!wb.familyFocus);
          closeLinks();
        }}
      >
        <UsersFour aria-hidden="true" />
        <span className="pop__text">
          Highlight a sim's family
          <small>Select any sim; pick close or extended family on the banner</small>
        </span>
        {wb.familyFocus && <Check className="pop__check" aria-hidden="true" />}
      </button>
      {/* What the board draws, in one place: links, then boxes. */}
      <span className="pop__rule" aria-hidden="true" />
      <div className="pop__head" aria-hidden="true">
        Show boxes
      </div>
      {(
        [
          ['groups', House, 'Household boxes'],
          ['worlds', Globe, 'World boxes'],
        ] as const
      ).map(([layer, Glyph, label]) => (
        <button
          key={layer}
          type="button"
          role="menuitemcheckbox"
          aria-checked={wb.show[layer]}
          onClick={() => {
            wb.toggleShow(layer);
            closeLinks();
          }}
        >
          <Glyph aria-hidden="true" />
          <span className="pop__text">{label}</span>
          {wb.show[layer] && <Check className="pop__check" aria-hidden="true" />}
        </button>
      ))}
    </div>
  );

  return (
    <header className="appbar">
      <span className="brand">
        <svg className="plumbob" viewBox="0 0 20 30" aria-hidden="true">
          <path d="M10 0 L4 11 L10 15 L16 11 Z" fill="#7fe04f" />
          <path d="M4 11 L10 15 L10 30 Z" fill="#3fa61f" />
          <path d="M16 11 L10 15 L10 30 Z" fill="#57c22e" />
        </svg>
        <span className="brand__name">Family Trees Whiteboard</span>
      </span>

      <span className="appbar__rule" aria-hidden="true" />

      <ToolButton
        icon={LinkSimple}
        label={
          wb.connectMode ? 'Connect is on: click to turn it off' : 'Link two sims'
        }
        tone="primary"
        pressed={wb.connectMode}
        onClick={() => wb.setConnectMode(!wb.connectMode)}
      >
        Connect
      </ToolButton>
      <ToolButton
        ref={addBtnRef}
        icon={UserPlus}
        label={wb.petKinds.length ? 'Add a sim or a pet' : 'Add a sim'}
        menu={wb.petKinds.length > 0}
        expanded={wb.petKinds.length ? !!wb.addMenu && !wb.addMenu.gid : undefined}
        onClick={addNewSim}
      >
        Add sim
      </ToolButton>
      <ToolButton
        icon={ArrowCounterClockwise}
        label={undoTip(wb.undoWhat)}
        tip={<StepTip verb="Undo" keys={UNDO_KEYS} what={wb.undoWhat} none="Nothing to undo" />}
        disabled={!wb.canUndo}
        onClick={wb.undo}
      />
      <ToolButton
        icon={ArrowClockwise}
        label={redoTip(wb.redoWhat)}
        tip={<StepTip verb="Redo" keys={REDO_KEYS} what={wb.redoWhat} none="Nothing to redo" />}
        className="appbar__wide-only"
        disabled={!wb.redoWhat}
        onClick={wb.redo}
      />
      <span className="appbar__rule" aria-hidden="true" />

      <div className="overflow appbar__wide-only" ref={linksRef}>
        <ToolButton
          icon={Eye}
          label={`View: ${layersNote(wb)}`}
          menu
          pressed={wb.linksView !== 'all' || wb.familyFocus || !wb.show.groups || !wb.show.worlds}
          expanded={linksFrom === 'bar'}
          className="tool--secondary"
          onClick={() => toggleLinks('bar')}
        >
          View
        </ToolButton>
        {linksFrom === 'bar' && linksMenu}
      </div>

      <span className="appbar__spacer" />

      {/* On a phone both fold into More, with the board tools. */}
      {!compact && (
        <ToolButton
          id="btnUpNext"
          ref={upNextBtnRef}
          icon={ListNumbers}
          label="Up next: a suggested order to play your households in"
          pressed={wb.upNextOpen}
          expanded={wb.upNextOpen}
          className="tool--secondary"
          onClick={openUpNext}
        >
          Up next
        </ToolButton>
      )}
      {!compact && (
        <ToolButton
          id="btnDynasties"
          ref={dynastiesBtnRef}
          icon={Crown}
          label="Dynasties: every dynasty, planned or in your game, with its members"
          pressed={wb.dynastiesOpen}
          expanded={wb.dynastiesOpen}
          className="tool--secondary"
          onClick={openDynasties}
        >
          Dynasties
        </ToolButton>
      )}
      {!compact && (
        <ToolButton
          id="btnStory"
          icon={BookOpenText}
          label="Story: what happened in your game, upload by upload"
          pressed={storyOpen}
          expanded={storyOpen}
          className="tool--secondary"
          onClick={openStory}
        >
          Story
        </ToolButton>
      )}

      <div className="overflow" ref={filtersRef}>
        <ToolButton
          id="btnFilters"
          ref={filtersBtnRef}
          icon={Funnel}
          label={filterCount ? `Filters: ${filterCount} on` : 'Bloodline, hide secrets or deceased, games, play, highlight'}
          pressed={filterCount > 0 || filterPanelOpen || filtersOpen}
          count={filterCount}
          expanded={filtersOpen}
          onClick={toggleFilters}
        >
          Filters
        </ToolButton>
        {filtersOpen && (
          <div
            ref={filtersPopRef}
            className="pop"
            role="menu"
            aria-label="Filters"
            style={filtersPopStyle}
          >
            <button
              type="button"
              role="menuitem"
              aria-pressed={!!wb.bloodlineId}
              disabled={!(wb.bloodlineId || wb.sel?.type === 'node')}
              title={bloodlineToolLabel(wb)}
              onClick={onBloodline}
            >
              <UsersThree aria-hidden="true" />
              Bloodline
            </button>
            <button
              type="button"
              role="menuitem"
              aria-pressed={wb.hideSecrets}
              disabled={!wb.hasSecrets && !wb.hideSecrets}
              title={
                wb.hasSecrets || wb.hideSecrets
                  ? 'Hide secret lovers and secret parents, for screenshots without spoilers. They stay in your file.'
                  : 'No secrets on this board. Secret lovers and secret parents come from a save import.'
              }
              onClick={onHideSecrets}
            >
              <LockSimple aria-hidden="true" />
              Hide secrets
            </button>
            <button
              type="button"
              role="menuitem"
              aria-pressed={wb.hideDeceased}
              disabled={!wb.hasDeceased && !wb.hideDeceased}
              title={
                wb.hasDeceased || wb.hideDeceased
                  ? 'Hide sims marked Deceased. Their cards keep their places, and they stay in your file.'
                  : 'No deceased sims on this board.'
              }
              onClick={onHideDeceased}
            >
              <Skull aria-hidden="true" />
              Hide deceased
            </button>
            <span className="pop__rule" aria-hidden="true" />
            <button type="button" role="menuitem" onClick={openGames}>
              <GameController aria-hidden="true" />
              Games
              {hiddenCount ? ` (${hiddenCount})` : ''}
            </button>
            <button type="button" role="menuitem" onClick={openPlay}>
              <IdentificationBadge aria-hidden="true" />
              Play
              {playHidden ? ` (${playHidden})` : ''}
            </button>
            <button type="button" role="menuitem" onClick={openAges}>
              <Highlighter aria-hidden="true" />
              Highlight
              {ageCount ? ` (${ageCount})` : ''}
            </button>
          </div>
        )}
      </div>

      {/* Search opens over the board, Spotlight-style, and never changes the bar's size. */}
      <button
        type="button"
        className="findbtn"
        aria-label={`Search the board (${findKeys})`}
        aria-haspopup="dialog"
        onClick={onOpenFind}
      >
        <MagnifyingGlass aria-hidden="true" />
        <span className="findbtn__text">Search</span>
        <kbd className="findbtn__keys">{findKeys}</kbd>
      </button>

      <OverflowMenu
        onSave={wb.saveJson}
        onLoad={(f) => {
          const { w, h } = svgSize();
          wb.loadJson(f, w, h);
        }}
        onLoadSave={(f) => wb.previewSave(f)}
        canResetBoard={wb.canResetBoard}
        onResetBuiltIn={() => {
          const { w, h } = svgSize();
          wb.resetToBuiltInBoard(w, h);
        }}
        onDevUpdates={onDevUpdates}
        devUpdatesUnseen={devUpdatesUnseen}
        label={
          compact
            ? `More: ${wb.redoWhat ? 'redo, ' : ''}Up next, dynasties, story, view, organise, log, save, load, and credits`
            : 'More: organise, log, save, load, and credits'
        }
        folded={folded}
        wrapRef={moreRef}
        buttonRef={logBtnRef}
      />
      {linksFrom === 'more' && linksMenu}
      {compact && saveOpen && wb.saveGame && (
        <div
          ref={savePopRef}
          className="pop pop--save"
          role="dialog"
          aria-label="Your save"
          style={savePopStyle}
        >
          <SaveDetails
            game={wb.saveGame}
            {...(wb.recap
              ? {
                  onRecap: () => {
                    setSaveOpen(false);
                    wb.setRecapOpen(true);
                  },
                }
              : {})}
            onStory={() => {
              setSaveOpen(false);
              wb.setRecapOpen(false);
              wb.setChronicleView({ label: 'your board', ids: null });
            }}
          />
        </div>
      )}

    </header>
  );
}
