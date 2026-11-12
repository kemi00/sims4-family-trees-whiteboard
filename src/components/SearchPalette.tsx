import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ArrowRight, ClockCounterClockwise, Crown, Globe, House, MapPin, MagnifyingGlass, User, type Icon } from '../icons.ts';
import { useFittingPlaceholder } from '../hooks/useFittingPlaceholder.ts';
import { findResults, type FindAction, type FindGroup, type FindKind, type FindResult } from '../lib/findPalette.ts';
import type { DynastyName } from '../lib/generations.ts';
import type { Group, SimNode, World } from '../types/whiteboard.ts';

type Props = {
  worlds: readonly World[];
  groups: readonly Group[];
  visibleNodes: readonly SimNode[];
  dynastyNames: ReadonlyMap<string, DynastyName>;
  actions: readonly FindAction[];
  onGo: (result: FindResult) => void;
  onClose: () => void;
};

const ICON: Record<FindKind, Icon> = {
  sim: User,
  household: House,
  neighbourhood: MapPin,
  world: Globe,
  dynasty: Crown,
  action: ArrowRight,
};

/** The field's hint, the longest that fits: a phone says less, never half of more. */
const HINTS = [
  'Find a sim, household, place or dynasty, or something to do',
  'Find a sim, household, place or dynasty',
  'Sims, households, places',
  'Search',
] as const;

/** The places you went from search, newest first, for this browser only. */
const RECENT_KEY = 'find-recent';
const RECENT_KEPT = 6;
function readRecent(): FindResult[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as FindResult[];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
function rememberFound(r: FindResult): void {
  if (r.kind === 'action') return;
  try {
    const next = [r, ...readRecent().filter((x) => !(x.kind === r.kind && x.key === r.key))].slice(0, RECENT_KEPT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Private mode: nothing is remembered.
  }
}

/**
 * Search, Spotlight-style: one field over the board, opened with ⌘K or
 * Ctrl+K, the bar's Search, or a phone's magnifier. Everything a name
 * finds, grouped, with where it is; ↑ and ↓ to choose, Enter to go, Esc
 * to close. With nothing typed: where you went last, and things to do.
 */
export function SearchPalette({ worlds, groups, visibleNodes, dynastyNames, actions, onGo, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const { ref: inputRef, text: hint } = useFittingPlaceholder(HINTS);
  const listRef = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    // Back where the keyboard was when search closes (the Search button, a field), not lost on the page.
    const before = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    inputRef.current?.focus();
    return () => before?.focus({ preventScroll: true });
  }, [inputRef]);

  const groupsShown: FindGroup[] = useMemo(() => {
    if (query.trim()) return findResults(query, { worlds, groups, visibleNodes, dynastyNames }, actions);
    // Nothing typed: where you went last, still on the board, then things to do.
    const sims = new Set(visibleNodes.map((n) => n.id));
    const gids = new Set(visibleNodes.map((n) => n.gid));
    const worldNames = new Set(visibleNodes.map((n) => n.world));
    const recent = readRecent().filter((r) =>
      r.kind === 'sim'
        ? sims.has(r.key)
        : r.kind === 'household'
          ? gids.has(r.key)
          : r.kind === 'world'
            ? worldNames.has(r.key)
            : r.kind === 'neighbourhood'
              ? visibleNodes.some((n) => `${n.world}||${n.nb}` === r.key)
              : r.kind === 'dynasty' && dynastyNames.has(r.key),
    );
    return [
      ...(recent.length ? [{ title: 'Recent', items: recent, more: 0 }] : []),
      {
        title: 'Do',
        items: actions.filter((a) => a.suggested).map((a) => ({ kind: 'action' as const, key: a.id, label: a.label, detail: a.detail })),
        more: 0,
      },
    ];
  }, [query, worlds, groups, visibleNodes, dynastyNames, actions]);
  const flat = groupsShown.flatMap((g) => g.items);
  const at = Math.min(active, Math.max(0, flat.length - 1));
  const optionId = (i: number) => `${id}-opt-${i}`;

  useEffect(() => {
    listRef.current?.querySelector(`#${CSS.escape(optionId(at))}`)?.scrollIntoView({ block: 'nearest' });
    // optionId only joins id and the index.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at]);

  const go = (r: FindResult | undefined) => {
    if (!r) return;
    rememberFound(r);
    onGo(r);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!flat.length) return;
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((at + step + flat.length) % flat.length);
    } else if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) {
      e.preventDefault();
      go(flat[at]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (query) {
        setQuery('');
        setActive(0);
      } else onClose();
    }
  };

  let index = 0;
  return (
    <div
      className="find"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="find__box" role="dialog" aria-modal="true" aria-label="Search the board">
        <div className="find__field">
          <MagnifyingGlass className="find__icon" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded={flat.length > 0}
            aria-controls={`${id}-list`}
            aria-activedescendant={flat.length ? optionId(at) : undefined}
            aria-autocomplete="list"
            value={query}
            placeholder={hint}
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="go"
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKey}
          />
          <button type="button" className="find__close" onClick={onClose}>
            Close
          </button>
        </div>
        <div ref={listRef} id={`${id}-list`} className="find__list" role="listbox" aria-label="Results">
          {query.trim() && !flat.length && (
            <p className="find__empty">Nothing on the board is called “{query.trim()}”. Hidden sims don’t show: check Filters.</p>
          )}
          {groupsShown.map((g) => (
            <div key={g.title} role="group" aria-label={g.title}>
              <p className="find__title" aria-hidden="true">
                {g.title === 'Recent' && <ClockCounterClockwise aria-hidden="true" />}
                {g.title}
              </p>
              {g.items.map((r) => {
                const i = index++;
                const Glyph = ICON[r.kind];
                return (
                  <div
                    key={`${r.kind}:${r.key}`}
                    id={optionId(i)}
                    role="option"
                    aria-selected={i === at}
                    className={i === at ? 'find__item find__item--on' : 'find__item'}
                    onPointerMove={() => i !== at && setActive(i)}
                    onClick={() => go(r)}
                  >
                    <Glyph className="find__kind" aria-hidden="true" />
                    <span className="find__label">{r.label}</span>
                    <span className="find__detail">{r.detail}</span>
                  </div>
                );
              })}
              {g.more > 0 && (
                <p className="find__more">
                  And {g.more} more: type more of the name to narrow it.
                </p>
              )}
            </div>
          ))}
        </div>
        <p className="find__foot" aria-hidden="true">
          ↑ ↓ to choose · Enter to go · Esc to close
        </p>
      </div>
    </div>
  );
}
