import type { Edge } from '../types/whiteboard.ts';
import { edgeSourceOf, endedByPassing } from './utils.ts';
import { pastUnionIds } from './coupleStory.ts';

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
  /** A couple a passing ended: kept as their history, faded, with nothing to plan. */
  ended?: true;
  /**
   * A parent link that can be the declared parent's (Edge.declared): its
   * child has a secret parent, or it is marked already. `on` when it is.
   */
  declare?: { on: boolean };
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
  /** Who has passed away: a couple with a partner who passed is over, so there is no divorce to plan. */
  isDead: (id: string) => boolean = () => false,
  /** A sim's first name, for "until Imani passed away": a name, never a guessed pronoun. */
  firstOf: (id: string) => string = nameOf,
): SimLinkRow[] {
  const rows: (SimLinkRow & { kind: (typeof ORDER)[number] })[] = [];
  // A couple's earlier links, which a later step of their story replaced,
  // are their history: the link's label and the Log tell it.
  const past = pastUnionIds(edges);
  for (const e of edges) {
    if (e.a !== id && e.b !== id) continue;
    if (past.has(e.id)) continue;
    const otherId = e.a === id ? e.b : e.a;
    const other = nameOf(otherId);
    const planned = edgeSourceOf(e) === 'planned';
    const secret = e.secret ? ', secret' : '';
    // Gently, with names: "who passed away" when the other one passed,
    // "until Imani passed away" on the one who did, "until both passed away".
    const ended = !planned && endedByPassing(e, isDead);
    const death = !ended
      ? ''
      : isDead(id) && isDead(otherId)
        ? ' until both passed away'
        : isDead(otherId)
          ? ', who passed away'
          : ` until ${firstOf(id)} passed away`;
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
          text = `${e.adopted ? 'Adoptive parent' : e.declared ? 'Declared parent' : 'Parent'} of ${other}${secret}`;
        } else {
          kind = 'childOf';
          text = `${e.adopted ? 'Adopted by' : 'Child of'} ${other}${secret}${e.declared ? ', declared parent' : ''}`;
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
    // One a passing ended has no end left to plan: it comes off like any link.
    const couple = (e.type === 'marriage' || e.type === 'romance') && !planned && !e.ending && !ended;
    const removal: LinkRemoval = !couple ? 'remove' : e.type === 'marriage' ? 'divorce' : 'breakup';
    // A secret child with two listed parents: one carried them, the other may be
    // the parent the game declared at birth, not by blood. One listed parent carried them.
    const listed = (child: string) => edges.filter((x) => x.type === 'parent' && x.b === child && !x.secret && !x.adopted).length;
    const declarable =
      e.type === 'parent' &&
      !e.secret &&
      !e.adopted &&
      (!!e.declared || (edges.some((x) => x.type === 'parent' && x.b === e.b && x.secret) && listed(e.b) >= 2));
    rows.push({
      id: e.id,
      text,
      other,
      planned,
      removal,
      kind,
      ...(ended ? { ended: true as const } : {}),
      ...(declarable ? { declare: { on: !!e.declared } } : {}),
    });
  }
  return rows
    .sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) || a.other.localeCompare(b.other))
    .map(({ kind: _kind, ...row }) => row);
}

/** The row's button: "Remove", "Plan divorce" or "Plan breakup". */
export function removalLabel(r: LinkRemoval): string {
  return r === 'divorce' ? 'Plan divorce' : r === 'breakup' ? 'Plan breakup' : 'Remove';
}
