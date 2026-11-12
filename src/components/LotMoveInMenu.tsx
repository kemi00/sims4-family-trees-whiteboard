import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { CloseButton } from './CloseButton.tsx';
import { X } from '../icons.ts';
import { useFitMenuInStage } from '../hooks/useFitMenuInStage.ts';
import { DECEASED_STATE } from '../lib/constants.ts';
import { lotKindLabel, lotRoomsLabel, lotSizeLabel, neighbourhoodIconUrl, type GameLot } from '../lib/places.ts';
import { isUnhousedGid } from '../lib/unhoused.ts';
import { cardName } from '../lib/plan.ts';
import { fold } from '../lib/utils.ts';
import type { SimNode } from '../types/whiteboard.ts';
import { useLightDismiss } from '../hooks/useLightDismiss.ts';

type Props = {
  lot: GameLot;
  left: number;
  top: number;
  nodes: SimNode[];
  /** Sims picked on the board when the lot was clicked: they move, to start with. */
  picked: string[];
  onMove: (ids: string[], name: string) => void;
  onClose: () => void;
};

/** How many matches the search shows at once. */
const SHOWN = 8;

/**
 * Who moves into a free lot, from the lot on the board: sims picked there
 * already, or found by name. They make a new household on the lot, named
 * after the first of them unless you name it. A whole household keeps its
 * name and simply moves to the lot.
 */
export function LotMoveInMenu({ lot, left, top, nodes, picked, onMove, onClose }: Props) {
  const { compact, ref, style } = useFitMenuInStage(left, top);
  useLightDismiss(ref, onClose);
  const searchRef = useRef<HTMLInputElement>(null);
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const [ids, setIds] = useState<string[]>(() => picked.filter((id) => byId.get(id)?.state !== DECEASED_STATE));
  const [query, setQuery] = useState('');
  const [name, setName] = useState<string | null>(null);
  const movers = ids.map((id) => byId.get(id)).filter((n): n is SimNode => !!n);
  /** Every member of one household: it moves whole, under its own name. */
  const wholeHh = (() => {
    const gids = new Set(movers.map((n) => n.gid));
    if (gids.size !== 1) return null;
    const [gid] = gids;
    if (!gid || isUnhousedGid(gid)) return null;
    const all = nodes.filter((n) => n.gid === gid);
    return all.every((n) => ids.includes(n.id)) ? movers[0]!.hh : null;
  })();
  const suggested = movers[0]?.sur.trim() || movers[0]?.hh || '';
  const hhName = wholeHh ?? (name ?? suggested);

  const q = fold(query.trim());
  const matches = useMemo(() => {
    if (!q) return [];
    const out: SimNode[] = [];
    for (const n of nodes) {
      if (n.state === DECEASED_STATE || ids.includes(n.id)) continue;
      if (!fold(cardName(n)).includes(q) && !fold(n.hh).includes(q)) continue;
      out.push(n);
      if (out.length >= SHOWN) break;
    }
    return out;
  }, [nodes, ids, q]);

  useEffect(() => {
    const f = requestAnimationFrame(() => searchRef.current?.focus());
    return () => cancelAnimationFrame(f);
  }, []);

  const add = (n: SimNode) => {
    setIds((xs) => [...xs, n.id]);
    setQuery('');
    searchRef.current?.focus();
  };
  const ready = movers.length > 0 && !!hhName.trim();
  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (ready) onMove(ids, hhName.trim());
  };
  const onKeyDown = (e: KeyboardEvent<HTMLFormElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'Enter' || e.nativeEvent.isComposing || e.keyCode === 229) return;
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    // Enter in the search adds the first match; anywhere else it moves them in.
    if (e.target === searchRef.current && matches[0]) add(matches[0]);
    else submit();
  };

  const icon = neighbourhoodIconUrl(lot.world, lot.nb);
  const facts = [lotKindLabel(lot), lotSizeLabel(lot), lotRoomsLabel(lot)].filter(Boolean).join(' · ');
  const button = !movers.length
    ? 'Move in'
    : wholeHh
      ? `Move the ${wholeHh} household here`
      : movers.length === 1
        ? `Move ${cardName(movers[0]!)} in`
        : `Move ${movers.length} sims in`;

  return (
    <div
      ref={ref}
      id="menu"
      className={compact ? 'menu menu--sheet pmenu lotmenu' : 'menu pmenu lotmenu'}
      role="dialog"
      aria-label={`Move into ${lot.name}`}
      style={style}
    >
      <div className="pmenu__head">
        <span className="lotmenu__title">
          {icon ? <img src={icon} alt="" width={20} height={20} /> : <span className="lotmenu__blank" aria-hidden="true" />}
          <span>
            <b>{lot.name}</b>
            <span className="lotmenu__facts">
              {lot.nb} · {facts}
            </span>
          </span>
        </span>
        <CloseButton label="Close" onClick={onClose} />
      </div>
      <form className="hhmove" onSubmit={submit} onKeyDown={onKeyDown}>
        <label htmlFor="lotWho">Who moves in?</label>
        {movers.length > 0 && (
          <ul className="lotmenu__movers" aria-label="Moving in">
            {movers.map((n) => (
              <li key={n.id}>
                <span>{cardName(n)}</span>
                <button
                  type="button"
                  aria-label={`Not ${cardName(n)}`}
                  onClick={() => setIds((xs) => xs.filter((x) => x !== n.id))}
                >
                  <X aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <input
          ref={searchRef}
          id="lotWho"
          placeholder={movers.length ? 'Add another sim by name' : 'Find a sim by name'}
          autoComplete="off"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {matches.length > 0 && (
          <ul className="lotmenu__found" aria-label="Sims found">
            {matches.map((n) => (
              <li key={n.id}>
                <button type="button" onClick={() => add(n)}>
                  <span className="lotmenu__name">{cardName(n)}</span>
                  <span className="lotmenu__where">
                    {n.hh} · {n.world}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {q && !matches.length && <p className="hhmove__note">No sim on the board is called that.</p>}
        {wholeHh ? (
          <p className="hhmove__note">The whole {wholeHh} household moves here and keeps its name.</p>
        ) : (
          movers.length > 0 && (
            <>
              <label htmlFor="lotName">Household name</label>
              <input
                id="lotName"
                autoComplete="off"
                value={hhName}
                onChange={(e) => setName(e.target.value)}
              />
            </>
          )
        )}
        <button type="submit" className="movego" disabled={!ready}>
          {button}
        </button>
      </form>
    </div>
  );
}
