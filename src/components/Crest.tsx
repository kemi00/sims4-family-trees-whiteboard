import { crestPicture } from '../lib/crests.ts';
import type { DynastyStanding } from '../types/whiteboard.ts';

/**
 * A dynasty's crest as the game draws it: its shield, with its emblem on
 * top. Nothing for a dynasty the save gives no crest, or one whose pictures
 * the board doesn't have (a pack newer than the board's pictures).
 */
export function Crest({ crest, size, title }: { crest: DynastyStanding['crest']; size: number; title?: string }) {
  const shield = crestPicture(crest?.shield);
  const emblem = crestPicture(crest?.emblem);
  if (!shield && !emblem) return null;
  return (
    <span className="crest" style={{ width: size, height: size }} role="img" aria-label={title ?? 'Dynasty crest'} title={title}>
      {shield && <img src={shield} alt="" width={size} height={size} draggable={false} />}
      {/* The emblem pictures carry their own margin: drawn the shield's size, they sit as in the game. */}
      {emblem && <img src={emblem} alt="" width={size} height={size} draggable={false} />}
    </span>
  );
}
