import { useEffect, useState } from 'react';
import { Hourglass } from '../icons.ts';
import { STAGES_WITH_LENGTHS, gameStageDays, stageLengthsOn, stageLengthsSummary } from '../lib/lifeClock.ts';
import type { SaveGameInfo, StageLengths } from '../types/whiteboard.ts';
import { SettingRow } from './BoardSettingPanel.tsx';
import { ToggleRow } from './ToggleRow.tsx';

/** The longest a stage may be set to, in sim days. */
const MAX_STAGE_DAYS = 9999;

/** "12", "10.5", or null for anything that isn't a length of days. */
function parseDays(text: string): number | null {
  const t = text.trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return n > 0 && n <= MAX_STAGE_DAYS ? Math.round(n * 100) / 100 : null;
}

/**
 * One stage's days: what the player typed, else empty with the game's own
 * length shown in grey. A number applies on Enter or leaving the box; an
 * empty box gives the stage back to the game.
 */
function StageDays({
  stage,
  value,
  gameDays,
  onDays,
}: {
  stage: string;
  value: number | undefined;
  gameDays: number | undefined;
  onDays: (days: number | undefined) => void;
}) {
  const [text, setText] = useState(value === undefined ? '' : String(value));
  useEffect(() => setText(value === undefined ? '' : String(value)), [value]);
  const typed = text.trim() === '' ? undefined : parseDays(text);
  const bad = typed === null;
  const apply = () => {
    if (bad || typed === value) return;
    onDays(typed);
  };
  const id = `stagedays-${stage.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <div className="stagelen__row">
      <label htmlFor={id}>{stage === 'Elder' ? 'Elder, until old age can come' : stage}</label>
      <span className="stagelen__days">
        <input
          id={id}
          type="text"
          inputMode="decimal"
          value={text}
          placeholder={gameDays === undefined ? '' : String(gameDays)}
          aria-invalid={bad}
          onChange={(e) => setText(e.target.value)}
          onBlur={apply}
          onKeyDown={(e) => {
            if (e.key === 'Enter') apply();
          }}
        />
        <span>days</span>
      </span>
    </div>
  );
}

/**
 * Life stage lengths of the player's own, as a mod like MCCC sets them: a
 * switch, then each stage's days, greyed out while off. A stage left empty
 * keeps the game's length; turned off, the days are kept for next time.
 * Every countdown (age-ups, Up next, the succession forecast) counts by them.
 */
export function StageLengthsControl({
  game,
  onStageLengths,
}: {
  game: SaveGameInfo | null;
  onStageLengths: (lengths: StageLengths, off: boolean) => void;
}) {
  const on = stageLengthsOn(game);
  const days: StageLengths = game?.stageLengths ?? {};
  const lifespan = game?.lifespan ?? 'Normal';
  return (
    <div className="calctl">
      <ToggleRow
        icon={Hourglass}
        label="Use my own stage lengths"
        note={on ? `${stageLengthsSummary(game).replace(/^On · /, 'On. ')}.` : `Off. Every stage follows the game’s ${lifespan} lifespan.`}
        on={on}
        onClick={() => onStageLengths(days, on)}
      />
      <p className="calctl__lead">
        Changed how long life stages last with a mod like MCCC? Type the days you set there. Age-ups, Up next and the
        succession forecast then count by them. A stage left empty keeps the game’s length, shown in grey.
      </p>
      <fieldset className="calctl__set" disabled={!on}>
        <legend className="calctl__head">Days in each stage</legend>
        {STAGES_WITH_LENGTHS.map((stage) => (
          <StageDays
            key={stage}
            stage={stage}
            value={days[stage]}
            gameDays={gameStageDays(stage, lifespan)}
            onDays={(d) => {
              const next: StageLengths = { ...days };
              if (d === undefined) delete next[stage];
              else next[stage] = d;
              onStageLengths(next, false);
            }}
          />
        ))}
      </fieldset>
    </div>
  );
}

/** Life stage lengths summed up in one row, in Your save's On the board. */
export function StageLengthsRow({ game, onOpen }: { game: SaveGameInfo | null; onOpen: () => void }) {
  return <SettingRow icon={Hourglass} title="Life stage lengths" summary={stageLengthsSummary(game)} onOpen={onOpen} />;
}
