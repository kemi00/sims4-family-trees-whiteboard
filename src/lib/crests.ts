import gameCrests from '../data/gameCrests.json' with { type: 'json' };
import type { DynastyStanding } from '../types/whiteboard.ts';

const KNOWN = new Set<string>(gameCrests.ids);

/** The picture of a crest part (shield or emblem), when the board has it (scripts/build-crests.ts). */
export function crestPicture(id: string | undefined): string | undefined {
  if (!id || !KNOWN.has(id)) return undefined;
  const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
  return `${base}game-crests/${id}.webp`;
}

/** Whether the board can draw this dynasty's crest from the save. */
export function hasCrest(crest: DynastyStanding['crest']): boolean {
  return !!crestPicture(crest?.shield) || !!crestPicture(crest?.emblem);
}
