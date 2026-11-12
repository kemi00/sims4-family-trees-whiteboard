import { DECEASED_STATE } from './constants.ts';
import { isUnhousedGid } from './unhoused.ts';
import { isPet } from './utils.ts';
import type { Edge, SimNode } from '../types/whiteboard.ts';

/**
 * The key teaches the board's grammar (family lines, the family shapes,
 * married, tags) always, and the marks below only when the board shows one:
 * a board without pets has no pet lane to explain. "Show every mark" in the
 * key brings the rest back.
 */
export type KeyMark =
  | 'secretParent'
  | 'romance'
  | 'secretLovers'
  | 'divorced'
  | 'dynastyRoles'
  | 'deceased'
  | 'fromSave'
  | 'pets'
  | 'unhoused'
  | 'freeLots'
  | 'added'
  | 'plannedRole'
  | 'offPlan'
  | 'closing'
  | 'otherLink';

export const ALL_KEY_MARKS: ReadonlySet<KeyMark> = new Set<KeyMark>([
  'secretParent',
  'romance',
  'secretLovers',
  'divorced',
  'dynastyRoles',
  'deceased',
  'fromSave',
  'pets',
  'unhoused',
  'freeLots',
  'added',
  'plannedRole',
  'offPlan',
  'closing',
  'otherLink',
]);

/** The marks the board shows now: its cards and links as drawn (filters applied). */
export function keyMarks(board: {
  nodes: readonly SimNode[];
  edges: readonly Edge[];
  /** A Free lots box is on the board. */
  freeLots: boolean;
  /** Something is flagged off plan. */
  offPlan: boolean;
  /** A household tag has a closing badge. */
  closing: boolean;
}): Set<KeyMark> {
  const out = new Set<KeyMark>();
  for (const e of board.edges) {
    if (e.type === 'parent' && e.secret) out.add('secretParent');
    else if (e.type === 'romance') out.add(e.secret ? 'secretLovers' : 'romance');
    else if (e.type === 'divorced') out.add('divorced');
    else if (e.type === 'custom') out.add('otherLink');
  }
  for (const n of board.nodes) {
    if (n.added) out.add('added');
    else if (n.fromSave) out.add('fromSave');
    if (n.dynastyRole) out.add(n.dynastyPlan === 'member' || n.dynastyPlan === 'role' ? 'plannedRole' : 'dynastyRoles');
    if (n.state === DECEASED_STATE) out.add('deceased');
    if (isPet(n)) out.add('pets');
    if (isUnhousedGid(n.gid)) out.add('unhoused');
  }
  if (board.freeLots) out.add('freeLots');
  if (board.offPlan) out.add('offPlan');
  if (board.closing) out.add('closing');
  return out;
}
