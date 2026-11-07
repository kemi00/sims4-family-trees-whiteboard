import { conflictText, type PlanChoice } from '../lib/plan.ts';
import type { PlanChoices, SavePlanReview } from '../lib/planReview.ts';

const CHOICE_LABEL: Record<PlanChoice | 'later', string> = {
  follow: 'Follow the game',
  keep: 'Keep my plan',
  drop: 'Drop it',
  later: 'Decide later',
};

/**
 * The import's second step: how your plan meets this save. Planned sims the
 * save can fill, plans it went against, and how many stay planned. Choices
 * apply on Proceed; nothing here changes the board by itself.
 */
export function PlanReview({
  plan,
  stillPlanned,
  choices,
  auto,
  onAuto,
  onChange,
}: {
  plan: SavePlanReview;
  stillPlanned: number;
  choices: PlanChoices;
  auto: boolean;
  onAuto: (on: boolean) => void;
  onChange: (next: PlanChoices) => void;
}) {
  const name = (id: string) => plan.names[id] ?? 'someone';
  const takenBy = new Map(Object.entries(choices.matches).map(([slot, save]) => [save, slot]));
  return (
    <>
      {plan.suggestions.length > 0 && (
        <section className="planrev" aria-labelledby="planrev-filled">
          <h3 id="planrev-filled" className="save-import__lead">
            Planned sims your save can fill
          </h3>
          <label className="planrev__auto">
            <input type="checkbox" checked={auto} onChange={(e) => onAuto(e.target.checked)} />
            Match the sure ones for me
          </label>
          {plan.suggestions.map((s) => {
            const picked = choices.matches[s.slotId] ?? '';
            const sure = s.candidates.find((c) => c.sure);
            return (
              <div key={s.slotId} className="planrev__item">
                <label className="planrev__what" htmlFor={`planrev-${s.slotId}`}>
                  <b>{name(s.slotId)}</b>
                  <span>
                    {s.kind === 'child' ? 'planned child' : 'planned partner'}
                    {sure && picked === sure.saveSimId && auto ? ' · matched for you' : ''}
                  </span>
                </label>
                <select
                  id={`planrev-${s.slotId}`}
                  value={picked}
                  onChange={(e) =>
                    onChange({ ...choices, matches: { ...choices.matches, [s.slotId]: e.target.value } })
                  }
                >
                  <option value="">Not yet: keep planned</option>
                  {s.candidates.map((c) => {
                    const other = takenBy.get(c.saveSimId);
                    return (
                      <option key={c.saveSimId} value={c.saveSimId} disabled={!!other && other !== s.slotId}>
                        {c.name} · {c.why}
                        {other && other !== s.slotId ? ` (fills ${name(other)})` : ''}
                      </option>
                    );
                  })}
                </select>
              </div>
            );
          })}
          <p className="planrev__note">
            A match keeps the planned card's links, and takes the name, gender and age from your
            save. You can unlink it later in the sim's editor.
          </p>
        </section>
      )}
      {plan.conflicts.length > 0 && (
        <section className="planrev" aria-labelledby="planrev-off">
          <h3 id="planrev-off" className="save-import__lead">
            Where your game went another way
          </h3>
          {plan.conflicts.map((c) => {
            const choice = choices.resolve[c.edgeId] ?? 'later';
            const move = plan.moves[c.edgeId];
            const left = c.sim === c.a ? c.b : c.a;
            const effect =
              choice === 'follow'
                ? c.kind === 'otherParents'
                  ? `Removes ${name(c.a)} as a planned parent.`
                  : c.kind === 'deceased'
                    ? `Removes the planned couple${c.children.length ? `; their planned children keep ${name(c.a === c.dead ? c.b : c.a)}` : ''}.`
                    : `Removes the planned couple${c.children.length ? `; their planned children are planned with ${name(c.partner!)} instead of ${name(left)}` : ''}${move ? `. ${name(move.simId)} goes back to the ${move.fromHh} household` : ''}.`
                : choice === 'keep'
                  ? 'Stays violet, and is no longer flagged.'
                  : choice === 'drop'
                    ? `Removes the planned ${c.kind === 'otherParents' ? 'parent' : 'couple and their planned children'}.`
                    : 'Stays as it is, flagged ⚠ on the board until you decide in the editor.';
            return (
              <div key={c.edgeId} className="planrev__item">
                <label className="planrev__what" htmlFor={`planrev-${c.edgeId}`}>
                  <b>{conflictText(c, name)}</b>
                  {c.children.length > 0 && (
                    <span>
                      Planned {c.children.length === 1 ? 'child' : 'children'}:{' '}
                      {c.children.map(name).join(', ')}
                    </span>
                  )}
                </label>
                <select
                  id={`planrev-${c.edgeId}`}
                  value={choice}
                  onChange={(e) =>
                    onChange({
                      ...choices,
                      resolve: { ...choices.resolve, [c.edgeId]: e.target.value as PlanChoice | 'later' },
                    })
                  }
                >
                  {(['follow', 'keep', 'drop', 'later'] as const).map((k) => (
                    <option key={k} value={k}>
                      {CHOICE_LABEL[k]}
                    </option>
                  ))}
                </select>
                <p className="planrev__effect">{effect}</p>
              </div>
            );
          })}
        </section>
      )}
      {stillPlanned > 0 && (
        <p className="planrev__still">
          <b>{stillPlanned}</b> other planned {stillPlanned === 1 ? 'link stays' : 'links stay'}{' '}
          planned (violet).
        </p>
      )}
    </>
  );
}
