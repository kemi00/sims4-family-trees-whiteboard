import { Star } from '../icons.ts';
import { prestigeLevel, standingText } from '../lib/prestige.ts';
import type { DynastyStanding } from '../types/whiteboard.ts';

/**
 * A dynasty's Prestige Level as the game draws it: ten stars on a bar, gold
 * up to its level, and the level in words. The points, perk points and
 * perks are in the tip. How far it is into a level isn't shown: the game's
 * own percentage didn't match the level table for the Thebes (0% of
 * Level 9 in the game, 26% by the table), so the board only says what it
 * knows.
 */
export function PrestigeBar({ standing }: { standing: DynastyStanding & { prestige: number } }) {
  const level = prestigeLevel(standing.prestige);
  return (
    <span className="prestige" title={standingText(standing)}>
      <span className="prestige__stars" role="img" aria-label={`Prestige Level ${level} of 10`}>
        {Array.from({ length: 10 }, (_, i) => (
          <Star key={i} weight="fill" aria-hidden="true" className={i < level ? 'prestige__star prestige__star--on' : 'prestige__star'} />
        ))}
      </span>
      <span className="prestige__label" aria-hidden="true">
        Prestige Level {level}
      </span>
    </span>
  );
}
