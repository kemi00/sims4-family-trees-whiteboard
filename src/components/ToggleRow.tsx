import { Check, type Icon } from '../icons.ts';

/**
 * An on/off setting in a panel: its name, what it does, a check and the
 * accent tint while on. Filters' switches and Calendar years share it.
 */
export function ToggleRow({
  icon: Glyph,
  label,
  note,
  on,
  disabled,
  onClick,
}: {
  icon: Icon;
  label: string;
  note: string;
  on: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" role="switch" aria-checked={on} disabled={disabled} className="fpanel__row" onClick={onClick}>
      <Glyph aria-hidden="true" />
      <span className="fpanel__text">
        {label}
        <small>{note}</small>
      </span>
      {on && <Check className="fpanel__end" weight="bold" aria-hidden="true" />}
    </button>
  );
}
