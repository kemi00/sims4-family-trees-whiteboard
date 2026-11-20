import type { CSSProperties } from 'react';
import { Star } from '../icons.ts';
import { prestigeLevel, prestigeProgress, prestigeProgressText, standingText } from '../lib/prestige.ts';
import type { DynastyStanding } from '../types/whiteboard.ts';

/**
 * A dynasty's Prestige Level as the game draws it: ten stars on a dark bar,
 * filled blue up to its level and on into the next as far as it has come,
 * the stars it has reached gold. Beside it, the level and how far into the
 * next, in the game's words: "25% of Prestige Level 8". The points, perk
 * points and perks are in the tip.
 */
export function PrestigeBar({ standing }: { standing: DynastyStanding & { prestige: number } }) {
  const level = prestigeLevel(standing.prestige);
  const progress = prestigeProgress(standing.prestige);
  const next = prestigeProgressText(standing.prestige);
  const fill = Math.min(10, level + (progress ?? 0)) / 10;
  return (
    <span className="prestige" title={standingText(standing)}>
      <span
        className="prestige__stars"
        role="img"
        aria-label={`Prestige Level ${level} of 10${next ? `, ${next}` : ''}`}
        style={{ '--fill': fill } as CSSProperties}
      >
        <span className="prestige__fill" aria-hidden="true" />
        {Array.from({ length: 10 }, (_, i) => (
          <Star key={i} weight="fill" aria-hidden="true" className={i < level ? 'prestige__star prestige__star--on' : 'prestige__star'} />
        ))}
      </span>
      <span className="prestige__label" aria-hidden="true">
        Level {level}
        {next && <span className="prestige__next"> · {next}</span>}
      </span>
    </span>
  );
}
