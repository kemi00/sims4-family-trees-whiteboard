import { CaretDown, type Icon } from '../icons.ts';
import { useState, type ReactNode, type Ref } from 'react';

type Tone = 'neutral' | 'primary' | 'danger';

type Props = {
  icon: Icon;
  /** Accessible name and tooltip. Required even when a visible label is shown. */
  label: string;
  /**
   * A tip richer than `label` (lines, names set apart), shown in its place.
   * `label` stays the accessible name, so it should say the same in words.
   */
  tip?: ReactNode;
  /** Visible label. Omit for an icon-only, square button. */
  children?: ReactNode;
  tone?: Tone;
  /** Omit for plain actions. Present makes this a toggle and sets aria-pressed. */
  pressed?: boolean;
  /** Rendered as a badge when non-zero. */
  count?: number;
  disabled?: boolean;
  expanded?: boolean;
  /**
   * Opens a menu: announced as one, with a small caret to say so. `pressed`
   * then only styles it, since a menu button is not a toggle.
   */
  menu?: boolean;
  id?: string;
  /** Extra classes, e.g. `appbar__wide-only` for a control phones fold into More. */
  className?: string;
  ref?: Ref<HTMLButtonElement>;
  onClick?: () => void;
};

/** The window edge a tip keeps clear of. */
const TIP_MARGIN = 8;

/**
 * Keeps a button's tip inside the window: centred under the button, then
 * slid along (--tip-shift) by as much as it would stick out past an edge,
 * wherever the button sits in the bar and however long its tip is.
 */
function fitTip(btn: HTMLElement) {
  btn.style.removeProperty('--tip-shift');
  const rich = btn.querySelector<HTMLElement>('.tool__tip');
  const w = rich ? rich.offsetWidth : parseFloat(getComputedStyle(btn, '::after').width);
  if (!w) return;
  const r = btn.getBoundingClientRect();
  const left = r.left + r.width / 2 - w / 2;
  const right = left + w;
  const edge = document.documentElement.clientWidth - TIP_MARGIN;
  const shift = left < TIP_MARGIN ? TIP_MARGIN - left : right > edge ? edge - right : 0;
  if (shift) btn.style.setProperty('--tip-shift', `${Math.round(shift)}px`);
}

export function ToolButton({
  icon: Glyph,
  label,
  tip,
  children,
  tone = 'neutral',
  pressed,
  count,
  disabled,
  expanded,
  menu,
  id,
  className,
  ref,
  onClick,
}: Props) {
  // A click hides the tip until the pointer leaves: what the click did shows
  // on the board and the status line, which the tip would sit over.
  const [quiet, setQuiet] = useState(false);
  return (
    <button
      id={id}
      ref={ref}
      type="button"
      className={`${children ? 'tool' : 'tool tool--icon'}${menu ? ' tool--menu' : ''}${className ? ` ${className}` : ''}`}
      data-tone={tone}
      data-pressed={pressed === undefined ? undefined : String(pressed)}
      data-tooltip={quiet || tip ? undefined : label}
      aria-pressed={menu ? undefined : pressed}
      aria-haspopup={menu ? 'menu' : undefined}
      aria-expanded={expanded}
      aria-label={children ? undefined : label}
      disabled={disabled}
      onClick={(e) => {
        // A pointer's click (detail > 0), not a key's: no pointer to leave.
        if (e.detail > 0) setQuiet(true);
        onClick?.();
      }}
      onPointerEnter={(e) => {
        setQuiet(false);
        // After the tip renders: a rich tip mounts once the button isn't quiet.
        const btn = e.currentTarget;
        requestAnimationFrame(() => fitTip(btn));
      }}
      onFocus={(e) => fitTip(e.currentTarget)}
      onPointerLeave={() => setQuiet(false)}
    >
      <Glyph aria-hidden="true" />
      {children && <span className="tool__label">{children}</span>}
      {count ? <span className="tool__count">{count}</span> : null}
      {menu && <CaretDown className="tool__caret" weight="bold" aria-hidden="true" />}
      {tip && !quiet && (
        <span className="tool__tip" aria-hidden="true">
          {tip}
        </span>
      )}
    </button>
  );
}
