import { useState, type FormEvent } from 'react';
import { DECEASED_STATE } from '../lib/constants.ts';
import { householdNamed, movesInGame } from '../lib/householdMove.ts';
import type { Group, SimNode, World } from '../types/whiteboard.ts';

type Props = {
  /** Prefix for the field ids, unique on the page. */
  idPrefix: string;
  /** The household that moves. */
  group: Pick<Group, 'gid' | 'hh' | 'world'>;
  worlds: World[];
  groups: Group[];
  nodes: SimNode[];
  onMove: (world: string) => void;
};

/**
 * Where a whole household moves: one choice, the world. It keeps its name
 * and everyone in it, as when the game moves a household to a lot in
 * another world, so the board never holds two of it. The button says what
 * will happen ("Move the Dreamer household to Ondarion").
 */
export function WorldMoveForm({ idPrefix, group, worlds, groups, nodes, onMove }: Props) {
  const [world, setWorld] = useState('');
  const members = nodes.filter((n) => n.gid === group.gid);
  const count = members.length;
  const dead = members.filter((n) => n.state === DECEASED_STATE).length;
  const inGame = members.some(movesInGame);
  const twin = world ? householdNamed(groups, nodes, world, group.hh) : undefined;
  const others = worlds.filter((w) => w.name !== group.world);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (world) onMove(world);
  };

  return (
    <form className="hhmove" onSubmit={submit}>
      <label htmlFor={`${idPrefix}World`}>Move to</label>
      <select id={`${idPrefix}World`} value={world} onChange={(e) => setWorld(e.target.value)}>
        <option value="">Choose a world…</option>
        {others.map((w) => (
          <option key={w.name} value={w.name}>
            {w.name}
          </option>
        ))}
      </select>
      {twin && (
        <p className="hhmove__note">
          {world} already has a {twin.hh} household, so they will join it.
        </p>
      )}
      <button type="submit" className="movego" disabled={!world}>
        {world ? `Move the ${group.hh} household to ${world}` : `Move the ${group.hh} household`}
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
