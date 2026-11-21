import type { Sheet } from '../hooks/useSheet.ts';

/**
 * The pill at the top of a drawer on a narrow screen: it says the drawer
 * moves. Drag it; or tap it (a button, for screen readers and anyone who
 * can't drag) to fold the drawer to its bar, or open it back to half.
 */
export function SheetGrabber({ sheet, what }: { sheet: Sheet; what: string }) {
  if (!sheet.on) return null;
  const folded = sheet.detent === 'bar';
  return (
    <button
      type="button"
      className="sheet-grab"
      data-sheet-grab
      aria-expanded={!folded}
      aria-label={folded ? `Open ${what}` : `Fold ${what} to the bottom`}
      title={folded ? 'Open' : 'Fold to the bottom'}
      onClick={sheet.toggle}
    >
      <span aria-hidden="true" />
    </button>
  );
}
