import { useMemo, useState, type FormEvent } from 'react';
import { DECEASED_STATE } from '../lib/constants.ts';
import { householdNamed, movesInGame } from '../lib/householdMove.ts';
import { freeLotsIn, householdLots, lotOfPick, lotPick, lotsIn, lotKindLabel, lotRoomsLabel } from '../lib/places.ts';
import type { Group, SimNode, World } from '../types/whiteboard.ts';

type Props = {
  /** Prefix for the field ids, unique on the page. */
  idPrefix: string;
  /** The household that moves. */
  group: Pick<Group, 'gid' | 'hh' | 'world'>;
  worlds: World[];
  groups: Group[];
  nodes: SimNode[];
  /** `house`: a free lot's pick, or the gid of a household of its name to join. */
  onMove: (world: string, house?: string) => void;
};

/**
 * Where a whole household moves: a world, then one of its free lots, as
 * when the game moves a household to a lot in another world. It keeps its
 * name and everyone in it. A world with a household of its name already
 * offers to join that one instead, so the board never holds two of it by
 * a slip. The button says what will happen ("Move the Dreamer household to
 * Brook Bungalow in Willow Creek").
 */
export function WorldMoveForm({ idPrefix, group, worlds, groups, nodes, onMove }: Props) {
  const [world, setWorld] = useState('');
  const [house, setHouse] = useState('');
  const homes = useMemo(() => householdLots(nodes), [nodes]);
  const members = nodes.filter((n) => n.gid === group.gid);
  const count = members.length;
  const dead = members.filter((n) => n.state === DECEASED_STATE).length;
  const inGame = members.some(movesInGame);
  const twin = world ? householdNamed(groups, nodes, world, group.hh) : undefined;
  const others = worlds.filter((w) => w.name !== group.world);
  /** A world with no lots to live on (Not in any world): it simply goes there. */
  const lotless = !!world && lotsIn(world).length === 0;
  const free = world && !lotless ? freeLotsIn(world, homes) : [];
  const lot = lotOfPick(world, house);
  const ready = !!world && (lotless || !!lot || (!!twin && house === twin.gid));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    onMove(world, lotless ? undefined : house);
  };

  return (
    <form className="hhmove" onSubmit={submit}>
      <label htmlFor={`${idPrefix}World`}>Move to</label>
      <select
        id={`${idPrefix}World`}
        value={world}
        onChange={(e) => {
          setWorld(e.target.value);
          setHouse('');
        }}
      >
        <option value="">Choose a world…</option>
        {others.map((w) => (
          <option key={w.name} value={w.name}>
            {w.name}
          </option>
        ))}
      </select>
      {world && !lotless && (
        <>
          <label htmlFor={`${idPrefix}Lot`}>Lot</label>
          <select id={`${idPrefix}Lot`} value={house} onChange={(e) => setHouse(e.target.value)}>
            <option value="" disabled>
              {free.length ? 'Choose a free lot' : twin ? 'Choose where they go' : 'No free lot'}
            </option>
            {twin && (
              <option value={twin.gid}>
                Join the {twin.hh} household there
              </option>
            )}
            {free.length > 0 && (
              <optgroup label={`Free lots (${free.length})`}>
                {free.map((l) => {
                  const rooms = lotRoomsLabel(l);
                  return (
                    <option key={l.name} value={lotPick(l)}>
                      {[l.name, l.nb, rooms ? rooms.replace(' · ', ', ') : lotKindLabel(l)].join(' · ')}
                    </option>
                  );
                })}
              </optgroup>
            )}
          </select>
          {!free.length && !twin && (
            <p className="hhmove__note">Every lot in {world} has a household. Free one first, or choose another world.</p>
          )}
        </>
      )}
      <button type="submit" className="movego" disabled={!ready}>
        {!world
          ? `Move the ${group.hh} household`
          : lot
            ? `Move the ${group.hh} household to ${lot.name} in ${world}`
            : twin && house === twin.gid
              ? `Join the ${twin.hh} household in ${world}`
              : `Move the ${group.hh} household to ${world}`}
      </button>
      <p className="hhmove__hint">
        {count === 1 ? 'Its one sim goes' : `All ${count} of its sims go`}
        {dead > 0 && dead < count ? ', the deceased too' : ''}.{' '}
        {inGame
          ? 'It’s one move in your game: a plan until a save shows it.'
          : 'No one in it is living in your game, so this only changes the board.'}
      </p>
    </form>
  );
}
