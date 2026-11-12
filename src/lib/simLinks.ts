import type { Edge } from '../types/whiteboard.ts';
import { edgeSourceOf, endedByDeath } from './utils.ts';

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
  /** A couple a death ended: kept as their history, faded, with nothing to plan. */
  ended?: true;
};

/** Couples first, then parents, children, siblings and other links. */
const ORDER = ['marriage', 'romance', 'divorced', 'childOf', 'parentOf', 'sibling', 'custom'] as const;

/**
 * A sim's links, one row each, as the editor lists them so one can be taken
 * off without finding its line on the board (on a phone, a thin target).
 * Within a kind, A to Z by the other sim's name.
 */
export function simLinkRows(
  id: string,
  edges: readonly Edge[],
  nameOf: (id: string) => string,
  /** Who has died: a couple one of them died in is over, so there is no divorce to plan. */
  isDead: (id: string) => boolean = () => false,
): SimLinkRow[] {
  const rows: (SimLinkRow & { kind: (typeof ORDER)[number] })[] = [];
  for (const e of edges) {
    if (e.a !== id && e.b !== id) continue;
    const otherId = e.a === id ? e.b : e.a;
    const other = nameOf(otherId);
    const planned = edgeSourceOf(e) === 'planned';
    const secret = e.secret ? ', secret' : '';
    // Widowed: "who died" when the other one did, "until death" on the one who died.
    const ended = !planned && endedByDeath(e, isDead);
    const death = ended ? (isDead(otherId) ? ', who died' : ' until death') : '';
    let kind: (typeof ORDER)[number];
    let text: string;
    switch (e.type) {
      case 'marriage':
        kind = 'marriage';
        text = `Married to ${other}${death || (e.ending ? ', divorce planned' : '')}`;
        break;
      case 'romance':
        kind = 'romance';
        text = `In a romance with ${other}${secret}${death || (e.ending ? ', breakup planned' : '')}`;
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
    // One a death ended has no end left to plan: it comes off like any link.
    const couple = (e.type === 'marriage' || e.type === 'romance') && !planned && !e.ending && !ended;
    const removal: LinkRemoval = !couple ? 'remove' : e.type === 'marriage' ? 'divorce' : 'breakup';
    rows.push({ id: e.id, text, other, planned, removal, kind, ...(ended ? { ended: true as const } : {}) });
  }
  return rows
    .sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) || a.other.localeCompare(b.other))
    .map(({ kind: _kind, ...row }) => row);
}

/** The row's button: "Remove", "Plan divorce" or "Plan breakup". */
export function removalLabel(r: LinkRemoval): string {
  return r === 'divorce' ? 'Plan divorce' : r === 'breakup' ? 'Plan breakup' : 'Remove';
}
