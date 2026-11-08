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
  /** Renames a planned dynasty on all its members; false when refused. */
  onRename: (from: string, to: string) => boolean;
  /** Takes a planned dynasty off all its members; false when refused. */
  onRemove: (name: string) => boolean;
};

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
export function DynastiesPanel({ rows, labelOf, nameOf, homeOf, anchorRect, onFind, onHover, onRename, onRemove }: Props) {
  const sheet = usePanelSheet();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  const [editing, setEditing] = useState<Editing | null>(null);
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

  /** A planned dynasty's Rename and Remove, or the form one of them opened. */
  const tidy = (r: DynastyRow, formId: string) => {
    const sims = r.members.length === 1 ? 'its 1 sim' : `all ${r.members.length} of its sims`;
    if (editing?.key === r.key && editing.mode === 'rename') {
      const to = editing.to.trim();
      const taken = to ? rows.find((x) => x.key !== r.key && fold(x.name) === fold(to)) : undefined;
      const can = !!to && to !== r.name && !taken;
      const submit = () => {
        if (!can || !onRename(r.name, to)) return;
        // The card stays open under its new name.
        setOpen((s) => new Set([...s].filter((k) => k !== r.key)).add(`name:${to}`));
        setEditing(null);
      };
      return (
        <div className="dynp__form">
          <label htmlFor={`${formId}-to`}>New name for the {r.name} dynasty</label>
          <input
            id={`${formId}-to`}
            value={editing.to}
            autoFocus
            autoComplete="off"
            spellCheck={false}
            aria-invalid={taken ? true : undefined}
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
          <p
            id={`${formId}-hint`}
            className={taken ? 'dynp__hint dynp__hint--error' : 'dynp__hint'}
            role={taken ? 'alert' : undefined}
          >
            {taken
              ? `There’s already a ${taken.name} dynasty. Choose another name.`
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
          aria-label={`Remove the ${r.name} dynasty`}
          onKeyDown={(e) => {
            if (e.key !== 'Escape') return;
            e.stopPropagation();
            setEditing(null);
          }}
        >
          <p className="dynp__hint dynp__hint--ask">
            Remove the planned {r.name} dynasty from {sims}? Their cards stay: only the dynasty and their roles in
            it go. Undo brings it back.
          </p>
          <div className="dynp__formacts">
            <button
              type="button"
              className="dynp__go dynp__go--danger"
              autoFocus
              onClick={() => {
                if (!onRemove(r.name)) return;
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
        Hover a dynasty to light up its members on the board, in any world; open it to see who they are, or to
        rename or remove a planned one. Counts take in the deceased and sims only planned into it.
      </p>
    </div>
  );
}
