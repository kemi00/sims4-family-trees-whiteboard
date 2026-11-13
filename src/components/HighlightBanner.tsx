import type { HighlightSummary } from '../lib/highlight.ts';

type Props = {
  summary: HighlightSummary;
  /** Open the Highlight panel to change the chips. */
  onChange: () => void;
  onClear: () => void;
  /** Show who they are, as a list beside the board. */
  onList?: () => void;
};

/**
 * While a highlight is on and its panel is closed, say how many cards it
 * picks out, so the count stays in view on the board. The deceased don't
 * count: the chips never pick them.
 */
export function HighlightBanner({ summary, onChange, onClear, onList }: Props) {
  return (
    <div
      className="bloodline-banner highlight-banner"
      role="status"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <p>
        Highlighting <b>{summary.count}</b> {summary.phrase} of {summary.living} living on the board.
      </p>
      {onList && (
        <button type="button" className="banner__alt" onClick={onList}>
          List
        </button>
      )}
      <button type="button" className="highlight-banner__change" onClick={onChange}>
        Change
      </button>
      <button type="button" onClick={onClear}>
        Clear
      </button>
    </div>
  );
}
