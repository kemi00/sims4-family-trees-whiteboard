import { HOUSEHOLD_LIMIT } from '../lib/constants.ts';
import { HOUSEHOLD_LIMIT_MAX } from '../lib/whereTheyLive.ts';

/**
 * The household limit, the same wherever it shows (a household's ⚠ and
 * Your save): fewer, the number, more, and No limit. Back to the game's 8
 * once changed.
 */
export function HouseholdLimitControl({ limit, onLimit }: { limit: number | null; onLimit: (n: number | null) => void }) {
  const n = limit ?? HOUSEHOLD_LIMIT;
  return (
    <div className="limitctl" role="group" aria-label="Household limit">
      <span className="limitctl__label">Household limit</span>
      {limit === null ? (
        <button type="button" className="limitctl__btn" onClick={() => onLimit(HOUSEHOLD_LIMIT)}>
          No limit · turn on
        </button>
      ) : (
        <>
          <span className="hlstep">
            <button type="button" aria-label="Household limit: one fewer" onClick={() => onLimit(Math.max(1, n - 1))}>
              −
            </button>
            <output aria-live="polite">{n}</output>
            <button type="button" aria-label="Household limit: one more" onClick={() => onLimit(Math.min(HOUSEHOLD_LIMIT_MAX, n + 1))}>
              +
            </button>
          </span>
          <button type="button" className="limitctl__btn" onClick={() => onLimit(null)}>
            No limit
          </button>
          {/* Always there, hidden at the game's own: a control that appears would move the rest under the pointer. */}
          <button
            type="button"
            className="limitctl__btn"
            style={n === HOUSEHOLD_LIMIT ? { visibility: 'hidden' } : undefined}
            aria-hidden={n === HOUSEHOLD_LIMIT}
            tabIndex={n === HOUSEHOLD_LIMIT ? -1 : undefined}
            onClick={() => onLimit(HOUSEHOLD_LIMIT)}
          >
            The game’s {HOUSEHOLD_LIMIT}
          </button>
        </>
      )}
    </div>
  );
}
