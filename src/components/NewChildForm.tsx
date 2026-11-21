import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { SimCard } from './SimCard.tsx';
import { NEW_SIM_GENDERS } from '../lib/constants.ts';
import { GENDER_NOT_KNOWN, shortName } from '../lib/plan.ts';
import { whyCantAdopt } from '../lib/adoption.ts';
import {
  ADOPTED_AGES,
  MAX_PARENTS,
  canParent,
  childSurnames,
  parentSearch,
  type ChildArrival,
  type ChildChoice,
} from '../lib/childParents.ts';
import { simCardClass, type SimCardOptions } from '../lib/simCard.ts';
import type { SimNode } from '../types/whiteboard.ts';

/** A couple living there, offered as a quick pick: never picked for you. */
export type ParentPair = { a: string; b: string; names: string };

export type NewChildProps = {
  /** The household's sims who could be parents (householdParents). */
  household: readonly SimNode[];
  /** Everyone living there, for the household's last names. */
  members: readonly SimNode[];
  /** "the Goth household", for "Joins the Goth household". */
  home: string;
  /** The household's name, its last name when no one there has one. */
  hh: string;
  /** Every sim, for Someone else. */
  nodes: readonly SimNode[];
  /** When a sim is grown for the plan, on their card: a date, never whether the game allows it (whenLine). */
  whenOf: (n: SimNode) => string | null;
  /** Couples together now with one of them living there. */
  pairs: readonly ParentPair[];
  cards: Pick<SimCardOptions, 'dynasties' | 'risks'>;
  onAdd: (choice: ChildChoice) => void;
  /** Adopt a sim already on the board, by the adopters picked. */
  onAdoptExisting: (adopters: string[]) => void;
};

const GENDER_CHOICES = [...NEW_SIM_GENDERS, GENDER_NOT_KNOWN] as const;
const genderLabel = (g: string) => (g === GENDER_NOT_KNOWN ? 'Not decided' : g);

/**
 * "A child", from a household's ＋: born or adopted, then its parents,
 * chosen and never guessed: up to two sims, linked or not, from the
 * household or anyone on the board, or none. A couple living there is a
 * quick pick, never picked for you. Any living sim can be picked, a child
 * or a baby not born yet too: a plan is for later, and their card says
 * when they're grown, in grey. The last name is asked only when the
 * parents' (or, with none, the household's) differ.
 */
export function NewChildForm({ household, members, home, hh, nodes, whenOf, pairs, cards, onAdd, onAdoptExisting }: NewChildProps) {
  const id = useId();
  const [arrives, setArrives] = useState<ChildArrival>('born');
  const [picked, setPicked] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [sur, setSur] = useState<string | null>(null);
  const [age, setAge] = useState<string>(ADOPTED_AGES[0]);
  const [gender, setGender] = useState<string>(GENDER_NOT_KNOWN);
  const [askSur, setAskSur] = useState(false);
  const firstRef = useRef<HTMLButtonElement>(null);
  const surRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    // A frame later: the menu is hidden while it measures where it fits.
    const f = requestAnimationFrame(() => firstRef.current?.focus());
    return () => cancelAnimationFrame(f);
  }, []);

  const byid = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const own = useMemo(() => new Set(household.map((n) => n.id)), [household]);
  const pickedSims = picked.map((p) => byid.get(p)).filter((n): n is SimNode => !!n);
  // The household's own, then anyone picked from elsewhere.
  const listed = [...household, ...pickedSims.filter((n) => !own.has(n.id))];
  const found = parentSearch(nodes, query, new Set([...own, ...picked]));
  const quick = pairs.filter((p) => {
    const a = byid.get(p.a);
    const b = byid.get(p.b);
    return !!a && !!b && canParent(a) && canParent(b);
  });
  const full = picked.length >= MAX_PARENTS;
  const surnames = childSurnames(pickedSims, members, hh);
  const chosenSur = surnames.length === 1 ? surnames[0]! : sur && surnames.includes(sur) ? sur : null;
  const adopters = arrives === 'adopted' && pickedSims.length > 0 && pickedSims.every((p) => !whyCantAdopt(p));

  const toggle = (sim: string) =>
    setPicked((cur) => (cur.includes(sim) ? cur.filter((x) => x !== sim) : cur.length < MAX_PARENTS ? [...cur, sim] : cur));
  const pickFound = (sim: string) => {
    toggle(sim);
    setQuery('');
  };

  const surWhy = (): string => {
    const s = surnames[0] ?? '';
    if (!pickedSims.length) return `Takes ${s}, the household’s last name.`;
    if (pickedSims.length === 1) return `Takes ${s}, ${shortName(pickedSims[0]!)}’s last name.`;
    return `Takes ${s}, their last name.`;
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!chosenSur) {
      setAskSur(true);
      surRef.current?.focus();
      return;
    }
    onAdd({
      arrives,
      parents: picked,
      sur: chosenSur,
      ...(arrives === 'adopted' ? { age, gender } : {}),
    });
  };

  const card = (n: SimNode, outside: boolean) => {
    const on = picked.includes(n.id);
    return (
      <li key={n.id}>
        <button
          type="button"
          className={`${simCardClass(n)} simcard--pick`}
          aria-pressed={on}
          disabled={!on && full}
          title={!on && full ? 'Two at most: untick one first' : undefined}
          onClick={() => toggle(n.id)}
        >
          <SimCard sim={n} {...cards} world={outside} when={whenOf(n)} />
        </button>
      </li>
    );
  };

  const clearQuery = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && query) {
      // The first Esc clears the name; the next goes back.
      e.stopPropagation();
      setQuery('');
    } else if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (found[0] && !full) pickFound(found[0].id);
    }
  };

  return (
    <form className="childform" onSubmit={submit}>
      <span className="addmenu__label" id={`${id}-how`}>
        How they arrive
      </span>
      <div className="pmenu__kinds addmenu__choices" role="radiogroup" aria-labelledby={`${id}-how`}>
        {(['born', 'adopted'] as const).map((a, i) => (
          <button
            key={a}
            ref={i === 0 ? firstRef : undefined}
            type="button"
            role="radio"
            aria-checked={arrives === a}
            className="pmenu__kind"
            onClick={() => setArrives(a)}
          >
            {a === 'born' ? 'Born' : 'Adopted'}
          </button>
        ))}
      </div>
      {arrives === 'adopted' && (
        <>
          <span className="addmenu__label" id={`${id}-age`}>
            Life stage
          </span>
          <div className="pmenu__kinds addmenu__choices" role="radiogroup" aria-labelledby={`${id}-age`}>
            {ADOPTED_AGES.map((a) => (
              <button key={a} type="button" role="radio" aria-checked={age === a} className="pmenu__kind" onClick={() => setAge(a)}>
                {a}
              </button>
            ))}
          </div>
          <span className="addmenu__label" id={`${id}-gender`}>
            Gender
          </span>
          <div className="pmenu__kinds addmenu__choices" role="radiogroup" aria-labelledby={`${id}-gender`}>
            {GENDER_CHOICES.map((g) => (
              <button key={g} type="button" role="radio" aria-checked={gender === g} className="pmenu__kind" onClick={() => setGender(g)}>
                {genderLabel(g)}
              </button>
            ))}
          </div>
        </>
      )}
      <span className="addmenu__label" id={`${id}-parents`}>
        {`${arrives === 'born' ? 'Parents' : 'Adopted by'}: up to two, or none`}
      </span>
      {quick.length > 0 && (
        <div className="childform__pairs">
          <span>Together here:</span>
          {quick.map((p) => {
            const on = picked.length === 2 && picked.includes(p.a) && picked.includes(p.b);
            return (
              <button key={`${p.a}|${p.b}`} type="button" className="childform__pair" aria-pressed={on} onClick={() => setPicked(on ? [] : [p.a, p.b])}>
                {p.names}
              </button>
            );
          })}
        </div>
      )}
      <ul className="simcards childform__list" role="group" aria-labelledby={`${id}-parents`}>
        {listed.map((n) => card(n, !own.has(n.id)))}
      </ul>
      <input
        className="pmenu__search childform__find"
        type="search"
        aria-label="Someone else: find any sim on the board"
        placeholder="Someone else: find any sim on the board"
        value={query}
        disabled={full}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={clearQuery}
      />
      {query.trim() &&
        (found.length ? (
          <ul className="simcards childform__list" aria-label="Found">
            {found.map((n) => (
              <li key={n.id}>
                <button type="button" className={`${simCardClass(n)} simcard--pick`} aria-pressed={false} onClick={() => pickFound(n.id)}>
                  <SimCard sim={n} {...cards} world when={whenOf(n)} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="pmenu__empty">No one by that name who could be a parent.</p>
        ))}
      {surnames.length > 1 ? (
        <>
          <span className="addmenu__label" id={`${id}-sur`}>
            Last name
          </span>
          <div className="pmenu__kinds addmenu__choices" role="radiogroup" aria-labelledby={`${id}-sur`}>
            {surnames.map((s, i) => (
              <button
                key={s}
                ref={i === 0 ? surRef : undefined}
                type="button"
                role="radio"
                aria-checked={chosenSur === s}
                className="pmenu__kind"
                onClick={() => {
                  setSur(s);
                  setAskSur(false);
                }}
              >
                {s}
              </button>
            ))}
          </div>
          {askSur && !chosenSur && (
            <p className="childform__ask" role="alert">
              Which last name will they have?
            </p>
          )}
        </>
      ) : (
        <p className="addmenu__note childform__sur">{surWhy()}</p>
      )}
      <p className="addmenu__note">
        {arrives === 'born'
          ? 'Woohoo, a science baby or one parent: any sims, linked or not. With none picked, they join with no parents on the board.'
          : 'One adopter, two, or none on the board: linked or not.'}
      </p>
      <button type="submit" className="addmenu__go">
        Add the child
      </button>
      <p className="addmenu__note childform__after">{`Joins ${home}. Planned until a save brings them.`}</p>
      {arrives === 'adopted' && (
        <>
          <p className="childform__or">Or</p>
          <button type="button" className="cmenu__pick" disabled={!adopters} onClick={() => onAdoptExisting(picked)}>
            <span className="cmenu__title">Adopt a sim already on the board</span>
            <span className="cmenu__sub">{adopters ? 'Someone younger who isn’t family yet' : 'Tick who adopts first'}</span>
          </button>
        </>
      )}
    </form>
  );
}
