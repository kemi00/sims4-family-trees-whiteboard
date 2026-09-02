import { Analytics } from '@vercel/analytics/react';
import { IconContext } from './icons.ts';
import { useCallback, useEffect, useRef, useState } from 'react';
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

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        if (devUpdatesOpen) closeDevUpdates();
        else if (wb.saveImport) wb.cancelSaveImport();
        else if (wb.pendingLoadJson) wb.cancelLoadJson();
        else if (wb.gamesOpen) wb.setGamesOpen(false);
        else if (wb.playOpen) wb.setPlayOpen(false);
        else if (wb.agesOpen) wb.setAgesOpen(false);
        else if (wb.logOpen) wb.setLogOpen(false);
        else if (wb.editNodeId) wb.setEditNodeId(null);
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
    };
    document.addEventListener('pointerdown', onPointer, true);
    return () => document.removeEventListener('pointerdown', onPointer, true);
  }, [wb.gamesOpen, wb.playOpen, wb.agesOpen, wb.logOpen, wb]);

  return (
    <IconContext.Provider value={ICONS}>
      <div id="app">
        <AppBar
          wb={wb}
          svgRef={svgRef}
          filtersBtnRef={filtersBtnRef}
          logBtnRef={logBtnRef}
          onDevUpdates={() => setDevUpdatesOpen(true)}
          devUpdatesUnseen={devUpdatesUnseen}
        />
        <WhiteboardStage wb={wb} svgRef={svgRef} stageRef={stageRef} />
        {wb.gamesOpen && (
          <div ref={gamesPanelRef}>
            <GamesPanel
              packs={wb.packs}
              hiddenPacks={wb.hiddenPacks}
              nodes={wb.nodes}
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
              edges={wb.edges}
              hiAges={wb.hiAges}
              hiSingle={wb.hiSingle}
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
        {wb.logOpen && (
          <div ref={logPanelRef}>
            <ConnectionLogPanel
              entries={wb.connectionLog}
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
            onCancel={wb.cancelSaveImport}
            onMerge={() => {
              const r = svgRef.current?.getBoundingClientRect();
              wb.confirmSaveImport(r?.width ?? 800, r?.height ?? 600);
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
            onDownload={wb.saveJson}
            onCancel={wb.cancelLoadJson}
            onMerge={wb.confirmMergeJson}
            onReplace={wb.confirmReplaceJson}
          />
        )}
      </div>
      <Analytics />
    </IconContext.Provider>
  );
}
