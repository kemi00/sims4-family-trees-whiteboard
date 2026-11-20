import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Crown, House, User } from '../icons.ts';
import { boardTipPin, parseRichTip, placeTip, type RichTip, type TipIcon } from '../lib/boardTip.ts';
import { packIconUrl } from '../lib/packs.ts';

/** Hover this long before a tip shows; moving straight on to the next one shows it at once. */
const SHOW_DELAY_MS = 400;
/** How long after a tip hides the next one still shows at once. */
const WARM_MS = 300;

const TIP_TARGET = '[data-tip],[data-tip-rich]';

const ICONS: Record<TipIcon, typeof User> = { sims: User, households: House, dynasties: Crown };

function tipTarget(t: EventTarget | null): Element | null {
  return t instanceof Element ? t.closest(TIP_TARGET) : null;
}

function RichBody({ tip }: { tip: RichTip }) {
  return (
    <>
      <div className="board-tip__head">{tip.head}</div>
      {tip.game && (
        <div className="board-tip__game">
          {packIconUrl(tip.game) && <img src={packIconUrl(tip.game)} alt="" width={14} height={14} />}
          {tip.game}
        </div>
      )}
      {tip.note && <div className="board-tip__note">{tip.note}</div>}
      <div className="board-tip__rows">
        {tip.rows.map((r) => {
          const Icon = ICONS[r.icon];
          return (
            <div key={r.icon} className="board-tip__row">
              <Icon weight="bold" aria-hidden="true" />
              <span>{r.text}</span>
              {r.aside && <span className="board-tip__aside">{r.aside}</span>}
            </div>
          );
        })}
      </div>
      {tip.foot && <div className="board-tip__foot">{tip.foot}</div>}
    </>
  );
}

function PlainBody({ text }: { text: string }) {
  const [first, ...rest] = text.split('\n').filter((l) => l.trim());
  return (
    <>
      <div className="board-tip__head">{first}</div>
      {rest.map((l, i) => (
        <div key={i} className="board-tip__note">
          {l}
        </div>
      ))}
    </>
  );
}

/**
 * The board's tip: what an element with `data-tip` or `data-tip-rich` is,
 * in the toolbar tips' dark ink, after a short pause on hover or at once on
 * keyboard focus. A press, the wheel or Escape hides it, and the element
 * pressed stays quiet until the pointer leaves it. On a touch screen,
 * where there is no hover, `boardTipPin.open` shows one until the next press.
 */
export function BoardTip() {
  const [shown, setShown] = useState<{ el: Element; pinned: boolean } | null>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  // What shows, for the listeners: set with the state, as they read it before a render.
  const shownRef = useRef<{ el: Element; pinned: boolean } | null>(null);

  useEffect(() => {
    let timer = 0;
    let current: Element | null = null;
    let quiet: Element | null = null;
    let warmUntil = 0;
    // The pinned tip a press closed, so a tap on the same tag closes it rather than opening it again.
    let closedByPress: Element | null = null;

    const hide = () => {
      window.clearTimeout(timer);
      if (shownRef.current) {
        if (!shownRef.current.pinned) warmUntil = Date.now() + WARM_MS;
        shownRef.current = null;
        setShown(null);
      }
    };
    const show = (el: Element, pinned = false) => {
      window.clearTimeout(timer);
      shownRef.current = { el, pinned };
      setShown(shownRef.current);
    };

    const onOver = (ev: PointerEvent) => {
      if (ev.pointerType === 'touch') return;
      const el = tipTarget(ev.target);
      if (el === current) return;
      current = el;
      if (el !== quiet) quiet = null;
      if (shownRef.current?.pinned) return;
      window.clearTimeout(timer);
      if (!el || el === quiet || ev.buttons) {
        hide();
        return;
      }
      if (shownRef.current || Date.now() < warmUntil) show(el);
      else timer = window.setTimeout(() => show(el), SHOW_DELAY_MS);
    };
    const onOut = (ev: PointerEvent) => {
      // Off the page altogether.
      if (!ev.relatedTarget && ev.pointerType !== 'touch') {
        current = null;
        if (!shownRef.current?.pinned) hide();
      }
    };
    const onDown = (ev: PointerEvent) => {
      closedByPress = shownRef.current?.pinned ? shownRef.current.el : null;
      quiet = tipTarget(ev.target);
      hide();
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') hide();
    };
    const onFocus = (ev: FocusEvent) => {
      const t = ev.target;
      if (!(t instanceof Element) || !t.matches(TIP_TARGET)) return;
      if (t.matches(':focus-visible')) show(t);
    };
    const onBlur = (ev: FocusEvent) => {
      if (shownRef.current?.el === ev.target) hide();
    };

    boardTipPin.open = (el) => {
      if (el === closedByPress) {
        closedByPress = null;
        return;
      }
      show(el, true);
    };

    document.addEventListener('pointerover', onOver);
    document.addEventListener('pointerout', onOut);
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('wheel', hide, { capture: true, passive: true });
    document.addEventListener('keydown', onKey);
    document.addEventListener('focusin', onFocus);
    document.addEventListener('focusout', onBlur);
    window.addEventListener('blur', hide);
    window.addEventListener('resize', hide);
    return () => {
      window.clearTimeout(timer);
      boardTipPin.open = () => {};
      document.removeEventListener('pointerover', onOver);
      document.removeEventListener('pointerout', onOut);
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('wheel', hide, { capture: true });
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('focusin', onFocus);
      document.removeEventListener('focusout', onBlur);
      window.removeEventListener('blur', hide);
      window.removeEventListener('resize', hide);
    };
  }, []);

  // Placed once drawn, when its size is known; hidden until then so it never flashes at the corner.
  useLayoutEffect(() => {
    const tip = tipRef.current;
    if (!shown || !tip) return;
    if (!shown.el.isConnected) {
      shownRef.current = null;
      setShown(null);
      return;
    }
    // The part that's drawn, when the element is bigger to be easy to hit.
    const a = (shown.el.querySelector('[data-tip-anchor]') ?? shown.el).getBoundingClientRect();
    const side = shown.el.getAttribute('data-tip-side') === 'left' ? 'left' : 'below';
    const align = shown.el.getAttribute('data-tip-align') === 'start' ? 'start' : 'center';
    const { x, y } = placeTip(
      a,
      { w: tip.offsetWidth, h: tip.offsetHeight },
      { w: window.innerWidth, h: window.innerHeight },
      { side, align },
    );
    tip.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    tip.style.visibility = 'visible';
  }, [shown]);

  if (!shown) return null;
  const rich = parseRichTip(shown.el.getAttribute('data-tip-rich'));
  const text = shown.el.getAttribute('data-tip') ?? '';
  if (!rich && !text.trim()) return null;
  return createPortal(
    <div ref={tipRef} className={rich ? 'board-tip board-tip--rich' : 'board-tip'} role="tooltip" style={{ visibility: 'hidden' }}>
      {rich ? <RichBody tip={rich} /> : <PlainBody text={text} />}
    </div>,
    document.body,
  );
}
