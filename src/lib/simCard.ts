import { DECEASED_STATE, DYNASTY_ROLES } from './constants.ts';
import { dynastyKey, dynastyPhrase, type DynastyName } from './generations.ts';
import { gapText, type PartnerCandidate } from './partners.ts';
import { cardName } from './plan.ts';
import type { SimNode } from '../types/whiteboard.ts';

export type SimCardOptions = {
  /** Every dynasty's name on the board (dynastyNames), for "Watson dynasty". */
  dynasties: Map<string, DynastyName>;
  /** Set for a suggested partner: how close in life they are. */
  candidate?: PartnerCandidate;
  /**
   * What they are, first on the grey line, in place of the age gap or the
   * life stage: "Elder", "Heir · Young Adult", "Parent · Elder".
   */
  what?: string;
  /** Add the world after the household: a list that isn't grouped by world. */
  world?: boolean;
  /** Leave the dynasty off: a dynasty's own list names it in its title. */
  noDynasty?: boolean;
  /** A blood relative: found by name, never suggested. */
  related?: boolean;
  married?: boolean;
  /** More to weigh, after the rest (the adoption list's "has 2 parents"). */
  extra?: string[];
};

/** A sim card's three lines. */
export type SimCardLines = {
  /** Their dynasty role's mark (👑 ⚜️ 🥀), or nothing. */
  mark: string;
  name: string;
  /** Grey: what they are, then where they live. */
  meta: string;
  /** Amber: what to weigh. Empty for none. */
  flags: string[];
};

/**
 * One sim in any list on the board, the same everywhere: their dynasty
 * role's mark and name; what they are and where they live, in grey; then
 * what to weigh, in amber (related, married or in a romance, not aging now,
 * their dynasty). A sim who passed away says so on the grey line.
 */
export function simCardLines(p: SimNode, o: SimCardOptions): SimCardLines {
  const c = o.candidate;
  const passed = p.state === DECEASED_STATE;
  // A partner's age is weighed from where they are in life; anyone else's
  // only when the save says so for their life stage now.
  const frozen = c ? !!c.frozen : !passed && !!p.life?.frozen && p.life.stage === p.age;
  const meta = [
    o.what ?? (c ? gapText(c) : p.age),
    passed ? 'passed away' : '',
    p.hh || 'no household',
    o.world ? p.world : '',
  ];
  const flags = [
    o.related ? 'related' : '',
    o.married ? 'married' : c?.taken ? 'in a romance' : '',
    frozen ? 'not aging now' : '',
    p.dynasty && !o.noDynasty ? dynastyPhrase(o.dynasties.get(dynastyKey(p) ?? '') ?? { name: p.dynasty }) : '',
    ...(o.extra ?? []),
  ];
  return {
    mark: p.dynastyRole ? DYNASTY_ROLES[p.dynastyRole].mark : '',
    name: cardName(p),
    meta: meta.filter(Boolean).join(' · '),
    flags: flags.filter(Boolean),
  };
}

/** A card's button class: a sim who passed away fades, as on the board; `on` is a menu's keyboard pick. */
export function simCardClass(p: SimNode, on = false): string {
  return ['simcard', p.state === DECEASED_STATE ? 'simcard--passed' : '', on ? 'simcard--on' : ''].filter(Boolean).join(' ');
}
