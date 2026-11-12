import { useId, useMemo, useState } from 'react';
import { DECEASED_STATE } from '../lib/constants.ts';
import { cardName, isPlannedSim } from '../lib/plan.ts';
import { petAgeLabel, youngWord } from '../lib/pets.ts';
import { edgeSourceOf } from '../lib/utils.ts';
import type { Edge, SimNode } from '../types/whiteboard.ts';

type Props = {
  pet: SimNode;
  nodes: SimNode[];
  edges: Edge[];
  /** Make `parentId` a parent of this pet, a plan until a save has it. */
  onLinkParent: (parentId: string) => void;
  /** Take a link off the board. */
  onDeleteLink: (edgeId: string) => void;
  /** Plan a young of this pet, with another parent or alone. */
  onPlanYoung: (parentIds: string[]) => void;
};

/**
 * A pet's family, as the game keeps one: its parents (two at most, of its
 * kind), its young and its siblings. Pets don't marry or date, so there
 * are no partners: a kitten is planned with a second parent picked here.
 * Every link it adds is a plan until a save shows it, as for sims.
 */
export function PetFamily({ pet, nodes, edges, onLinkParent, onDeleteLink, onPlanYoung }: Props) {
  const id = useId();
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const young = youngWord(pet.species);
  const kind = (pet.species ?? 'pet').toLowerCase();
  const parentLinks = edges.filter((e) => e.type === 'parent' && e.b === pet.id && byId.has(e.a));
  const childLinks = edges.filter((e) => e.type === 'parent' && e.a === pet.id && byId.has(e.b));
  const parentIds = new Set(parentLinks.map((e) => e.a));
  const siblings = useMemo(() => {
    const mine = new Set(edges.filter((e) => e.type === 'parent' && e.b === pet.id).map((e) => e.a));
    const out = new Set<string>();
    for (const e of edges) {
      if (e.type !== 'parent' || !mine.has(e.a) || e.b === pet.id) continue;
      out.add(e.b);
    }
    return [...out].map((x) => byId.get(x)).filter((n): n is SimNode => !!n);
  }, [edges, pet.id, byId]);
  /** Its descendants: never its parent. */
  const below = useMemo(() => {
    const out = new Set<string>();
    const queue = [pet.id];
    while (queue.length) {
      const x = queue.pop()!;
      for (const e of edges) {
        if (e.type !== 'parent' || e.a !== x || out.has(e.b)) continue;
        out.add(e.b);
        queue.push(e.b);
      }
    }
    return out;
  }, [edges, pet.id]);
  const sameKind = nodes
    .filter((n) => n.id !== pet.id && n.species === pet.species && !isPlannedSim(n))
    .sort((a, b) => cardName(a).localeCompare(cardName(b)));
  const parentChoices = sameKind.filter((n) => !parentIds.has(n.id) && !below.has(n.id));
  const mates = sameKind.filter((n) => n.state !== DECEASED_STATE && n.age !== 'Child' && !below.has(n.id) && !parentIds.has(n.id));
  const [mate, setMate] = useState('');
  const canHaveYoung = !isPlannedSim(pet) && pet.state !== DECEASED_STATE && pet.age !== 'Child';

  const row = (n: SimNode, e?: Edge) => (
    <li key={n.id} className="petfam__row">
      <span className="petfam__who">
        {cardName(n)}
        <span className="petfam__meta">
          {' '}
          · {n.gender && n.gender !== '-' ? `${n.gender}, ` : ''}
          {isPlannedSim(n) ? 'not born yet' : petAgeLabel(n.species, n.age).toLowerCase()}
          {n.state === DECEASED_STATE ? ', passed away' : ''}
        </span>
        {e && edgeSourceOf(e) === 'planned' && <span className="edlinks__tag">planned</span>}
      </span>
      {e && (
        <button
          type="button"
          className="petfam__x"
          aria-label={`Remove the link to ${cardName(n)}`}
          title="Remove this link"
          onClick={() => onDeleteLink(e.id)}
        >
          ✕
        </button>
      )}
    </li>
  );

  return (
    <div className="petfam">
      <section aria-labelledby={`${id}-parents`}>
        <div className="edlabel">
          <span className="edlabel__text" id={`${id}-parents`}>
            Parents
          </span>
        </div>
        {parentLinks.length ? (
          <ul className="petfam__list">{parentLinks.map((e) => row(byId.get(e.a)!, e))}</ul>
        ) : (
          <p className="edhint">No parents on the board.</p>
        )}
        {parentLinks.length < 2 && parentChoices.length > 0 && (
          <>
            <label htmlFor={`${id}-addparent`}>Add a parent</label>
            <select
              id={`${id}-addparent`}
              value=""
              onChange={(e) => {
                if (e.target.value) onLinkParent(e.target.value);
              }}
            >
              <option value="">Pick a {kind}</option>
              {parentChoices.map((n) => (
                <option key={n.id} value={n.id}>
                  {cardName(n)}
                </option>
              ))}
            </select>
          </>
        )}
      </section>

      <section aria-labelledby={`${id}-young`}>
        <div className="edlabel">
          <span className="edlabel__text" id={`${id}-young`}>
            Young
          </span>
        </div>
        {childLinks.length ? (
          <ul className="petfam__list">{childLinks.map((e) => row(byId.get(e.b)!, e))}</ul>
        ) : (
          <p className="edhint">No young on the board.</p>
        )}
        {canHaveYoung && (
          <div className="petfam__plan">
            <label htmlFor={`${id}-mate`}>Plan a {young} with</label>
            <div className="petfam__planrow">
              <select id={`${id}-mate`} value={mate} onChange={(e) => setMate(e.target.value)}>
                <option value="">No other parent yet</option>
                {mates.map((n) => (
                  <option key={n.id} value={n.id}>
                    {cardName(n)}
                  </option>
                ))}
              </select>
              <button type="button" className="petfam__go" onClick={() => onPlanYoung(mate ? [pet.id, mate] : [pet.id])}>
                Plan a {young}
              </button>
            </div>
            <p className="edhint">
              Not born yet until a save has it: your next save fills it in with the {young} the game has.
            </p>
          </div>
        )}
      </section>

      {siblings.length > 0 && (
        <section aria-labelledby={`${id}-siblings`}>
          <div className="edlabel">
            <span className="edlabel__text" id={`${id}-siblings`}>
              Siblings
            </span>
          </div>
          <ul className="petfam__list">{siblings.map((n) => row(n))}</ul>
        </section>
      )}
    </div>
  );
}
