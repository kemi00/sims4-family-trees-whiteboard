import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { DynastyRisk } from '../lib/dynastyMenu.ts';
import type { DynastyName } from '../lib/generations.ts';
import { worldIconUrl } from '../lib/places.ts';
import { cardName } from '../lib/plan.ts';
import { simCardClass } from '../lib/simCard.ts';
import type { SimList, SimListRow, SimListWorld } from '../lib/simList.ts';
import { fold } from '../lib/utils.ts';
import { BarPanel } from './BarPanel.tsx';
import { SimCard } from './SimCard.tsx';

type Sort = 'world' | 'az';

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

/**
 * The sims a highlight lights, as a list docked beside the board: the
 * board shows where they are, the list says who they are. The same sim
 * cards, search box and Show more as Possible partners, so it reads as a
 * list of sims at once. By world, in the order the board has them, or A
 * to Z. Pointing at a card singles it out on the board; clicking it goes
 * there. It stays open while you move around the board, like the Key: you
 * read one against the other.
 */
export function SimListPanel({ title, description, tools, list, dynasties, risks, noDynasty, empty, onPick, onHover, onClose }: Props) {
  const [sort, setSort] = useState<Sort>('world');
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
  const none = sort === 'world' ? worlds.length === 0 : az.length === 0;

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
        <SimCard sim={r.sim} what={r.what} dynasties={dynasties} risks={risks} world={world} noDynasty={noDynasty} />
      </button>
    </li>
  );

  const world = (w: Pick<SimListWorld, 'world'> & { rows: SimListRow[] }) => {
    // A search shows every match; otherwise a long world folds to its first cards.
    const folds = !q && w.rows.length > SHOWN;
    const all = open.has(w.world);
    const shown = folds && !all ? w.rows.slice(0, SHOWN) : w.rows;
    const icon = worldIconUrl(w.world);
    return (
      <section key={w.world} className="slist__world" aria-label={`${w.world}: ${w.rows.length} ${w.rows.length === 1 ? 'sim' : 'sims'}`}>
        <h3 className="slist__worldhead">
          {icon ? <img src={icon} alt="" width={16} height={16} /> : <span className="slist__noicon" aria-hidden="true" />}
          <span className="slist__worldname">{w.world}</span>
          <span className="slist__count">{w.rows.length}</span>
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
                if (all) next.delete(w.world);
                else next.add(w.world);
                return next;
              })
            }
          >
            {all ? 'Show fewer' : `Show ${w.rows.length - SHOWN} more`}
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
        <div className="slist__tools">
          {tools}
          <div className="dynp__sort slist__sort" role="group" aria-label="List order">
            <button type="button" className="slist__sortopt" aria-pressed={sort === 'world'} onClick={() => setSort('world')}>
              By world
            </button>
            <button type="button" className="slist__sortopt" aria-pressed={sort === 'az'} onClick={() => setSort('az')}>
              A to Z
            </button>
          </div>
          {list.count > 0 && (
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
      }
    >
      {list.count === 0 ? (
        <p className="slist__empty">{empty}</p>
      ) : none ? (
        <p className="slist__empty">No one in this list matches “{query.trim()}”.</p>
      ) : (
        <>
          <p className="slist__order">
            {sort === 'world' ? 'As on the board: world by world, top to bottom' : 'A to Z by name'}
          </p>
          {sort === 'world' ? worlds.map(world) : <ul className="simcards">{az.map((r) => card(r, true))}</ul>}
        </>
      )}
      {list.hidden > 0 && (
        <p className="slist__hidden">
          {list.hidden} more {list.hidden === 1 ? 'is' : 'are'} hidden by Filters, so not listed.
        </p>
      )}
    </BarPanel>
  );
}
