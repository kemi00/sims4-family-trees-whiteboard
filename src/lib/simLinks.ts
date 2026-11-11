import type { Edge } from '../types/whiteboard.ts';
import { edgeSourceOf } from './utils.ts';

/** What taking a link off does: removes it, or plans the end of a couple the game has. */
export type LinkRemoval = 'remove' | 'divorce' | 'breakup';

export type SimLinkRow = {
  id: string;
  /** "Married to Juliette Monty", "Child of Tybalt Capp". */
  text: string;
  /** The other sim. */
  other: string;
  /** Made on the board, not in your save yet. */
  planned: boolean;
  removal: LinkRemoval;
};

/** Couples first, then parents, children, siblings and other links. */
const ORDER = ['marriage', 'romance', 'divorced', 'childOf', 'parentOf', 'sibling', 'custom'] as const;

/**
 * A sim's links, one row each, as the editor lists them so one can be taken
 * off without finding its line on the board (on a phone, a thin target).
 * Within a kind, A to Z by the other sim's name.
 */
export function simLinkRows(id: string, edges: readonly Edge[], nameOf: (id: string) => string): SimLinkRow[] {
  const rows: (SimLinkRow & { kind: (typeof ORDER)[number] })[] = [];
  for (const e of edges) {
    if (e.a !== id && e.b !== id) continue;
    const otherId = e.a === id ? e.b : e.a;
    const other = nameOf(otherId);
    const planned = edgeSourceOf(e) === 'planned';
    const secret = e.secret ? ', secret' : '';
    let kind: (typeof ORDER)[number];
    let text: string;
    switch (e.type) {
      case 'marriage':
        kind = 'marriage';
        text = `Married to ${other}${e.ending ? ', divorce planned' : ''}`;
        break;
      case 'romance':
        kind = 'romance';
        text = `In a romance with ${other}${secret}${e.ending ? ', breakup planned' : ''}`;
        break;
      case 'divorced':
        kind = 'divorced';
        text = `Divorced from ${other}`;
        break;
      case 'parent':
        if (e.a === id) {
          kind = 'parentOf';
          text = `${e.adopted ? 'Adoptive parent' : 'Parent'} of ${other}${secret}`;
        } else {
          kind = 'childOf';
          text = `${e.adopted ? 'Adopted by' : 'Child of'} ${other}${secret}`;
        }
        break;
      case 'sibling':
        kind = 'sibling';
        text = `Sibling of ${other}`;
        break;
      default:
        kind = 'custom';
        text = `Linked to ${other}`;
    }
    // The game can't unmake a couple it has: taking one off plans its end.
    const couple = (e.type === 'marriage' || e.type === 'romance') && !planned && !e.ending;
    const removal: LinkRemoval = !couple ? 'remove' : e.type === 'marriage' ? 'divorce' : 'breakup';
    rows.push({ id: e.id, text, other, planned, removal, kind });
  }
  return rows
    .sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) || a.other.localeCompare(b.other))
    .map(({ kind: _kind, ...row }) => row);
}

/** The row's button: "Remove", "Plan divorce" or "Plan breakup". */
export function removalLabel(r: LinkRemoval): string {
  return r === 'divorce' ? 'Plan divorce' : r === 'breakup' ? 'Plan breakup' : 'Remove';
}
