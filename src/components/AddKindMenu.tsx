import { SheetGrabber } from './SheetGrabber.tsx';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { CloseButton } from './CloseButton.tsx';
import { useFitMenuInStage } from '../hooks/useFitMenuInStage.ts';
import { AGES_H, NEW_SIM_GENDERS, SPECIES } from '../lib/constants.ts';
import { GENDER_NOT_KNOWN } from '../lib/plan.ts';
import type { PetKind } from '../lib/pets.ts';
import { CaretLeft } from '../icons.ts';
import { useLightDismiss } from '../hooks/useLightDismiss.ts';
import type { HomeChoice, HomePlace } from '../lib/whereTheyLive.ts';
import { WherePicker } from './WherePicker.tsx';
import { NewChildForm, type NewChildProps } from './NewChildForm.tsx';

/** A sim moving in, as the menu asks for them: a life stage, and a gender or none decided. */
export type NewSimChoice = { age: string; gender: string };

type Props = {
  x: number;
  y: number;
  /** "Who’s joining the Goth household?", "Add to the board". */
  title: string;
  /** The pets your packs allow (petKindsAvailable). */
  kinds: readonly PetKind[];
  /** From a household's ＋: "A child", born or adopted, its parents chosen (none from the bar). */
  child?: NewChildProps;
  /** A planned sim, at the life stage and gender chosen; from the bar, where they live too. */
  onSim: (choice: NewSimChoice, to?: HomeChoice) => void;
  /** A pet of that species; from the bar, where it lives too. */
  onPet: (species: string, to?: HomeChoice) => void;
  /** From the bar, where no household is given: ask where they'll live, from these places. */
  where?: { places: readonly HomePlace[]; inView: string | null; limit: number | null };
  onClose: () => void;
};

const GENDER_CHOICES = [...NEW_SIM_GENDERS, GENDER_NOT_KNOWN] as const;
const genderLabel = (g: string) => (g === GENDER_NOT_KNOWN ? 'Not decided' : g);

/**
 * Who joins, from a household's ＋ or the bar's Add: a child there, born
 * or adopted, whose parents you choose (NewChildForm: two, one or none,
 * never guessed from a romance), a sim moving in, or a pet your packs
 * allow. A sim moving in asks their life stage and gender first, with
 * Young Adult and Not decided picked: the board guesses neither. Every one
 * is planned, named "Planned" and their last name until you name them.
 */
export function AddKindMenu({ x, y, title, kinds, child, onSim, onPet, where, onClose }: Props) {
  const { compact, ref, style, sheet } = useFitMenuInStage(x, y);
  // The bar's Add button toggles the menu itself.
  useLightDismiss(ref, onClose, { keep: '#btnAdd' });
  const [step, setStep] = useState<'pick' | 'sim' | 'child' | 'where'>('pick');
  /** Who they are, kept while the bar's Add asks where they live. */
  const [who, setWho] = useState<{ sim: NewSimChoice } | { species: string } | null>(null);
  const [age, setAge] = useState<string>('Young Adult');
  const [gender, setGender] = useState<string>(GENDER_NOT_KNOWN);
  const firstRef = useRef<HTMLButtonElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    // A frame later: the menu is hidden while it measures where it fits.
    // The where and child steps focus their own first control.
    if (step === 'where' || step === 'child') return;
    const f = requestAnimationFrame(() => (step === 'sim' ? addRef.current : firstRef.current)?.focus());
    return () => cancelAnimationFrame(f);
  }, [step]);
  const close = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    if (step === 'where') setStep(who && 'sim' in who ? 'sim' : 'pick');
    else if (step === 'sim' || step === 'child') setStep('pick');
    else onClose();
  };
  const fromHousehold = !!child;
  return (
    <div
      ref={ref}
      id="menu"
      className={compact ? 'menu menu--sheet pmenu' : 'menu pmenu'}
      role="dialog"
      aria-label={step === 'where' ? 'Where will they live?' : step === 'sim' ? 'A sim moving in' : step === 'child' ? 'A child' : title}
      style={style}
      onKeyDown={close}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <SheetGrabber sheet={sheet} what="the menu" />
      <div className="pmenu__head">
        {step === 'where' ? (
          <button type="button" className="pmenu__back" onClick={() => setStep(who && 'sim' in who ? 'sim' : 'pick')}>
            <CaretLeft aria-hidden="true" weight="bold" />
            <b>Where will they live?</b>
          </button>
        ) : step === 'sim' || step === 'child' ? (
          <button type="button" className="pmenu__back" onClick={() => setStep('pick')}>
            <CaretLeft aria-hidden="true" weight="bold" />
            <b>{step === 'child' ? 'A child' : fromHousehold ? 'A sim moving in' : 'A sim'}</b>
          </button>
        ) : (
          <b>{title}</b>
        )}
        <CloseButton label="Close" onClick={onClose} />
      </div>
      {step === 'pick' ? (
        <>
          {child && (
            <button ref={firstRef} type="button" className="cmenu__pick" onClick={() => setStep('child')}>
              <span className="cmenu__title">A child</span>
              <span className="cmenu__sub">Born or adopted; you choose the parents, if any</span>
            </button>
          )}
          <button
            ref={child ? undefined : firstRef}
            type="button"
            className="cmenu__pick"
            onClick={() => setStep('sim')}
          >
            <span className="cmenu__title">{fromHousehold ? 'A sim moving in' : 'A sim'}</span>
            <span className="cmenu__sub">Choose their life stage and gender</span>
          </button>
          {kinds.map((k) => (
            <button
              key={k.species}
              type="button"
              className="cmenu__pick"
              onClick={() => {
                if (!where) return onPet(k.species);
                setWho({ species: k.species });
                setStep('where');
              }}
            >
              <span className="cmenu__title">
                <span aria-hidden="true">{SPECIES[k.species]} </span>A {k.species.toLowerCase()}
              </span>
              <span className="cmenu__sub">An adult from {k.pack}; plan a {k.young.toLowerCase()} from its ＋</span>
            </button>
          ))}
        </>
      ) : step === 'child' && child ? (
        <NewChildForm {...child} />
      ) : step === 'where' && where && who ? (
        <>
          <p className="addmenu__who">
            {'sim' in who ? `A planned sim · ${who.sim.age}${who.sim.gender !== GENDER_NOT_KNOWN ? ` · ${who.sim.gender}` : ''}` : `A ${who.species.toLowerCase()}`}
          </p>
          <WherePicker
            places={where.places}
            inView={where.inView}
            limit={where.limit}
            adding={1}
            onPick={(to) => ('sim' in who ? onSim(who.sim, to) : onPet(who.species, to))}
          />
        </>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!where) return onSim({ age, gender });
            setWho({ sim: { age, gender } });
            setStep('where');
          }}
        >
          <span className="addmenu__label" id={`${id}-age`}>
            Life stage
          </span>
          <div className="pmenu__kinds addmenu__choices" role="radiogroup" aria-labelledby={`${id}-age`}>
            {AGES_H.map((a) => (
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
          <p className="addmenu__note">
            Planned until a save brings them. {where ? 'Next, where they live; then you name them.' : 'You name them next.'}
          </p>
          <button ref={addRef} type="submit" className="addmenu__go">
            {where ? 'Next' : 'Add them'}
          </button>
        </form>
      )}
    </div>
  );
}
