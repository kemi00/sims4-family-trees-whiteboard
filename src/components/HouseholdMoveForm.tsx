import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { NEW_HOUSEHOLD, householdNamed, householdOptions } from '../lib/householdMove.ts';
import { freeLotsIn, householdLots, lotOfPick, lotPick, lotsIn, lotKindLabel, lotRoomsLabel } from '../lib/places.ts';
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
  /** A new household's name to start with: the mover's last name. */
  suggestedName?: string;
  onMove: (world: string, houseGid: string, newName: string) => void;
  /**
   * The household the one sim moving lives in, with how many others do.
   * A new household of its name in another world is most likely the whole
   * household moving, so the form offers that.
   */
  home?: { hh: string; world: string; others: number };
  /** Who moves alone, for "Move only Dirk". */
  who?: string;
  /** The whole household moves to `world`: onto the lot `house` picks, when it picks one. */
  onMoveHousehold?: (world: string, house?: string) => void;
};

/** "Brook Bungalow · Courtyard Lane · 3 bed, 2 bath", a free lot in the list. */
function lotOption(lot: ReturnType<typeof lotsIn>[number]): string {
  const rooms = lotRoomsLabel(lot);
  return [lot.name, lot.nb, rooms ? rooms.replace(' · ', ', ') : lotKindLabel(lot)].join(' · ');
}

/**
 * World, then household, then a name for a new one: from the broad choice to
 * the narrow. Sims join a household that exists or move into one of the
 * world's free lots, as in the game: a new household needs a lot. Only
 * where there are no lots (Not in any world) can one be made with none.
 * Enter moves from any field.
 */
export function HouseholdMoveForm({
  idPrefix,
  worlds,
  groups,
  nodes,
  initialWorld,
  exclude,
  submitLabel,
  suggestedName = '',
  onMove,
  home,
  who,
  onMoveHousehold,
}: Props) {
  const [world, setWorld] = useState(initialWorld);
  const homes = useMemo(() => householdLots(nodes), [nodes]);
  /** A world with no lots to live on: only there is a household made with none. */
  const lotless = (w: string) => lotsIn(w).length === 0;
  const startHouse = (w: string) => (lotless(w) ? NEW_HOUSEHOLD : '');
  const [house, setHouse] = useState<string>(() => startHouse(initialWorld));
  const [name, setName] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const options = householdOptions(groups, nodes, world, exclude);
  const free = lotless(world) ? [] : freeLotsIn(world, homes);
  const lot = lotOfPick(world, house);
  const isNew = house === NEW_HOUSEHOLD || !!lot;
  const typed = name ?? (lot ? suggestedName : '');
  const twin = isNew ? householdNamed(groups, nodes, world, typed) : undefined;
  /** The name is the household they are all in already: nothing would move. */
  const stays = !lot && !!twin && twin.gid === exclude;
  const ready = isNew ? !!typed.trim() && !stays : options.some((o) => o.gid === house);
  /** Their own household's name in another world: the household moving, most likely. */
  const wholeHome =
    isNew && !!home && !!onMoveHousehold && home.others > 0 && world !== home.world &&
    typed.trim().toLocaleLowerCase() === home.hh.trim().toLocaleLowerCase();

  // Ready to type a name on a mouse; on a phone the keyboard would cover the form.
  useEffect(() => {
    if (house === NEW_HOUSEHOLD && window.matchMedia?.('(pointer: fine)').matches) nameRef.current?.focus();
  }, [house]);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (ready) onMove(world, house, typed);
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
          setHouse(startHouse(e.target.value));
          setName(null);
        }}
      >
        {worlds.map((w) => (
          <option key={w.name} value={w.name}>
            {w.name}
          </option>
        ))}
      </select>
      <label htmlFor={`${idPrefix}House`}>{lotless(world) ? 'Household' : 'Household or free lot'}</label>
      <select
        id={`${idPrefix}House`}
        value={house}
        onChange={(e) => {
          setHouse(e.target.value);
          setName(null);
          if (e.target.value === NEW_HOUSEHOLD) requestAnimationFrame(() => nameRef.current?.focus());
        }}
      >
        {lotless(world) ? (
          <option value={NEW_HOUSEHOLD}>➕ Create a new household…</option>
        ) : (
          <option value="" disabled>
            Choose a household or a free lot
          </option>
        )}
        {options.length > 0 && (
          <optgroup label="Households">
            {options.map((o) => (
              <option key={o.gid} value={o.gid}>
                {o.hh} ({o.count}){homes.get(o.gid) ? ` · ${homes.get(o.gid)!.name}` : ''}
              </option>
            ))}
          </optgroup>
        )}
        {free.length > 0 && (
          <optgroup label={`Free lots (${free.length})`}>
            {free.map((l) => (
              <option key={l.name} value={lotPick(l)}>
                {lotOption(l)}
              </option>
            ))}
          </optgroup>
        )}
      </select>
      {!lotless(world) && !free.length && (
        <p className="hhmove__note">Every lot in {world} has a household, so they can only join one.</p>
      )}
      {isNew && (
        <>
          <label htmlFor={`${idPrefix}Name`}>{lot ? `Their household on ${lot.name}` : 'New household name'}</label>
          <input
            ref={nameRef}
            id={`${idPrefix}Name`}
            placeholder="Household name"
            autoComplete="off"
            value={typed}
            aria-describedby={twin ? `${idPrefix}Twin` : undefined}
            onChange={(e) => setName(e.target.value)}
          />
          {twin && (
            <p id={`${idPrefix}Twin`} className="hhmove__note">
              {lot
                ? `${world} has a ${twin.hh} household already. This makes a second one, on ${lot.name}.`
                : stays
                  ? `They already live in the ${twin.hh} household. Choose another name.`
                  : `${world} already has a ${twin.hh} household, so they will join it.`}
            </p>
          )}
        </>
      )}
      {wholeHome && (
        <div className="hhmove__whole" role="group" aria-label={`Move the ${home.hh} household`}>
          <p>
            That’s their household’s name. To keep it one household, move it whole:{' '}
            {home.others === 1 ? '1 other sim goes' : `${home.others} other sims go`} too.
          </p>
          <button type="button" className="movego" onClick={() => onMoveHousehold(world, lot ? house : undefined)}>
            Move the {home.hh} household to {lot ? `${lot.name} in ${world}` : world}
          </button>
        </div>
      )}
      <button type="submit" className={wholeHome ? 'movego movego--alt' : 'movego'} disabled={!ready}>
        {wholeHome ? `Move only ${who ?? 'this sim'}, to a second ${home.hh} household` : submitLabel}
      </button>
    </form>
  );
}
