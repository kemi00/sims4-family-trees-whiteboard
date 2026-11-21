/**
 * Drawers on phones and tablets (bottom sheets) have three heights: a bar
 * at the bottom (only their head shows), half the screen (where they
 * open), and full (under the top bar). They fold to the bar instead of
 * going away: touching the board, dragging down, or picking something in
 * them. Only ✕ (or a highlight's own end: Show everyone, Done, Clear)
 * closes one.
 */
export type Detent = 'bar' | 'half' | 'full';

const ORDER: readonly Detent[] = ['bar', 'half', 'full'];

/** Where a drawer opens: half the screen, so the board stays in view. */
export const HALF_SHARE = 0.52;

/** The open heights, as CSS: half the screen, or up to just under the top bar. */
export const HALF_CSS = `${HALF_SHARE * 100}dvh`;
export const FULL_CSS = 'calc(100dvh - var(--bar-h) - env(safe-area-inset-top, 0px) - 8px)';

/** Fold every drawer to its bar: the board is what you want to see now. */
export const FOLD_EVENT = 'sheets:fold';

export function foldSheets(): void {
  window.dispatchEvent(new Event(FOLD_EVENT));
}

/**
 * Presses here leave an open drawer as it is: the top bar (its buttons open
 * and swap drawers themselves), a dialog over everything, a popover, search,
 * and other drawers. Anywhere else is the board: the drawer folds.
 */
export const NOT_THE_BOARD = '.appbar, [aria-modal="true"]:not([data-detent]), .pop, .find, [data-detent]';

/** A press on one of these in a drawer's head is theirs, never a drag. */
export const HEAD_CONTROLS = 'button:not([data-sheet-grab]), a, input, select, textarea, label, [role="button"], [role="radio"], [role="tab"], [contenteditable="true"]';

/** A flick this fast (px per ms) goes one height on in its direction. */
const FLICK = 0.45;

/**
 * Where a drag lets go: a flick goes on to the next height in its direction
 * (down from full to half, from half to the bar); a slow drag settles on the
 * nearest height. `visible`: how much of the drawer shows; `velocity`:
 * positive downward.
 */
export function releaseDetent(o: { visible: number; velocity: number; heights: Record<Detent, number> }): Detent {
  const { visible, velocity, heights } = o;
  if (velocity > FLICK) {
    const below = ORDER.filter((d) => heights[d] < visible - 1);
    return below[below.length - 1] ?? 'bar';
  }
  if (velocity < -FLICK) {
    return ORDER.find((d) => heights[d] > visible + 1) ?? 'full';
  }
  return ORDER.reduce((best, d) => (Math.abs(heights[d] - visible) < Math.abs(heights[best] - visible) ? d : best), 'half' as Detent);
}

/** The drawer's heights on this screen, in px: its bar (`peek`), half, and full under the top bar (`top`). */
export function detentHeights(viewport: number, peek: number, top: number): Record<Detent, number> {
  const full = Math.max(peek, viewport - top - 8);
  return { bar: peek, half: Math.min(full, Math.round(viewport * HALF_SHARE)), full };
}
