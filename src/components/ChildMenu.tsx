import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { CloseButton } from './CloseButton.tsx';
import { dynastyNames } from '../lib/generations.ts';
import { PartnerRow } from './PartnerRow.tsx';
import { CaretLeft } from '../icons.ts';
import { useFitMenuInStage } from '../hooks/useFitMenuInStage.ts';
import { cardName } from '../lib/plan.ts';
import { theHousehold } from '../lib/utils.ts';
import { hasNoHome } from '../lib/partners.ts';
import { adopteeSearch, whyCantAdopt } from '../lib/adoption.ts';
import type { ChildMenuState } from '../hooks/useWhiteboard.ts';
import type { Edge, SaveGameInfo, SimNode } from '../types/whiteboard.ts';

type Props = {
  menu: ChildMenuState;
  nodes: SimNode[];
  byid: Record<string, SimNode>;
  edges: Edge[];
  saveGame?: SaveGameInfo | null;
  /** Planned babies, not born yet: never adopted. */
  unborn: ReadonlySet<string>;
  onNewSim: () => void;
  onAdoptStep: (step: ChildMenuState['step']) => void;
  onAdopt: (child: string) => void;
  /** The adopted child moves into `host`'s household (an adopter's). */
  onMoveIn: (child: string, host: string) => void;
  onClose: () => void;
};

/** "has 1 parent", "has 2 parents": who the adopted child has already. */
function parentsFlag(n: number): string[] {
  return n ? [`has ${n} parent${n === 1 ? '' : 's'}`] : [];
}

/**
 * The menu from a ＋: a card's (one parent) or a couple's (both). First,
 * what kind of child: a new sim (a planned baby, as the ＋ always made) or
 * an existing sim to adopt. Adopting lists, as the partner menu does, the
 * sims who could be: younger than each parent, living, and family to none
 * of them yet (no blood relative, partner or ex). Picked and living apart,
 * it asks whether the child moves in, into either parent's home.
 */
export function ChildMenu({
  menu,
  nodes,
  byid,
  edges,
  saveGame,
  unborn,
  onNewSim,
  onAdoptStep,
  onAdopt,
  onMoveIn,
  onClose,
}: Props) {
  const { compact, ref, style } = useFitMenuInStage(menu.x, menu.y);
  const listId = useId();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const firstRef = useRef<HTMLButtonElement>(null);
  const adopters = menu.parents.map((id) => byid[id]).filter((n): n is SimNode => !!n);
  const me = adopters.length === menu.parents.length ? adopters[0] : undefined;
  const couple = adopters.length > 1;
  const picked = menu.picked ? byid[menu.picked] : undefined;
  const adopting = menu.step === 'adopt';

  const all = useMemo(
    () => (me ? adopteeSearch({ ids: menu.parents, nodes, edges, game: saveGame, unborn }) : []),
    [me, menu.parents, nodes, edges, saveGame, unborn],
  );
  const hits = useMemo(
    () =>
      adopting && me
        ? adopteeSearch({ ids: menu.parents, nodes, edges, query, game: saveGame, unborn, limit: query.trim() ? 30 : 8 })
        : [],
    [adopting, me, menu.parents, nodes, edges, query, saveGame, unborn],
  );
  const dynasties = useMemo(() => dynastyNames(nodes), [nodes]);
  useEffect(() => {
    // A frame later: the menu is hidden while it measures where it fits.
    // On a phone the keyboard would cover the board.
    if (compact && adopting) return;
    const f = requestAnimationFrame(() => (adopting ? inputRef.current : firstRef.current)?.focus());
    return () => cancelAnimationFrame(f);
  }, [menu.step, adopting, compact]);
  if (!me) return null;

  const name = adopters.map((a) => cardName(a)).join(' and ');
  const firsts = adopters.map((a) => a.first).join(' and ');
  const adopt = couple ? 'adopt' : 'adopts';
  const close = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    // Esc closes this menu, not the panel or selection behind it.
    e.stopPropagation();
    onClose();
  };
  const head = (title: string, back = false) => (
    <div className="pmenu__head">
      {back ? (
        <button type="button" className="pmenu__back" onClick={() => onAdoptStep('choose')}>
          <CaretLeft aria-hidden="true" weight="bold" />
          <b>{title}</b>
        </button>
      ) : (
        <b>{title}</b>
      )}
      <CloseButton label="Close" onClick={onClose} />
    </div>
  );
  const shell = (label: string, body: ReactNode) => (
    <div
      ref={ref}
      id="menu"
      className={compact ? 'menu menu--sheet pmenu' : 'menu pmenu'}
      role="dialog"
      aria-label={label}
      style={style}
      onKeyDown={close}
    >
      {body}
    </div>
  );

  if (menu.step === 'move' && picked) {
    // Each parent's home, once: a couple apart offers both.
    const hosts = adopters.filter((a, i) => !hasNoHome(a) && adopters.findIndex((b) => b.gid === a.gid) === i);
    return shell(
      `Move ${cardName(picked)} in with ${name}?`,
      <>
        <p className="pmenu__done">
          ✓ Adoption planned: {name} {adopt} {cardName(picked)}
        </p>
        <p className="pmenu__ask">They live apart. Will {picked.first} move in?</p>
        {hosts.map((host, i) => (
          <button
            key={host.id}
            ref={i === 0 ? firstRef : undefined}
            type="button"
            className={i === 0 ? 'pmenu__move pmenu__move--first' : 'pmenu__move'}
            onClick={() => onMoveIn(picked.id, host.id)}
          >
            {cardName(picked)} moves into {theHousehold(host.hh)}
          </button>
        ))}
        <button type="button" className="pmenu__move pmenu__keep" onClick={onClose}>
          Keep them apart
        </button>
        <p className="pmenu__hint">A move is part of your plan until a save shows it.</p>
      </>,
    );
  }

  if (!adopting) {
    const cantOne = adopters.map((a) => [a, whyCantAdopt(a)] as const).find(([, why]) => why);
    const cant = cantOne ? (couple ? `${cantOne[0].first}: ${cantOne[1]}` : cantOne[1]) : null;
    const none =
      !cant && all.length === 0
        ? `No one younger${couple ? ' than both' : ''} who isn’t family already.`
        : null;
    return shell(
      `Add a child of ${name}`,
      <>
        {head(`Child of ${name}`)}
        <button ref={firstRef} type="button" className="cmenu__pick" onClick={onNewSim}>
          <span className="cmenu__title">＋ New sim</span>
          <span className="cmenu__sub">A planned baby, not born yet</span>
        </button>
        <button
          type="button"
          className="cmenu__pick"
          disabled={!!(cant ?? none)}
          onClick={() => onAdoptStep('adopt')}
        >
          <span className="cmenu__title">Adopt a sim</span>
          <span className="cmenu__sub">
            {cant ??
              none ??
              `Someone younger${couple ? ' than both' : ''} who isn’t family yet: ${all.length} to pick from`}
          </span>
        </button>
      </>,
    );
  }

  const hit = hits[Math.min(active, hits.length - 1)];
  const optionId = (id: string) => `${listId}-${id}`;
  return shell(
    `Plan an adoption by ${name}`,
    <>
      {head(`${couple ? firsts : name} ${adopt}…`, true)}
      <input
        ref={inputRef}
        className="pmenu__search"
        type="search"
        role="combobox"
        aria-expanded={hits.length > 0}
        aria-controls={listId}
        aria-activedescendant={hit ? optionId(hit.id) : undefined}
        aria-label="Find a sim to adopt by name"
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
            onAdopt(hit.id);
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
            ? 'Youngest first'
            : ''}
      </p>
      {hits.length > 0 ? (
        <ul id={listId} className="partners pmenu__list" role="listbox" aria-label="Sims to adopt">
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
                  onClick={() => onAdopt(h.id)}
                >
                  <PartnerRow sim={p} candidate={h.candidate} dynasties={dynasties} extra={parentsFlag(h.parents)} />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="pmenu__empty">
          {query.trim()
            ? `No one to adopt matches “${query.trim()}”.`
            : `No one younger${couple ? ' than both' : ''} who isn’t family already.`}
        </p>
      )}
      <p className="pmenu__hint">
        {couple
          ? `Only sims younger than ${firsts} who aren’t family to either yet: no relatives, partners or exes.`
          : `Only sims younger than ${me.first} who aren’t family yet: no relatives, partners or exes.`}
      </p>
    </>,
  );
}
