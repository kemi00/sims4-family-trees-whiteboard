import { CaretDown, type Icon } from '../icons.ts';
import { useState, type ReactNode, type Ref } from 'react';

type Tone = 'neutral' | 'primary' | 'danger';

type Props = {
  icon: Icon;
  /** Accessible name and tooltip. Required even when a visible label is shown. */
  label: string;
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

export function ToolButton({
  icon: Glyph,
  label,
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
      data-tooltip={quiet ? undefined : label}
      aria-pressed={menu ? undefined : pressed}
      aria-haspopup={menu ? 'menu' : undefined}
      aria-expanded={expanded}
      aria-label={children ? undefined : label}
      disabled={disabled}
      onClick={() => {
        setQuiet(true);
        onClick?.();
      }}
      onPointerLeave={() => setQuiet(false)}
    >
      <Glyph aria-hidden="true" />
      {children && <span className="tool__label">{children}</span>}
      {count ? <span className="tool__count">{count}</span> : null}
      {menu && <CaretDown className="tool__caret" weight="bold" aria-hidden="true" />}
    </button>
  );
}
