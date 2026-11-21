import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import {
  FOLD_EVENT,
  FULL_CSS,
  HALF_CSS,
  HEAD_CONTROLS,
  NOT_THE_BOARD,
  detentHeights,
  releaseDetent,
  type Detent,
} from '../lib/sheet.ts';

/** A drawer's height and the ways to change it, for its grabber. */
export type Sheet = {
  /** Is it a drawer now (a narrow screen)? */
  on: boolean;
  detent: Detent;
  setDetent: (d: Detent) => void;
  /** The grabber's tap: the bar opens to half, an open drawer folds to its bar. */
  toggle: () => void;
};

type Options = {
  enabled: boolean;
  /** The drawer's head, all its bar shows; the first thing in it otherwise. */
  head?: string;
  /** Opens folded to its bar: a highlight on a phone, where its banner was. */
  start?: Detent;
  /** Presses here don't fold it: the board's cards a menu picks from. */
  keep?: string;
  /** Changes when the drawer's element does (one card swapped for another): it binds again. */
  bind?: unknown;
};

const EASE = 'transform .26s cubic-bezier(.2,.8,.2,1), max-height .26s cubic-bezier(.2,.8,.2,1)';
/** The bar shows the head, up to this much: a long head is cut, not the board. */
const MAX_PEEK = 112;

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/** Where the top bar ends: a full drawer stops under it. */
const topBarBottom = () => document.querySelector('.appbar')?.getBoundingClientRect().bottom ?? 52;

/**
 * A bottom sheet's three heights on a narrow screen: half (where it opens),
 * full, and folded to a bar that shows only its head. Drag the grabber or
 * the head; tap the grabber, or the bar, to switch. A press on the board
 * folds it rather than closing it, as does foldSheets() (a sim picked in
 * a list). The element gets `data-detent`; inline max-height and transform
 * do the rest, so each drawer's own CSS stays as it is. On a wide screen
 * nothing here applies.
 */
export function useSheet(ref: RefObject<HTMLElement | null>, opts: Options): Sheet {
  const { enabled, head, keep, bind } = opts;
  const [detent, setDetentState] = useState<Detent>(opts.start ?? 'half');
  const detentRef = useRef(detent);
  detentRef.current = detent;
  /** The height it opens back to from its bar. */
  const lastOpen = useRef<Exclude<Detent, 'bar'>>(opts.start === 'full' ? 'full' : 'half');
  const peekRef = useRef(64);
  /** What this hook wrote, so it takes back only its own. */
  const wrote = useRef<{ maxHeight?: string }>({});
  /** A drag just ended on the grabber: its click is not a tap. */
  const dragged = useRef(false);
  /** This drawer raised the board's corner controls, and lowers them again. */
  const lifted = useRef(false);
  const lift = useCallback((css: string | null) => {
    const root = document.documentElement.style;
    if (css) {
      root.setProperty('--sheet-lift', css);
      lifted.current = true;
    } else if (lifted.current) {
      root.removeProperty('--sheet-lift');
      lifted.current = false;
    }
  }, []);

  const headEl = useCallback((el: HTMLElement): HTMLElement | null => {
    const found = head ? el.querySelector<HTMLElement>(head) : null;
    if (found) return found;
    return [...el.children].find((c): c is HTMLElement => c instanceof HTMLElement && !c.hasAttribute('data-sheet-grab')) ?? null;
  }, [head]);

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const h = headEl(el);
    const top = el.getBoundingClientRect().top;
    const peek = h ? Math.min(MAX_PEEK, Math.ceil(h.getBoundingClientRect().bottom - top + 2)) : 64;
    peekRef.current = peek;
    el.style.setProperty('--sheet-peek', `calc(${peek}px + env(safe-area-inset-bottom, 0px))`);
    if (detentRef.current === 'bar') lift(`calc(${peek}px + env(safe-area-inset-bottom, 0px))`);
  }, [ref, headEl, lift]);

  const apply = useCallback(
    (d: Detent, animate = true) => {
      const el = ref.current;
      if (!el) return;
      el.dataset.detent = d;
      const open = d === 'bar' ? lastOpen.current : d;
      const maxHeight = open === 'full' ? FULL_CSS : HALF_CSS;
      el.style.maxHeight = maxHeight;
      wrote.current.maxHeight = el.style.maxHeight;
      el.style.transition = animate && !reducedMotion() ? EASE : 'none';
      if (d === 'bar') {
        // Its head is what the bar shows: back to the top of anything scrolled.
        el.scrollTop = 0;
        el.style.transform = 'translateY(calc(100% - var(--sheet-peek, 64px)))';
      } else {
        el.style.transform = '';
      }
      const h = headEl(el);
      if (h) h.style.touchAction = 'none';
      measure();
      // The board's corner controls rise above a folded drawer.
      lift(d === 'bar' ? el.style.getPropertyValue('--sheet-peek') : null);
    },
    [ref, headEl, measure, lift],
  );

  const setDetent = useCallback((d: Detent) => {
    if (d !== 'bar') lastOpen.current = d;
    setDetentState(d);
  }, []);

  const toggle = useCallback(() => {
    if (dragged.current) {
      dragged.current = false;
      return;
    }
    setDetent(detentRef.current === 'bar' ? lastOpen.current : 'bar');
  }, [setDetent]);

  // The styles for the height it is at, and none on a wide screen.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!enabled) {
      // Closed or a wide screen: the corner controls come down, even with the drawer gone.
      lift(null);
      if (!el?.dataset.detent) return;
      delete el.dataset.detent;
      if (wrote.current.maxHeight && el.style.maxHeight === wrote.current.maxHeight) el.style.maxHeight = '';
      el.style.transform = '';
      el.style.transition = '';
      el.style.removeProperty('--sheet-peek');
      return;
    }
    if (!el) return;
    apply(detent, !!el.dataset.detent);
  }, [enabled, detent, apply, ref, bind, lift]);

  // Gone: the corner controls come back down.
  useEffect(() => () => lift(null), [lift]);

  // The head changes height (a title wraps, a step changes): the bar follows.
  useEffect(() => {
    const el = ref.current;
    if (!enabled || !el) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    const h = headEl(el);
    if (h) ro.observe(h);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [enabled, ref, headEl, measure, bind]);

  // Folded, it stays at its head: nothing scrolls it there, not a wheel, a
  // finger, or focus moving into it (the CSS turns its scrolling off too).
  useEffect(() => {
    const el = ref.current;
    if (!enabled || !el) return;
    const onScroll = () => {
      if (detentRef.current === 'bar' && el.scrollTop !== 0) el.scrollTop = 0;
    };
    el.addEventListener('scroll', onScroll);
    return () => el.removeEventListener('scroll', onScroll);
  }, [enabled, ref, bind]);

  // foldSheets(): something was picked, the board shows it.
  useEffect(() => {
    if (!enabled) return;
    const fold = () => setDetentState('bar');
    window.addEventListener(FOLD_EVENT, fold);
    return () => window.removeEventListener(FOLD_EVENT, fold);
  }, [enabled]);

  // A press on the board folds it; the press still does what it does there.
  useEffect(() => {
    if (!enabled) return;
    const onPointer = (ev: PointerEvent) => {
      if (detentRef.current === 'bar') return;
      const t = ev.target;
      if (!(t instanceof Element)) return;
      if (ref.current?.contains(t)) return;
      if (t.closest(NOT_THE_BOARD)) return;
      if (keep && t.closest(keep)) return;
      setDetentState('bar');
    };
    document.addEventListener('pointerdown', onPointer, true);
    return () => document.removeEventListener('pointerdown', onPointer, true);
  }, [enabled, ref, keep]);

  // Drag the grabber or the head; a tap on the bar opens it.
  useEffect(() => {
    const el = ref.current;
    if (!enabled || !el) return;
    const onDown = (ev: PointerEvent) => {
      if (ev.button !== 0) return;
      const t = ev.target;
      if (!(t instanceof Element)) return;
      const grab = !!t.closest('[data-sheet-grab]');
      const rect = el.getBoundingClientRect();
      if (!grab && (ev.clientY - rect.top > peekRef.current || t.closest(HEAD_CONTROLS))) return;
      const startY = ev.clientY;
      const startVisible = window.innerHeight - rect.top;
      const tall = el.offsetHeight;
      const heights = detentHeights(window.innerHeight, peekRef.current, topBarBottom());
      let moving = false;
      let last = { y: startY, t: performance.now() };
      let prev = last;
      const move = (e: PointerEvent) => {
        const dy = e.clientY - startY;
        if (!moving && Math.abs(dy) < 6) return;
        if (!moving) {
          moving = true;
          el.style.transition = 'none';
          try {
            el.setPointerCapture(e.pointerId);
          } catch {
            // Not ours to capture: the drag still follows the window's events.
          }
        }
        e.preventDefault();
        prev = last;
        last = { y: e.clientY, t: performance.now() };
        const visible = Math.min(heights.full, Math.max(heights.bar, startVisible - dy));
        if (visible <= tall) {
          el.style.transform = `translateY(${tall - visible}px)`;
        } else {
          el.style.transform = '';
          el.style.maxHeight = `${visible}px`;
        }
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
        if (!moving) {
          // A tap on the bar's head opens it; the grabber's own click toggles.
          if (!grab && detentRef.current === 'bar') setDetent(lastOpen.current);
          return;
        }
        if (grab) dragged.current = true;
        setTimeout(() => (dragged.current = false), 0);
        const velocity = (last.y - prev.y) / Math.max(1, last.t - prev.t);
        const visible = window.innerHeight - el.getBoundingClientRect().top;
        const target = releaseDetent({ visible, velocity, heights });
        if (target !== 'bar') lastOpen.current = target;
        setDetentState(target);
        // Even when it lands where it was: the drag's own styles go.
        apply(target);
      };
      window.addEventListener('pointermove', move, { passive: false });
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
    };
    el.addEventListener('pointerdown', onDown);
    return () => el.removeEventListener('pointerdown', onDown);
  }, [enabled, ref, apply, setDetent, bind]);

  return { on: enabled, detent, setDetent, toggle };
}
