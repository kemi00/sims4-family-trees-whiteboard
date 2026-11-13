import { Analytics } from '@vercel/analytics/react';
import { IconContext } from './icons.ts';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import changelog from './data/changelog.json';
import {
  hasUnseen,
  markSeen,
  readSeen,
  visibleEntries,
  type ChangelogEntry,
} from './lib/changelog.ts';
import { AppBar } from './components/AppBar.tsx';
import { ConnectionLogPanel } from './components/ConnectionLogPanel.tsx';
import { DevUpdatesDialog } from './components/DevUpdatesDialog.tsx';
import { UpNextPanel } from './components/UpNextPanel.tsx';
import { DynastiesPanel } from './components/DynastiesPanel.tsx';
import { FiltersPanel } from './components/FiltersPanel.tsx';
import { HighlightList, type ListOf } from './components/HighlightList.tsx';
import { highlightActive } from './lib/highlight.ts';
import { successionForecast } from './lib/forecast.ts';
import { partnerWindows } from './lib/matchClock.ts';
import { storyLines } from './lib/chronicle.ts';
import { PosterDialog } from './components/PosterDialog.tsx';
import { dynastyPoster, householdPoster, type PosterModel } from './lib/poster.ts';
import { dynastyIndex, renamePlannedDynasty, type DynastyRow } from './lib/dynastyMenu.ts';
import { dynastyKey, dynastyLabelText, dynastyNames, dynastyPhrase } from './lib/generations.ts';
import { isPanelSheet } from './lib/chrome.ts';
import { householdPlace } from './lib/connectionLog.ts';
import { householdName, upNext } from './lib/householdPlan.ts';
import { cardName } from './lib/plan.ts';
import { WhiteboardStage } from './components/WhiteboardStage.tsx';
import { Welcome } from './components/Welcome.tsx';
import { isFirstVisit } from './lib/welcome.ts';
import { SearchPalette } from './components/SearchPalette.tsx';
import { findShortcut, type FindAction, type FindResult } from './lib/findPalette.ts';
import { aKind } from './lib/pets.ts';
import { trackAction } from './lib/analytics.ts';
import { LoadJsonDialog } from './components/LoadJsonDialog.tsx';
import { SaveImportDialog } from './components/SaveImportDialog.tsx';
import { useWhiteboard } from './hooks/useWhiteboard.ts';

/** One icon size and weight for the whole app, set once. */
const ICONS = { size: 17, weight: 'regular' } as const;

const CHANGELOG = visibleEntries(changelog.entries as ChangelogEntry[]);

export default function App() {
  const wb = useWhiteboard();
  /** A first visit opens on the welcome, which asks for their save first. */
  const [welcomeOpen, setWelcomeOpen] = useState(() =>
    isFirstVisit(wb.fromBrowserDraft || !!wb.sourceFileName || !!wb.saveGame),
  );
  /**
   * Opens itself on load only for a returning visitor who has not read the
   * newest entry: a newcomer gets the welcome, not news of changes.
   */
  const [devUpdatesOpen, setDevUpdatesOpen] = useState(() =>
    !welcomeOpen && hasUnseen(CHANGELOG, readSeen()),
  );
  useEffect(() => {
    // Everything so far is new to a newcomer: only later changes are news.
    if (welcomeOpen) markSeen(CHANGELOG);
    // Once, on the first render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [devUpdatesUnseen, setDevUpdatesUnseen] = useState(devUpdatesOpen);
  /** A household's or dynasty's poster, open to keep or share. */
  const [poster, setPoster] = useState<PosterModel | null>(null);

  /** Every dismissal marks the log read, or it would reopen on the next load. */
  const closeDevUpdates = useCallback(() => {
    markSeen(CHANGELOG);
    setDevUpdatesUnseen(false);
    setDevUpdatesOpen(false);
  }, []);
  const svgRef = useRef<SVGSVGElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  /** Search, Spotlight-style: ⌘K or Ctrl+K anywhere, or the bar's Search. */
  const [findOpen, setFindOpen] = useState(false);
  const findKeys = useMemo(() => findShortcut(), []);
  const saveFileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (!(ev.metaKey || ev.ctrlKey) || ev.altKey || ev.shiftKey || ev.key.toLowerCase() !== 'k') return;
      ev.preventDefault();
      setFindOpen((o) => {
        if (!o) trackAction('/action/search');
        return !o;
      });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      // A bar panel (BarPanel) took this Esc: going back a view, or closing.
      if (ev.key === 'Escape' && !ev.defaultPrevented) {
        if (devUpdatesOpen) closeDevUpdates();
        else if (wb.saveImport) wb.cancelSaveImport();
        else if (wb.pendingLoadJson) wb.cancelLoadJson();
        else if (wb.partnerMenu) wb.closePartnerMenu();
        else if (wb.childMenu) wb.closeChildMenu();
        else if (wb.editNodeId) wb.setEditNodeId(null);
        else if (wb.briefGid) wb.setBriefGid(null);
        else if (wb.infantHouseMenu) wb.setInfantHouseMenu(null);
        else if (wb.connectMenu) {
          wb.setConnectMenu(null);
          wb.cancelConnect();
        } else if (wb.connSrc) {
          wb.cancelConnect();
          wb.setStatus(
            'Cancelled that link — still in Connect. Click a sim, or Esc again to exit.',
          );
        }         else if (wb.connectMode) wb.setConnectMode(false);
        else if (wb.multiSel) wb.clearMultiSel();
        else if (wb.selectMode) wb.setSelectMode(false);
        else if (wb.dynastyFocus) wb.setDynastyFocus(null);
        else if (wb.familyFocus) wb.setFamilyFocus(false);
        else if (wb.bloodlineId) wb.setBloodlineId(null);
      }
      const typing =
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'SELECT' ||
        document.activeElement?.tagName === 'TEXTAREA';
      if (
        (ev.key === 'z' || ev.key === 'Z') &&
        (ev.metaKey || ev.ctrlKey) &&
        !ev.shiftKey &&
        !typing
      ) {
        ev.preventDefault();
        wb.undo();
      }
      if (
        (((ev.key === 'z' || ev.key === 'Z') && ev.shiftKey) || ((ev.key === 'y' || ev.key === 'Y') && ev.ctrlKey)) &&
        (ev.metaKey || ev.ctrlKey) &&
        !typing
      ) {
        ev.preventDefault();
        wb.redo();
      }
      // The sims picked (one, or several with Select or Shift), or a link.
      if (
        (ev.key === 'Delete' || ev.key === 'Backspace') &&
        wb.canDelete &&
        !typing &&
        !ev.metaKey &&
        !ev.ctrlKey
      ) {
        ev.preventDefault();
        wb.deleteSelected();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [wb, devUpdatesOpen, closeDevUpdates]);

  /**
   * The bar's group (Up next, Dynasties, Story, Filters) and the Log share
   * one panel: one open at a time. The one opened last swaps in for the
   * other, in the same place, before it paints.
   */
  /** A highlight's list beside the board, and whether Change came from it. */
  const [listOf, setListOf] = useState<ListOf | null>(null);
  const [hiFromList, setHiFromList] = useState(false);
  const barOpen = {
    list: listOf !== null,
    upnext: wb.upNextOpen,
    dynasties: wb.dynastiesOpen,
    story: !!wb.chronicleView,
    log: wb.logOpen,
    filters: wb.filtersOpen || wb.gamesOpen || wb.playOpen || wb.agesOpen,
  };
  const barWas = useRef(barOpen);
  const closeBar = useCallback(
    (keep?: keyof typeof barOpen) => {
      if (keep !== 'list') setListOf(null);
      if (keep !== 'upnext') wb.setUpNextOpen(false);
      if (keep !== 'dynasties') wb.setDynastiesOpen(false);
      if (keep !== 'story') wb.setChronicleView(null);
      if (keep !== 'log') wb.setLogOpen(false);
      if (keep !== 'filters') {
        wb.setFiltersOpen(false);
        wb.setGamesOpen(false);
        wb.setPlayOpen(false);
        wb.setAgesOpen(false);
      }
    },
    [wb],
  );
  useLayoutEffect(() => {
    const was = barWas.current;
    barWas.current = barOpen;
    const opened = (Object.keys(barOpen) as (keyof typeof barOpen)[]).find((k) => barOpen[k] && !was[k]);
    if (opened && Object.values(barOpen).filter(Boolean).length > 1) closeBar(opened);
  });
  const anyBarOpen = Object.values(barOpen).some(Boolean);
  useEffect(() => {
    if (!anyBarOpen) return;
    // A press on the board closes it. The panel, the bar (whose buttons
    // toggle and swap it) and anything over it (a dialog, a menu, the sim
    // editor, search) keep it.
    // A highlight's list stays: you read it against the board, moving
    // around and picking cards, as you do with the Key.
    if (listOf) return;
    const onPointer = (ev: PointerEvent) => {
      const t = ev.target as Element | null;
      if (!t?.closest || t.closest('.barpanel, .appbar, [aria-modal="true"], .menu, .editor, .find, .poster, .pop')) return;
      closeBar();
    };
    document.addEventListener('pointerdown', onPointer, true);
    return () => document.removeEventListener('pointerdown', onPointer, true);
  }, [anyBarOpen, closeBar, listOf]);

  // A list goes with its highlight: cleared, ended, or taken over by another.
  const listLit =
    listOf === 'highlight'
      ? highlightActive(wb.hiAges, wb.hiSingle) && !wb.familyFocus && !wb.dynastyFocusIds && !wb.bloodlineId
      : listOf === 'dynasty'
        ? !!wb.dynastyFocusIds
        : listOf === 'family'
          ? wb.familyFocus
          : true;
  useEffect(() => {
    if (listOf && !listLit) setListOf(null);
  }, [listOf, listLit]);
  useEffect(() => {
    if (!wb.agesOpen) setHiFromList(false);
  }, [wb.agesOpen]);

  /** Every dynasty on the board, for the Dynasties panel: worked out only while it is open. */
  const dynastyRows = useMemo(() => (wb.dynastiesOpen ? dynastyIndex(wb.nodes) : []), [wb.dynastiesOpen, wb.nodes]);
  const dynastyLabelOf = useCallback(
    (r: DynastyRow) => dynastyLabelText(wb.dynastyNames.get(r.key) ?? { name: r.name }),
    [wb.dynastyNames],
  );
  const dynastyPhraseOf = useCallback(
    (r: DynastyRow) => dynastyPhrase(wb.dynastyNames.get(r.key) ?? { name: r.name }),
    [wb.dynastyNames],
  );
  /** What a planned dynasty would show as if renamed: told apart by founder when the name is taken. */
  const renamedLabel = useCallback(
    (key: string, to: string) => {
      const done = renamePlannedDynasty(wb.nodes, key, to);
      const d = dynastyNames(done.nodes).get(done.key);
      return d ? dynastyLabelText(d) : to.trim();
    },
    [wb.nodes],
  );
  const nameOfSim = useCallback(
    (id: string) => {
      const n = wb.byid[id];
      return n ? cardName(n) : 'someone';
    },
    [wb.byid],
  );

  /**
   * The board left of a highlight's list, where a sim it goes to should land:
   * the list stays open over the right of the board.
   */
  const besideList = () => {
    const r = svgRef.current?.getBoundingClientRect();
    const panel = document.getElementById('simlist')?.getBoundingClientRect();
    if (!r) return { w: 800, h: 600 };
    const w = panel && !isPanelSheet() ? Math.max(240, panel.left - r.left) : r.width;
    return { w, h: r.height };
  };

  /** The board's size on screen, for framing what search finds. */
  const boardSize = () => {
    const r = svgRef.current?.getBoundingClientRect();
    return { w: r?.width ?? 800, h: r?.height ?? 600 };
  };

  /** What search can do, by the words a player would type. */
  const findActions = useMemo((): (FindAction & { run: () => void })[] => {
    const panels = () => {
      wb.setLogOpen(false);
      wb.setUpNextOpen(false);
      wb.setDynastiesOpen(false);
    };
    return [
      {
        id: 'open-save',
        suggested: true,
        label: 'Upload your save',
        detail: 'Your game’s newest .save: it stays on your computer',
        words: 'open load import refresh game file .save',
        run: () => saveFileRef.current?.click(),
      },
      {
        id: 'up-next',
        suggested: true,
        label: 'Open Up next',
        detail: 'A suggested order to play your households in',
        words: 'play order household rotation',
        run: () => {
          panels();
          wb.setUpNextOpen(true);
        },
      },
      {
        id: 'dynasties',
        suggested: true,
        label: 'Open Dynasties',
        detail: 'Every dynasty, with its members',
        words: 'heir prestige crown family',
        run: () => {
          panels();
          wb.setDynastiesOpen(true);
        },
      },
      {
        id: 'story',
        suggested: true,
        label: 'Read your story',
        detail: 'What happened in your game, save by save',
        words: 'chronicle history',
        run: () => {
          wb.setRecapOpen(false);
          wb.setChronicleView({ label: 'your board', ids: null });
        },
      },
      {
        id: 'add-sim',
        suggested: true,
        label: 'Add a sim',
        detail: 'A new card on the board',
        words: 'new create person card',
        run: () => {
          const { w, h } = boardSize();
          wb.addSim(w, h);
        },
      },
      ...wb.petKinds.map((k) => ({
        id: `add-${k.species.toLowerCase()}`,
        label: `Add ${aKind(k.species)}`,
        detail: `A new ${k.species.toLowerCase()} card on the board`,
        words: `pet new create ${k.young.toLowerCase()}`,
        run: () => {
          const { w, h } = boardSize();
          wb.addSim(w, h, k.species);
        },
      })),
      {
        id: 'fit',
        suggested: true,
        label: 'Show the whole board',
        detail: 'Zoom out to every card',
        words: 'zoom fit all everyone',
        run: () => {
          const { w, h } = boardSize();
          wb.fit(w, h);
        },
      },
      ...(wb.chronicle.length >= 2
        ? [
            {
              id: 'look-back',
              label: 'Look back through your saves',
              detail: 'The board as it was at each save you uploaded',
              words: 'time lapse history past before',
              run: () => wb.setLookBackAt(wb.chronicle.length - 2),
            },
          ]
        : []),
      {
        id: 'log',
        label: 'Open the Log',
        detail: 'Links and household moves you added',
        words: 'history changes connection',
        run: () => {
          panels();
          wb.setLogOpen(true);
        },
      },
      {
        id: 'organise',
        label: 'Organise the board',
        detail: 'Arrange the board like the starter one',
        words: 'tidy layout arrange sort',
        run: () => {
          const { w, h } = boardSize();
          wb.organiseBoard(w, h);
        },
      },
      {
        id: 'download',
        label: 'Download the board',
        detail: 'Keep a copy as a .json file',
        words: 'save export backup json file',
        run: wb.saveJson,
      },
    ];
  }, [wb]);

  /** Go where a search result is: a sim close up, a household or place framed, an action done. */
  const goFound = (r: FindResult) => {
    setFindOpen(false);
    if (r.kind === 'action') {
      trackAction(`/action/find-do-${r.key}`);
      findActions.find((a) => a.id === r.key)?.run();
      return;
    }
    trackAction(`/action/find-${r.kind}`);
    const { w, h } = boardSize();
    const shown = wb.visibleNodes;
    if (r.kind === 'sim') {
      wb.focusSim(r.key, w, h);
    } else if (r.kind === 'world') {
      wb.clearSel();
      // Clear of the Worlds list and key down the right, on a wide screen.
      wb.zoomToWorld(r.key, w, h, w > 700 ? 210 : 0);
    } else if (r.kind === 'household') {
      wb.clearSel();
      wb.frameSims(shown.filter((n) => n.gid === r.key).map((n) => n.id), w, h);
    } else if (r.kind === 'neighbourhood') {
      const [world, nb] = r.key.split('||');
      wb.clearSel();
      wb.frameSims(shown.filter((n) => n.world === world && n.nb === nb).map((n) => n.id), w, h);
    } else if (r.kind === 'dynasty') {
      wb.clearSel();
      wb.setDynastyFocus(r.key);
      wb.frameSims(shown.filter((n) => !n.species && dynastyKey(n) === r.key).map((n) => n.id), w, h);
    }
  };

  return (
    <IconContext.Provider value={ICONS}>
      <div id="app">
        <AppBar
          wb={wb}
          svgRef={svgRef}
          onDevUpdates={() => setDevUpdatesOpen(true)}
          devUpdatesUnseen={devUpdatesUnseen}
          onOpenFind={() => {
            trackAction('/action/search');
            setFindOpen(true);
          }}
          findKeys={findKeys}
        />
        <WhiteboardStage
          wb={wb}
          svgRef={svgRef}
          stageRef={stageRef}
          tipsReady={!welcomeOpen && !devUpdatesOpen && !wb.saveImport && !wb.pendingLoadJson}
          onOpenSave={() => saveFileRef.current?.click()}
          listOf={listOf}
          onList={(of) => {
            trackAction(`/action/list/${of}`);
            setListOf(of);
          }}
          onPoster={(gid) => {
            const group = wb.groups.find((g) => g.gid === gid);
            if (!group) return;
            const poster = householdPoster({ group, nodes: wb.nodes, links: wb.shownEdges, lot: wb.homes.get(gid)?.name, saveGame: wb.saveGame });
            const story = storyLines(wb.chronicle, new Set(wb.nodes.filter((n) => n.gid === gid).map((n) => n.id)));
            setPoster(story.length ? { ...poster, story } : poster);
          }}
        />
        {poster && <PosterDialog model={poster} onClose={() => setPoster(null)} />}
        {barOpen.filters && (
          <FiltersPanel
            wb={wb}
            {...(hiFromList
              ? {
                  backToList: () => {
                    setListOf('highlight');
                    wb.setAgesOpen(false);
                  },
                }
              : {})}
          />
        )}
        {listOf && (
          <HighlightList
            key={listOf}
            wb={wb}
            of={listOf}
            onPick={(id, select) => {
              // A phone's sheet covers the board: it gets out of the way.
              if (isPanelSheet()) setListOf(null);
              const { w, h } = besideList();
              wb.focusSim(id, w, h, select);
            }}
            onChange={() => {
              setHiFromList(true);
              wb.setAgesOpen(true);
            }}
            onShowAll={() => {
              const { w, h } = besideList();
              // frameSims keeps clear of the Key's column; the list covers it.
              wb.frameSims(wb.dynastyFocusIds ?? [], w + (isPanelSheet() ? 0 : 210), h);
            }}
            onClose={() => setListOf(null)}
          />
        )}
        {wb.upNextOpen && (
            <UpNextPanel
              rows={upNext({
                items: wb.planItems,
                nodes: wb.nodes,
                groups: wb.groups,
                saveGame: wb.saveGame,
                generations: wb.generationOf,
                skipped: wb.upNextSkipped,
                notInGame: wb.notInGame,
              })}
              groups={wb.groups}
              nameOf={(id) => {
                const n = wb.byid[id];
                return n ? cardName(n) : 'someone';
              }}
              hhOf={(gid) => householdName(gid, wb.groups, wb.nodes)}
              onClose={() => wb.setUpNextOpen(false)}
              onOpen={(r) => {
                wb.setUpNextOpen(false);
                wb.setBriefGid(r.gid);
                // Show the household: the first of its sims in a plan.
                const first = [...r.ready, ...r.ownWaits, ...r.unblocks]
                  .flatMap((i) => i.sims)
                  .find((id) => wb.byid[id]?.gid === r.gid);
                if (first) {
                  const rect = svgRef.current?.getBoundingClientRect();
                  wb.focusSim(first, rect?.width ?? 800, rect?.height ?? 600);
                }
              }}
              onSkip={(gid, skip) =>
                wb.setUpNextSkipped((s) => {
                  const next = new Set(s);
                  if (skip) next.add(gid);
                  else next.delete(gid);
                  return next;
                })
              }
            />
        )}
        {wb.dynastiesOpen && (
            <DynastiesPanel
              rows={dynastyRows}
              labelOf={dynastyLabelOf}
              phraseOf={dynastyPhraseOf}
              nameOf={nameOfSim}
              homeOf={(id) => {
                const n = wb.byid[id];
                return n?.hh ? householdPlace(n.hh, n.nb, n.world) : '';
              }}
              onClose={() => wb.setDynastiesOpen(false)}
              onFind={(id) => {
                // A phone's sheet covers the board: it gets out of the way.
                if (isPanelSheet()) wb.setDynastiesOpen(false);
                const rect = svgRef.current?.getBoundingClientRect();
                wb.focusSim(id, rect?.width ?? 800, rect?.height ?? 600);
              }}
              onHover={wb.setBriefHover}
              onRename={wb.renameDynasty}
              renameLabel={renamedLabel}
              onRemove={wb.removeDynasty}
              litKey={wb.dynastyFocus}
              forecastOf={(key) => {
                const f = successionForecast(wb.nodes, wb.edges, key, wb.saveGame);
                return { ...f, windows: partnerWindows(f, wb.nodes, wb.saveGame) };
              }}
              hhOf={(gid) => householdName(gid, wb.groups, wb.nodes)}
              prestigeOf={(key) => wb.saveGame?.prestige?.[key]}
              {...(wb.chronicle.length
                ? {
                    onStory: (key: string) => {
                      if (isPanelSheet()) wb.setDynastiesOpen(false);
                      wb.setRecapOpen(false);
                      wb.setChronicleView({
                        label: `the ${dynastyLabelText(wb.dynastyNames.get(key) ?? { name: dynastyRows.find((r) => r.key === key)?.name ?? '' })} dynasty`,
                        ids: wb.nodes.filter((n) => dynastyKey(n) === key).map((n) => n.id),
                        dynasties: [key],
                      });
                    },
                  }
                : {})}
              onPoster={(key) => {
                const poster = dynastyPoster({
                  key,
                  prestige: wb.saveGame?.prestige?.[key],
                  label: dynastyLabelText(wb.dynastyNames.get(key) ?? { name: dynastyRows.find((r) => r.key === key)?.name ?? '' }),
                  nodes: wb.nodes,
                  edges: wb.edges,
                  links: wb.shownEdges,
                  saveGame: wb.saveGame,
                });
                const story = storyLines(wb.chronicle, new Set(wb.nodes.filter((n) => dynastyKey(n) === key).map((n) => n.id)));
                setPoster(story.length ? { ...poster, story } : poster);
              }}
              game={wb.saveGame}
              onLight={(key) => {
                wb.setDynastyFocus(key);
                // A phone's sheet covers the board: it gets out of the way.
                if (key && isPanelSheet()) wb.setDynastiesOpen(false);
              }}
            />
        )}
        {wb.logOpen && (
            <ConnectionLogPanel
              entries={wb.connectionLog}
              offPlanEdgeIds={wb.offPlan.edges}
              onNote={wb.setLogNote}
              onCancel={(entry) => {
                const r = svgRef.current?.getBoundingClientRect();
                wb.cancelPlan(entry, r ? { w: r.width, h: r.height } : undefined);
              }}
              isSelLink={wb.isSelLink}
              selectedSimId={wb.sel?.type === 'node' ? wb.sel.id : null}
              onPick={(entry) => {
                const r = svgRef.current?.getBoundingClientRect();
                if (entry.simId && !entry.edgeIds.length) {
                  if (!r) {
                    wb.selectNode(entry.simId);
                    return;
                  }
                  wb.focusSim(entry.simId, r.width, r.height);
                  return;
                }
                if (!r) {
                  wb.selectLink(entry.edgeIds);
                  return;
                }
                wb.focusLogEntry(entry.edgeIds, r.width, r.height);
              }}
              onFocusSim={(id) => {
                const r = svgRef.current?.getBoundingClientRect();
                if (!r) {
                  wb.selectNode(id);
                  return;
                }
                wb.focusSim(id, r.width, r.height);
              }}
              onClose={() => wb.setLogOpen(false)}
            />
        )}
        {wb.saveImport && (
          <SaveImportDialog
            summary={wb.saveImport.merge.summary}
            game={wb.saveImport.merge.saveGame}
            starter={wb.saveImport.starter}
            untouched={wb.saveImport.untouched}
            fresh={wb.saveImport.fresh}
            plan={wb.saveImport.plan}
            planned={wb.plannedCounts}
            onCancel={wb.cancelSaveImport}
            onMerge={(choices) => {
              const r = svgRef.current?.getBoundingClientRect();
              wb.confirmSaveImport(r?.width ?? 800, r?.height ?? 600, choices);
            }}
            story={wb.chronicle.length}
            onReplace={(keepStory) => {
              const r = svgRef.current?.getBoundingClientRect();
              wb.confirmSaveReplace(r?.width ?? 800, r?.height ?? 600, keepStory);
            }}
          />
        )}
        {welcomeOpen && (
          <Welcome
            onOpenSave={(f) => {
              setWelcomeOpen(false);
              wb.previewSave(f);
            }}
            onOpenBoard={(f) => {
              setWelcomeOpen(false);
              const { w, h } = boardSize();
              wb.loadJson(f, w, h);
            }}
            onClose={() => setWelcomeOpen(false)}
          />
        )}
        {findOpen && (
          <SearchPalette
            worlds={wb.worlds}
            groups={wb.groups}
            visibleNodes={wb.visibleNodes}
            dynastyNames={wb.dynastyNames}
            actions={findActions}
            onGo={goFound}
            onClose={() => setFindOpen(false)}
          />
        )}
        <input
          ref={saveFileRef}
          type="file"
          accept=".save"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) wb.previewSave(f);
            e.target.value = '';
          }}
        />
        {devUpdatesOpen && (
          <DevUpdatesDialog entries={CHANGELOG} onClose={closeDevUpdates} />
        )}
        {wb.pendingLoadJson && (
          <LoadJsonDialog
            risk={wb.pendingLoadJson.risk}
            pendingFileName={wb.pendingLoadJson.file.name}
            willRepack={wb.pendingLoadJson.willRepack}
            filtersNote={wb.pendingLoadJson.filtersNote}
            onDownload={wb.saveJson}
            onCancel={wb.cancelLoadJson}
            onMerge={(keepBoardPositions) =>
              wb.confirmMergeJson(keepBoardPositions)
            }
            onReplace={(keepBoardPositions) =>
              wb.confirmReplaceJson(keepBoardPositions)
            }
          />
        )}
      </div>
      <Analytics />
    </IconContext.Provider>
  );
}
