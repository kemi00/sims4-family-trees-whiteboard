import { useEffect, useRef, useState, type ReactNode } from 'react';
import { worldIconUrl } from '../lib/places.ts';
import type { SimList, SimListRow, SimListWorld } from '../lib/simList.ts';
import { BarPanel } from './BarPanel.tsx';

type Sort = 'world' | 'az';

type Props = {
  title: string;
  /** One line under the title: what lights them up. */
  description?: ReactNode;
  /** The highlight's own controls (Change, Clear; Close or Extended; Show all, Done), before the sort. */
  tools?: ReactNode;
  list: SimList;
  /** Said when no one is listed. */
  empty: ReactNode;
  /** A row clicked: the view goes to that sim. */
  onPick: (id: string) => void;
  /** A row pointed at: its card is singled out on the board while it is. */
  onHover: (ids: Set<string> | null) => void;
  onClose: () => void;
};

/** Worlds this long fold to their first rows, with a button for the rest. */
const FOLD_OVER = 8;
const FOLD_SHOW = 5;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * The sims a highlight lights, as a list docked beside the board: the
 * board shows where they are, the list says who they are. By world and
 * household, in the order the board has them, or A to Z. Pointing at a
 * row singles its card out; clicking it goes there. It stays open while
 * you move around the board, like the Key: you read one against the other.
 */
export function SimListPanel({ title, description, tools, list, empty, onPick, onHover, onClose }: Props) {
  const [sort, setSort] = useState<Sort>('world');
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  // A card singled out by a row lets go when the list closes under the pointer.
  const hover = useRef(onHover);
  useEffect(() => {
    hover.current = onHover;
  });
  useEffect(() => () => hover.current(null), []);

  const row = (r: SimListRow, where?: string) => (
    <li key={r.id}>
      <button
        type="button"
        className="slist__sim"
        onClick={() => onPick(r.id)}
        onPointerEnter={() => onHover(new Set([r.id]))}
        onPointerLeave={() => onHover(null)}
        onFocus={() => onHover(new Set([r.id]))}
        onBlur={() => onHover(null)}
      >
        <span className="slist__name">{r.name}</span>
        <span className="slist__detail">{[r.detail, where].filter(Boolean).join(' · ')}</span>
      </button>
    </li>
  );

  const world = (w: SimListWorld) => {
    const folds = w.count > FOLD_OVER && !open.has(w.world);
    let budget = folds ? FOLD_SHOW : Infinity;
    let restRows = 0;
    let restHomes = 0;
    const homes = w.homes.map((h) => {
      const shown = h.rows.slice(0, Math.max(0, budget));
      budget -= shown.length;
      if (shown.length < h.rows.length) {
        restRows += h.rows.length - shown.length;
        restHomes += 1;
      }
      return shown.length ? (
        <div key={h.gid} className="slist__home">
          <p className="slist__homehead">{h.label}</p>
          <ul className="slist__rows">{shown.map((r) => row(r))}</ul>
        </div>
      ) : null;
    });
    const icon = worldIconUrl(w.world);
    return (
      <section key={w.world} className="slist__world" aria-label={`${w.world}: ${plural(w.count, 'sim')}`}>
        <h3 className="slist__worldhead">
          {icon ? <img src={icon} alt="" width={16} height={16} /> : <span className="slist__noicon" aria-hidden="true" />}
          <span className="slist__worldname">{w.world}</span>
          <span className="slist__count">{w.count}</span>
        </h3>
        {homes}
        {restRows > 0 && (
          <button type="button" className="slist__more" onClick={() => setOpen((s) => new Set([...s, w.world]))}>
            Show {restRows} more in {plural(restHomes, 'household')}
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
        </div>
      }
    >
      {list.count === 0 ? (
        <p className="slist__empty">{empty}</p>
      ) : sort === 'world' ? (
        list.worlds.map(world)
      ) : (
        <ul className="slist__rows slist__rows--az">{list.az.map((r) => row(r, r.where))}</ul>
      )}
      {list.hidden > 0 && (
        <p className="slist__hidden">
          {plural(list.hidden, 'more is', 'more are')} hidden by Filters, so not listed.
        </p>
      )}
    </BarPanel>
  );
}
