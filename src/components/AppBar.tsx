import {
  Funnel,
  GameController,
  Globe,
  Highlighter,
  House,
  IdentificationBadge,
  LinkSimple,
  MagnifyingGlass,
  CaretDown,
  CaretUp,
  ArrowCounterClockwise,
  Scroll,
  Trash,
  TreeStructure,
  UserPlus,
  UsersThree,
} from '@phosphor-icons/react';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { useCompactChrome } from '../hooks/useCompactChrome.ts';
import { useDropdownPosition } from '../hooks/useDropdownPosition.ts';
import type { WhiteboardApi } from '../hooks/useWhiteboard.ts';
import { trackAction } from '../lib/analytics.ts';
import { simName } from '../lib/connectionLog.ts';
import { OverflowMenu } from './OverflowMenu.tsx';
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

type Props = {
  wb: WhiteboardApi;
  svgRef: RefObject<SVGSVGElement | null>;
  filtersBtnRef: RefObject<HTMLButtonElement | null>;
  logBtnRef: RefObject<HTMLButtonElement | null>;
};

export function AppBar({
  wb,
  svgRef,
  filtersBtnRef,
  logBtnRef,
}: Props) {
  const compact = useCompactChrome();
  const [searchOpen, setSearchOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersRef = useRef<HTMLDivElement>(null);
  const compactSearchRef = useRef<HTMLInputElement>(null);
  const queryRef = useRef('');
  const { popRef: filtersPopRef, style: filtersPopStyle } = useDropdownPosition(
    filtersOpen,
    filtersRef,
  );

  const hiddenCount = wb.hiddenPacks.size;
  const playHidden = wb.hiddenPlay.size;
  const ageCount = wb.hiAges.size + (wb.hiSingle ? 1 : 0);
  const filterCount =
    hiddenCount + playHidden + ageCount + (wb.bloodlineId ? 1 : 0);
  const filterPanelOpen = wb.gamesOpen || wb.playOpen || wb.agesOpen;

  const svgSize = () => {
    const r = svgRef.current?.getBoundingClientRect();
    return { w: r?.width ?? 800, h: r?.height ?? 600 };
  };

  const addNewSim = () => {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r) return;
    wb.addSim(r.width, r.height);
  };

  const search = (value: string, cycle: 0 | 1 | -1 = 0) => {
    queryRef.current = value;
    const { w, h } = svgSize();
    wb.searchSim(value, w, h, cycle);
  };

  useEffect(() => {
    if (!searchOpen || !compact) return;
    compactSearchRef.current?.focus();
  }, [searchOpen, compact]);

  useEffect(() => {
    if (!compact) setSearchOpen(false);
  }, [compact]);

  useEffect(() => {
    if (!filtersOpen) return;
    const onPointer = (ev: PointerEvent) => {
      if (!filtersRef.current?.contains(ev.target as Node)) {
        setFiltersOpen(false);
      }
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape') return;
      ev.stopPropagation();
      setFiltersOpen(false);
    };
    document.addEventListener('pointerdown', onPointer, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onPointer, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [filtersOpen]);

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
  const openLog = () => {
    setFiltersOpen(false);
    closeFilterPanels();
    const next = !wb.logOpen;
    if (next) trackAction('/action/log');
    wb.setLogOpen(next);
  };
  const onBloodline = () => {
    wb.toggleBloodline();
    setFiltersOpen(false);
  };

  return (
    <header
      className={
        compact && searchOpen ? 'appbar appbar--searching' : 'appbar'
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
          wb.connectMode
            ? 'Connect mode is on. Click a sim, or click here to leave.'
            : 'Connect two sims'
        }
        tone="primary"
        pressed={wb.connectMode}
        onClick={() => wb.setConnectMode(!wb.connectMode)}
      >
        Connect
      </ToolButton>
      <ToolButton icon={UserPlus} label="Add a sim" onClick={addNewSim}>
        Add sim
      </ToolButton>
      <ToolButton
        icon={Trash}
        label="Delete the selected sim or link"
        tone="danger"
        disabled={!wb.sel}
        onClick={wb.deleteSelected}
      />
      <ToolButton
        icon={ArrowCounterClockwise}
        label="Undo the last change (Ctrl/⌘ Z)"
        disabled={!wb.canUndo}
        onClick={wb.undo}
      />
      <ToolButton
        id="btnLog"
        ref={logBtnRef}
        icon={Scroll}
        label={
          wb.connectionLog.length
            ? `Links and household moves you added. ${wb.connectionLog.length} on the list.`
            : 'Links and household moves you added'
        }
        pressed={wb.logOpen}
        count={wb.connectionLog.length}
        expanded={wb.logOpen}
        onClick={openLog}
      >
        Log
      </ToolButton>

      <span className="appbar__rule" aria-hidden="true" />

      <span className="segment" role="group" aria-label="Canvas layers">
        <ToolButton
          icon={TreeStructure}
          label="Family links"
          pressed={wb.show.seed}
          onClick={() => wb.toggleShow('seed')}
        />
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

      <div className="overflow" ref={filtersRef}>
        <ToolButton
          id="btnFilters"
          ref={filtersBtnRef}
          icon={Funnel}
          label={
            filterCount
              ? `Filters. ${filterCount} active.`
              : 'Filters: bloodline, games, playability, and ages'
          }
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
              Ages
              {ageCount ? ` (${ageCount})` : ''}
            </button>
          </div>
        )}
      </div>

      <span className="search search--bar">
        <MagnifyingGlass className="search__icon" aria-hidden="true" />
        <input
          id="search"
          type="search"
          aria-label="Find a sim"
          placeholder="Find a sim"
          onInput={(e) => search(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              search(e.currentTarget.value, e.shiftKey ? -1 : 1);
            }
          }}
        />
        {wb.searchHits.length > 0 && (
          <span className="search__nav">
            <span className="search__count">
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
        )}
      </span>

      <span className="appbar__compact-only appbar__compact-tools">
        <ToolButton
          icon={MagnifyingGlass}
          label="Find a sim"
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
      />

      {compact && searchOpen && (
        <div className="search-overlay">
          <MagnifyingGlass className="search__icon" aria-hidden="true" />
          <input
            ref={compactSearchRef}
            type="search"
            aria-label="Find a sim"
            placeholder="Find a sim"
            onInput={(e) => search(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                search(e.currentTarget.value, e.shiftKey ? -1 : 1);
              }
            }}
          />
          {wb.searchHits.length > 0 && (
            <span className="search__nav">
              <span className="search__count">
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
          )}
        </div>
      )}
    </header>
  );
}
