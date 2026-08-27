import type { Icon } from '@phosphor-icons/react';
import type { ReactNode, Ref } from 'react';

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
  id?: string;
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
  id,
  ref,
  onClick,
}: Props) {
  return (
    <button
      id={id}
      ref={ref}
      type="button"
      className={children ? 'tool' : 'tool tool--icon'}
      data-tone={tone}
      data-pressed={pressed === undefined ? undefined : String(pressed)}
      data-tooltip={label}
      aria-pressed={pressed}
      aria-expanded={expanded}
      aria-label={children ? undefined : label}
      disabled={disabled}
      onClick={onClick}
    >
      <Glyph aria-hidden="true" />
      {children && <span className="tool__label">{children}</span>}
      {count ? <span className="tool__count">{count}</span> : null}
    </button>
  );
}
