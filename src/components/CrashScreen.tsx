import { Component, useEffect, useState, type ErrorInfo, type ReactNode } from 'react';
import changelog from '../data/changelog.json';
import { AUTOSAVE_KEY } from '../lib/autosave.ts';
import { BUILD } from '../lib/build.ts';
import { logError, recentErrors } from '../lib/errorLog.ts';
import { problemReportFromDraft, reportEnv } from '../lib/problemReport.ts';
import { SendReport } from './SendReport.tsx';

/** The problem report, made from the board the browser kept, as the page can't run. */
function crashReport(): string {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(AUTOSAVE_KEY);
  } catch {
    raw = null;
  }
  const latest = changelog.entries[0];
  try {
    return problemReportFromDraft(raw, {
      build: BUILD,
      ...(latest ? { latestUpdate: { sha: latest.sha, date: latest.date } } : {}),
      now: new Date(),
      env: reportEnv(),
      errors: recentErrors(),
    });
  } catch (e) {
    // The crash screen must never crash: the errors alone, as plain lines.
    return [
      `The Sims 4 Family Tree Planner: problem report (build ${BUILD})`,
      `The report couldn't be made: ${String(e).slice(0, 200)}`,
      ...recentErrors().map((x) => `${x.at}${x.crash ? ' (the page went blank)' : ''} ${x.message}${x.where ? ` @ ${x.where}` : ''}${x.components ? ` in ${x.components}` : ''}`),
    ].join('\n');
  }
}

/** The board kept in this browser, as a file to keep: "Upload a board (.json)" takes it back. */
function downloadDraft(): void {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(AUTOSAVE_KEY);
  } catch {
    raw = null;
  }
  if (!raw) {
    alert('There is no board kept in this browser to download.');
    return;
  }
  const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `sims4_family_trees_kept_${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * What shows instead of a blank page when the board crashes: it says so,
 * that the board is safe in the browser, and offers to reload it or to
 * send the developer a problem report with the error in it (SendReport,
 * the same as the ⋮ menu's report).
 */
function CrashScreen() {
  // Made once the crash is logged (the guard logs it as the screen shows), so it's in the report.
  const [text, setText] = useState('');
  useEffect(() => setText(crashReport()), []);
  return (
    <main className="crash" role="alert">
      <div className="crash__card">
        <h1>Something went wrong</h1>
        <p className="crash__lead">
          The board hit a problem and stopped. Your board is safe: it’s kept in this browser, and reloading brings it
          back.
        </p>
        <div className="crash__acts">
          <button type="button" className="crash__btn" onClick={() => location.reload()}>
            Reload the board
          </button>
        </div>
        <SendReport report={() => text || crashReport()} />
        <details className="crash__report">
          <summary>See what’s sent</summary>
          <pre className="report-panel__text" tabIndex={0}>
            {text}
          </pre>
        </details>
        <details className="crash__report">
          <summary>If reloading doesn’t help</summary>
          <p className="crash__note">
            The board kept in this browser may be what stops it. Keep a copy first: you can upload it again later, or
            send it with the report if you like. Then start over with the example board.
          </p>
          <div className="crash__acts">
            <button type="button" className="crash__btn" onClick={downloadDraft}>
              Download your board (.json)
            </button>
            <button
              type="button"
              className="crash__btn crash__btn--danger"
              onClick={() => {
                if (!confirm('Start over with the example board? The board kept in this browser goes. Download it first if you want to keep it.')) return;
                try {
                  localStorage.removeItem(AUTOSAVE_KEY);
                } catch {
                  // Nothing to clear.
                }
                location.reload();
              }}
            >
              Start over
            </button>
          </div>
        </details>
      </div>
    </main>
  );
}

/**
 * Catches a crash anywhere in the board while it draws: logs it (kept
 * across a reload, for the report) and shows the crash screen.
 */
export class CrashGuard extends Component<{ children: ReactNode }, { crashed: boolean }> {
  override state = { crashed: false };

  static getDerivedStateFromError(): { crashed: boolean } {
    return { crashed: true };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    logError(error, { crash: true, build: BUILD, ...(info.componentStack ? { componentStack: info.componentStack } : {}) });
  }

  override render(): ReactNode {
    return this.state.crashed ? <CrashScreen /> : this.props.children;
  }
}
