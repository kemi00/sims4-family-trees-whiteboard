import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { NEW_HOUSEHOLD, householdNamed, householdOptions } from '../lib/householdMove.ts';
import type { Group, SimNode, World } from '../types/whiteboard.ts';

type Props = {
  /** Prefix for the field ids, unique on the page. */
  idPrefix: string;
  worlds: World[];
  groups: Group[];
  nodes: SimNode[];
  initialWorld: string;
  /** The household every moving sim already lives in: not offered. */
  exclude?: string;
  /** The button, which says who moves ("Move Bella here", "Move 3 sims here"). */
  submitLabel: string;
  onMove: (world: string, houseGid: string, newName: string) => void;
};

/**
 * World, then household, then a name for a new one: from the broad choice to
 * the narrow. "Create a new household…" leads the list, as moving sims out is
 * the usual reason to open this; the households that exist follow A to Z with
 * how many sims each holds. Enter moves from any field.
 */
export function HouseholdMoveForm({
  idPrefix,
  worlds,
  groups,
  nodes,
  initialWorld,
  exclude,
  submitLabel,
  onMove,
}: Props) {
  const [world, setWorld] = useState(initialWorld);
  const [house, setHouse] = useState<string>(NEW_HOUSEHOLD);
  const [name, setName] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);
  const options = householdOptions(groups, nodes, world, exclude);
  const isNew = house === NEW_HOUSEHOLD;
  const twin = isNew ? householdNamed(groups, nodes, world, name) : undefined;
  /** The name is the household they are all in already: nothing would move. */
  const stays = !!twin && twin.gid === exclude;
  const ready = isNew ? !!name.trim() && !stays : options.some((o) => o.gid === house);

  // Ready to type a name on a mouse; on a phone the keyboard would cover the form.
  useEffect(() => {
    if (window.matchMedia?.('(pointer: fine)').matches) nameRef.current?.focus();
  }, []);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (ready) onMove(world, house, name);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLFormElement>) => {
    if (e.key !== 'Enter' || e.nativeEvent.isComposing || e.keyCode === 229) return;
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    e.stopPropagation();
    submit();
  };

  return (
    <form className="hhmove" onSubmit={submit} onKeyDown={onKeyDown}>
      <label htmlFor={`${idPrefix}World`}>World</label>
      <select
        id={`${idPrefix}World`}
        value={world}
        onChange={(e) => {
          setWorld(e.target.value);
          setHouse(NEW_HOUSEHOLD);
        }}
      >
        {worlds.map((w) => (
          <option key={w.name} value={w.name}>
            {w.name}
          </option>
        ))}
      </select>
      <label htmlFor={`${idPrefix}House`}>Household</label>
      <select
        id={`${idPrefix}House`}
        value={house}
        onChange={(e) => {
          setHouse(e.target.value);
          if (e.target.value === NEW_HOUSEHOLD) requestAnimationFrame(() => nameRef.current?.focus());
        }}
      >
        <option value={NEW_HOUSEHOLD}>➕ Create a new household…</option>
        {options.map((o) => (
          <option key={o.gid} value={o.gid}>
            {o.hh} ({o.count})
          </option>
        ))}
      </select>
      {isNew && (
        <>
          <label htmlFor={`${idPrefix}Name`}>New household name</label>
          <input
            ref={nameRef}
            id={`${idPrefix}Name`}
            placeholder="Household name"
            autoComplete="off"
            value={name}
            aria-describedby={twin ? `${idPrefix}Twin` : undefined}
            onChange={(e) => setName(e.target.value)}
          />
          {twin && (
            <p id={`${idPrefix}Twin`} className="hhmove__note">
              {stays
                ? `They already live in the ${twin.hh} household. Choose another name.`
                : `${world} already has a ${twin.hh} household, so they will join it.`}
            </p>
          )}
        </>
      )}
      <button type="submit" className="movego" disabled={!ready}>
        {submitLabel}
      </button>
    </form>
  );
}
