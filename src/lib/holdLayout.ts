import type { SimNode } from '../types/whiteboard.ts';

type Spot = { x: number; y: number };

/**
 * Whether a change is about this card: it is new, or the change set where
 * it goes (its own offset) or moved it to another household or world.
 */
export function cardTouched(before: SimNode | undefined, after: SimNode): boolean {
  return (
    !before ||
    (before.ox ?? 0) !== (after.ox ?? 0) ||
    (before.oy ?? 0) !== (after.oy ?? 0) ||
    before.gid !== after.gid ||
    (before.world || '') !== (after.world || '')
  );
}

/**
 * The board's promise that a change moves only the cards it is about.
 *
 * A card's place on screen is where the automatic packing puts it plus its
 * own offset, and the packing follows links, names, ages and who lives
 * where. So a new marriage, a renamed sim or a sim leaving a household
 * repacks its world, and through the world's size the worlds around it.
 * Every card the change did not touch, and that the repacking moved anyway,
 * gets its offset back to where it was on screen: the board never reflows a
 * card the person did not touch.
 *
 * `beforeAt`/`afterAt` give a card's top-left on screen before and after the
 * change. Returns `after` itself, and `held` 0, when no card needs holding.
 */
export function holdUntouchedCards(
  before: readonly SimNode[],
  beforeAt: (id: string) => Spot | undefined,
  after: SimNode[],
  afterAt: (id: string) => Spot | undefined,
): { core: SimNode[]; held: number } {
  const was = new Map(before.map((n) => [n.id, n]));
  let held = 0;
  const core = after.map((n) => {
    const old = was.get(n.id);
    if (cardTouched(old, n)) return n;
    const then = beforeAt(n.id);
    const now = afterAt(n.id);
    if (!then || !now) return n;
    const dx = then.x - now.x;
    const dy = then.y - now.y;
    if (dx === 0 && dy === 0) return n;
    held++;
    return { ...n, ox: (n.ox ?? 0) + dx, oy: (n.oy ?? 0) + dy };
  });
  return held ? { core, held } : { core: after, held: 0 };
}
