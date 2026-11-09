import { Analytics } from '@vercel/analytics/react';
import { IconContext } from './icons.ts';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import changelog from './data/changelog.json';
import {
  hasUnseen,
  markSeen,
  readSeen,
  visibleEntries,
  type ChangelogEntry,
} from './lib/changelog.ts';
import { AgesPanel } from './components/AgesPanel.tsx';
import { AppBar } from './components/AppBar.tsx';
import { ConnectionLogPanel } from './components/ConnectionLogPanel.tsx';
import { DevUpdatesDialog } from './components/DevUpdatesDialog.tsx';
import { GamesPanel } from './components/GamesPanel.tsx';
import { PlayabilityPanel } from './components/PlayabilityPanel.tsx';
import { UpNextPanel } from './components/UpNextPanel.tsx';
import { DynastiesPanel } from './components/DynastiesPanel.tsx';
import { dynastyIndex, renamePlannedDynasty, type DynastyRow } from './lib/dynastyMenu.ts';
import { dynastyLabelText, dynastyNames, dynastyPhrase } from './lib/generations.ts';
import { isPanelSheet } from './lib/chrome.ts';
import { householdPlace } from './lib/connectionLog.ts';
import { householdName, upNext } from './lib/householdPlan.ts';
import { cardName } from './lib/plan.ts';
import { WhiteboardStage } from './components/WhiteboardStage.tsx';
import { LoadJsonDialog } from './components/LoadJsonDialog.tsx';
import { SaveImportDialog } from './components/SaveImportDialog.tsx';
import { useWhiteboard } from './hooks/useWhiteboard.ts';

/** One icon size and weight for the whole app, set once. */
const ICONS = { size: 17, weight: 'regular' } as const;

const CHANGELOG = visibleEntries(changelog.entries as ChangelogEntry[]);

export default function App() {
  const wb = useWhiteboard();
  /** Opens itself on load only for a visitor who has not read the newest entry. */
  const [devUpdatesOpen, setDevUpdatesOpen] = useState(() =>
    hasUnseen(CHANGELOG, readSeen()),
  );
  const [devUpdatesUnseen, setDevUpdatesUnseen] = useState(devUpdatesOpen);

  /** Every dismissal marks the log read, or it would reopen on the next load. */
  const closeDevUpdates = useCallback(() => {
    markSeen(CHANGELOG);
    setDevUpdatesUnseen(false);
    setDevUpdatesOpen(false);
  }, []);
  const svgRef = useRef<SVGSVGElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const filtersBtnRef = useRef<HTMLButtonElement>(null);
  const logBtnRef = useRef<HTMLButtonElement>(null);
  const gamesPanelRef = useRef<HTMLDivElement>(null);
  const agesPanelRef = useRef<HTMLDivElement>(null);
  const playPanelRef = useRef<HTMLDivElement>(null);
  const logPanelRef = useRef<HTMLDivElement>(null);
  const upNextBtnRef = useRef<HTMLButtonElement>(null);
  const upNextPanelRef = useRef<HTMLDivElement>(null);
  const dynastiesBtnRef = useRef<HTMLButtonElement>(null);
  const dynastiesPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        if (devUpdatesOpen) closeDevUpdates();
        else if (wb.saveImport) wb.cancelSaveImport();
        else if (wb.pendingLoadJson) wb.cancelLoadJson();
        else if (wb.partnerMenu) wb.closePartnerMenu();
        else if (wb.childMenu) wb.closeChildMenu();
        else if (wb.gamesOpen) wb.setGamesOpen(false);
        else if (wb.playOpen) wb.setPlayOpen(false);
        else if (wb.agesOpen) wb.setAgesOpen(false);
        else if (wb.logOpen) wb.setLogOpen(false);
        else if (wb.upNextOpen) wb.setUpNextOpen(false);
        else if (wb.dynastiesOpen) wb.setDynastiesOpen(false);
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
        (ev.key === 'Delete' || ev.key === 'Backspace') &&
        wb.sel &&
        !typing
      ) {
        ev.preventDefault();
        wb.deleteSelected();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [wb, devUpdatesOpen, closeDevUpdates]);

  useEffect(() => {
    const onPointer = (ev: PointerEvent) => {
      const t = ev.target as Node;
      if (
        wb.gamesOpen &&
        gamesPanelRef.current &&
        !gamesPanelRef.current.contains(t) &&
        !filtersBtnRef.current?.contains(t)
      ) {
        wb.setGamesOpen(false);
      }
      if (
        wb.playOpen &&
        playPanelRef.current &&
        !playPanelRef.current.contains(t) &&
        !filtersBtnRef.current?.contains(t)
      ) {
        wb.setPlayOpen(false);
      }
      if (
        wb.agesOpen &&
        agesPanelRef.current &&
        !agesPanelRef.current.contains(t) &&
        !filtersBtnRef.current?.contains(t)
      ) {
        wb.setAgesOpen(false);
      }
      if (
        wb.logOpen &&
        logPanelRef.current &&
        !logPanelRef.current.contains(t) &&
        !logBtnRef.current?.contains(t)
      ) {
        wb.setLogOpen(false);
      }
      if (
        wb.upNextOpen &&
        upNextPanelRef.current &&
        !upNextPanelRef.current.contains(t) &&
        !upNextBtnRef.current?.contains(t) &&
        // Folded into More on a phone: its menu opens the panel.
        !(t as Element).closest?.('.overflow')
      ) {
        wb.setUpNextOpen(false);
      }
      if (
        wb.dynastiesOpen &&
        dynastiesPanelRef.current &&
        !dynastiesPanelRef.current.contains(t) &&
        !dynastiesBtnRef.current?.contains(t) &&
        // Folded into More on a phone: its menu opens the panel.
        !(t as Element).closest?.('.overflow')
      ) {
        wb.setDynastiesOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointer, true);
    return () => document.removeEventListener('pointerdown', onPointer, true);
  }, [wb.gamesOpen, wb.playOpen, wb.agesOpen, wb.logOpen, wb.upNextOpen, wb.dynastiesOpen, wb]);

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

  return (
    <IconContext.Provider value={ICONS}>
      <div id="app">
        <AppBar
          wb={wb}
          svgRef={svgRef}
          filtersBtnRef={filtersBtnRef}
          logBtnRef={logBtnRef}
          upNextBtnRef={upNextBtnRef}
          dynastiesBtnRef={dynastiesBtnRef}
          onDevUpdates={() => setDevUpdatesOpen(true)}
          devUpdatesUnseen={devUpdatesUnseen}
        />
        <WhiteboardStage
          wb={wb}
          svgRef={svgRef}
          stageRef={stageRef}
          tipsReady={!devUpdatesOpen && !wb.saveImport && !wb.pendingLoadJson}
        />
        {(wb.gamesOpen || wb.playOpen || wb.agesOpen) && (
          <div
            className="chrome-backdrop"
            aria-hidden
            onPointerDown={() => {
              wb.setGamesOpen(false);
              wb.setPlayOpen(false);
              wb.setAgesOpen(false);
            }}
          />
        )}
        {wb.gamesOpen && (
          <div ref={gamesPanelRef}>
            <GamesPanel
              packs={wb.packs}
              hiddenPacks={wb.hiddenPacks}
              counts={wb.packCounts}
              colors={wb.packColors}
              anchorRect={
                filtersBtnRef.current?.getBoundingClientRect() ?? null
              }
              onToggle={wb.togglePack}
              onAll={() => wb.setHiddenPacks(new Set())}
              onNone={() => wb.setHiddenPacks(new Set(wb.packs))}
              onClose={() => wb.setGamesOpen(false)}
            />
          </div>
        )}
        {wb.playOpen && (
          <div ref={playPanelRef}>
            <PlayabilityPanel
              playabilities={wb.playabilities}
              hiddenPlay={wb.hiddenPlay}
              nodes={wb.nodes}
              anchorRect={
                filtersBtnRef.current?.getBoundingClientRect() ?? null
              }
              onToggle={wb.togglePlay}
              onAll={() => wb.setHiddenPlay(new Set())}
              onNone={() => wb.setHiddenPlay(new Set(wb.playabilities))}
            />
          </div>
        )}
        {wb.agesOpen && (
          <div ref={agesPanelRef}>
            <AgesPanel
              nodes={wb.nodes}
              edges={wb.shownEdges}
              hiAges={wb.hiAges}
              hiSingle={wb.hiSingle}
              unborn={wb.plannedChildIds}
              packVis={wb.nodeVis}
              anchorRect={
                filtersBtnRef.current?.getBoundingClientRect() ?? null
              }
              onToggle={wb.toggleAge}
              onToggleSingle={wb.toggleSingle}
              onClear={() => {
                wb.setHiAges(new Set());
                wb.setHiSingle(false);
              }}
            />
          </div>
        )}
        {wb.upNextOpen && (
          <div ref={upNextPanelRef}>
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
              anchorRect={upNextBtnRef.current?.getBoundingClientRect() ?? null}
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
          </div>
        )}
        {wb.dynastiesOpen && (
          <div ref={dynastiesPanelRef}>
            <DynastiesPanel
              rows={dynastyRows}
              labelOf={dynastyLabelOf}
              phraseOf={dynastyPhraseOf}
              nameOf={nameOfSim}
              homeOf={(id) => {
                const n = wb.byid[id];
                return n?.hh ? householdPlace(n.hh, n.nb, n.world) : '';
              }}
              anchorRect={dynastiesBtnRef.current?.getBoundingClientRect() ?? null}
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
              onLight={(key) => {
                wb.setDynastyFocus(key);
                // A phone's sheet covers the board: it gets out of the way.
                if (key && isPanelSheet()) wb.setDynastiesOpen(false);
              }}
            />
          </div>
        )}
        {wb.logOpen && (
          <div ref={logPanelRef}>
            <ConnectionLogPanel
              entries={wb.connectionLog}
              offPlanEdgeIds={wb.offPlan.edges}
              onNote={wb.setLogNote}
              onCancel={(entry) => {
                const r = svgRef.current?.getBoundingClientRect();
                wb.cancelPlan(entry, r ? { w: r.width, h: r.height } : undefined);
              }}
              anchorRect={
                logBtnRef.current?.getBoundingClientRect() ?? null
              }
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
          </div>
        )}
        {wb.saveImport && (
          <SaveImportDialog
            summary={wb.saveImport.merge.summary}
            game={wb.saveImport.merge.saveGame}
            starter={wb.saveImport.starter}
            plan={wb.saveImport.plan}
            planned={wb.plannedCounts}
            onCancel={wb.cancelSaveImport}
            onMerge={(choices) => {
              const r = svgRef.current?.getBoundingClientRect();
              wb.confirmSaveImport(r?.width ?? 800, r?.height ?? 600, choices);
            }}
            onReplace={() => {
              const r = svgRef.current?.getBoundingClientRect();
              wb.confirmSaveReplace(r?.width ?? 800, r?.height ?? 600);
            }}
          />
        )}
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
