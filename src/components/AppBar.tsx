import { ROYALTY_AND_LEGACY } from '../lib/packs.ts';
import {
  CaretLeft,
  Check,
  GearSix,
  Highlighter,
  ShareNetwork,
  Newspaper,
  FileImage,
  Coins,
  ImageSquare,
  User,
  BookOpenText,
  Crown,
  Eye,
  EyeSlash,
  Funnel,
  Globe,
  House,
  LinkSimple,
  ListNumbers,
  MagicWand,
  MagnifyingGlass,
  ArrowClockwise,
  ArrowCounterClockwise,
  TreeStructure,
  UserPlus,
  type Icon,
} from '../icons.ts';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { useCompactChrome } from '../hooks/useCompactChrome.ts';
import { useDropdownPosition } from '../hooks/useDropdownPosition.ts';
import type { WhiteboardApi } from '../hooks/useWhiteboard.ts';
import { trackAction } from '../lib/analytics.ts';
import changelog from '../data/changelog.json';
import { AUTOSAVE_KEY } from '../lib/autosave.ts';
import { recentErrors } from '../lib/errorLog.ts';
import { draftKB, problemReport, reportEnv } from '../lib/problemReport.ts';
import { filterCounts } from '../lib/filterCount.ts';
import type { LinksView } from '../lib/family.ts';
import { REDO_KEYS, UNDO_KEYS, redoTip, undoTip } from '../lib/undoNames.ts';
import { StepTip } from './StepText.tsx';
import { BUILD } from '../lib/build.ts';
import { OverflowMenu } from './OverflowMenu.tsx';
import { dynastyIndex } from '../lib/dynastyMenu.ts';
import { SavePopupBody, type SaveView } from './SaveStatus.tsx';
import { ToolButton } from './ToolButton.tsx';

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
type OpenedFrom = 'bar' | 'more' | 'tabs';

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
  onDevUpdates: () => void;
  devUpdatesUnseen: boolean;
  /** Open search (⌘K or Ctrl+K does too). */
  onOpenFind: () => void;
  /** "⌘K" or "Ctrl+K", shown on the Search button. */
  findKeys: string;
  /** Close every other panel and menu: one popup at a time, so More never opens over another. */
  onCloseOthers?: () => void;
  /** Share: a household's poster, a dynasty's poster. */
  onPoster?: (gid: string) => void;
  onDynastyPoster?: (key: string) => void;
};

export function AppBar({
  wb,
  svgRef,
  onDevUpdates,
  devUpdatesUnseen,
  onOpenFind,
  findKeys,
  onCloseOthers,
  onPoster,
  onDynastyPoster,
}: Props) {
  const compact = useCompactChrome();
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
  /** Your save's details, or a setting opened inside them; each opening starts at the details. */
  const [saveView, setSaveView] = useState<SaveView>('details');
  useEffect(() => {
    if (!saveOpen) setSaveView('details');
  }, [saveOpen]);
  const { popRef: savePopRef, style: savePopStyle } = useDropdownPosition(saveOpen, moreRef);
  const closeSave = useCallback(() => setSaveOpen(false), []);
  useDismiss(saveOpen, moreRef, closeSave, savePopRef);

  const counts = filterCounts(wb);
  const filtersOpenAny = wb.filtersOpen || wb.gamesOpen || wb.playOpen || wb.agesOpen;
  /** Filters' panel, on any of its views (Games and Play open inside it); Highlight is a panel of its own. */
  const filtersPanelOpen = wb.filtersOpen || wb.gamesOpen || wb.playOpen;
  /** Play: Up next and Worlds in numbers, two tabs of one panel. */
  const playOpen = wb.upNextOpen || wb.worldStatsOpen;
  /** Story: the story, the Log and the Gazette, tabs of one place. */
  const storyGroupOpen = !!wb.chronicleView || wb.logOpen;

  const svgSize = () => {
    const r = svgRef.current?.getBoundingClientRect();
    return { w: r?.width ?? 800, h: r?.height ?? 600 };
  };

  const addBtnRef = useRef<HTMLButtonElement>(null);
  const addNewSim = () => {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r) return;
    // Who to add, from a menu under the button: a sim (their stage and gender asked) or a pet.
    const at = addBtnRef.current?.getBoundingClientRect();
    // Open from here: the button closes it again.
    if (wb.addMenu && !wb.addMenu.gid) {
      wb.setAddMenu(null);
      return;
    }
    if (at) {
      wb.setAddMenu({ x: Math.max(8, at.left - r.left), y: Math.max(8, at.bottom - r.top + 6) });
      return;
    }
    wb.addSim(r.width, r.height);
  };

  // The bar's group opens one panel at a time, in one place: App swaps out
  // whichever was open, so each button only toggles its own.
  const toggleFilters = () => {
    closeLinks();
    closeSave();
    if (filtersPanelOpen) {
      wb.setFiltersOpen(false);
      wb.setGamesOpen(false);
      wb.setPlayOpen(false);
      return;
    }
    trackAction('/action/filters');
    wb.setAgesOpen(false);
    wb.setFiltersOpen(true);
  };
  const toggleHighlight = () => {
    closeLinks();
    closeSave();
    if (wb.agesOpen) {
      wb.setAgesOpen(false);
      return;
    }
    trackAction('/action/highlight');
    wb.setFiltersOpen(false);
    wb.setGamesOpen(false);
    wb.setPlayOpen(false);
    wb.setAgesOpen(true);
  };
  const openUpNext = () => {
    if (playOpen) {
      wb.setUpNextOpen(false);
      wb.setWorldStatsOpen(false);
      return;
    }
    trackAction('/action/up-next');
    wb.setUpNextOpen(true);
  };
  /** The Chronicle, the whole board's story (and the Log beside it): from here as well as the save chip. */
  const openStory = () => {
    // Open on one household's or dynasty's story, the button shows the whole one.
    if (wb.chronicleView?.ids === null || wb.logOpen) {
      wb.setChronicleView(null);
      wb.setLogOpen(false);
      return;
    }
    trackAction('/action/story');
    wb.setRecapOpen(false);
    wb.setChronicleView({ label: 'your board', ids: null });
  };
  const openDynasties = () => {
    const next = !wb.dynastiesOpen;
    if (next) trackAction('/action/dynasties');
    wb.setDynastiesOpen(next);
  };
  const organise = () => {
    const { w, h } = svgSize();
    wb.organiseBoard(w, h);
  };
  const toggleLinks = (from: OpenedFrom) => {
    closeSave();
    // One popup at a time: View opening from the bar closes the panels (from More, More did).
    if (!linksFrom && from === 'bar') onCloseOthers?.();
    setLinksFrom((f) => (f ? null : from));
  };
  // A panel or the editor opening closes View and Your save: popups never overlap.
  const panelOpen = !!(wb.upNextOpen || wb.dynastiesOpen || wb.chronicleView || wb.logOpen || wb.filtersOpen || wb.worldStatsOpen || wb.editNodeId || wb.briefGid);
  useEffect(() => {
    if (!panelOpen) return;
    closeLinks();
    closeSave();
  }, [panelOpen, closeLinks, closeSave]);

  // Share: the whole tree, a household's or a dynasty's poster, the Gazette.
  const [shareOpen, setShareOpen] = useState(false);
  const [shareView, setShareView] = useState<'main' | 'household' | 'dynasty'>('main');
  const [shareQuery, setShareQuery] = useState('');
  const shareRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<HTMLElement>(null);
  /** Phones: the Show tab's menu (Highlight, Filters, View), over the tabs. */
  const [showOpen, setShowOpen] = useState(false);
  const { popRef: sharePopRef, style: sharePopStyle } = useDropdownPosition(shareOpen && !compact, shareRef);
  const closeShare = useCallback(() => {
    setShareOpen(false);
    setShareView('main');
    setShareQuery('');
  }, []);
  useDismiss(shareOpen, compact ? tabsRef : shareRef, closeShare, sharePopRef);
  const showPopRef = useRef<HTMLDivElement>(null);
  const closeShow = useCallback(() => setShowOpen(false), []);
  useDismiss(showOpen, tabsRef, closeShow, showPopRef);
  /** Every popup alone: opening one closes the panels and the bar's other menus. */
  const openAlone = () => {
    onCloseOthers?.();
    closeLinks();
    closeSave();
    closeShare();
    closeShow();
  };
  const toggleShare = () => {
    if (shareOpen) return closeShare();
    openAlone();
    trackAction('/action/share');
    setShareOpen(true);
  };
  const households = [...new Map(wb.nodes.filter((n) => n.hh && !n.gid.endsWith('||unhoused') && wb.nodeVis(n)).map((n) => [n.gid, n])).values()]
    .map((n) => ({ gid: n.gid, label: `${n.hh} · ${n.world}` }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const dynasties = shareOpen && shareView === 'dynasty' ? dynastyIndex(wb.nodes) : [];
  const q = shareQuery.trim().toLowerCase();
  const shareMenu = (
    <div
      ref={sharePopRef}
      className={compact ? 'pop pop--folded pop--share pop--fromtabs' : 'pop pop--folded pop--share'}
      role="menu"
      aria-label="Share"
      style={compact ? undefined : sharePopStyle}
    >
      {shareView === 'main' ? (
        <>
          <div className="pop__head" aria-hidden="true">
            Share
          </div>
          {[
            {
              id: 'tree',
              icon: FileImage,
              label: 'The whole tree',
              note: 'A picture, a PDF with a page a world, or an SVG',
              run: () => {
                closeShare();
                trackAction('/action/tree-export');
                wb.setTreeExportOpen(true);
              },
            },
            { id: 'household', icon: House, label: 'A household’s poster', note: 'Its sims and their story, as a picture', run: () => setShareView('household') },
            ...(wb.hasGame(ROYALTY_AND_LEGACY)
              ? [{ id: 'dynasty', icon: Crown, label: 'A dynasty’s poster', note: 'Its line and generations, with its crest', run: () => setShareView('dynasty') }]
              : []),
            {
              id: 'gazette',
              icon: Newspaper,
              label: 'The Gazette',
              note: wb.chronicle.length ? 'An edition as a picture' : 'Upload a newer save for the first edition',
              run: () => {
                closeShare();
                trackAction('/action/gazette');
                wb.setGazetteOpen(true);
              },
            },
          ].map(({ id, icon: Glyph, label, note, run }) => (
            <button key={id} type="button" role="menuitem" className="pop__noted" onClick={run}>
              <Glyph aria-hidden="true" />
              <span className="pop__text">
                {label}
                <small>{note}</small>
              </span>
            </button>
          ))}
        </>
      ) : (
        <>
          <button type="button" className="pop__back" onClick={() => setShareView('main')}>
            <CaretLeft aria-hidden="true" />
            {shareView === 'household' ? 'A household’s poster' : 'A dynasty’s poster'}
          </button>
          <input
            className="pop__find"
            type="search"
            autoFocus
            value={shareQuery}
            placeholder={shareView === 'household' ? 'Find a household' : 'Find a dynasty'}
            aria-label={shareView === 'household' ? 'Find a household' : 'Find a dynasty'}
            onChange={(e) => setShareQuery(e.target.value)}
          />
          <div className="pop__scroll">
            {shareView === 'household'
              ? households
                  .filter((h) => !q || h.label.toLowerCase().includes(q))
                  .map((h) => (
                    <button
                      key={h.gid}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        closeShare();
                        onPoster?.(h.gid);
                      }}
                    >
                      {h.label}
                    </button>
                  ))
              : dynasties
                  .filter((d) => !q || d.name.toLowerCase().includes(q))
                  .map((d) => (
                    <button
                      key={d.key}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        closeShare();
                        onDynastyPoster?.(d.key);
                      }}
                    >
                      {`The ${d.name} dynasty`}
                    </button>
                  ))}
          </div>
        </>
      )}
    </div>
  );

  const linksMenu = (
    <div
      ref={linksPopRef}
      className={linksFrom === 'tabs' ? 'pop pop--links pop--fromtabs' : 'pop pop--links'}
      role="menu"
      aria-label="View: family links and boxes"
      style={linksFrom === 'tabs' ? undefined : linksPopStyle}
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
      {/* What the board draws, in one place: links, then boxes. */}
      <span className="pop__rule" aria-hidden="true" />
      <div className="pop__head" aria-hidden="true">
        Show boxes
      </div>
      {(
        [
          ['groups', House, 'Household boxes'],
          ['worlds', Globe, 'World boxes'],
          // Beside each household's tag; its plan has it either way.
          ['funds', Coins, 'Household funds'],
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
      {/* Photos you add in a sim's editor; the silhouettes only while photos show. */}
      <span className="pop__rule" aria-hidden="true" />
      <div className="pop__head" aria-hidden="true">
        Show on cards
      </div>
      <button
        type="button"
        role="menuitemcheckbox"
        aria-checked={wb.show.photos}
        onClick={() => {
          wb.toggleShow('photos');
          closeLinks();
        }}
      >
        <ImageSquare aria-hidden="true" />
        <span className="pop__text">
          Photos
          <small>{wb.photoUrls.size ? `${wb.photoUrls.size} in this browser` : 'Add one in a sim’s editor'}</small>
        </span>
        {wb.show.photos && <Check className="pop__check" aria-hidden="true" />}
      </button>
      <button
        type="button"
        role="menuitemcheckbox"
        aria-checked={wb.show.silhouettes}
        disabled={!wb.show.photos}
        onClick={() => {
          wb.toggleShow('silhouettes');
          closeLinks();
        }}
      >
        <User aria-hidden="true" />
        <span className="pop__text">
          Silhouettes until young adult
          <small>Infants to teens, in place of their photo</small>
        </span>
        {wb.show.silhouettes && wb.show.photos && <Check className="pop__check" aria-hidden="true" />}
      </button>
      {/* Arranging the board is how it looks too. */}
      <span className="pop__rule" aria-hidden="true" />
      <button
        type="button"
        role="menuitem"
        className="pop__noted"
        onClick={() => {
          closeLinks();
          organise();
        }}
      >
        <MagicWand aria-hidden="true" />
        <span className="pop__text">
          Organise
          <small>Arrange the board like the starter one</small>
        </span>
      </button>
    </div>
  );

  /** The phone's tabs: Show (Highlight, Filters, View), Play, Dynasties, Story, Share. */
  const tab = (id: string, Glyph: Icon, label: string, on: boolean, onClick: () => void, count = 0) => (
    <button key={id} type="button" className="tabbar__tab" aria-pressed={on} onClick={onClick}>
      <span className="tabbar__icon">
        <Glyph aria-hidden="true" weight={on ? 'fill' : 'regular'} />
        {count > 0 && <span className="tabbar__count">{count}</span>}
      </span>
      <span className="tabbar__label">{label}</span>
    </button>
  );
  const showMenu = (
    <div ref={showPopRef} className="pop pop--folded pop--fromtabs" role="menu" aria-label="Show">
      <div className="pop__head" aria-hidden="true">
        Find and show
      </div>
      {[
        { id: 'hl', icon: Highlighter, label: 'Highlight', note: counts.lit ? `${counts.lit} on` : 'A family, a bloodline, life stages, singles', run: toggleHighlight },
        { id: 'fl', icon: Funnel, label: 'Filters', note: counts.hiding ? `${counts.hiding} on` : 'Hide secrets or deceased, games, play', run: toggleFilters },
        { id: 'vw', icon: Eye, label: 'View', note: layersNote(wb), run: () => toggleLinks('tabs') },
      ].map(({ id, icon: Glyph, label, note, run }) => (
        <button
          key={id}
          type="button"
          role="menuitem"
          className="pop__noted"
          onClick={() => {
            closeShow();
            if (id !== 'vw') onCloseOthers?.();
            run();
          }}
        >
          <Glyph aria-hidden="true" />
          <span className="pop__text">
            {label}
            <small>{note}</small>
          </span>
        </button>
      ))}
    </div>
  );

  return (
    <>
    {compact && (
      <nav className="tabbar" ref={tabsRef} aria-label="Your game">
        {tab('show', Highlighter, 'Show', showOpen || filtersOpenAny || linksFrom === 'tabs', () => {
          if (showOpen) return closeShow();
          openAlone();
          setShowOpen(true);
        }, counts.total)}
        {tab('play', ListNumbers, 'Play', playOpen, () => {
          if (!playOpen) openAlone();
          openUpNext();
        })}
        {wb.hasGame(ROYALTY_AND_LEGACY) &&
          tab('dyn', Crown, 'Dynasties', wb.dynastiesOpen, () => {
            if (!wb.dynastiesOpen) openAlone();
            openDynasties();
          })}
        {tab('story', BookOpenText, 'Story', storyGroupOpen, () => {
          if (!storyGroupOpen) openAlone();
          openStory();
        })}
        {tab('share', ShareNetwork, 'Share', shareOpen, toggleShare)}
        {showOpen && showMenu}
        {shareOpen && shareMenu}
        {linksFrom === 'tabs' && linksMenu}
      </nav>
    )}
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

      {/* Edit the tree. */}
      <ToolButton
        id="btnAdd"
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
        icon={LinkSimple}
        label={wb.connectMode ? 'Connect is on: click to turn it off' : 'Link two sims'}
        tone="primary"
        pressed={wb.connectMode}
        onClick={() => wb.setConnectMode(!wb.connectMode)}
      >
        Connect
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
        className={compact && wb.redoWhat ? undefined : 'appbar__wide-only'}
        disabled={!wb.redoWhat}
        onClick={wb.redo}
      />
      <span className="appbar__rule" aria-hidden="true" />

      {/* Find and show: search, highlight, filters, view. */}
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
      {!compact && (
        <>
          <ToolButton
            id="btnHighlight"
            icon={Highlighter}
            label={counts.lit ? `Highlight: ${counts.lit} on` : 'Highlight: a family, a bloodline, life stages, singles'}
            pressed={counts.lit > 0 || wb.agesOpen}
            count={counts.lit}
            expanded={wb.agesOpen}
            className="tool--secondary tool--find"
            onClick={toggleHighlight}
          >
            Highlight
          </ToolButton>
          <ToolButton
            id="btnFilters"
            icon={Funnel}
            label={counts.hiding ? `Filters: ${counts.hiding} on` : 'Filters: hide secrets or deceased, games, play'}
            pressed={counts.hiding > 0 || filtersPanelOpen}
            count={counts.hiding}
            expanded={filtersPanelOpen}
            className="tool--secondary tool--find"
            onClick={toggleFilters}
          >
            Filters
          </ToolButton>
          <div className="overflow" ref={linksRef}>
            <ToolButton
              icon={Eye}
              label={`View: ${layersNote(wb)}`}
              menu
              pressed={wb.linksView !== 'all' || !wb.show.groups || !wb.show.worlds}
              expanded={linksFrom === 'bar'}
              className="tool--secondary tool--find"
              onClick={() => toggleLinks('bar')}
            >
              View
            </ToolButton>
            {linksFrom === 'bar' && linksMenu}
          </div>
        </>
      )}

      <span className="appbar__spacer" />

      {/* Your game: play, dynasties, story. On a phone, the tabs at the bottom. */}
      {!compact && (
        <>
          <ToolButton
            id="btnUpNext"
            icon={ListNumbers}
            label="Play: who to play next, this week, and your worlds in numbers"
            pressed={playOpen}
            expanded={playOpen}
            className="tool--secondary tool--game"
            onClick={openUpNext}
          >
            Play
          </ToolButton>
          {wb.hasGame(ROYALTY_AND_LEGACY) && (
            <ToolButton
              id="btnDynasties"
              icon={Crown}
              label="Dynasties: every dynasty, planned or in your game, with its members"
              pressed={wb.dynastiesOpen}
              expanded={wb.dynastiesOpen}
              className="tool--secondary tool--game"
              onClick={openDynasties}
            >
              Dynasties
            </ToolButton>
          )}
          <ToolButton
            id="btnStory"
            icon={BookOpenText}
            label="Story: what happened in your game, save by save; the Gazette and the Log"
            pressed={storyGroupOpen}
            expanded={storyGroupOpen}
            className="tool--secondary tool--game"
            onClick={openStory}
          >
            Story
          </ToolButton>
          <span className="appbar__rule" aria-hidden="true" />
          <div className="overflow" ref={shareRef}>
            <ToolButton icon={ShareNetwork} label="Share: the whole tree, a poster, the Gazette" menu expanded={shareOpen} className="tool--secondary tool--game" onClick={toggleShare}>
              Share
            </ToolButton>
            {shareOpen && shareMenu}
          </div>
        </>
      )}

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
        label="Settings: your save, the board file, help"
        icon={GearSix}
        onOpenMenu={openAlone}
        wrapRef={moreRef}
        calendar={wb.planner.calendar ?? null}
        onCalendar={wb.setCalendar}
        calendarOpen={wb.calendarOpen}
        onCalendarOpen={wb.setCalendarOpen}
        game={wb.saveGame}
        onProblemReport={() => {
          const latest = changelog.entries[0];
          return problemReport({
            build: BUILD,
            ...(latest ? { latestUpdate: { sha: latest.sha, date: latest.date } } : {}),
            now: new Date(),
            env: reportEnv(),
            nodes: wb.nodes,
            edges: wb.edges,
            groups: wb.groups,
            worlds: wb.worlds,
            saveGame: wb.saveGame,
            shownWorlds: wb.liveWorlds,
            freeLots: wb.freeLots,
            filters: {
              hiddenPacks: [...wb.hiddenPacks].filter((p) => wb.packCounts.get(p)),
              hiddenPlay: wb.hiddenPlay.size,
              highlightAges: [...wb.hiAges],
              single: wb.hiSingle,
              bloodline: !!wb.bloodlineId,
              hideSecrets: wb.hideSecrets,
              hideDeceased: wb.hideDeceased,
            },
            layers: { ...wb.show },
            plans: {
              plannedBabies: wb.plannedChildIds.size,
              offPlanSims: wb.offPlan.sims.size,
              offPlanLinks: wb.offPlan.edges.size,
              issues: wb.planIssues.length,
              logEntries: wb.connectionLog.length,
              storyPages: wb.chronicle.length,
            },
            storage: { draftKB: draftKB(AUTOSAVE_KEY), staleTab: wb.staleTab, fromDraft: wb.fromBrowserDraft },
            errors: recentErrors(),
          });
        }}
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
          <SavePopupBody
            view={saveView}
            onView={setSaveView}
            game={wb.saveGame}
            limit={wb.householdLimit}
            onLimit={wb.setHouseholdLimit}
            calendar={wb.planner.calendar ?? null}
            onCalendar={wb.setCalendar}
            onStageLengths={wb.setStageLengths}
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
    </>
  );
}
