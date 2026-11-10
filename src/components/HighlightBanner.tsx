import type { HighlightSummary } from '../lib/highlight.ts';

type Props = {
  summary: HighlightSummary;
  /** Open the Highlight panel to change the chips. */
  onChange: () => void;
  onClear: () => void;
};

/**
 * While a highlight is on and its panel is closed, say how many cards it
 * picks out, so the count stays in view on the board. The deceased don't
 * count: the chips never pick them.
 */
export function HighlightBanner({ summary, onChange, onClear }: Props) {
  return (
    <div
      className="bloodline-banner highlight-banner"
      role="status"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <p>
        Highlighting <b>{summary.count}</b> {summary.phrase} of {summary.living} living on the board.
      </p>
      <button type="button" className="highlight-banner__change" onClick={onChange}>
        Change
      </button>
      <button type="button" onClick={onClear}>
        Clear
      </button>
    </div>
  );
}
