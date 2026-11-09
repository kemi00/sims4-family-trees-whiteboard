import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { dynastyNames } from '../lib/generations.ts';
import { PartnerRow } from './PartnerRow.tsx';
import { X } from '../icons.ts';
import { useFitMenuInStage } from '../hooks/useFitMenuInStage.ts';
import { cardName } from '../lib/plan.ts';
import { theHousehold } from '../lib/utils.ts';
import { hasNoHome, partnerSearch } from '../lib/partners.ts';
import { PARTNER_CHOICES, type PartnerChoice, type PartnerMenuState } from '../hooks/useWhiteboard.ts';
import type { Edge, SaveGameInfo, SimNode } from '../types/whiteboard.ts';

const CHOICE_LABEL: Record<PartnerChoice, string> = {
  marriage: 'Married',
  romance: 'Romance',
  secretromance: 'Secret lovers',
  divorced: 'Divorced',
};

type Props = {
  menu: PartnerMenuState;
  nodes: SimNode[];
  byid: Record<string, SimNode>;
  edges: Edge[];
  saveGame?: SaveGameInfo | null;
  onChoice: (choice: PartnerChoice) => void;
  onPick: (id: string) => void;
  /** One partner moves into the other's household. */
  onMove: (mover: string, host: string) => void;
  onClose: () => void;
};

/**
 * The partner menu, from the ♥ on a card's side. Pick the link, then the
 * partner: type a name (suggested partners first, closest in life), or
 * click them on the board. Picked by name, two who live apart are asked
 * about one household: the reason to type is that they're far away.
 */
export function PartnerMenu({ menu, nodes, byid, edges, saveGame, onChoice, onPick, onMove, onClose }: Props) {
  const { compact, ref, style } = useFitMenuInStage(menu.x, menu.y);
  const listId = useId();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const firstMoveRef = useRef<HTMLButtonElement>(null);
  const me = byid[menu.id];
  const picked = menu.picked ? byid[menu.picked] : undefined;

  const hits = useMemo(
    () => (me ? partnerSearch({ id: me.id, nodes, edges, query, game: saveGame }) : []),
    [me, nodes, edges, query, saveGame],
  );
  const dynasties = useMemo(() => dynastyNames(nodes), [nodes]);
  useEffect(() => {
    // A frame later: the menu is hidden while it measures where it fits.
    // On a phone the keyboard would cover the board, where you can also pick.
    if (compact && !picked) return;
    const f = requestAnimationFrame(() => (picked ? firstMoveRef.current : inputRef.current)?.focus());
    return () => cancelAnimationFrame(f);
  }, [picked, compact]);
  if (!me) return null;

  const name = cardName(me);
  const close = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    // Esc closes this menu, not the panel or selection behind it.
    e.stopPropagation();
    onClose();
  };

  if (picked) {
    const pickedName = cardName(picked);
    const into = [
      // The one typed moves in with the sim whose ♥ was clicked: Lucas into Mara's.
      ...(!hasNoHome(me) ? [{ mover: picked, host: me }] : []),
      ...(!hasNoHome(picked) ? [{ mover: me, host: picked }] : []),
    ];
    return (
      <div
        ref={ref}
        id="menu"
        className={compact ? 'menu menu--sheet pmenu' : 'menu pmenu'}
        role="dialog"
        aria-label={`Move ${pickedName} and ${name} into one household?`}
        style={style}
        onKeyDown={close}
      >
        <p className="pmenu__done">
          ✓ {CHOICE_LABEL[menu.choice]}: {name} and {pickedName}
        </p>
        <p className="pmenu__ask">They live apart. Will one move in with the other?</p>
        {into.map(({ mover, host }, i) => (
          <button
            key={mover.id}
            ref={i === 0 ? firstMoveRef : undefined}
            type="button"
            className={i === 0 ? 'pmenu__move pmenu__move--first' : 'pmenu__move'}
            onClick={() => onMove(mover.id, host.id)}
          >
            {cardName(mover)} moves into {theHousehold(host.hh)}
          </button>
        ))}
        <button type="button" className="pmenu__move pmenu__keep" onClick={onClose}>
          Keep them apart
        </button>
        <p className="pmenu__hint">A move is part of your plan until a save shows it.</p>
      </div>
    );
  }

  const hit = hits[Math.min(active, hits.length - 1)];
  const optionId = (id: string) => `${listId}-${id}`;
  return (
    <div
      ref={ref}
      id="menu"
      className={compact ? 'menu menu--sheet pmenu' : 'menu pmenu'}
      role="dialog"
      aria-label={`Plan a partner for ${name}`}
      style={style}
      onKeyDown={close}
    >
      <div className="pmenu__head">
        <b>Partner for {name}</b>
        <button type="button" className="pmenu__close" aria-label="Close" onClick={onClose}>
          <X aria-hidden="true" />
        </button>
      </div>
      <div className="pmenu__kinds" role="radiogroup" aria-label="Link">
        {PARTNER_CHOICES.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={menu.choice === c}
            className="pmenu__kind"
            onClick={() => onChoice(c)}
          >
            {CHOICE_LABEL[c]}
          </button>
        ))}
      </div>
      <input
        ref={inputRef}
        className="pmenu__search"
        type="search"
        role="combobox"
        aria-expanded={hits.length > 0}
        aria-controls={listId}
        aria-activedescendant={hit ? optionId(hit.id) : undefined}
        aria-label="Find a partner by name"
        placeholder="Type a name…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            const step = e.key === 'ArrowDown' ? 1 : -1;
            setActive((i) => Math.max(0, Math.min(hits.length - 1, i + step)));
          } else if (e.key === 'Enter' && hit && !e.nativeEvent.isComposing) {
            e.preventDefault();
            onPick(hit.id);
          } else if (e.key === 'Escape' && query) {
            // The first Esc clears the name; the next closes the menu.
            e.stopPropagation();
            setQuery('');
            setActive(0);
          }
        }}
      />
      <p className="pmenu__label">
        {query.trim()
          ? hits.length
            ? `${hits.length} ${hits.length === 1 ? 'match' : 'matches'}`
            : ''
          : hits.length
            ? 'Closest in life'
            : ''}
      </p>
      {hits.length > 0 ? (
        <ul id={listId} className="partners pmenu__list" role="listbox" aria-label="Partners">
          {hits.map((h, i) => {
            const p = byid[h.id];
            if (!p) return null;
            return (
              <li key={h.id} id={optionId(h.id)} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  tabIndex={-1}
                  className={i === active ? 'partners__on' : undefined}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => onPick(h.id)}
                >
                  <PartnerRow sim={p} {...(h.candidate ? { candidate: h.candidate } : {})} dynasties={dynasties} related={h.related} married={h.married} />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="pmenu__empty">
          {query.trim() ? `No sim matches “${query.trim()}”.` : 'No one suggested: type a name.'}
        </p>
      )}
      <p className="pmenu__hint">Or click them on the board.</p>
    </div>
  );
}
