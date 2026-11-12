import { useEffect, useMemo, useState } from 'react';
import { BookOpenText, Check, Highlighter, ImageSquare, Warning } from '../icons.ts';
import { usePanelSheet } from '../hooks/usePanelSheet.ts';
import { panelPosition } from '../lib/chrome.ts';
import { DYNASTY_ROLES } from '../lib/constants.ts';
import { riskText, type DynastyMember, type DynastyRow } from '../lib/dynastyMenu.ts';
import { handoverText, lineClockText, stepClockText, stepWhen, type Handover, type SuccessionForecast } from '../lib/forecast.ts';
import { agingSummary } from '../lib/lifeClock.ts';
import { windowText } from '../lib/matchClock.ts';
import type { SaveGameInfo } from '../types/whiteboard.ts';
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
  /** A dynasty's line of succession with its countdowns (successionForecast). */
  forecastOf: (key: string) => SuccessionForecast;
  /** The last save's clock and aging options, if any. */
  game: SaveGameInfo | null;
  /** Make a poster of a dynasty (by key). */
  onPoster: (key: string) => void;
  /** "the Munch household", for the matchmaking clock's lines. */
  hhOf: (gid: string) => string;
  /** Open the Chronicle on a dynasty's story (by key); absent while the story is empty. */
  onStory?: (key: string) => void;
  /** A game dynasty's prestige from your last save, by key. */
  prestigeOf?: (key: string) => number | undefined;
};

/** The list's order: by name, by how many sims each has (the count on its card), or by prestige. */
type Sort = 'name' | 'most' | 'fewest' | 'prestige';

const SORTS: { key: Sort; label: string; title: string }[] = [
  { key: 'name', label: 'A–Z', title: 'By name, A to Z' },
  { key: 'most', label: 'Most sims', title: 'The most sims first' },
  { key: 'fewest', label: 'Fewest sims', title: 'The fewest sims first' },
  { key: 'prestige', label: 'Most prestige', title: 'The most prestige first, as your save has it' },
];

/** The order you last picked, kept for this browser only. */
const SORT_KEY = 'dynasties-sort';
function readSort(): Sort {
  try {
    const v = localStorage.getItem(SORT_KEY);
    return v === 'most' || v === 'fewest' || v === 'prestige' ? v : 'name';
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
  forecastOf,
  game,
  onPoster,
  hhOf,
  onStory,
  prestigeOf,
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
    if (sort === 'prestige') out.sort((a, b) => (prestigeOf?.(b.key) ?? -1) - (prestigeOf?.(a.key) ?? -1));
    else if (sort !== 'name') out.sort((a, b) => (sort === 'most' ? -1 : 1) * (a.members.length - b.members.length));
    return { rows: out, byMember };
  }, [rows, q, labelOf, nameOf, riskOnly, sort, prestigeOf]);
  /** Prestige is in the save (Royalty & Legacy, read since 2026-11-12): only then sort by it. */
  const hasPrestige = useMemo(() => rows.some((r) => prestigeOf?.(r.key) !== undefined), [rows, prestigeOf]);

  const pos = panelPosition(anchorRect, WIDTH);
  if (!pos) return null;
  const groups = [
    { key: 'game', title: 'In your game', rows: found.rows.filter((r) => r.inGame) },
    { key: 'planned', title: 'Planned', rows: found.rows.filter((r) => !r.inGame) },
  ].filter((g) => g.rows.length);

  const posterButton = (r: DynastyRow) => (
    <button
      type="button"
      className="dynp__act dynp__act--poster"
      title="A picture of this dynasty to keep or share"
      onClick={() => onPoster(r.key)}
    >
      <ImageSquare aria-hidden="true" /> Poster
    </button>
  );
  const storyButton = (r: DynastyRow) =>
    onStory ? (
      <button
        type="button"
        className="dynp__act dynp__act--poster"
        title="What happened to this dynasty in your saves"
        onClick={() => onStory(r.key)}
      >
        <BookOpenText aria-hidden="true" /> Story
      </button>
    ) : null;

  /** A planned dynasty's Poster, Rename and Remove, or the form one of them opened. */
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
        {posterButton(r)}
        {storyButton(r)}
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
      {/* Prestige comes with a save read since the board learned it: say so until then. */}
      {!hasPrestige && rows.some((r) => r.inGame) && (
        <p className="dynp__note">Each dynasty’s prestige shows here the next time you open your save.</p>
      )}
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
            {SORTS.filter((o) => o.key !== 'prestige' || hasPrestige).map((o) => (
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
          No dynasties yet. Open a save with dynasties in it, or plan one from a sim’s Family tab.
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
                        {prestigeOf?.(r.key) !== undefined && (
                          <span
                            className="dynp__prestige"
                            title="Prestige as your save stores it: the game shows it as Prestige Level 0 to 10"
                          >
                            {prestigeOf(r.key)!.toLocaleString()} prestige
                          </span>
                        )}
                        <span className="dynp__count">{plural(r.members.length, 'sim')}</span>
                      </span>
                      <span className="dynp__holders">
                        {holder(r.head, 'head')}
                        {holder(r.heir, 'heir')}
                        {r.later?.map((id, i) => (
                          <span
                            key={id}
                            className="dynp__who dynp__who--planned"
                            title={`Planned heir once ${nameOf(i ? r.later![i - 1]! : (r.heir?.id ?? ''))} is head`}
                          >
                            then {nameOf(id)}
                          </span>
                        ))}
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
                      <LineForecast f={forecastOf(r.key)} game={game} nameOf={nameOf} hhOf={hhOf} onFind={onFind} />
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
                      {/* Only a planned dynasty renames or goes: a game one is named by the save. */}
                      {r.inGame ? (
                        <div className="dynp__actions">
                          {posterButton(r)}
                          {storyButton(r)}
                        </div>
                      ) : (
                        tidy(r, listId)
                      )}
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
        lit. Open it to see who they are, its line of succession, a poster of it, or to rename or remove a planned one. Counts take
        in the deceased and sims only planned into it. A dynasty is at risk with no heir, or with 2 sims or fewer
        to carry it on: its living members, planned ones too, but not outcasts or sims planned to leave. Prestige is
        the number your save keeps for a game dynasty; the game shows it as Prestige Level 0 to 10. The line’s
        countdowns are days on your save’s lifespan, counting only the days that age each sim under its aging
        options; old age can come from the day shown, usually a few days after.
      </p>
    </div>
  );
}

/** How a handover reads: fine, worth a look, or just so. */
function handoverTone(h: Handover): 'ok' | 'warn' | 'info' {
  if (h.kind === 'ready' || h.kind === 'first') return 'ok';
  if (h.kind === 'late' || (h.kind === 'bornBy' && h.days <= 0)) return 'warn';
  return 'info';
}

/**
 * A dynasty's line of succession, head first, each with where they are in
 * life and between each two whether the next grows up in time. Under the
 * heading, who ages in the save, since that decides which days count.
 */
function LineForecast({
  f,
  game,
  nameOf,
  hhOf,
  onFind,
}: {
  f: SuccessionForecast;
  game: SaveGameInfo | null;
  nameOf: (id: string) => string;
  hhOf: (gid: string) => string;
  onFind: (id: string) => void;
}) {
  if (!f.steps.length) return null;
  const aging = game ? agingSummary(game) : '';
  const note = !game
    ? 'Open your save to see when each one grows up or grows old.'
    : [game.lifespan ? `${game.lifespan} lifespan` : '', aging].filter(Boolean).join(' · ');
  // Everyone in line in one household on one clock: said once, under the heading.
  const shared = lineClockText(f.steps);
  return (
    <section className="dynp__fc" aria-label="Line of succession">
      <h4 className="dynp__fch">
        Line of succession
        {note && <span className="dynp__fcnote">{note}</span>}
        {shared && <span className="dynp__fcnote">{shared}</span>}
      </h4>
      <ol className="dynp__line">
        {f.steps.map((s, i) => {
          const h = i ? f.handovers[i - 1] : undefined;
          const hand = h ? handoverText(h, nameOf(f.steps[i - 1]!.id), nameOf(s.id)) : '';
          const tone = h ? handoverTone(h) : 'info';
          const when = stepWhen(s, game);
          const clock = shared ? '' : stepClockText(s, i ? f.steps[i - 1] : undefined);
          const mark = s.place === 'head' ? '👑' : s.place === 'heir' ? '⚜️' : '';
          const role = s.place === 'head' ? 'Head' : s.place === 'heir' ? 'Heir' : 'Then';
          const partner =
            s.place === 'head' || s.unborn
              ? null
              : s.partner
                ? `${s.partner.married ? 'Married to' : 'Partner:'} ${nameOf(s.partner.id)}${s.partner.planned ? ' (planned)' : ''}`
                : ['Young Adult', 'Adult', 'Elder'].includes(s.stage)
                  ? 'No partner yet'
                  : null;
          return (
            <li key={s.id} className="dynp__step">
              {hand && (
                <p className={`dynp__hand dynp__hand--${tone}`}>
                  {tone === 'ok' ? <Check size={12} weight="bold" aria-hidden /> : tone === 'warn' ? <Warning size={12} weight="fill" aria-hidden /> : null}
                  {hand}
                </p>
              )}
              <button
                type="button"
                className={s.planned ? 'dynp__stepwho dynp__stepwho--planned' : 'dynp__stepwho'}
                title="Show them on the board"
                onClick={() => onFind(s.id)}
              >
                <span className="dynp__steprole">
                  {mark && <span aria-hidden="true">{mark} </span>}
                  {role}
                  {s.planned && s.place !== 'later' ? ', planned' : ''}
                </span>
                <span className="dynp__stepname">{nameOf(s.id)}</span>
                <span className="dynp__stepstage">{s.unborn ? 'not born yet' : s.stage}</span>
              </button>
              {when && <span className="dynp__when">{when}</span>}
              {partner && (
                <span className={partner === 'No partner yet' ? 'dynp__partner dynp__partner--none' : 'dynp__partner'}>
                  {partner}
                </span>
              )}
              {(() => {
                const w = f.windows?.get(s.id);
                const t = w ? windowText(w, nameOf, hhOf, game, true) : null;
                return t ? (
                  <span className={t.tone === 'warn' ? 'dynp__window dynp__window--warn' : 'dynp__window'}>
                    <span aria-hidden="true">⏳ </span>
                    {t.text}
                  </span>
                ) : null;
              })()}
              {clock && <span className="dynp__clock">{clock}</span>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
