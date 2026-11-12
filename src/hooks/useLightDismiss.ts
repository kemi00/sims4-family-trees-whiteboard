import { useEffect, useRef, type RefObject } from 'react';

/**
 * Close a popup on a press anywhere outside it: the board's rule for every
 * menu, panel and card that floats over it. The press still does what it
 * does there (a card is picked, the board pans), so one press both closes
 * and acts. A dialog over everything (aria-modal: a poster opened from the
 * popup, say) is part of the popup's flow and keeps it, as does `keep`: the
 * button that opens it, which toggles it itself, or the cards a menu picks
 * from the board.
 */
export function useLightDismiss(
  ref: RefObject<Element | null>,
  onClose: () => void,
  opts: { keep?: string; enabled?: boolean } = {},
) {
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  const { keep, enabled = true } = opts;
  useEffect(() => {
    if (!enabled) return;
    const onPointer = (ev: PointerEvent) => {
      const t = ev.target;
      if (!(t instanceof Element)) return;
      if (ref.current?.contains(t)) return;
      if (t.closest('[aria-modal="true"]')) return;
      if (keep && t.closest(keep)) return;
      close.current();
    };
    document.addEventListener('pointerdown', onPointer, true);
    return () => document.removeEventListener('pointerdown', onPointer, true);
  }, [ref, keep, enabled]);
}
