import { useState } from 'react';
import { Trash } from '../icons.ts';
import { DAYS_TO_DUE } from '../lib/babyTries.ts';
import type { BabyTry } from '../types/whiteboard.ts';

/**
 * A planned baby's tries, in its editor: each try's day and whether it
 * worked, with a due date for one that did, and the save's own when it has
 * the parents expecting. Each planned baby keeps its own count, which it
 * keeps once the save brings it: "Born after 4 tries".
 */
export function BabyTries({
  tries,
  today,
  dayText,
  expecting,
  onAdd,
  onRemove,
}: {
  tries: readonly BabyTry[];
  /** Today in the game, by the last save: the day a new try starts at. */
  today: number;
  /** "Day 3", or "Day 3 · 1300" with calendar years. */
  dayText: (day: number) => string;
  /** The parents' pregnancy by the save, as the clock says it: "Day 4, 5:59 AM". */
  expecting?: string;
  onAdd: (t: BabyTry) => void;
  onRemove: (index: number) => void;
}) {
  const [day, setDay] = useState(String(today));
  const typed = /^-?\d+$/.test(day.trim()) ? Number(day.trim()) : null;
  const n = tries.length;
  const add = (pregnant: boolean) => {
    if (typed !== null) onAdd({ day: typed, pregnant });
  };
  return (
    <section className="edtries" aria-labelledby="edTriesHead">
      <div className="edlabel">
        <span className="edlabel__text" id="edTriesHead">
          {n ? `Tries for this baby · ${n}` : 'Tries for this baby'}
        </span>
      </div>
      {expecting && <p className="edtries__expecting">{`Your save has its parents expecting: due ${expecting}.`}</p>}
      <p className="edhint">
        Your save shows a pregnancy only once it has begun. Log each try for this baby as you play, to count them and see
        when it would be due. The baby keeps the count once born.
      </p>
      {n > 0 && (
        <ol className="edtries__list">
          {tries.map((t, i) => (
            <li key={i}>
              <span className="edtries__num" aria-hidden="true">
                {i + 1}
              </span>
              <span className="edtries__try">
                {t.pregnant
                  ? `${dayText(t.day)} · It worked${i === n - 1 && !expecting ? `, due about ${dayText(t.day + DAYS_TO_DUE)}` : ''}`
                  : `${dayText(t.day)} · It didn’t`}
              </span>
              <button type="button" className="edtries__bin" aria-label={`Remove try ${i + 1}`} title="Remove this try. Undo takes it back." onClick={() => onRemove(i)}>
                <Trash aria-hidden="true" />
              </button>
            </li>
          ))}
        </ol>
      )}
      <div className="edtries__form">
        <label className="edtries__day">
          <span>{`Try ${n + 1}, on Day`}</span>
          <input type="text" inputMode="numeric" value={day} aria-invalid={typed === null} onChange={(e) => setDay(e.target.value)} />
        </label>
        {/* One choice, two answers: they stay side by side, whatever the width. */}
        <span className="edtries__result" role="group" aria-label={`How try ${n + 1} went`}>
          <button type="button" disabled={typed === null} onClick={() => add(true)}>
            It worked
          </button>
          <button type="button" disabled={typed === null} onClick={() => add(false)}>
            It didn’t
          </button>
        </span>
      </div>
    </section>
  );
}
