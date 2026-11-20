import { AGES_H, DECEASED_STATE, GENDERS, HI_DESCENDANTS, HI_DYNASTY, HI_MARRIED, HI_NO_CHILDREN, HI_NO_SIBLINGS, HI_NOT_BORN, HI_ROMANCE, HI_SIBLINGS, hiDynastyChip, householdChipSize, SPECIES_H, type HiDynastyRole } from './constants.ts';
import { isHighlightMatch, type HighlightSets } from './utils.ts';
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
 * chips add up; gender, family chips and dynasty roles narrow them,
 * as in isHighlightMatch.
 */
export function highlightPhrase(hi: ReadonlySet<string>, hiSingle: boolean, n: number): string {
  const one = n === 1;
  const word = one ? 'or' : 'and';
  const pick = ([singular, plural]: [string, string]) => (one ? singular : plural);
  const gender = GENDERS.filter((g) => hi.has(g))
    .map((g) => g.toLowerCase())
    .join(' or ');
  const ages = [
    ...(hi.has(HI_NOT_BORN) ? [pick(['baby not born yet', 'babies not born yet'])] : []),
    ...AGES_H.filter((a) => hi.has(a)).map((a) => pick(AGE_NOUN[a]!)),
  ];
  const pets = SPECIES_H.filter((s) => hi.has(s)).map((s) => pick(SPECIES_NOUN[s]!));
  const roles = HI_DYNASTY.filter((r) => hi.has(hiDynastyChip(r))).map((r) => pick(ROLE_NOUN[r]));
  const groups: string[] = [];
  if (ages.length || !pets.length) {
    const noun = ages.length ? listed(ages, word) : one ? 'sim' : 'sims';
    // Partners: one pick reads before the noun ("single teens"), more after it.
    const partners = [hiSingle ? 'single' : '', hi.has(HI_ROMANCE) ? 'in a romance' : '', hi.has(HI_MARRIED) ? 'married' : ''].filter(Boolean);
    const allPartners = partners.length === 3;
    const before = partners.length === 1 && partners[0] !== 'in a romance' ? partners[0]! : '';
    const partnerText = allPartners || before || !partners.length ? '' : ` ${one ? 'who is' : 'who are'} ${listed(partners, 'or')}`;
    // A pair with both sides picked is everyone: said only when one side is.
    const side = (yes: string, no: string, word: string): { has?: string; not?: string } | null =>
      hi.has(yes) === hi.has(no) ? null : hi.has(yes) ? { has: word } : { not: word };
    const sides = [side(HI_DESCENDANTS, HI_NO_CHILDREN, 'descendants'), side(HI_SIBLINGS, HI_NO_SIBLINGS, 'siblings')];
    const has = sides.flatMap((x) => (x?.has ? [x.has] : []));
    const not = sides.flatMap((x) => (x?.not ? [x.not] : []));
    const withText = [has.length ? listed(has, 'and') : '', not.length ? `no ${listed(not, 'or')}` : ''].filter(Boolean);
    const familyText = withText.length ? ` with ${withText.join(' and ')}` : '';
    const sizes = [...hi].map(householdChipSize).filter((n): n is number => n !== null).sort((a, b) => a - b);
    const homeText = sizes.length
      ? ` in ${one ? 'a ' : ''}${listed(sizes.map((n) => `${n}-sim`), 'or')} ${one ? 'household' : 'households'}`
      : '';
    const role = roles.length ? ` who ${one ? 'is a' : 'are'} dynasty ${listed(roles, word)}` : '';
    groups.push([before, gender, noun].filter(Boolean).join(' ') + partnerText + familyText + homeText + role);
  }
  if (pets.length) groups.push([gender, listed(pets, word)].filter(Boolean).join(' '));
  return groups.join(', plus ');
}

export type HighlightSummary = {
  /** Living shown cards the highlight picks out. */
  count: number;
  /** Living cards shown at all (games and play allowing). */
  living: number;
  phrase: string;
};

/**
 * How many shown cards the highlight picks out, and what they are. The
 * deceased are left out of both counts, since the chips never pick them.
 */
export function highlightSummary(
  opts: HighlightSets & {
    nodes: SimNode[];
    shown: (n: SimNode) => boolean;
    hi: ReadonlySet<string>;
    hiSingle: boolean;
  },
): HighlightSummary {
  let count = 0;
  let living = 0;
  const hi = opts.hi as Set<string>;
  for (const n of opts.nodes) {
    if (!opts.shown(n) || n.state === DECEASED_STATE) continue;
    living += 1;
    if (isHighlightMatch(n, hi, opts.hiSingle, opts)) count += 1;
  }
  return { count, living, phrase: highlightPhrase(opts.hi, opts.hiSingle, count) };
}
