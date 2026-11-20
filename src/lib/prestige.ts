import type { DynastyStanding } from '../types/whiteboard.ts';

/**
 * Where each Prestige Level starts, in prestige points: Royalty & Legacy's
 * levels 0 to 10 (rankedstatistic_Dynasty_prestige, as its cheats set
 * them). Checked against saves on 2026-11-20: a dynasty with all 31 perks
 * at 32,239 points, one set to Level 7 at exactly 16,100, and the Thebes at
 * 22,405 with eight stars in the game.
 */
export const PRESTIGE_LEVEL_STARTS = [0, 100, 450, 1350, 3300, 6700, 11100, 16100, 21100, 26100, 31100] as const;

/**
 * How far into its level a dynasty is, 0 to 1, toward the next: null at
 * Level 10. The game shows it rounded down: the Capps' 17,383 points are
 * 25.7% of the way from Level 7 to 8, and the game said "25% of Prestige
 * Level 8".
 */
export function prestigeProgress(points: number): number | null {
  const level = prestigeLevel(points);
  const from = PRESTIGE_LEVEL_STARTS[level]!;
  const to = PRESTIGE_LEVEL_STARTS[level + 1];
  return to === undefined ? null : Math.min(1, Math.max(0, (points - from) / (to - from)));
}

/** "25% of Prestige Level 8", as the game says it; null at Level 10. */
export function prestigeProgressText(points: number): string | null {
  const p = prestigeProgress(points);
  return p === null ? null : `${Math.floor(p * 100)}% of Prestige Level ${prestigeLevel(points) + 1}`;
}

/** The Prestige Level, 0 to 10, the game shows for these prestige points. */
export function prestigeLevel(points: number): number {
  let level = 0;
  PRESTIGE_LEVEL_STARTS.forEach((start, i) => {
    if (points >= start) level = i;
  });
  return level;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

/** "Prestige Level 8": a dynasty's standing in the game's words, or null when the save didn't say. */
export function prestigeLevelText(s: DynastyStanding | undefined): string | null {
  return s?.prestige === undefined ? null : `Prestige Level ${prestigeLevel(s.prestige)}`;
}

/**
 * Everything the save says about a dynasty's standing, for a tip: "Prestige
 * Level 8 (22,405 prestige) · 375 perk points to spend · 11 perks active".
 */
export function standingText(s: DynastyStanding | undefined): string {
  if (!s) return '';
  return [
    s.prestige !== undefined
      ? `Prestige Level ${prestigeLevel(s.prestige)} (${Math.floor(s.prestige).toLocaleString('en-US')} prestige)${
          prestigeProgressText(s.prestige) ? `, ${prestigeProgressText(s.prestige)}` : ''
        }`
      : '',
    s.perkPoints !== undefined ? `${plural(s.perkPoints, 'perk point')} to spend` : '',
    s.perks !== undefined ? `${plural(s.perks, 'perk')} active` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}
