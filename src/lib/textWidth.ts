let measureCtx: CanvasRenderingContext2D | null | undefined;
const widths = new Map<string, number | null>();

/**
 * Width of `text` in the board's type, from the browser's own font metrics,
 * or null without a canvas (tests, the node scripts). Layout never uses it:
 * fonts differ between machines, and a board must pack the same on all.
 */
export function measureText(text: string, size: number, weight: number): number | null {
  const key = `${weight} ${size} ${text}`;
  const hit = widths.get(key);
  if (hit !== undefined) return hit;
  if (measureCtx === undefined) {
    measureCtx =
      typeof document === 'undefined'
        ? null
        : document.createElement('canvas').getContext('2d');
  }
  let w: number | null = null;
  if (measureCtx) {
    measureCtx.font = `${weight} ${size}px -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`;
    w = measureCtx.measureText(text).width;
  }
  widths.set(key, w);
  return w;
}

/** {@link measureText}, falling back to a per-character estimate. */
export function textWidth(text: string, size: number, weight: number): number {
  return measureText(text, size, weight) ?? text.length * size * (weight >= 800 ? 0.586 : 0.58);
}
