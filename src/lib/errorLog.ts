/**
 * The last few errors the page hit, for the problem report: when, the
 * message (cut short), where in the code, and for a crash the components it
 * happened in. Kept in this browser (localStorage) so a report copied after
 * reloading still has the error that made the page go blank; never sent.
 */

import { pageTranslation } from './translateGuard.ts';

export type LoggedError = {
  at: string;
  message: string;
  /** Up to three places in the app's code, innermost first: file:line:column. */
  where?: string;
  /** For a crash while drawing: the components it happened in, innermost first. */
  components?: string;
  /** The page went blank for it (the crash screen took over). */
  crash?: true;
  /** The app's build when it happened. */
  build?: string;
  /** The browser was translating the page, to this language, when it happened. */
  translated?: string;
};

export const ERROR_LOG_KEY = 'sims4-family-trees:errors:v1';
const MAX_ERRORS = 8;
const MAX_MESSAGE = 200;
/** Errors older than this are no help to a report about today. */
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

let errors: LoggedError[] | null = null;

function store(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function load(now = Date.now()): LoggedError[] {
  if (errors) return errors;
  errors = [];
  try {
    const raw = store()?.getItem(ERROR_LOG_KEY);
    const list = raw ? (JSON.parse(raw) as LoggedError[]) : [];
    if (Array.isArray(list)) {
      errors = list.filter((e) => e && typeof e.message === 'string' && now - Date.parse(e.at) < MAX_AGE_MS).slice(-MAX_ERRORS);
    }
  } catch {
    // A log that can't be read starts afresh.
  }
  return errors;
}

function save(): void {
  try {
    store()?.setItem(ERROR_LOG_KEY, JSON.stringify(errors ?? []));
  } catch {
    // Full or blocked storage: the log stays in memory.
  }
}

/** Up to three lines of a stack that point into the app's code: file:line:column, innermost first. */
function whereFrom(stack: string | undefined): string | undefined {
  if (!stack) return undefined;
  const out: string[] = [];
  for (const line of stack.split('\n').slice(1)) {
    const m = line.match(/([\w.-]+\.(?:js|ts|tsx)(?:\?[^:\s)]*)?:\d+:\d+)/);
    if (m) out.push(m[1]!);
    if (out.length === 3) break;
  }
  return out.length ? out.join(' < ') : undefined;
}

/** The innermost components of a React component stack: "ConnectMenu < WhiteboardStage < App". */
function componentsFrom(stack: string | undefined): string | undefined {
  if (!stack) return undefined;
  const names = stack
    .split('\n')
    .map((l) => l.trim().match(/^at (\S+)/)?.[1])
    .filter((n): n is string => !!n)
    .slice(0, 4);
  return names.length ? names.join(' < ') : undefined;
}

export function logError(
  error: unknown,
  opts: { now?: Date; componentStack?: string; crash?: boolean; build?: string } = {},
): void {
  const list = load();
  const e = error instanceof Error ? error : null;
  const message = (e ? `${e.name}: ${e.message}` : String(error)).slice(0, MAX_MESSAGE);
  const where = whereFrom(e?.stack);
  const components = componentsFrom(opts.componentStack);
  const translated = pageTranslation();
  list.push({
    at: (opts.now ?? new Date()).toISOString(),
    message,
    ...(where ? { where } : {}),
    ...(components ? { components } : {}),
    ...(opts.crash ? { crash: true as const } : {}),
    ...(opts.build ? { build: opts.build } : {}),
    ...(translated ? { translated } : {}),
  });
  if (list.length > MAX_ERRORS) list.splice(0, list.length - MAX_ERRORS);
  save();
}

export function recentErrors(): readonly LoggedError[] {
  return load();
}

/** Listen for errors nothing else caught, once, as the app starts. */
export function installErrorLog(build?: string): void {
  if (typeof window === 'undefined') return;
  load();
  window.addEventListener('error', (ev) => logError(ev.error ?? ev.message, { ...(build ? { build } : {}) }));
  window.addEventListener('unhandledrejection', (ev) => logError(ev.reason, { ...(build ? { build } : {}) }));
}
