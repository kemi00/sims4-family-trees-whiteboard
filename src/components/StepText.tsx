import { stepParts } from '../lib/undoNames.ts';

/**
 * A step or message with its names (sims, households, worlds, dynasties)
 * set apart in the name colour, so who and where read at a glance.
 */
export function StepText({ text }: { text: string }) {
  return (
    <>
      {stepParts(text).map((p, i) =>
        p.name ? (
          <span key={i} className="named">
            {p.text}
          </span>
        ) : (
          p.text
        ),
      )}
    </>
  );
}

/**
 * The Undo or Redo button's tip: the action and its keys on top, then the
 * step it would take back or put back, in full, wrapping as it needs.
 */
export function StepTip({
  verb,
  keys,
  what,
  none,
}: {
  verb: string;
  keys: string;
  what: string | null;
  none: string;
}) {
  if (!what) return <span className="tool__tip-head">{none}</span>;
  return (
    <>
      <span className="tool__tip-head">
        {verb}
        <kbd className="tool__tip-keys">{keys}</kbd>
      </span>
      <span className="tool__tip-what">
        <StepText text={what} />
      </span>
    </>
  );
}
