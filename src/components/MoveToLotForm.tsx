import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { CaretLeft } from '../icons.ts';
import { lotOptionLabel, lotPick, type GameLot } from '../lib/places.ts';

/** What a couple needs to move together onto a free lot (coupleLotChoices and the move itself). */
export type CoupleLots = {
  /** Each world's free lots, the couple's own worlds first. */
  choices: { world: string; lots: GameLot[] }[];
  /** Their household's name to start with: the first sim's last name. */
  suggested: string;
  /** The household of that name the world has already, if any: the new one is a second. */
  twin: (world: string, name: string) => string | undefined;
  onMove: (lot: GameLot, name: string) => void;
};

type Props = CoupleLots & {
  /** "Tai Lum and Mila Munch". */
  who: string;
  onBack: () => void;
};

/**
 * Both partners move together onto a free lot, an empty lot or an empty
 * house, as a new household: the world (theirs first), the lot, then the
 * household's name. The fields the household move form has, in its order.
 * A plan until a save shows it, as any move.
 */
export function MoveToLotForm({ choices, suggested, twin, onMove, who, onBack }: Props) {
  const id = useId();
  const [world, setWorld] = useState(choices[0]?.world ?? '');
  const [pick, setPick] = useState('');
  const [name, setName] = useState<string | null>(null);
  const worldRef = useRef<HTMLSelectElement>(null);
  const lots = choices.find((c) => c.world === world)?.lots ?? [];
  const lot = lots.find((l) => lotPick(l) === pick);
  const typed = name ?? suggested;
  const other = lot && typed.trim() ? twin(world, typed) : undefined;
  const ready = !!lot && !!typed.trim();

  useEffect(() => {
    // A frame later, as the menu's other steps: it settles where it fits first.
    const f = requestAnimationFrame(() => worldRef.current?.focus());
    return () => cancelAnimationFrame(f);
  }, []);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (ready) onMove(lot, typed.trim());
  };
  const onKeyDown = (e: KeyboardEvent<HTMLFormElement>) => {
    if (e.key !== 'Enter' || e.nativeEvent.isComposing || e.keyCode === 229) return;
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    e.stopPropagation();
    submit();
  };

  return (
    <>
      <div className="pmenu__head">
        <button type="button" className="pmenu__back" onClick={onBack}>
          <CaretLeft aria-hidden="true" weight="bold" />
          <b>A free lot for {who}</b>
        </button>
      </div>
      <form className="hhmove" onSubmit={submit} onKeyDown={onKeyDown}>
        <label htmlFor={`${id}world`}>World</label>
        <select
          ref={worldRef}
          id={`${id}world`}
          value={world}
          onChange={(e) => {
            setWorld(e.target.value);
            setPick('');
          }}
        >
          {choices.map((c) => (
            <option key={c.world} value={c.world}>
              {c.world} ({c.lots.length} free)
            </option>
          ))}
        </select>
        <label htmlFor={`${id}lot`}>Free lot</label>
        <select id={`${id}lot`} value={pick} onChange={(e) => setPick(e.target.value)}>
          <option value="" disabled>
            Choose a free lot
          </option>
          {lots.map((l) => (
            <option key={l.name} value={lotPick(l)}>
              {lotOptionLabel(l)}
            </option>
          ))}
        </select>
        <label htmlFor={`${id}name`}>{lot ? `Their household on ${lot.name}` : 'Their household'}</label>
        <input
          id={`${id}name`}
          placeholder="Household name"
          autoComplete="off"
          value={typed}
          aria-describedby={other ? `${id}twin` : undefined}
          onChange={(e) => setName(e.target.value)}
        />
        {other && lot && (
          <p id={`${id}twin`} className="hhmove__note">
            {world} has a {other} household already. This makes a second one, on {lot.name}.
          </p>
        )}
        <button type="submit" className="movego" disabled={!ready}>
          {lot ? `Move both to ${lot.name}` : 'Move both'}
        </button>
      </form>
    </>
  );
}
