/**
 * The board's own tips (BoardTip), in place of the browser's: an element
 * says what its tip is with `data-tip` (plain lines, the first one the
 * main one) or `data-tip-rich` (a {@link RichTip} as JSON, for a world's
 * tag). `data-tip-side="left"` puts it left of the element, for the panel
 * at the board's right edge; `data-tip-align="start"` lines it up with the
 * element's left edge instead of its middle, and a child marked
 * `data-tip-anchor` is what it lines up with, when the element has a pad
 * round what is drawn.
 */
export type TipIcon = 'sims' | 'households' | 'dynasties';

/** A tip with a heading, a line on what it is, rows with the tag's icons, and a quiet last line. */
export type RichTip = {
  head: string;
  /** The game it comes from, with its icon, under the heading (a world's). */
  game?: string;
  note?: string;
  rows: { icon: TipIcon; text: string; aside?: string }[];
  foot?: string;
};

/** A rich tip read back from `data-tip-rich`; null when it isn't one. */
export function parseRichTip(raw: string | null): RichTip | null {
  if (!raw) return null;
  try {
    const t = JSON.parse(raw) as RichTip;
    return t && typeof t.head === 'string' && Array.isArray(t.rows) ? t : null;
  } catch {
    return null;
  }
}

/** Where a tip goes: under its element (or over it, near the bottom), or to its left; always on screen. */
export function placeTip(
  anchor: { left: number; top: number; right: number; bottom: number },
  tip: { w: number; h: number },
  view: { w: number; h: number },
  opts: { side?: 'below' | 'left'; align?: 'center' | 'start' } = {},
): { x: number; y: number } {
  const gap = 8;
  const margin = 8;
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, Math.max(lo, hi)));
  if (opts.side === 'left') {
    let x = anchor.left - gap - tip.w;
    if (x < margin) x = anchor.right + gap;
    const y = (anchor.top + anchor.bottom) / 2 - tip.h / 2;
    return { x: clamp(x, margin, view.w - tip.w - margin), y: clamp(y, margin, view.h - tip.h - margin) };
  }
  const x = opts.align === 'start' ? anchor.left : (anchor.left + anchor.right) / 2 - tip.w / 2;
  let y = anchor.bottom + gap;
  if (y + tip.h > view.h - margin && anchor.top - gap - tip.h >= margin) y = anchor.top - gap - tip.h;
  return { x: clamp(x, margin, view.w - tip.w - margin), y: clamp(y, margin, view.h - tip.h - margin) };
}

/**
 * Opens a tip and keeps it open, for a tap on a touch screen where there is
 * no hover: the board's BoardTip listens. A press anywhere closes it.
 */
export const boardTipPin: { open: (el: Element) => void } = { open: () => {} };
