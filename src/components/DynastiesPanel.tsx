import { useEffect, useMemo, useState } from 'react';
import { usePanelSheet } from '../hooks/usePanelSheet.ts';
import { panelPosition } from '../lib/chrome.ts';
import { DYNASTY_ROLES } from '../lib/constants.ts';
import type { DynastyMember, DynastyRow } from '../lib/dynastyMenu.ts';
import { fold } from '../lib/utils.ts';

const WIDTH = 330;

type Props = {
  rows: DynastyRow[];
  /** "Ngata (Oliana’s line)" when two dynasties share a name, else the name. */
  labelOf: (row: DynastyRow) => string;
  nameOf: (id: string) => string;
  /** "the Munch household · Willow Creek". */
  homeOf: (id: string) => string;
  anchorRect: DOMRect | null;
  /** Show a member on the board. */
  onFind: (id: string) => void;
  /** Light up these sims on the board (a dynasty's members), or no one. */
  onHover: (ids: Set<string> | null) => void;
};

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
export function DynastiesPanel({ rows, labelOf, nameOf, homeOf, anchorRect, onFind, onHover }: Props) {
  const sheet = usePanelSheet();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  // Nothing stays lit once the panel closes.
  useEffect(() => () => onHover(null), [onHover]);

  const q = fold(query);
  /** Rows matching the search, by their name or a member's; those found by a member open. */
  const found = useMemo(() => {
    if (!q) return { rows, byMember: new Set<string>() };
    const byMember = new Set<string>();
    const out = rows.filter((r) => {
      if (fold(labelOf(r)).includes(q)) return true;
      if (r.members.some((m) => fold(nameOf(m.id)).includes(q))) {
        byMember.add(r.key);
        return true;
      }
      return false;
    });
    return { rows: out, byMember };
  }, [rows, q, labelOf, nameOf]);

  const pos = panelPosition(anchorRect, WIDTH);
  if (!pos) return null;
  const groups = [
    { key: 'game', title: 'In your game', rows: found.rows.filter((r) => r.inGame) },
    { key: 'planned', title: 'Planned', rows: found.rows.filter((r) => !r.inGame) },
  ].filter((g) => g.rows.length);

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
      {!rows.length ? (
        <p className="dynp__empty">
          No dynasties yet. Upload a save with dynasties in it, or plan one from a sim’s Family tab.
        </p>
      ) : !groups.length ? (
        <p className="dynp__empty">No dynasty or member matches “{query.trim()}”.</p>
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
                return (
                  <li
                    key={r.key}
                    className="dynp__row"
                    onPointerEnter={() => onHover(ids)}
                    onPointerLeave={() => onHover(null)}
                  >
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
                    </button>
                    {expanded && (
                      <ul className="dynp__members" id={listId} aria-label={`${labelOf(r)} members`}>
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
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
      <p className="upnext__rules">
        Hover a dynasty to light up its members on the board, in any world; open it to see who they are. Counts
        take in the deceased and sims only planned into it.
      </p>
    </div>
  );
}
