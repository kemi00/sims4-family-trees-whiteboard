import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { DynastyRisk } from '../lib/dynastyMenu.ts';
import type { DynastyName } from '../lib/generations.ts';
import { worldIconUrl } from '../lib/places.ts';
import { cardName } from '../lib/plan.ts';
import { simCardClass } from '../lib/simCard.ts';
import type { SimList, SimListGroup, SimListRow, SimListWorld } from '../lib/simList.ts';
import { fold } from '../lib/utils.ts';
import { BarPanel } from './BarPanel.tsx';
import { SimCard } from './SimCard.tsx';

type Sort = 'group' | 'world' | 'az';

type Props = {
  title: string;
  /** One line under the title: what lights them up. */
  description?: ReactNode;
  /** The highlight's own controls (Change, Clear; Close or Extended; Show all, Done), before the sort. */
  tools?: ReactNode;
  list: SimList;
  /** Every dynasty's name on the board, for the cards' "Watson dynasty". */
  dynasties: Map<string, DynastyName>;
  /** The dynasties at risk: "at risk" follows theirs on the cards. */
  risks: ReadonlyMap<string, DynastyRisk>;
  /** A dynasty's own list: its cards don't repeat the dynasty its title names. */
  noDynasty?: boolean;
  /** Two-line cards: a bloodline's list reads who and whose child. */
  brief?: boolean;
  /** Its own order, first and picked at the start: a bloodline's generations. */
  groups?: { label: string; list: SimListGroup[] };
  /** A choice that changes who is listed, beside the order (Count adopted children). */
  footer?: ReactNode;
  /** Said when no one is listed. */
  empty: ReactNode;
  /** A card clicked: the view goes to that sim. */
  onPick: (id: string) => void;
  /** A card pointed at: it is singled out on the board while it is. */
  onHover: (ids: Set<string> | null) => void;
  onClose: () => void;
};

/** A world shows this many cards, with Show more for the rest, as Possible partners does. */
const SHOWN = 4;

/** Find by name shows once a list is longer than this: a short one is all in view. */
const FIND_FROM = 12;

/**
 * The sims a highlight lights, as a list docked beside the board: the
 * board shows where they are, the list says who they are. The same sim
 * cards and Show more as Possible partners, so it reads as a list of sims
 * at once; Find by name once it is long. By world, in the order the board
 * has them, or A to Z, picked in a quiet footer; a bloodline's list
 * starts by generation. Pointing at a card singles it out on the board;
 * clicking it goes there. It stays open while you move around the board,
 * like the Key: you read one against the other.
 */
export function SimListPanel({ title, description, tools, list, dynasties, risks, noDynasty, brief, groups, footer, empty, onPick, onHover, onClose }: Props) {
  const [sort, setSort] = useState<Sort>(groups ? 'group' : 'world');
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const [query, setQuery] = useState('');
  // A card singled out by the list lets go when the list closes under the pointer.
  const hover = useRef(onHover);
  useEffect(() => {
    hover.current = onHover;
  });
  useEffect(() => () => hover.current(null), []);

  const q = fold(query);
  const found = (r: SimListRow) => !q || fold(cardName(r.sim)).includes(q);
  const worlds = list.worlds
    .map((w) => ({ world: w.world, rows: w.homes.flatMap((h) => h.rows).filter(found) }))
    .filter((w) => w.rows.length > 0);
  const az = list.az.filter(found);
  const gens = (groups?.list ?? []).map((g) => ({ ...g, rows: g.rows.filter(found) })).filter((g) => g.me || g.rows.length > 0);
  const order: Sort = sort === 'group' && !groups ? 'world' : sort;
  const none = order === 'world' ? worlds.length === 0 : order === 'group' ? !gens.some((g) => g.rows.length) : az.length === 0;
  // A short list needs no search: the names are all in view.
  const findable = list.count > FIND_FROM;

  const card = (r: SimListRow, world = false) => (
    <li key={r.sim.id}>
      <button
        type="button"
        className={simCardClass(r.sim)}
        onClick={() => onPick(r.sim.id)}
        onPointerEnter={() => onHover(new Set([r.sim.id]))}
        onPointerLeave={() => onHover(null)}
        onFocus={() => onHover(new Set([r.sim.id]))}
        onBlur={() => onHover(null)}
      >
        <SimCard sim={r.sim} what={r.what} dynasties={dynasties} risks={risks} world={world} noDynasty={noDynasty} brief={brief} />
      </button>
    </li>
  );

  const world = (w: Pick<SimListWorld, 'world'> & { rows: SimListRow[] }) => section(w.world, w.world, w.rows, worldIconUrl(w.world) ?? null);

  /** A world or a generation: its name, how many, its first cards and Show more. `icon` null: a world with none; undefined: no icon at all. */
  const section = (key: string, label: string, rows: SimListRow[], icon?: string | null) => {
    // A search shows every match; otherwise a long section folds to its first cards.
    const folds = !q && rows.length > SHOWN;
    const all = open.has(key);
    const shown = folds && !all ? rows.slice(0, SHOWN) : rows;
    return (
      <section key={key} className="slist__world" aria-label={`${label}: ${rows.length} ${rows.length === 1 ? 'sim' : 'sims'}`}>
        <h3 className="slist__worldhead">
          {icon ? <img src={icon} alt="" width={16} height={16} /> : icon === null ? <span className="slist__noicon" aria-hidden="true" /> : null}
          <span className="slist__worldname">{label}</span>
          <span className="slist__count">{rows.length}</span>
        </h3>
        <ul className="simcards">{shown.map((r) => card(r))}</ul>
        {folds && (
          <button
            type="button"
            className="edlink edlink--more"
            aria-expanded={all}
            onClick={() =>
              setOpen((s) => {
                const next = new Set(s);
                if (all) next.delete(key);
                else next.add(key);
                return next;
              })
            }
          >
            {all ? 'Show fewer' : `Show ${rows.length - SHOWN} more`}
          </button>
        )}
      </section>
    );
  };

  return (
    <BarPanel
      id="simlist"
      className="slist"
      title={title}
      description={description}
      onClose={() => {
        onHover(null);
        onClose();
      }}
      tools={
        tools || findable ? (
          <div className="slist__tools">
            {tools}
            {findable && (
              <input
                type="search"
                className="slist__find"
                value={query}
                placeholder="Find by name"
                aria-label="Find a sim in this list by name"
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  // Esc clears the search first, then closes the list.
                  if (e.key === 'Escape' && query) {
                    e.preventDefault();
                    e.stopPropagation();
                    setQuery('');
                  }
                }}
              />
            )}
          </div>
        ) : undefined
      }
    >
      {list.count === 0 ? (
        <p className="slist__empty">{empty}</p>
      ) : none ? (
        <p className="slist__empty">{`No one in this list matches “${query.trim()}”.`}</p>
      ) : order === 'group' ? (
        gens.map((g) =>
          g.me ? (
            <p key={g.key} className="slist__me">
              {g.label}
            </p>
          ) : (
            section(g.key, g.label, g.rows)
          ),
        )
      ) : order === 'world' ? (
        worlds.map(world)
      ) : (
        <ul className="simcards slist__az">{az.map((r) => card(r, !brief))}</ul>
      )}
      {list.hidden > 0 && (
        <p className="slist__hidden">{`${list.hidden} more ${list.hidden === 1 ? 'is' : 'are'} hidden by Filters, so not listed.`}</p>
      )}
      {(footer || list.count > 1) && (
        <div className="slist__foot">
          {footer}
          {list.count > 1 && (
            <div className="slist__orderctl" role="group" aria-label="List order">
              <span className="slist__orderword">Order</span>
              {groups && (
                <button type="button" className="slist__sortopt" aria-pressed={order === 'group'} onClick={() => setSort('group')}>
                  {groups.label}
                </button>
              )}
              <button
                type="button"
                className="slist__sortopt"
                aria-pressed={order === 'world'}
                title="As on the board: world by world, top to bottom"
                onClick={() => setSort('world')}
              >
                {groups ? 'World' : 'By world'}
              </button>
              <button type="button" className="slist__sortopt" aria-pressed={order === 'az'} title="A to Z by name" onClick={() => setSort('az')}>
                A to Z
              </button>
            </div>
          )}
        </div>
      )}
    </BarPanel>
  );
}
