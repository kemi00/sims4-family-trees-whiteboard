import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { fold } from '../lib/utils.ts';

export type SearchOption = {
  value: string;
  label: string;
  /** A second line under the label: why it is suggested. */
  meta?: string;
  /** Short text at the row's right: a count. */
  aside?: string;
};

export type SearchGroup = {
  key: string;
  /** Its heading; none for a group that needs none ("No dynasty"). */
  label?: string;
  options: SearchOption[];
};

type Props = {
  /** The closed field's id, for its <label htmlFor>. */
  id: string;
  value: string;
  /** What the closed field shows. */
  display: string;
  groups: SearchGroup[];
  /** Placeholder and accessible name of the search box: "Search dynasties". */
  searchLabel: string;
  /**
   * The first row, always shown: "➕ Create a new dynasty…", or with text
   * typed and no exact match, one named after it.
   */
  create?: {
    value: string;
    /** `taken`: the text typed is a name an option already has. */
    label: (query: string, taken: boolean) => string;
    /**
     * The text typed is a name an option already has (a dynasty's, tags
     * aside): the row then stays, last and marked, to make another of that
     * name on purpose rather than by a slip.
     */
    taken?: (query: string) => boolean;
    /** Its second line then: what to pick instead. */
    takenMeta?: string;
  };
  /** Picked: the option's value, and the text typed when it was picked. */
  onChange: (value: string, query: string) => void;
  /** What to say when nothing matches. */
  emptyText: (query: string) => string;
  describedBy?: string;
  onOpenChange?: (open: boolean) => void;
};

/**
 * A menu with a search box at its top, for lists too long to scan: closed,
 * it looks like the other menus; open, it unfolds below the field (inside
 * the scrolling editor, so it is never cut off), the search box focused.
 * Arrow keys move, Enter picks, Esc closes; groups keep their headings
 * while you search, and empty ones go.
 */
export function SearchSelect({
  id,
  value,
  display,
  groups,
  searchLabel,
  create,
  onChange,
  emptyText,
  describedBy,
  onOpenChange,
}: Props) {
  const uid = useId();
  const listId = `${uid}-list`;
  const optId = (i: number) => `${uid}-o${i}`;
  const [open, setOpenState] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const q = fold(query);
  /**
   * The groups as shown: those with a match, in order. In each, names with
   * a word starting with the text typed come first: "ro" puts Robles and
   * Roswell before Darong.
   */
  const shown = useMemo(() => {
    const starts = (label: string) => fold(label).split(/[\s(’'-]+/).some((w) => w.startsWith(q));
    const found = q
      ? groups.map((g) => ({
          ...g,
          options: g.options
            .filter((o) => fold(o.label).includes(q))
            .sort((a, b) => Number(starts(b.label)) - Number(starts(a.label))),
        }))
      : groups;
    return found.filter((g) => g.options.length);
  }, [groups, q]);
  const typed = query.trim();
  const taken = !!q && !!create?.taken?.(typed);
  const exact = !!q && groups.some((g) => g.options.some((o) => fold(o.label) === q));
  const createRow = create && !taken && !exact ? { value: create.value, label: create.label(typed, false) } : null;
  // The name is taken: making another goes last, below the one to join.
  const createLast =
    create && taken
      ? { value: create.value, label: create.label(typed, true), ...(create.takenMeta ? { meta: create.takenMeta } : {}) }
      : null;
  type Row = SearchOption & { query: string; create?: true };
  /** Every row the arrow keys move through, top to bottom. */
  const rows: Row[] = [
    ...(createRow ? [{ ...createRow, query: typed, create: true as const }] : []),
    ...shown.flatMap((g) => g.options.map((o) => ({ ...o, query: '' }))),
    ...(createLast ? [{ ...createLast, query: typed, create: true as const }] : []),
  ];
  const offset = createRow ? 1 : 0;

  const setOpen = (on: boolean) => {
    setOpenState(on);
    onOpenChange?.(on);
  };
  const openWith = (text: string) => {
    setQuery(text);
    setOpen(true);
  };
  const close = (refocus: boolean) => {
    setOpen(false);
    setQuery('');
    if (refocus) fieldRef.current?.focus();
  };
  const pick = (i: number) => {
    const r = rows[i];
    if (!r) return;
    onChange(r.value, r.query);
    close(true);
  };

  // The row to start on: what is picked, or while searching the first match
  // (Enter takes it), else creating one by the name typed.
  useEffect(() => {
    if (!open) return;
    const cur = rows.findIndex((r) => !r.create && r.value === value);
    setActive(q ? (rows.length > offset ? offset : 0) : Math.max(0, cur));
    // On opening and on each change to the search only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, q]);

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
    const away = (ev: PointerEvent) => {
      if (!rootRef.current?.contains(ev.target as Node)) close(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (open) document.getElementById(optId(active))?.scrollIntoView({ block: 'nearest' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, active]);

  const onFieldKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      openWith('');
    } else if (e.key.length === 1 && e.key !== ' ' && !e.metaKey && !e.ctrlKey && !e.altKey) {
      // Typing on the closed field starts the search with that letter.
      e.preventDefault();
      openWith(e.key);
    }
  };
  const onSearchKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((a) => (rows.length ? (a + step + rows.length) % rows.length : 0));
    } else if (e.key === 'Enter') {
      // Picks, and only picks: the editor around it saves on Enter.
      e.stopPropagation();
      // An Enter that finishes typing with an input method is left to it.
      if (e.nativeEvent.isComposing || e.keyCode === 229) return;
      e.preventDefault();
      pick(active);
    } else if (e.key === 'Escape') {
      // Closes this menu only, not the editor around it.
      e.preventDefault();
      e.stopPropagation();
      close(true);
    } else if (e.key === 'Tab') {
      close(false);
    }
  };

  const row = (o: Row, i: number, extra = '') => (
    <li
      key={`${o.value}:${i}`}
      id={optId(i)}
      role="option"
      aria-selected={o.value === value && !o.create}
      className={`ssel__opt${i === active ? ' ssel__opt--active' : ''}${extra}`}
      // Keeps focus in the search box, so the list stays open to the click.
      onPointerDown={(e) => e.preventDefault()}
      onPointerMove={() => setActive(i)}
      onClick={() => pick(i)}
    >
      <span className="ssel__text">
        <span className="ssel__label">{o.label}</span>
        {o.meta && <span className="ssel__meta">{o.meta}</span>}
      </span>
      {o.aside && <span className="ssel__aside">{o.aside}</span>}
    </li>
  );

  let i = offset;
  return (
    <div className={open ? 'ssel ssel--open' : 'ssel'} ref={rootRef}>
      <button
        type="button"
        id={id}
        ref={fieldRef}
        className="ssel__field"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-describedby={describedBy}
        onClick={() => (open ? close(true) : openWith(''))}
        onKeyDown={onFieldKey}
      >
        <span className="ssel__value">{display}</span>
        <svg className="ssel__chev" viewBox="0 0 12 12" aria-hidden>
          <path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="ssel__pop">
          <input
            ref={searchRef}
            type="search"
            className="ssel__search"
            role="combobox"
            aria-label={searchLabel}
            aria-autocomplete="list"
            aria-expanded
            aria-controls={listId}
            aria-activedescendant={rows.length ? optId(active) : undefined}
            placeholder={searchLabel}
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onSearchKey}
          />
          <ul className="ssel__list" id={listId} role="listbox" aria-label={searchLabel}>
            {createRow && row(rows[0]!, 0, ' ssel__opt--create')}
            {shown.map((g) => {
              const head = `${uid}-g${g.key}`;
              return (
                <li key={g.key} role="presentation">
                  {g.label && (
                    <div className="ssel__group" id={head}>
                      {g.label}
                    </div>
                  )}
                  <ul role="group" aria-labelledby={g.label ? head : undefined} className="ssel__sub">
                    {g.options.map(() => {
                      const at = i++;
                      return row(rows[at]!, at);
                    })}
                  </ul>
                </li>
              );
            })}
            {createLast && row(rows[rows.length - 1]!, rows.length - 1, ' ssel__opt--create ssel__opt--taken')}
          </ul>
          {!shown.length && <div className="ssel__empty">{emptyText(typed)}</div>}
        </div>
      )}
    </div>
  );
}
