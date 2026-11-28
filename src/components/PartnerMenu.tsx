import { SheetGrabber } from './SheetGrabber.tsx';
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { CloseButton } from './CloseButton.tsx';
import { dynastyNames } from '../lib/generations.ts';
import { dynastyRiskMap } from '../lib/dynastyMenu.ts';
import { SimCard } from './SimCard.tsx';
import { useFitMenuInStage } from '../hooks/useFitMenuInStage.ts';
import { cardName } from '../lib/plan.ts';
import {
  coupleLine,
  couplesNow,
  filterPartners,
  moveInChoices,
  partnerBand,
  partnerCounts,
  partnerOptions,
  partnerSearch,
  partnerWorlds,
  type PartnerFilters,
  partnerMarkerCounts,
  partnerTitleChoices,
  type PartnerRelation,
} from '../lib/partners.ts';
import { withoutSecretLinks } from '../lib/secrets.ts';
import { NOT_IN_WORLD } from '../lib/constants.ts';
import { MoveInAsk } from './MoveInAsk.tsx';
import type { CoupleLots } from './MoveToLotForm.tsx';
import { simCardClass } from '../lib/simCard.ts';
import { PARTNER_CHOICES, PARTNER_LABEL, type PartnerChoice, type PartnerMenuState } from '../hooks/useWhiteboard.ts';
import type { Edge, SaveGameInfo, SimMarker, SimNode } from '../types/whiteboard.ts';
import { useLightDismiss } from '../hooks/useLightDismiss.ts';

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
  /** Once picked, both can move onto a free lot instead (none when no world has one). */
  lots?: CoupleLots & { who: string };
  onClose: () => void;
  /** Secrets hidden (Filters): a secret romance isn't named on a card. */
  hideSecrets?: boolean;
  /** Light these sims up on the board while their card is pointed at; null to stop. */
  onHover?: (ids: string[] | null) => void;
  /** The board's markers, for the Marker menu and the cards. */
  markers?: readonly SimMarker[];
};

/** Cards listed before "Show more". */
const SHOWN = 6;

const GENDERS = ['Female', 'Male', 'Non-Binary'] as const;

/** A life stage as the Age menu says it: "Young adults". */
const STAGE_PLURAL: Record<string, string> = {
  Infant: 'Infants',
  Toddler: 'Toddlers',
  Child: 'Children',
  Teen: 'Teens',
  'Young Adult': 'Young adults',
  Adult: 'Adults',
  Elder: 'Elders',
};

const RELATIONS: { value: PartnerRelation; label: string }[] = [
  { value: 'single', label: 'Single' },
  { value: 'romance', label: 'In a romance' },
  { value: 'married', label: 'Married' },
];

/** Where this browser remembers "Hide sims with no home", for every finder. */
const HOUSED_ONLY_KEY = 'partners-housed-only';
/** And "Second cousins and further too". */
const FAR_KIN_KEY = 'partners-far-kin';

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeFlag(key: string, on: boolean): void {
  try {
    localStorage.setItem(key, on ? '1' : '0');
  } catch {
    // Private mode: forgotten when the page closes.
  }
}

/** The Title menu's words for a choice: "Any title", "Rank 9 or higher". */
function titleChoiceText(value: string): string {
  return value === 'titled' ? 'Any title' : `Rank ${value.slice(1)} or higher`;
}

/**
 * The partner menu, from the ♥ on a card's side. Pick the link, then the
 * partner: type a name (suggested partners first, closest in life), or
 * click them on the board. For a marriage or a romance, two who live apart
 * are then asked about one household (MoveInAsk), as Connect asks.
 */
export function PartnerMenu({ menu, nodes, byid, edges, saveGame, onChoice, onPick, onMove, lots, onClose, hideSecrets, onHover, markers = [] }: Props) {
  const { compact, ref, style, sheet } = useFitMenuInStage(menu.x, menu.y, menu.picked ? {} : { keep: '.node' });
  // A sim's card is a pick: clicking one on the board makes them the partner.
  // Once picked, a press anywhere else keeps them apart and closes the menu.
  useLightDismiss(ref, onClose, menu.picked ? {} : { keep: '.node' });
  const listId = useId();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const firstMoveRef = useRef<HTMLButtonElement>(null);
  const me = byid[menu.id];
  const picked = menu.picked ? byid[menu.picked] : undefined;

  // The filters: each finder starts at their own life stage, any gender, anyone, any world.
  const [stagePick, setStagePick] = useState<string | null>(null);
  const [gender, setGender] = useState('');
  const [relation, setRelation] = useState<'' | PartnerRelation>('');
  const [world, setWorld] = useState('');
  const [housedOnly, setHousedOnlyState] = useState(() => readFlag(HOUSED_ONLY_KEY));
  const [farKin, setFarKinState] = useState(() => readFlag(FAR_KIN_KEY));
  const [title, setTitle] = useState('');
  const [marker, setMarker] = useState('');
  const [all, setAll] = useState(false);
  const setHousedOnly = (on: boolean) => {
    setHousedOnlyState(on);
    writeFlag(HOUSED_ONLY_KEY, on);
  };
  const setFarKin = (on: boolean) => {
    setFarKinState(on);
    writeFlag(FAR_KIN_KEY, on);
  };
  const options = useMemo(
    () => (me ? partnerOptions({ id: me.id, nodes, edges, game: saveGame, farKin }) : []),
    [me, nodes, edges, saveGame, farKin],
  );
  /** Who each sim is with, as the board shows it: with secrets hidden, a secret romance isn't there. */
  const couples = useMemo(() => couplesNow(nodes, hideSecrets ? withoutSecretLinks(edges) : edges), [nodes, edges, hideSecrets]);
  const band = me ? (partnerBand(me.age) ?? []) : [];
  const base: PartnerFilters = { stage: '', gender, relation, world, housedOnly, title, marker };
  const stageCounts = partnerCounts(options, base, 'stage');
  // Their own stage until another is picked, or the first with anyone in it.
  const stage =
    stagePick ?? (me && stageCounts.get(me.age) ? me.age : (band.find((st) => stageCounts.get(st)) ?? me?.age ?? ''));
  const filters: PartnerFilters = { ...base, stage };
  const relationCounts = partnerCounts(options, filters, 'relation');
  const worldCounts = partnerCounts(options, filters, 'world');
  const worlds = partnerWorlds(worldCounts, me?.world ?? '', world);
  const titleChoices = partnerTitleChoices(options, filters);
  const markerCounts = partnerMarkerCounts(options, filters);
  const markerChoices = markers.filter((m) => markerCounts.has(m.id) || m.id === marker);
  const listed = filterPartners(options, filters);
  const searching = !!query.trim();
  const hits = useMemo(
    () => (me && query.trim() ? partnerSearch({ id: me.id, nodes, edges, query, game: saveGame }) : []),
    [me, nodes, edges, query, saveGame],
  );
  /** What the list shows: every match for a name, else the filtered partners, the first few until Show more. */
  const shown = searching
    ? hits.map((h) => ({ id: h.id, candidate: h.candidate, related: h.related }))
    : (all ? listed : listed.slice(0, SHOWN)).map((o) => ({ id: o.id, candidate: o.candidate, related: false }));
  // Nothing stays lit once the menu closes (the latest onHover, not the first).
  const hoverRef = useRef(onHover);
  useEffect(() => {
    hoverRef.current = onHover;
  });
  useEffect(() => () => hoverRef.current?.(null), []);
  const dynasties = useMemo(() => dynastyNames(nodes), [nodes]);
  const risks = useMemo(() => dynastyRiskMap(nodes), [nodes]);
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
        <SheetGrabber sheet={sheet} what="the menu" />
        <MoveInAsk
          done={`✓ ${PARTNER_LABEL[menu.choice]}: ${name} and ${pickedName}`}
          ask="They live apart. Will one move in with the other?"
          // The one picked moves in with the sim whose ♥ was clicked: Lucas into Mara's.
          moves={moveInChoices(me, picked)}
          {...(lots ? { lots } : {})}
          firstRef={firstMoveRef}
          onMove={onMove}
          onKeep={onClose}
        />
      </div>
    );
  }

  const hit = shown[Math.min(active, shown.length - 1)];
  const optionId = (id: string) => `${listId}-${id}`;
  const nameOf = (id: string) => (byid[id] ? cardName(byid[id]!) : 'someone not on the board');
  const anyone = [...relationCounts.values()].reduce((a, b) => a + b, 0);
  const anyWorld = [...worldCounts.values()].reduce((a, b) => a + b, 0);
  const own = me.world && me.world !== NOT_IN_WORLD && worldCounts.has(me.world) ? me.world : '';
  const others = worlds.filter((w) => w !== own && w !== NOT_IN_WORLD);
  const reset = () => {
    setActive(0);
    setAll(false);
  };
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
      <SheetGrabber sheet={sheet} what="the menu" />
      <div className="pmenu__head">
        <b>Partner for {name}</b>
        <CloseButton label="Close" onClick={onClose} />
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
            {PARTNER_LABEL[c]}
          </button>
        ))}
      </div>
      <input
        ref={inputRef}
        className="pmenu__search"
        type="search"
        role="combobox"
        aria-expanded={shown.length > 0}
        aria-controls={listId}
        aria-activedescendant={hit ? optionId(hit.id) : undefined}
        aria-label="Find a partner by name"
        placeholder="Find by name"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            const step = e.key === 'ArrowDown' ? 1 : -1;
            setActive((i) => Math.max(0, Math.min(shown.length - 1, i + step)));
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
      {/* The filters, in the order they narrow, each with how many it leaves. A name searched looks everywhere. */}
      <fieldset className="pmenu__filters" disabled={searching} aria-label="Filters">
        <div className="pmenu__row">
          <select
            aria-label="Life stage"
            value={stage}
            onChange={(e) => {
              setStagePick(e.target.value);
              reset();
            }}
          >
            {band.map((st) => (
              <option key={st} value={st}>{`${STAGE_PLURAL[st] ?? st} (${stageCounts.get(st) ?? 0})`}</option>
            ))}
          </select>
          <select
            aria-label="Gender"
            value={gender}
            onChange={(e) => {
              setGender(e.target.value);
              reset();
            }}
          >
            <option value="">Any gender</option>
            {GENDERS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>
        <div className="pmenu__row pmenu__row--wide">
          <select
            aria-label="Relationship"
            value={relation}
            onChange={(e) => {
              setRelation(e.target.value as '' | PartnerRelation);
              reset();
            }}
          >
            <option value="">{`Anyone (${anyone})`}</option>
            {RELATIONS.map((r) => (
              <option key={r.value} value={r.value}>{`${r.label} (${relationCounts.get(r.value) ?? 0})`}</option>
            ))}
          </select>
          <select
            aria-label="World"
            value={world}
            onChange={(e) => {
              setWorld(e.target.value);
              reset();
            }}
          >
            <option value="">{`Any world (${anyWorld})`}</option>
            {own && (
              <optgroup label="Their world">
                <option value={own}>{`${own} (${worldCounts.get(own) ?? 0})`}</option>
              </optgroup>
            )}
            {others.length > 0 && (
              <optgroup label="Other worlds">
                {others.map((w) => (
                  <option key={w} value={w}>{`${w} (${worldCounts.get(w) ?? 0})`}</option>
                ))}
              </optgroup>
            )}
            {worlds.includes(NOT_IN_WORLD) && (
              <optgroup label="No home">
                <option value={NOT_IN_WORLD}>{`${NOT_IN_WORLD} (${worldCounts.get(NOT_IN_WORLD) ?? 0})`}</option>
              </optgroup>
            )}
          </select>
        </div>
        {(titleChoices.length > 0 || title || markerChoices.length > 0) && (
          <div className="pmenu__row pmenu__row--wide">
            {(titleChoices.length > 0 || title) && (
              <select
                aria-label="Title"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  reset();
                }}
              >
                <option value="">Titled or not</option>
                {titleChoices.map((c) => (
                  <option key={c.value} value={c.value}>{`${titleChoiceText(c.value)} (${c.count})`}</option>
                ))}
                {title && !titleChoices.some((c) => c.value === title) && <option value={title}>{`${titleChoiceText(title)} (0)`}</option>}
              </select>
            )}
            {markerChoices.length > 0 && (
              <select
                aria-label="Marker"
                value={marker}
                onChange={(e) => {
                  setMarker(e.target.value);
                  reset();
                }}
              >
                <option value="">Any marker or none</option>
                {markerChoices.map((m) => (
                  <option key={m.id} value={m.id}>{`${m.mark} ${m.label} (${markerCounts.get(m.id) ?? 0})`}</option>
                ))}
              </select>
            )}
          </div>
        )}
        <label className="pmenu__check" title="Not in any world, and the Unhoused sims in each world">
          <input
            type="checkbox"
            checked={housedOnly}
            onChange={(e) => {
              setHousedOnly(e.target.checked);
              reset();
            }}
          />
          <span>Hide sims with no home</span>
        </label>
        <label
          className="pmenu__check"
          title="Blood relatives stay out. With this on, kin who share no ancestor closer than a great-grandparent come in, each named on their card."
        >
          <input
            type="checkbox"
            checked={farKin}
            onChange={(e) => {
              setFarKin(e.target.checked);
              reset();
            }}
          />
          <span>Second cousins and further too</span>
        </label>
      </fieldset>
      {shown.length > 0 ? (
        <ul id={listId} className="simcards pmenu__list" role="listbox" aria-label="Partners">
          {shown.map((h, i) => {
            const p = byid[h.id];
            if (!p) return null;
            return (
              <li key={h.id} id={optionId(h.id)} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  tabIndex={-1}
                  className={simCardClass(p, i === active)}
                  onMouseEnter={() => {
                    setActive(i);
                    onHover?.([h.id]);
                  }}
                  onMouseLeave={() => onHover?.(null)}
                  onClick={() => onPick(h.id)}
                >
                  <SimCard
                    sim={p}
                    {...(h.candidate ? { candidate: h.candidate } : {})}
                    dynasties={dynasties}
                    risks={risks}
                    related={h.related}
                    {...(h.candidate?.kin ? { kin: h.candidate.kin } : {})}
                    markerDefs={markers}
                    couples={coupleLine(couples.get(h.id), nameOf)}
                  />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="pmenu__empty">
          {searching ? `No sim matches “${query.trim()}”.` : 'No one left with these filters: try another world or relationship.'}
        </p>
      )}
      {!searching && listed.length > SHOWN && (
        <button type="button" className="edlink pmenu__more" onClick={() => setAll(!all)}>
          {all ? 'Show fewer' : `Show ${listed.length - SHOWN} more`}
        </button>
      )}
      <p className="pmenu__hint">
        {searching
          ? `Every sim named like “${query.trim()}”, at any age, in any world, family too. Clear the name for the filters.`
          : 'Closest in age first, older or younger; then A to Z. Point at one to light them up on the board, or click them there.'}
      </p>
    </div>
  );
}
