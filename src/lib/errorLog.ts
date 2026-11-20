/**
 * The last few errors the page hit, for the problem report: when, the
 * message (cut short) and where in the code. Kept in memory only, never
 * saved or sent.
 */

export type LoggedError = { at: string; message: string; where?: string };

const MAX_ERRORS = 8;
const MAX_MESSAGE = 200;
const errors: LoggedError[] = [];

/** The first line of a stack that points into the app's code: file:line:column. */
function whereFrom(stack: string | undefined): string | undefined {
  if (!stack) return undefined;
  for (const line of stack.split('\n').slice(1)) {
    const m = line.match(/([\w.-]+\.(?:js|ts|tsx)(?:\?[^:\s)]*)?:\d+:\d+)/);
    if (m) return m[1];
  }
  return undefined;
}

export function logError(error: unknown, now = new Date()): void {
  const e = error instanceof Error ? error : null;
  const message = (e ? `${e.name}: ${e.message}` : String(error)).slice(0, MAX_MESSAGE);
  const where = whereFrom(e?.stack);
  errors.push({ at: now.toISOString(), message, ...(where ? { where } : {}) });
  if (errors.length > MAX_ERRORS) errors.splice(0, errors.length - MAX_ERRORS);
}

export function recentErrors(): readonly LoggedError[] {
  return errors;
}

/** Listen for errors nothing else caught, once, as the app starts. */
export function installErrorLog(): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('error', (ev) => logError(ev.error ?? ev.message));
  window.addEventListener('unhandledrejection', (ev) => logError(ev.reason));
}
