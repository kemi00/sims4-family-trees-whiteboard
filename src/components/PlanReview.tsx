import { conflictText, type PlanChoice, type PlanConflict, type SlotCandidate } from '../lib/plan.ts';
import {
  childCandidates,
  effectiveMatches,
  overruledBy,
  withConflictChoice,
  type PlanChoices,
  type PlannedChildReview,
  type SavePlanReview,
} from '../lib/planReview.ts';

const CHOICE_LABEL: Record<PlanChoice | 'later', string> = {
  follow: 'Follow the game',
  keep: 'Keep my plan',
  drop: 'Drop it',
  later: 'Decide later',
};

/** "Beatrice & Dirk", "Ana, Bo & Cy". */
function andList(items: string[]): string {
  if (items.length < 2) return items.join('');
  return `${items.slice(0, -1).join(', ')} & ${items[items.length - 1]}`;
}

/** Their possessive word: their own pronoun when the game has one. */
const pronoun = (c: SlotCandidate) =>
  c.pronouns?.possessive ?? (c.gender === 'Female' ? 'her' : c.gender === 'Male' ? 'his' : 'their');
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * The import's second step: how your plan meets this save. One rule leads
 * it: the save is the truth. Then each plan the game went against, with the
 * planned children that depend on it asked about inside it, after the
 * choice they depend on; then planned sims the save can fill outside those.
 * Choices apply on Proceed; nothing here changes the board by itself.
 */
export function PlanReview({
  plan,
  choices,
  auto,
  onAuto,
  onChange,
}: {
  plan: SavePlanReview;
  choices: PlanChoices;
  auto: boolean;
  onAuto: (on: boolean) => void;
  onChange: (next: PlanChoices) => void;
}) {
  const name = (id: string) => plan.names[id] ?? 'someone';
  const first = (id: string) => plan.firsts[id] ?? name(id);
  const firsts = (ids: string[]) => andList(ids.map(first));
  const live = effectiveMatches(plan, choices);
  const takenBy = new Map(Object.entries(live).map(([slot, save]) => [save, slot]));
  const nested = plan.conflicts.flatMap((c) => plan.children[c.edgeId] ?? []);
  const anyToFill =
    plan.suggestions.length > 0 || nested.some((k) => k.follow.length > 0 || k.keep.length > 0);
  const pick = (slotId: string, save: string) =>
    onChange({ ...choices, matches: { ...choices.matches, [slotId]: save } });

  const parentWord = (ids: string[]) =>
    ids.length > 1
      ? 'parents'
      : plan.genders[ids[0]!] === 'Female'
        ? 'mother'
        : plan.genders[ids[0]!] === 'Male'
          ? 'father'
          : 'parent';

  /** What filling a planned sim with this save sim does, in a sentence. */
  const fillEffect = (slotId: string, c: SlotCandidate, kind: 'child' | 'spouse', planned: string[]) => {
    const their = pronoun(c);
    if (kind === 'spouse') {
      return `${c.name} takes ${name(slotId)}’s place, with ${their} name, gender and age from your save.`;
    }
    const over = overruledBy(c, planned, plan.saveIds);
    return (
      `${c.name} takes ${name(slotId)}’s place. ${cap(their)} name, gender, age and parents come from your save` +
      (over.length
        ? `, so ${firsts(over)} ${over.length === 1 ? 'is' : 'are'} no longer ${their} planned ${parentWord(over)}.`
        : '.')
    );
  };

  /** The dropdown of who fills a planned sim. */
  const matchSelect = (slotId: string, list: SlotCandidate[]) => (
    <select id={`planrev-${slotId}`} value={live[slotId] ?? ''} onChange={(e) => pick(slotId, e.target.value)}>
      <option value="">Not yet: keep planned</option>
      {list.map((c) => {
        const other = takenBy.get(c.saveSimId);
        const elsewhere = !!other && other !== slotId;
        return (
          <option key={c.saveSimId} value={c.saveSimId} disabled={elsewhere}>
            {c.name} · {c.why}
            {elsewhere ? ` (fills ${name(other)})` : ''}
          </option>
        );
      })}
    </select>
  );

  const matchedForYou = (slotId: string, list: SlotCandidate[]) => {
    const sure = list.find((c) => c.sure);
    return auto && !!sure && live[slotId] === sure.saveSimId ? ' · matched for you' : '';
  };

  /** A planned child of a couple the game went against, asked about under the couple's choice. */
  const childBlock = (k: PlannedChildReview, choice: PlanChoice | 'later') => {
    const slot = name(k.slotId);
    const list = childCandidates(k, choice);
    const parents = choice === 'follow' ? k.followParents : k.parents;
    const picked = list.find((c) => c.saveSimId === live[k.slotId]);
    let ask = '';
    let effect: string;
    if (list.length) {
      const n = list.length;
      ask = list.every((c) => c.all)
        ? `Your save has ${n} new ${n === 1 ? 'child' : 'children'} of ${firsts(parents)}. Is ${n === 1 ? 'this' : 'one of them'} ${slot}?`
        : `Is ${n === 1 ? 'this new sim' : 'one of these new sims'} in your save ${slot}?`;
      effect = picked
        ? fillEffect(k.slotId, picked, 'child', k.parents)
        : `${slot} stays planned, as the child of ${firsts(parents)}.`;
    } else if (choice === 'follow') {
      effect = parents.length
        ? `${slot} will be planned as the child of ${firsts(parents)}.`
        : `${slot} stays planned, with no planned parents.`;
    } else if (choice === 'keep') {
      effect =
        `${slot} stays planned, as the child of ${firsts(k.parents)}.` +
        (k.follow.length
          ? ` None of the new children in your save is ${firsts(k.parents)}’s, so none of them can be ${slot}.`
          : '');
    } else if (choice === 'drop') {
      effect = k.dropRemoves
        ? `${slot} is removed with the plan.`
        : `${slot} stays, no longer planned as ${firsts(k.parents)}’s child.`;
    } else {
      effect = `Decide about the couple first. ${slot} stays planned until then.`;
    }
    const head = (
      <>
        <b>{slot}</b>
        <span>
          planned child of {firsts(k.parents)}
          {matchedForYou(k.slotId, list)}
        </span>
      </>
    );
    return (
      <div key={k.slotId} className="planrev__child">
        {list.length ? (
          <label className="planrev__what" htmlFor={`planrev-${k.slotId}`}>
            {head}
          </label>
        ) : (
          <div className="planrev__what">{head}</div>
        )}
        {ask && <p className="planrev__ask">{ask}</p>}
        {list.length > 0 && matchSelect(k.slotId, list)}
        <p className="planrev__effect">{effect}</p>
      </div>
    );
  };

  /** What a choice does to the planned couple (or parent) itself. */
  const conflictEffect = (c: PlanConflict, choice: PlanChoice | 'later') => {
    const slots = new Set((plan.children[c.edgeId] ?? []).map((k) => k.slotId));
    const real = c.children.filter((id) => !slots.has(id));
    const link = plan.linkTypes[c.edgeId] === 'marriage' ? 'marriage' : 'romance';
    const left = c.sim === c.a ? c.b : c.a;
    const move = plan.moves[c.edgeId];
    if (choice === 'keep') return 'Stays violet, and is no longer flagged.';
    if (choice === 'later') return 'Stays as it is, flagged ⚠ on the board until you decide in the editor.';
    if (c.kind === 'otherParents') return `Removes ${name(c.a)} as a planned parent.`;
    if (choice === 'drop') {
      return `Removes the planned ${link}${real.length ? ` and its planned links to ${andList(real.map(name))}` : ''}.`;
    }
    if (c.kind === 'deceased') {
      const living = c.a === c.dead ? c.b : c.a;
      return `Removes the planned ${link}${real.length ? `; ${andList(real.map(name))} keep${real.length === 1 ? 's' : ''} ${first(living)} as planned parent` : ''}.`;
    }
    return (
      `Removes the planned ${link} ${link === 'marriage' ? 'to' : 'with'} ${name(left)}.` +
      (real.length
        ? ` ${andList(real.map(name))} ${real.length === 1 ? 'is' : 'are'} planned with ${first(c.partner!)} instead of ${first(left)}.`
        : '') +
      (move ? ` ${name(move.simId)} goes back to the ${move.fromHh} household.` : '')
    );
  };

  return (
    <>
      <p className="planrev__rule">
        <b>Your save is the truth.</b> Names, genders, ages and parents come from the game. Your
        plan covers what the game hasn’t decided yet.
      </p>
      {anyToFill && (
        <label className="planrev__auto">
          <input type="checkbox" checked={auto} onChange={(e) => onAuto(e.target.checked)} />
          Match the sure ones for me
        </label>
      )}
      {plan.conflicts.length > 0 && (
        <section className="planrev" aria-labelledby="planrev-off">
          <h3 id="planrev-off" className="save-import__lead">
            Where your game went another way
          </h3>
          {plan.conflicts.map((c) => {
            const choice = choices.resolve[c.edgeId] ?? 'later';
            return (
              <div key={c.edgeId} className="planrev__item">
                <label className="planrev__what" htmlFor={`planrev-${c.edgeId}`}>
                  <b>{conflictText(c, name)}</b>
                </label>
                {plan.notes[c.edgeId] && (
                  <p className="planrev__yours">
                    <span className="sr-only">Your note: </span>
                    {plan.notes[c.edgeId]}
                  </p>
                )}
                <select
                  id={`planrev-${c.edgeId}`}
                  value={choice}
                  onChange={(e) =>
                    onChange(withConflictChoice(plan, choices, c.edgeId, e.target.value as PlanChoice | 'later', auto))
                  }
                >
                  {(['follow', 'keep', 'drop', 'later'] as const).map((k) => (
                    <option key={k} value={k}>
                      {CHOICE_LABEL[k]}
                    </option>
                  ))}
                </select>
                <p className="planrev__effect">{conflictEffect(c, choice)}</p>
                {(plan.children[c.edgeId] ?? []).map((k) => childBlock(k, choice))}
              </div>
            );
          })}
        </section>
      )}
      {plan.suggestions.length > 0 && (
        <section className="planrev" aria-labelledby="planrev-filled">
          <h3 id="planrev-filled" className="save-import__lead">
            Planned sims your save can fill
          </h3>
          {plan.suggestions.map((s) => {
            const picked = s.candidates.find((c) => c.saveSimId === live[s.slotId]);
            return (
              <div key={s.slotId} className="planrev__item">
                <label className="planrev__what" htmlFor={`planrev-${s.slotId}`}>
                  <b>{name(s.slotId)}</b>
                  <span>
                    planned {s.kind === 'child' ? 'child' : 'spouse'}
                    {s.of.length ? ` of ${firsts(s.of)}` : ''}
                    {matchedForYou(s.slotId, s.candidates)}
                  </span>
                </label>
                {matchSelect(s.slotId, s.candidates)}
                {picked && <p className="planrev__effect">{fillEffect(s.slotId, picked, s.kind, s.of)}</p>}
              </div>
            );
          })}
        </section>
      )}
      {plan.stillPlanned > 0 && (
        <p className="planrev__still">
          <b>{plan.stillPlanned}</b> other planned {plan.stillPlanned === 1 ? 'link stays' : 'links stay'}{' '}
          planned (violet).
        </p>
      )}
    </>
  );
}
