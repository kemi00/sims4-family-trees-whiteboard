import nobleTitlesData from '../data/nobleTitles.json' with { type: 'json' };
import { NON_BINARY } from './constants.ts';
import type { SimNode, SimTitle } from '../types/whiteboard.ts';

/** The Noble career (Royalty & Legacy): its level is the sim's noble rank. */
export const NOBLE_TRACK = '463273';

type RankWords = { rank: number; title: string[]; child: string[] };
const RANKS: readonly RankWords[] = nobleTitlesData.ranks;

/** The game's highest noble rank (King, Queen or Monarch). */
export const TOP_NOBLE_RANK = RANKS.length;

/** Masculine, feminine, neutral: the game's three forms of each title. */
function formOf(gender: string | undefined): 0 | 1 | 2 {
  if (gender === 'Male') return 0;
  if (gender === 'Female') return 1;
  return 2;
}

/**
 * A noble rank's title for a sim of this gender, as the game words it: the
 * career's ("Grand Duchess") or the one a noble's child uses ("Lady";
 * "Princess" for a monarch's child). Non-binary sims take the game's neutral
 * form ("Grand Duchum", "Princem").
 */
export function nobleTitle(rank: number, gender: string | undefined, child = false): string | undefined {
  const r = RANKS.find((x) => x.rank === rank);
  if (!r) return undefined;
  const g = gender === NON_BINARY ? 2 : formOf(gender);
  return (child ? r.child : r.title)[g];
}

/** A sim's noble rank by their Noble career, from the save's careers. */
export function careerNobleRank(about: SimNode['about']): number | undefined {
  const levels = (about?.jobs ?? []).filter((j) => j.track === NOBLE_TRACK).map((j) => j.level);
  return levels.length ? Math.max(...levels) : undefined;
}

/**
 * The title the game gives a sim, as Royalty & Legacy works it out: their
 * own Noble career's, one held by marriage to a noble (the same rank, in
 * their own form), or the title a noble's children use. The highest rank
 * wins; at the same rank, their own career's, then marriage, then birth.
 */
export function gameNobleTitle(opts: {
  gender: string | undefined;
  /** Their own Noble career level. */
  career?: number;
  /** Spouses and parents with a Noble career: their card and rank. */
  spouses: readonly { id: string; rank: number }[];
  parents: readonly { id: string; rank: number }[];
}): SimTitle | undefined {
  const options: SimTitle[] = [];
  const add = (rank: number, game: 'career' | 'marriage' | 'birth', via?: string) => {
    const title = nobleTitle(rank, opts.gender, game === 'birth');
    if (title) options.push({ title, rank, game, ...(via ? { via } : {}) });
  };
  if (opts.career) add(opts.career, 'career');
  for (const s of opts.spouses) add(s.rank, 'marriage', s.id);
  for (const p of opts.parents) add(p.rank, 'birth', p.id);
  const order = { career: 0, marriage: 1, birth: 2, tree: 3 } as const;
  options.sort((a, b) => (b.rank ?? 0) - (a.rank ?? 0) || order[a.game!] - order[b.game!]);
  return options[0];
}

/** Whether two titles are the same title: words, realm and rank. */
function sameTitle(a: SimTitle, b: SimTitle): boolean {
  return a.title === b.title && (a.realm ?? '') === (b.realm ?? '') && (a.rank ?? 0) === (b.rank ?? 0);
}

/**
 * A card's titles once the save has said what the game gives them now. The
 * game's current title stays as it is when unchanged (how it came may
 * move: a promotion over a title by marriage), and ends on `today` when the
 * game gives another or none; the new one begins `today`. `today` is
 * undefined on a board's first upload: when it began is unknown. Titles of
 * your own stay as they are.
 */
export function withGameTitle(titles: readonly SimTitle[] | undefined, next: SimTitle | undefined, today?: number): SimTitle[] | undefined {
  const list = [...(titles ?? [])];
  const i = list.findIndex((t) => t.game && t.game !== 'tree' && t.to === undefined);
  const cur = i >= 0 ? list[i] : undefined;
  if (cur && next && sameTitle(cur, next)) {
    const kept: SimTitle = { ...cur, game: next.game! };
    if (next.via) kept.via = next.via;
    else delete kept.via;
    list[i] = kept;
    return list;
  }
  if (cur) {
    if (today === undefined) list.splice(i, 1);
    else list[i] = { ...cur, to: today };
  }
  if (next) list.push({ ...next, ...(today !== undefined && cur ? { from: today } : {}) });
  return list.length ? list : undefined;
}

/** A family-tree ancestor's title, kept as the save has it (it never changes). */
export function withTreeTitle(titles: readonly SimTitle[] | undefined, tree: SimTitle | undefined): SimTitle[] | undefined {
  const own = (titles ?? []).filter((t) => t.game !== 'tree');
  const list = tree ? [...own, { ...tree, game: 'tree' as const }] : own;
  return list.length ? list : undefined;
}

/** The titles a sim holds now (no end day), highest rank first; unranked after ranked, newest first. */
export function currentTitles(n: Pick<SimNode, 'titles'>): SimTitle[] {
  return (n.titles ?? [])
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => t.to === undefined)
    .sort((a, b) => (b.t.rank ?? -1) - (a.t.rank ?? -1) || b.i - a.i)
    .map(({ t }) => t);
}

/** Their highest title now: the one their card shows. */
export function topTitle(n: Pick<SimNode, 'titles'>): SimTitle | undefined {
  return currentTitles(n)[0];
}

/** "Grand Duke of Ondarion", or "Grand Duke". */
export function titleText(t: SimTitle): string {
  return t.realm ? `${t.title} of ${t.realm}` : t.title;
}

/**
 * Where a title comes from, in a few words: "Noble career, rank 9", "By
 * marriage to Tybalt Capp", "As the child of Tybalt Capp", "In the family
 * tree, rank 10", or "Rank 3" for one of your own.
 */
export function titleSource(t: SimTitle, nameOf: (id: string) => string | undefined): string {
  const rank = t.rank !== undefined ? `rank ${t.rank}` : '';
  const via = t.via ? nameOf(t.via) : undefined;
  switch (t.game) {
    case 'career':
      return `Noble career, ${rank}`;
    case 'marriage':
      return via ? `By marriage to ${via}, ${rank}` : `By marriage, ${rank}`;
    case 'birth':
      return via ? `As the child of ${via}, ${rank}` : `As a noble’s child, ${rank}`;
    case 'tree':
      return rank ? `In the family tree, ${rank}` : 'In the family tree';
    default:
      return rank ? `Rank ${t.rank}` : '';
  }
}

/** A sim's highest rank now, for the partner finder: undefined for none. */
export function rankOf(n: Pick<SimNode, 'titles'>): number | undefined {
  return currentTitles(n).find((t) => t.rank !== undefined)?.rank;
}
