import { AGES_H, DECEASED_STATE, GENDERS, HI_DYNASTY, HI_NO_CHILDREN, hiDynastyChip, SPECIES_H, type HiDynastyRole } from './constants.ts';
import { isHighlightMatch } from './utils.ts';
import type { SimNode } from '../types/whiteboard.ts';

const AGE_NOUN: Record<string, [string, string]> = {
  Infant: ['infant', 'infants'],
  Toddler: ['toddler', 'toddlers'],
  Child: ['child', 'children'],
  Teen: ['teen', 'teens'],
  'Young Adult': ['young adult', 'young adults'],
  Adult: ['adult', 'adults'],
  Elder: ['elder', 'elders'],
};

const ROLE_NOUN: Record<HiDynastyRole, [string, string]> = {
  head: ['head', 'heads'],
  heir: ['heir', 'heirs'],
  member: ['member with no role', 'members with no role'],
  outcast: ['outcast', 'outcasts'],
};

const SPECIES_NOUN: Record<string, [string, string]> = {
  Cat: ['cat', 'cats'],
  Dog: ['dog', 'dogs'],
  Horse: ['horse', 'horses'],
};

/** Any highlight chip is on. */
export function highlightActive(hi: ReadonlySet<string>, hiSingle: boolean): boolean {
  return hi.size > 0 || hiSingle;
}

/** "a", "a and b", "a, b and c" (or "or" for one of them). */
function listed(items: string[], word: 'and' | 'or'): string {
  if (items.length < 2) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} ${word} ${items[items.length - 1]}`;
}

/**
 * What the highlight chips pick, in words, for `n` matches: "female
 * infants", "single male elders and teens", "female cats", "infants, plus
 * cats", "single female young adults with no children who are dynasty
 * members with no role". Singular for one ("1 female infant"). Age and pet
 * chips add up; gender, Single, No children and dynasty roles narrow them,
 * as in isHighlightMatch.
 */
export function highlightPhrase(hi: ReadonlySet<string>, hiSingle: boolean, n: number): string {
  const one = n === 1;
  const word = one ? 'or' : 'and';
  const pick = ([singular, plural]: [string, string]) => (one ? singular : plural);
  const gender = GENDERS.filter((g) => hi.has(g))
    .map((g) => g.toLowerCase())
    .join(' or ');
  const ages = AGES_H.filter((a) => hi.has(a)).map((a) => pick(AGE_NOUN[a]!));
  const pets = SPECIES_H.filter((s) => hi.has(s)).map((s) => pick(SPECIES_NOUN[s]!));
  const roles = HI_DYNASTY.filter((r) => hi.has(hiDynastyChip(r))).map((r) => pick(ROLE_NOUN[r]));
  const groups: string[] = [];
  if (ages.length || !pets.length) {
    const noun = ages.length ? listed(ages, word) : one ? 'sim' : 'sims';
    const kids = hi.has(HI_NO_CHILDREN) ? ' with no children' : '';
    const role = roles.length ? ` who ${one ? 'is a' : 'are'} dynasty ${listed(roles, word)}` : '';
    groups.push([hiSingle ? 'single' : '', gender, noun].filter(Boolean).join(' ') + kids + role);
  }
  if (pets.length) groups.push([gender, listed(pets, word)].filter(Boolean).join(' '));
  return groups.join(', plus ');
}

export type HighlightSummary = {
  /** Shown cards the highlight picks out. */
  count: number;
  /** Of those, sims marked Deceased. */
  deceased: number;
  /** Cards shown at all (games, play and Hide deceased allowing). */
  shown: number;
  phrase: string;
};

/** How many shown cards the highlight picks out, and what they are. */
export function highlightSummary(opts: {
  nodes: SimNode[];
  shown: (n: SimNode) => boolean;
  hi: ReadonlySet<string>;
  hiSingle: boolean;
  partnered: ReadonlySet<string>;
  /** Sims with a child: No children leaves them out. */
  parents?: ReadonlySet<string>;
}): HighlightSummary {
  let count = 0;
  let deceased = 0;
  let shown = 0;
  const hi = opts.hi as Set<string>;
  for (const n of opts.nodes) {
    if (!opts.shown(n)) continue;
    shown += 1;
    if (!isHighlightMatch(n, hi, opts.hiSingle, opts.partnered, opts.parents)) continue;
    count += 1;
    if (n.state === DECEASED_STATE) deceased += 1;
  }
  return { count, deceased, shown, phrase: highlightPhrase(opts.hi, opts.hiSingle, count) };
}
