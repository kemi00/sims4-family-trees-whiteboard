import type { EdgeType } from '../types/whiteboard.ts';

/**
 * Names of undo steps: what the person did, in the words of the button or
 * menu they used ("Add a sim to Gooseman"), so the Undo button can say what
 * it takes back and the status line what it took back. A step is always
 * said in full: its tip wraps instead of cutting it short.
 *
 * The names in a step (a sim, household, world or dynasty) are marked with
 * `named`, so the tip and the status line can set them apart from the
 * words around them. The marks are Unicode isolates, made for names of any
 * script inside a sentence; they show as nothing wherever a step is read as
 * plain text.
 */
export const NAME_START = '⁨';
export const NAME_END = '⁩';

/** `s` marked as a name inside a step or message. */
export function named(s: string): string {
  return `${NAME_START}${s}${NAME_END}`;
}

/** A step or message cut into its words and its names, in order. */
export function stepParts(s: string): { text: string; name: boolean }[] {
  const out: { text: string; name: boolean }[] = [];
  let rest = s;
  while (rest) {
    const at = rest.indexOf(NAME_START);
    const end = at < 0 ? -1 : rest.indexOf(NAME_END, at + 1);
    if (at < 0 || end < 0) {
      out.push({ text: rest.replaceAll(NAME_START, '').replaceAll(NAME_END, ''), name: false });
      break;
    }
    if (at > 0) out.push({ text: rest.slice(0, at), name: false });
    if (end > at + 1) out.push({ text: rest.slice(at + 1, end), name: true });
    rest = rest.slice(end + 1);
  }
  return out.filter((p) => p.text);
}

/** A step or message without its name marks, as a screen reader reads it. */
export function plainStep(s: string): string {
  return s.replaceAll(NAME_START, '').replaceAll(NAME_END, '');
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

export const UNDO_KEYS = 'Ctrl/⌘ Z';
export const REDO_KEYS = 'Ctrl/⌘ Shift Z';

/** The Undo button's name: what it takes back, in full, or that there is nothing. */
export function undoTip(what: string | null, keys = UNDO_KEYS): string {
  return what ? `Undo: ${plainStep(what)} (${keys})` : 'Nothing to undo';
}

/** The Redo button's name: what it puts back, in full, or that there is nothing. */
export function redoTip(what: string | null, keys = REDO_KEYS): string {
  return what ? `Redo: ${plainStep(what)} (${keys})` : 'Nothing to redo';
}
