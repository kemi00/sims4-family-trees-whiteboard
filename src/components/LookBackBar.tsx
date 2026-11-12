import { useEffect, useState } from 'react';
import { CaretLeft, CaretRight, Pause, Play } from '../icons.ts';
import { chronicleWhen, type ChronicleEntry } from '../lib/chronicle.ts';

type Props = {
  entries: readonly ChronicleEntry[];
  /** The upload shown: its index; the last is now. */
  at: number;
  onAt: (at: number) => void;
  onNow: () => void;
};

/** Between two uploads while playing. */
const STEP_MS = 1600;

/**
 * Looking back through the uploads: a slider with a stop for each, the
 * last one now, steps either way and a play button that walks the story
 * forward. What it hides and keeps is said once, under the date: the
 * board is read only until you're back to now.
 */
export function LookBackBar({ entries, at, onAt, onNow }: Props) {
  const last = entries.length - 1;
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!playing) return;
    if (at >= last) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => onAt(at + 1), STEP_MS);
    return () => clearTimeout(t);
  }, [playing, at, last, onAt]);
  const entry = entries[at]!;
  return (
    <div
      className="lookback"
      role="group"
      aria-label="Looking back through your saves"
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return;
        e.stopPropagation();
        onNow();
      }}
    >
      <p className="lookback__when" aria-live="polite">
        <b>{at >= last ? 'Now' : 'Looking back'}:</b> {chronicleWhen(entry)} · save {at + 1} of {entries.length}
      </p>
      <div className="lookback__ctl">
        <button type="button" className="lookback__btn" aria-label="An earlier save" disabled={at <= 0} onClick={() => onAt(at - 1)}>
          <CaretLeft aria-hidden="true" weight="bold" />
        </button>
        <input
          type="range"
          className="lookback__range"
          min={0}
          max={last}
          step={1}
          value={at}
          aria-label="Which save"
          aria-valuetext={`${chronicleWhen(entry)}, save ${at + 1} of ${entries.length}`}
          onChange={(e) => onAt(Number(e.target.value))}
        />
        <button type="button" className="lookback__btn" aria-label="A later save" disabled={at >= last} onClick={() => onAt(at + 1)}>
          <CaretRight aria-hidden="true" weight="bold" />
        </button>
        <button
          type="button"
          className="lookback__btn"
          aria-label={playing ? 'Pause' : 'Play the story forward'}
          onClick={() => {
            if (!playing && at >= last) onAt(0);
            setPlaying(!playing);
          }}
        >
          {playing ? <Pause aria-hidden="true" weight="fill" /> : <Play aria-hidden="true" weight="fill" />}
        </button>
        <button type="button" className="lookback__now" onClick={onNow}>
          Back to now
        </button>
      </div>
      <p className="lookback__note">
        Sims born or met later and your plans are hidden, ages and couples are as they were, and cards stay where they
        are. Editing waits until you’re back to now.
      </p>
    </div>
  );
}
