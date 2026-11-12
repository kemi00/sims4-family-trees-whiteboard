import {
  CalendarBlank,
  Check,
  Crown,
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
  CaretDown,
  CaretUp,
  ArrowClockwise,
  ArrowCounterClockwise,
  Scroll,
  Trash,
  TreeStructure,
  User,
  UserPlus,
  UsersFour,
  UsersThree,
  type Icon,
} from '../icons.ts';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { useCompactChrome } from '../hooks/useCompactChrome.ts';
import { usePanelSheet } from '../hooks/usePanelSheet.ts';
import { useDropdownPosition } from '../hooks/useDropdownPosition.ts';
import { useFittingPlaceholder } from '../hooks/useFittingPlaceholder.ts';
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
/** What Find looks through, as its box and button say it. */
const FIND_LABEL = 'Find a sim, household or world';
/** The box's placeholder, longest first: a narrow box says less, never half. */
const FIND_PLACEHOLDERS = [FIND_LABEL, 'Sims, households, worlds', 'Find'] as const;

/** Each kind of Find match, as its mark beside the count says it. */
const SEARCH_KIND = {
  world: { icon: Globe, noun: 'World' },
  household: { icon: House, noun: 'Household' },
  sim: { icon: User, noun: 'Sim' },
} as const satisfies Record<string, { icon: Icon; noun: string }>;

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

/** One short line: a tooltip stays on one line, and this is also the button's name. */
function linksToolLabel(wb: WhiteboardApi): string {
  if (wb.familyFocus) return 'Family links: highlighting a family';
  if (wb.linksView === 'inside') return 'Family links: inside households';
  return wb.linksView === 'none' ? 'Family links: hidden' : 'Family links: all';
}

/**
 * The canvas layers in words, for their More entry on a phone, where the
 * bar's pressed buttons that show them are folded away.
 */
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
}: Props) {
  const compact = useCompactChrome();
  /**
   * At sheet widths (900px and under) search is a button that opens a field
   * the width of the window, as on a phone: squeezed into the bar beside
   * everything else, it would leave no room to read what you type.
   */
  const searchCollapsed = usePanelSheet();
  const [searchOpen, setSearchOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersRef = useRef<HTMLDivElement>(null);
  const compactSearchRef = useRef<HTMLInputElement>(null);
  const queryRef = useRef('');
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

  const findHint = useFittingPlaceholder(FIND_PLACEHOLDERS);
  const search = (value: string, cycle: 0 | 1 | -1 = 0) => {
    queryRef.current = value;
    const { w, h } = svgSize();
    wb.searchSim(value, w, h, cycle);
  };

  /**
   * Which match is framed, out of how many, and what it is: a world, a
   * household or a sim, so a step that zooms right out reads as meant.
   */
  const hit = wb.searchHits[wb.searchHitIndex];
  const HitIcon = hit ? SEARCH_KIND[hit.kind].icon : null;
  const searchNav = hit && HitIcon && (
    <span className="search__nav">
      <span className="search__count" title={`${SEARCH_KIND[hit.kind].noun}: ${hit.label}`}>
        <HitIcon className="search__kind" weight="fill" aria-label={SEARCH_KIND[hit.kind].noun} />
        {wb.searchHitIndex + 1}/{wb.searchHits.length}
      </span>
      <button
        type="button"
        className="search__step"
        aria-label="Previous match"
        onClick={() => search(queryRef.current, -1)}
      >
        <CaretUp aria-hidden="true" />
      </button>
      <button
        type="button"
        className="search__step"
        aria-label="Next match"
        onClick={() => search(queryRef.current, 1)}
      >
        <CaretDown aria-hidden="true" />
      </button>
    </span>
  );

  useEffect(() => {
    if (!searchOpen || !searchCollapsed) return;
    compactSearchRef.current?.focus();
  }, [searchOpen, searchCollapsed]);

  useEffect(() => {
    if (!searchCollapsed) setSearchOpen(false);
  }, [searchCollapsed]);

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

  // A phone has room for the edit tools, Filters, search and More. The rest
  // of the bar folds into More, in the bar's order, each with the words its
  // tooltip or pressed state gives on a wider screen.
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
          id: 'organise',
          icon: MagicWand,
          label: 'Organise',
          note: 'Arrange the board like the starter one',
          onSelect: organise,
        },
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
          id: 'log',
          icon: Scroll,
          label: wb.connectionLog.length ? `Log (${wb.connectionLog.length})` : 'Log',
          note: 'Links and household moves you added',
          onSelect: openLog,
        },
        {
          id: 'layers',
          icon: TreeStructure,
          label: 'Family links and boxes',
          note: layersNote(wb),
          onSelect: () => toggleLinks('more'),
        },
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
    : [];

  const linksMenu = (
    <div
      ref={linksPopRef}
      className="pop pop--links"
      role="menu"
      aria-label={linksFrom === 'more' ? 'Family links and boxes' : 'Family links'}
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
      {/* The bar's box toggles sit beside its links button; on a phone they
          are folded away with it, so they come along here. */}
      {linksFrom === 'more' && (
        <>
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
        </>
      )}
    </div>
  );

  return (
    <header
      className={
        searchCollapsed && searchOpen ? 'appbar appbar--searching' : 'appbar'
      }
    >
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
        icon={MagicWand}
        label="Arrange the board like the starter one"
        className="appbar__wide-only tool--secondary"
        onClick={organise}
      >
        Organise
      </ToolButton>
      <ToolButton
        icon={Trash}
        label={
          wb.simsToDelete.length > 1
            ? `Delete the ${wb.simsToDelete.length} selected sims (Delete key)`
            : 'Delete the selected sim or link (Delete key)'
        }
        tone="danger"
        disabled={!wb.canDelete}
        onClick={wb.deleteSelected}
      />
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
      <ToolButton
        id="btnLog"
        ref={logBtnRef}
        icon={Scroll}
        label="Links and household moves you added"
        pressed={wb.logOpen}
        count={wb.connectionLog.length}
        expanded={wb.logOpen}
        className="appbar__wide-only tool--secondary"
        onClick={openLog}
      >
        Log
      </ToolButton>

      <span className="appbar__rule" aria-hidden="true" />

      <span className="segment appbar__wide-only" role="group" aria-label="Canvas layers">
        <div className="overflow" ref={linksRef}>
          <ToolButton
            icon={TreeStructure}
            label={linksToolLabel(wb)}
            menu
            pressed={wb.linksView !== 'none' || wb.familyFocus}
            expanded={linksFrom === 'bar'}
            onClick={() => toggleLinks('bar')}
          />
          {linksFrom === 'bar' && linksMenu}
        </div>
        <ToolButton
          icon={House}
          label="Household boxes"
          pressed={wb.show.groups}
          onClick={() => wb.toggleShow('groups')}
        />
        <ToolButton
          icon={Globe}
          label="World boxes"
          pressed={wb.show.worlds}
          onClick={() => wb.toggleShow('worlds')}
        />
      </span>

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

      <span className="search search--bar">
        <MagnifyingGlass className="search__icon" aria-hidden="true" />
        <input
          ref={findHint.ref}
          id="search"
          type="search"
          aria-label={FIND_LABEL}
          placeholder={findHint.text}
          onInput={(e) => search(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              search(e.currentTarget.value, e.shiftKey ? -1 : 1);
            }
          }}
        />
        {searchNav}
      </span>

      <span className="appbar__compact-only appbar__compact-tools">
        <ToolButton
          icon={MagnifyingGlass}
          label={FIND_LABEL}
          pressed={searchOpen}
          onClick={() => setSearchOpen((o) => !o)}
        />
      </span>

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
        label={compact ? `More: ${wb.redoWhat ? 'redo, ' : ''}organise, log, links, save, load, and credits` : undefined}
        folded={folded}
        wrapRef={moreRef}
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

      {searchCollapsed && searchOpen && (
        <div className="search-overlay">
          <MagnifyingGlass className="search__icon" aria-hidden="true" />
          <input
            ref={compactSearchRef}
            type="search"
            aria-label={FIND_LABEL}
            placeholder={FIND_LABEL}
            onInput={(e) => search(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                search(e.currentTarget.value, e.shiftKey ? -1 : 1);
              }
            }}
          />
          {searchNav}
        </div>
      )}
    </header>
  );
}
