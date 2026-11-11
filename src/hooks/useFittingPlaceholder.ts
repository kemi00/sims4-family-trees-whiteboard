import { useLayoutEffect, useRef, useState } from 'react';

/** Text width in an element's own font, measured off screen. */
function textWidth(text: string, font: string): number {
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return 0;
  ctx.font = font;
  return ctx.measureText(text).width;
}

/**
 * The longest of `options` that fits the input as it is drawn now, so a
 * placeholder is never cut short: a narrow search box says less, never half
 * of more. Falls back to the last (shortest) option.
 */
export function useFittingPlaceholder(options: readonly string[]) {
  const ref = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(options[0]!);
  useLayoutEffect(() => {
    const input = ref.current;
    if (!input || typeof ResizeObserver === 'undefined') return;
    const pick = () => {
      const cs = getComputedStyle(input);
      const room = input.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      setText(options.find((o) => textWidth(o, font) <= room) ?? options[options.length - 1]!);
    };
    pick();
    const ro = new ResizeObserver(pick);
    ro.observe(input);
    return () => ro.disconnect();
  }, [options]);
  return { ref, text };
}
