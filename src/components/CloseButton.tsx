import type { ReactNode, Ref } from 'react';
import { X } from '../icons.ts';

type IconButtonProps = {
  /** What it does, read out and shown as its tip: "Close Dynasties", "Sort newest first". */
  label: string;
  /** The tip, when it says more than the label ("Close (Esc)"). */
  title?: string;
  pressed?: boolean;
  disabled?: boolean;
  className?: string;
  id?: string;
  ref?: Ref<HTMLButtonElement>;
  onClick: () => void;
  children: ReactNode;
};

/**
 * The board's one small round icon button, for the few controls in a
 * panel's header: a 32px circle (44px on touch) with a 16px icon,
 * transparent until hovered. CloseButton is this with an X.
 */
export function IconButton({ label, title, pressed, disabled, className, id, ref, onClick, children }: IconButtonProps) {
  return (
    <button
      ref={ref}
      id={id}
      type="button"
      className={className ? `iconbtn ${className}` : 'iconbtn'}
      aria-label={label}
      title={title ?? label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {children}
    </button>
  );
}

type CloseProps = {
  /** What it closes, read out: "Close Dynasties". */
  label: string;
  /** The tip: "Close (Esc)" unless it says otherwise. */
  title?: string;
  /** Placement only (e.g. pinned in a corner); never its look. */
  className?: string;
  id?: string;
  ref?: Ref<HTMLButtonElement>;
  onClick: () => void;
};

/**
 * The one close button: the same size, icon, colours and states in every
 * panel, menu and dialog, always at the top right of its header.
 */
export function CloseButton({ label, title = 'Close (Esc)', className, id, ref, onClick }: CloseProps) {
  return (
    <IconButton label={label} title={title} className={className ? `closebtn ${className}` : 'closebtn'} id={id} ref={ref} onClick={onClick}>
      <X aria-hidden="true" />
    </IconButton>
  );
}
