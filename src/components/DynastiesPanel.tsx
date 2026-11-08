import { useEffect, useMemo, useState } from 'react';
import { Highlighter, Warning } from '../icons.ts';
import { usePanelSheet } from '../hooks/usePanelSheet.ts';
import { panelPosition } from '../lib/chrome.ts';
import { DYNASTY_ROLES } from '../lib/constants.ts';
import { riskText, type DynastyMember, type DynastyRow } from '../lib/dynastyMenu.ts';
import { fold } from '../lib/utils.ts';

const WIDTH = 330;

type Props = {
  rows: DynastyRow[];
  /** "Ngata (Oliana’s line)" when two dynasties share a name, else the name. */
  labelOf: (row: DynastyRow) => string;
  /** "Scott dynasty", or "Scott dynasty (Sara’s line)" for one of two Scotts: for sentences. */
  phraseOf: (row: DynastyRow) => string;
  nameOf: (id: string) => string;
  /** "the Munch household · Willow Creek". */
  homeOf: (id: string) => string;
  anchorRect: DOMRect | null;
  /** Show a member on the board. */
  onFind: (id: string) => void;
  /** Light up these sims on the board (a dynasty's members), or no one. */
  onHover: (ids: Set<string> | null) => void;
  /** Renames a planned dynasty (by key) on all its members: its key now, null when refused. */
  onRename: (key: string, to: string) => string | null;
  /** What a planned dynasty would show as renamed `to`: "Goth (Travis’s line)" when another is called Goth. */
  renameLabel: (key: string, to: string) => string;
  /** Takes a planned dynasty (by key) off all its members; false when refused. */
  onRemove: (key: string) => boolean;
  /** The dynasty kept lit on the board (its key), if any. */
  litKey: string | null;
  /** Keep a dynasty lit on the board, or none. */
  onLight: (key: string | null) => void;
};

/** The list's order: by name, or by how many sims each has (the count on its card). */
type Sort = 'name' | 'most' | 'fewest';

const SORTS: { key: Sort; label: string; title: string }[] = [
  { key: 'name', label: 'A–Z', title: 'By name, A to Z' },
  { key: 'most', label: 'Most sims', title: 'The most sims first' },
  { key: 'fewest', label: 'Fewest sims', title: 'The fewest sims first' },
];

/** The order you last picked, kept for this browser only. */
const SORT_KEY = 'dynasties-sort';
function readSort(): Sort {
  try {
    const v = localStorage.getItem(SORT_KEY);
    return v === 'most' || v === 'fewest' ? v : 'name';
  } catch {
    return 'name';
  }
}

/** What a planned dynasty's card is asking: a new name, or whether to remove it. */
type Editing = { key: string; mode: 'rename' | 'remove'; to: string };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "2 planned to join · 1 deceased": what the count holds besides members as the save has them. */
function partsText(r: DynastyRow): string {
  return [
    r.joining ? `${r.joining} planned to join` : '',
    r.leaving ? `${r.leaving} planned to leave` : '',
    r.deceased ? `${r.deceased} deceased` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

/** "Head · planned · the Munch household". */
function memberMeta(m: DynastyMember, home: string): string {
  const role = m.role ? DYNASTY_ROLES[m.role].noun : 'Member';
  return [
    `${role.charAt(0).toUpperCase()}${role.slice(1)}`,
    m.planned ? 'planned' : '',
    m.leaving ? 'planned to leave' : '',
    m.deceased ? 'deceased' : '',
    home,
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * Every dynasty on the board, the game's and the planned ones apart, each
 * with how many sims are in it and who heads it. Members live in any
 * world, so the list doesn't split by world: hovering a dynasty lights its
 * members up on the board wherever they are, and opening it lists them,
 * each a click from their card.
 */
export function DynastiesPanel({
  rows,
  labelOf,
  phraseOf,
  nameOf,
  homeOf,
  anchorRect,
  onFind,
  onHover,
  onRename,
  renameLabel,
  onRemove,
  litKey,
  onLight,
}: Props) {
  const sheet = usePanelSheet();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  const [editing, setEditing] = useState<Editing | null>(null);
  const [sort, setSort] = useState<Sort>(readSort);
  const [riskOnly, setRiskOnly] = useState(false);
  const atRisk = useMemo(() => rows.filter((r) => r.risk).length, [rows]);
  const pickSort = (next: Sort) => {
    setSort(next);
    try {
      localStorage.setItem(SORT_KEY, next);
    } catch {
      // Private mode: the order holds until the panel closes.
    }
  };
  // Nothing stays lit once the panel closes.
  useEffect(() => () => onHover(null), [onHover]);

  const q = fold(query);
  /**
   * Rows matching the search, by their name or a member's (those found by
   * a member open), only those at risk when asked, in the order picked:
   * by size, ties stay A to Z.
   */
  const found = useMemo(() => {
    const byMember = new Set<string>();
    const out = rows.filter((r) => {
      if (riskOnly && !r.risk) return false;
      if (!q || fold(labelOf(r)).includes(q)) return true;
      if (r.members.some((m) => fold(nameOf(m.id)).includes(q))) {
        byMember.add(r.key);
        return true;
      }
      return false;
    });
    if (sort !== 'name') out.sort((a, b) => (sort === 'most' ? -1 : 1) * (a.members.length - b.members.length));
    return { rows: out, byMember };
  }, [rows, q, labelOf, nameOf, riskOnly, sort]);

  const pos = panelPosition(anchorRect, WIDTH);
  if (!pos) return null;
  const groups = [
    { key: 'game', title: 'In your game', rows: found.rows.filter((r) => r.inGame) },
    { key: 'planned', title: 'Planned', rows: found.rows.filter((r) => !r.inGame) },
  ].filter((g) => g.rows.length);

  /** A planned dynasty's Rename and Remove, or the form one of them opened. */
  const tidy = (r: DynastyRow, formId: string) => {
    const sims = r.members.length === 1 ? 'its 1 sim' : `all ${r.members.length} of its sims`;
    if (editing?.key === r.key && editing.mode === 'rename') {
      const to = editing.to.trim();
      // Another dynasty has the name: allowed, and told apart by founder.
      const taken = to ? rows.find((x) => x.key !== r.key && fold(x.name) === fold(to)) : undefined;
      const can = !!to && to !== r.name;
      const submit = () => {
        if (!can) return;
        const key = onRename(r.key, to);
        if (!key) return;
        // The card stays open under its new name.
        setOpen((s) => new Set([...s].filter((k) => k !== r.key)).add(key));
        setEditing(null);
      };
      return (
        <div className="dynp__form">
          <label htmlFor={`${formId}-to`}>New name for the {phraseOf(r)}</label>
          <input
            id={`${formId}-to`}
            value={editing.to}
            autoFocus
            autoComplete="off"
            spellCheck={false}
            aria-describedby={`${formId}-hint`}
            onChange={(e) => setEditing({ ...editing, to: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                e.preventDefault();
                submit();
              } else if (e.key === 'Escape') {
                // Closes the form only, not the panel.
                e.stopPropagation();
                setEditing(null);
              }
            }}
          />
          <p id={`${formId}-hint`} className={taken ? 'dynp__hint dynp__hint--warn' : 'dynp__hint'} role="status">
            {taken
              ? `There’s already a ${taken.name} dynasty. You can still use the name: to tell them apart, this one will show as ${renameLabel(r.key, to)}.`
              : `Renames it on ${sims} right away. Use the name it will have in the game, so a save can match it.`}
          </p>
          <div className="dynp__formacts">
            <button type="button" className="dynp__go" disabled={!can} onClick={submit}>
              Rename
            </button>
            <button type="button" className="dynp__cancel" onClick={() => setEditing(null)}>
              Cancel
            </button>
          </div>
        </div>
      );
    }
    if (editing?.key === r.key && editing.mode === 'remove') {
      return (
        <div
          className="dynp__form"
          role="group"
          aria-label={`Remove the ${phraseOf(r)}`}
          onKeyDown={(e) => {
            if (e.key !== 'Escape') return;
            e.stopPropagation();
            setEditing(null);
          }}
        >
          <p className="dynp__hint dynp__hint--ask">
            Remove the planned {phraseOf(r)} from {sims}? Their cards stay: only the dynasty and their roles in
            it go. Undo brings it back.
          </p>
          <div className="dynp__formacts">
            <button
              type="button"
              className="dynp__go dynp__go--danger"
              autoFocus
              onClick={() => {
                if (!onRemove(r.key)) return;
                setEditing(null);
                onHover(null);
              }}
            >
              Remove
            </button>
            <button type="button" className="dynp__cancel" onClick={() => setEditing(null)}>
              Keep it
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className="dynp__actions">
        <button type="button" className="dynp__act" onClick={() => setEditing({ key: r.key, mode: 'rename', to: r.name })}>
          Rename
        </button>
        <button
          type="button"
          className="dynp__act dynp__act--danger"
          onClick={() => setEditing({ key: r.key, mode: 'remove', to: '' })}
        >
          Remove…
        </button>
      </div>
    );
  };

  const holder = (m: DynastyMember | undefined, role: 'head' | 'heir') =>
    m ? (
      <span
        className={m.planned ? 'dynp__who dynp__who--planned' : 'dynp__who'}
        title={m.planned ? `Planned ${DYNASTY_ROLES[role].noun}: not in your save yet` : undefined}
      >
        {DYNASTY_ROLES[role].mark} {nameOf(m.id)}
      </span>
    ) : role === 'head' ? (
      <span className="dynp__who dynp__who--none">No head yet</span>
    ) : null;

  return (
    <div
      id="dynasties"
      className={sheet ? 'gpanel gpanel--sheet dynp' : 'gpanel dynp'}
      style={{ display: 'block', ...(sheet ? {} : { width: WIDTH }), ...pos }}
      role="dialog"
      aria-label="Dynasties"
    >
      <div className="gph">
        <b>Dynasties</b>
        <span className="dynp__total">{plural(rows.length, 'dynasty', 'dynasties')}</span>
      </div>
      {rows.length > 0 && (
        <input
          type="search"
          className="dynp__search"
          value={query}
          placeholder="Find a dynasty or a sim"
          aria-label="Find a dynasty or a sim in one"
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            // Esc clears the search first, then closes the panel.
            if (e.key === 'Escape' && query) {
              e.stopPropagation();
              setQuery('');
            }
          }}
        />
      )}
      {rows.length > 1 && (
        <div className="dynp__tools">
          <div className="dynp__sort" role="group" aria-label="Sort dynasties">
            {SORTS.map((o) => (
              <button
                key={o.key}
                type="button"
                className="dynp__sortopt"
                aria-pressed={sort === o.key}
                title={o.title}
                onClick={() => pickSort(o.key)}
              >
                {o.label}
              </button>
            ))}
          </div>
          {(atRisk > 0 || riskOnly) && (
            <button
              type="button"
              className="dynp__riskonly"
              aria-pressed={riskOnly}
              title={riskOnly ? 'Show every dynasty' : 'Show only the dynasties at risk'}
              onClick={() => setRiskOnly((v) => !v)}
            >
              <Warning size={13} weight="fill" aria-hidden />
              {atRisk} at risk
            </button>
          )}
        </div>
      )}
      {!rows.length ? (
        <p className="dynp__empty">
          No dynasties yet. Upload a save with dynasties in it, or plan one from a sim’s Family tab.
        </p>
      ) : !groups.length ? (
        <p className="dynp__empty">
          {riskOnly
            ? q
              ? `No dynasty at risk matches “${query.trim()}”.`
              : 'No dynasty is at risk.'
            : `No dynasty or member matches “${query.trim()}”.`}
        </p>
      ) : (
        groups.map((g) => (
          <section key={g.key} className="dynp__group" aria-labelledby={`dynp-${g.key}`}>
            <h3 id={`dynp-${g.key}`} className="dynp__title">
              {g.title} <span className="brief__count">{g.rows.length}</span>
            </h3>
            <ul className="dynp__list">
              {g.rows.map((r) => {
                const expanded = open.has(r.key) || found.byMember.has(r.key);
                const parts = partsText(r);
                const ids = new Set(r.members.map((m) => m.id));
                const listId = `dynp-m-${r.key.replace(/[^\w-]/g, '_')}`;
                const lit = litKey === r.key;
                const label = labelOf(r);
                return (
                  <li
                    key={r.key}
                    className={lit ? 'dynp__row dynp__row--lit' : 'dynp__row'}
                    onPointerEnter={() => onHover(ids)}
                    onPointerLeave={() => onHover(null)}
                  >
                    <div className="dynp__rowhead">
                    <button
                      type="button"
                      className="dynp__head"
                      aria-expanded={expanded}
                      aria-controls={listId}
                      onFocus={() => onHover(ids)}
                      onBlur={() => onHover(null)}
                      onClick={() =>
                        setOpen((s) => {
                          const next = new Set(s);
                          if (next.has(r.key)) next.delete(r.key);
                          else next.add(r.key);
                          return next;
                        })
                      }
                    >
                      <span className="dynp__top">
                        <span className="dynp__name">{labelOf(r)}</span>
                        <span className="dynp__count">{plural(r.members.length, 'sim')}</span>
                      </span>
                      <span className="dynp__holders">
                        {holder(r.head, 'head')}
                        {holder(r.heir, 'heir')}
                      </span>
                      {parts && <span className="dynp__parts">{parts}</span>}
                      {r.risk && (
                        <span className="dynp__risk">
                          <Warning size={13} weight="fill" aria-hidden />
                          At risk: {riskText(r.risk)}
                        </span>
                      )}
                    </button>
                    {/* Hovering only previews; this keeps them lit after. */}
                    <button
                      type="button"
                      className="dynp__lite"
                      aria-pressed={lit}
                      aria-label={lit ? `Stop highlighting the ${label} dynasty` : `Highlight the ${label} dynasty on the board`}
                      title={lit ? 'Stop highlighting' : 'Highlight on the board'}
                      onClick={() => onLight(lit ? null : r.key)}
                    >
                      <Highlighter weight={lit ? 'fill' : 'regular'} />
                    </button>
                    </div>
                    {expanded && (
                      <div id={listId}>
                      <ul className="dynp__members" aria-label={`${labelOf(r)} members`}>
                        {r.members.map((m) => (
                          <li key={m.id}>
                            <button
                              type="button"
                              className={m.deceased ? 'dynp__member dynp__member--dead' : 'dynp__member'}
                              title="Show them on the board"
                              onClick={() => onFind(m.id)}
                            >
                              <span className="dynp__mname">
                                {m.role && (
                                  <span style={m.planned ? { opacity: 0.4 } : undefined}>
                                    {DYNASTY_ROLES[m.role].mark}{' '}
                                  </span>
                                )}
                                {nameOf(m.id)}
                              </span>
                              <span className="dynp__mmeta">{memberMeta(m, homeOf(m.id))}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                      {/* Only a planned dynasty: a game one is named by the save. */}
                      {!r.inGame && tidy(r, listId)}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
      <p className="upnext__rules">
        Hover a dynasty to light up its members on the board, in any world, or click its highlighter to keep them
        lit. Open it to see who they are, or to rename or remove a planned one. Counts take in the deceased and
        sims only planned into it. A dynasty is at risk with no heir, or with 2 sims or fewer to carry it on: its
        living members, planned ones too, but not outcasts or sims planned to leave.
      </p>
    </div>
  );
}
