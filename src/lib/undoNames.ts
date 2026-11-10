import type { EdgeType } from '../types/whiteboard.ts';

/**
 * Names of undo steps: what the person did, in the words of the button or
 * menu they used ("Add a sim to Gooseman"), so the Undo button can say what
 * it takes back and the status line what it took back. The Undo button's
 * tip is one line, so a name stays short.
 */
export const STEP_NAME_MAX = 56;

/** A name cut to one tip line, with an ellipsis where it was cut. */
export function clipStep(s: string, max = STEP_NAME_MAX): string {
  const one = s.replace(/\s+/g, ' ').trim();
  return one.length <= max ? one : `${one.slice(0, max - 1).trimEnd()}…`;
}

/** A link made by hand, between sims named `a` and `b`. */
export function linkStep(
  type: EdgeType,
  a: string,
  b: string,
  opts: { secret?: boolean; adopted?: boolean } = {},
): string {
  switch (type) {
    case 'parent':
      return opts.adopted ? `Plan ${a} adopting ${b}` : `Make ${a} a parent of ${b}`;
    case 'marriage':
      return `Plan a marriage of ${a} and ${b}`;
    case 'romance':
      return opts.secret ? `Plan ${a} and ${b} as secret lovers` : `Plan a romance of ${a} and ${b}`;
    case 'divorced':
      return `Mark ${a} and ${b} divorced`;
    case 'sibling':
      return `Make ${a} and ${b} siblings`;
    default:
      return `Link ${a} and ${b}`;
  }
}

/** The Undo button's tip: what it takes back, or that there is nothing. */
export function undoTip(what: string | null, keys = 'Ctrl/⌘ Z'): string {
  return what ? `Undo: ${clipStep(what)} (${keys})` : 'Nothing to undo';
}
