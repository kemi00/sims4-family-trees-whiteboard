import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { fitMenuInStage } from '../lib/chrome.ts';
import { CHROME_EDGE_PAD_PX } from '../lib/constants.ts';
import { useCompactChrome } from './useCompactChrome.ts';
import { useSheet } from './useSheet.ts';

const SHEET_STYLE: CSSProperties = { display: 'block' };

/**
 * Keep a stage-anchored `.menu` fully visible. Compact chrome uses the CSS
 * bottom sheet; otherwise the menu is measured and flipped/clamped inside
 * `#stage` (which clips overflow). The sheet is a drawer (useSheet): half,
 * full, or folded to a bar showing its head, so a half-made choice isn't
 * lost to a stray press. `keep`: presses there don't fold it (the board's
 * cards a menu picks from).
 */
export function useFitMenuInStage(preferredLeft: number, preferredTop: number, opts: { keep?: string } = {}) {
  const compact = useCompactChrome();
  const ref = useRef<HTMLDivElement>(null);
  const sheet = useSheet(ref, { enabled: compact, head: '.pmenu__head, .menu__pair', ...(opts.keep ? { keep: opts.keep } : {}) });
  const [style, setStyle] = useState<CSSProperties>(
    compact
      ? SHEET_STYLE
      : {
          display: 'block',
          left: preferredLeft,
          top: preferredTop,
          visibility: 'hidden',
        },
  );

  useLayoutEffect(() => {
    if (compact) {
      setStyle(SHEET_STYLE);
      return;
    }
    const el = ref.current;
    if (!el) return;

    const place = () => {
      const parent = el.offsetParent as HTMLElement | null;
      const stageW = parent?.clientWidth ?? window.innerWidth;
      const stageH = parent?.clientHeight ?? window.innerHeight;
      const maxWidth = Math.max(0, stageW - CHROME_EDGE_PAD_PX * 2);
      const maxHeight = Math.max(0, stageH - CHROME_EDGE_PAD_PX * 2);
      el.style.maxWidth = `${maxWidth}px`;
      el.style.maxHeight = `${maxHeight}px`;
      el.style.overflowY = 'auto';
      const fitted = fitMenuInStage(
        preferredLeft,
        preferredTop,
        el.offsetWidth,
        el.offsetHeight,
        stageW,
        stageH,
      );
      setStyle((prev) => {
        if (
          prev.display === 'block' &&
          prev.left === fitted.left &&
          prev.top === fitted.top &&
          prev.maxWidth === maxWidth &&
          prev.maxHeight === maxHeight &&
          prev.visibility === 'visible'
        ) {
          return prev;
        }
        return {
          display: 'block',
          left: fitted.left,
          top: fitted.top,
          maxWidth,
          maxHeight,
          overflowY: 'auto',
          visibility: 'visible',
        };
      });
    };

    place();
    const ro = new ResizeObserver(place);
    ro.observe(el);
    if (el.offsetParent instanceof HTMLElement) ro.observe(el.offsetParent);
    window.addEventListener('resize', place);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', place);
    };
  }, [compact, preferredLeft, preferredTop]);

  return { compact, ref, style, sheet };
}
