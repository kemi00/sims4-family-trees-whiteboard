import { useEffect, useState } from 'react';
import { CloseButton } from './CloseButton.tsx';
import { commonWorld } from '../lib/householdMove.ts';
import { cardName } from '../lib/plan.ts';
import { Trash } from '../icons.ts';
import type { Group, SimNode, World } from '../types/whiteboard.ts';
import { HouseholdMoveForm } from './HouseholdMoveForm.tsx';

type Props = {
  /** The sims a move would take: the ones picked, or everyone in the picked households. */
  sims: SimNode[];
  /** Set when whole households were picked: how many. */
  households?: number;
  /** Select is on: a plain click picks sims, not just Shift-click. */
  selectMode: boolean;
  worlds: World[];
  groups: Group[];
  nodes: SimNode[];
  onMove: (world: string, houseGid: string, newName: string) => void;
  onClear: () => void;
  /** Set when one household is picked: open its plan. */
  onPlan?: () => void;
  /** Take the picked sims off the board (also the Delete key). */
  onDelete?: () => void;
};

const NAMES_SHOWN = 3;

/** "Bella Goth, Planned (3) Capp and 2 more", as their cards name them. */
function namesOf(sims: SimNode[]): string {
  const names = sims.map((n) => cardName(n));
  if (names.length <= NAMES_SHOWN) {
    return names.length < 2
      ? (names[0] ?? '')
      : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  }
  return `${names.slice(0, NAMES_SHOWN - 1).join(', ')} and ${names.length - NAMES_SHOWN + 1} more`;
}

/**
 * What is selected, and what can be done with it, in one place: who the
 * selection holds, by name, so a stray pick shows before anything moves;
 * then the move itself, opened from here and closed again once it is done.
 */
export function SelectionBar({
  sims,
  households,
  selectMode,
  worlds,
  groups,
  nodes,
  onMove,
  onClear,
  onPlan,
  onDelete,
}: Props) {
  const [open, setOpen] = useState(false);
  const count = sims.length;
  const key = sims.map((n) => n.id).join(',');
  // A different pick starts with the form closed.
  useEffect(() => setOpen(false), [key]);
  if (!count) return null;

  const gids = new Set(sims.map((n) => n.gid));
  const home = gids.size === 1 ? [...gids][0] : undefined;
  const who = count === 1 ? sims[0]!.first || 'this sim' : `${count} sims`;

  return (
    <div
      className="selbar"
      role="region"
      aria-label="Selected sims"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="selbar__row">
        <p className="selbar__what">
          {households ? (
            <>
              <b>
                {households} household{households === 1 ? '' : 's'}
              </b>{' '}
              selected, {count} sim{count === 1 ? '' : 's'}
            </>
          ) : (
            <>
              <b>
                {count} sim{count === 1 ? '' : 's'}
              </b>{' '}
              selected: {namesOf(sims)}
            </>
          )}
        </p>
        {onPlan && (
          <button type="button" className="selbar__alt" onClick={onPlan}>
            See its plan
          </button>
        )}
        <button
          type="button"
          className="selbar__go"
          aria-expanded={open}
          aria-controls="selMove"
          onClick={() => setOpen((o) => !o)}
        >
          Move to household…
        </button>
        {onDelete && (
          <button
            type="button"
            className="selbar__del"
            aria-label={count === 1 ? `Delete ${who} from the board` : `Delete the ${count} selected sims from the board`}
            title={`${count === 1 ? `Delete ${who}` : `Delete these ${count} sims`} from the board (Delete key). Undo takes it back.`}
            onClick={onDelete}
          >
            <Trash aria-hidden="true" />
            <span>Delete</span>
          </button>
        )}
        <CloseButton label="Clear the selection" title="Clear the selection (Esc)" onClick={onClear} />
      </div>
      {open && (
        <div id="selMove" className="selbar__form">
          <HouseholdMoveForm
            idPrefix="selMove"
            worlds={worlds}
            groups={groups}
            nodes={nodes}
            initialWorld={commonWorld(sims, worlds)}
            exclude={home}
            submitLabel={`Move ${who} here`}
            suggestedName={sims[0]?.sur}
            onMove={(world, house, name) => {
              onMove(world, house, name);
              setOpen(false);
            }}
          />
        </div>
      )}
      {!open && !households && (
        <p className="selbar__tip">
          {selectMode ? 'Click' : 'Shift-click'} a sim to add or remove them.
          Drag the selected cards to move them.
        </p>
      )}
    </div>
  );
}
