import { useEffect, useId, useRef, type ReactNode } from 'react';
import { CaretLeft } from '../icons.ts';
import { CloseButton, IconButton } from './CloseButton.tsx';

type Props = {
  title: string;
  /** One line under the title: what the panel is for, or how many it holds. */
  description?: ReactNode;
  /** Small icon controls before the close button, such as the Log's sort. */
  actions?: ReactNode;
  /** An inner view's way back, such as Games inside Filters. Esc goes back first. */
  back?: { label: string; onBack: () => void };
  /** The row under the header: a search field, a sort control, tabs. */
  tools?: ReactNode;
  /** The content's own classes, for its rows' styles (dynp, upnext, chron). */
  className?: string;
  id?: string;
  onClose: () => void;
  children: ReactNode;
};

/**
 * The panel the bar's group opens: Up next, Dynasties, Story, Filters and
 * the Log. All open in one place, under the bar at the right, at one width,
 * with one header (title, a line on what it is, the close button), an
 * optional row for search and sorting, and a body that scrolls. Opening
 * another swaps the content in place; Esc, the close button, the bar
 * button again or a click on the board closes it. A bottom sheet on a
 * narrow screen.
 */
export function BarPanel({ title, description, actions, back, tools, className, id, onClose, children }: Props) {
  const titleId = useId();
  const ref = useRef<HTMLElement>(null);
  const backRef = useRef(back);
  const closeRef = useRef(onClose);
  useEffect(() => {
    backRef.current = back;
    closeRef.current = onClose;
  });

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape' || ev.defaultPrevented) return;
      // Esc in the sim editor, a menu, search or a field elsewhere is theirs.
      const at = document.activeElement;
      if (at && !ref.current?.contains(at)) {
        if (at.closest('.editor, .menu, .find, [aria-modal="true"]')) return;
        if (at.matches('input, textarea, select, [contenteditable="true"]')) return;
      }
      ev.preventDefault();
      if (backRef.current) backRef.current.onBack();
      else closeRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <section
      ref={ref}
      id={id}
      className={className ? `barpanel ${className}` : 'barpanel'}
      role="dialog"
      aria-labelledby={titleId}
      // The board under it never takes a press meant for the panel.
      onPointerDown={(e) => e.stopPropagation()}
    >
      <header className="barpanel__head">
        {back && (
          <IconButton label={back.label} onClick={back.onBack}>
            <CaretLeft aria-hidden="true" />
          </IconButton>
        )}
        <div className="barpanel__title">
          <h2 id={titleId}>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        {actions}
        <CloseButton label={`Close ${title}`} onClick={onClose} />
      </header>
      {tools && <div className="barpanel__tools">{tools}</div>}
      <div className="barpanel__body">{children}</div>
    </section>
  );
}
