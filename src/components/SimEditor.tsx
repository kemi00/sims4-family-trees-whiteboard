import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from 'react';
import { AGES, DYNASTY_ROLES, GENDERS, LIFE_STATES, PLAYABILITY } from '../lib/constants.ts';
import { useCompactChrome } from '../hooks/useCompactChrome.ts';
import {
  dynastyLabel,
  generationText,
  type DynastyGeneration,
} from '../lib/generations.ts';
import {
  clockText,
  dayText,
  daysText,
  frozenText,
  lifeView,
  wholeDaysText,
  yearText,
  type LifeView,
} from '../lib/lifeClock.ts';
import { gapText, partnerCandidates } from '../lib/partners.ts';
import { HouseholdMoveForm } from './HouseholdMoveForm.tsx';
import type { DynastyRole, Edge, Group, SaveGameInfo, SimNode, World } from '../types/whiteboard.ts';

function pinnedAlpha<T extends string>(items: readonly T[], pin: T): T[] {
  const rest = items
    .filter((x) => x !== pin)
    .slice()
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  return items.includes(pin) ? [pin, ...rest] : rest;
}

/**
 * Why a card shows no sim ID: none of the board came from a save yet, or
 * this card did not (a family-tree relative, a sim added here, a roster
 * premade the save did not have).
 */
function noSimIdNote(n: SimNode, boardHasSave: boolean): string {
  if (!boardHasSave) return 'Upload your save file to see the sim ID';
  if (n.treeId) return "No sim ID: only in the game's family tree";
  if (n.added) return 'No sim ID: added on the board';
  return 'No sim ID: not in your save';
}

/** "Day 3, Year 1" for a birth in play; "Day −26, before play (Year 0)" for a premade. */
function bornText(v: LifeView): string {
  const year = v.bornYear === undefined ? '' : yearText(v.bornYear);
  if (v.inPlay || v.bornDay >= 1) return `${dayText(v.bornDay)}${year ? `, ${year}` : ''}`;
  return `${dayText(v.bornDay)}, before play${year ? ` (${year})` : ''}`;
}

/**
 * The sim's age from the last save import: born, days alive, how far into
 * the stage and the days to the next, on the save's lifespan. Read only.
 */
function LifeFacts({ v }: { v: LifeView }) {
  const stage = v.newborn ? 'Newborn' : v.stage;
  const rows: [string, string][] = [
    ['Born', bornText(v)],
    ['Days alive', daysText(v.daysAlive)],
  ];
  if (v.elderDays !== undefined) rows.push(['Elder for', daysText(v.elderDays)]);
  else if (v.through !== undefined) rows.push([stage, `${Math.round(v.through * 100)}% through`]);
  if (v.next && v.daysToNext !== undefined) {
    rows.push([`${v.next} in`, `${wholeDaysText(v.daysToNext)}${v.frozen ? ' of aging' : ''}`]);
  }
  return (
    <div id="edLife" className="ro edlife">
      {rows.map(([k, val]) => (
        <div key={k} className="edlife__row">
          <span>{k}</span>
          <b>{val}</b>
        </div>
      ))}
      {v.frozen && <div className="edlife__note edlife__note--frozen">{frozenText(v.frozen)}</div>}
      <div className="edlife__note">
        {v.fromEarlierImport ? 'From an earlier save import, at ' : 'From your save at '}
        {clockText(v.at)} · {v.lifespan} lifespan{v.lifespanGuessed ? ' (assumed)' : ''}
        {v.fromEarlierImport ? '. Load the save again to refresh.' : ''}
      </div>
    </div>
  );
}

const PARTNER_GENDERS = ['Female', 'Male', 'Non-Binary'] as const;

/** The Generation menu's choice for counting from the oldest known ancestor. */
const AUTO_ROOT = '__oldest';

const LIFE_STATE_OPTIONS = pinnedAlpha(LIFE_STATES, 'Sim');
const PLAYABILITY_OPTIONS = pinnedAlpha(PLAYABILITY, 'Resident');

type Props = {
  node: SimNode;
  worlds: World[];
  groups: Group[];
  nodes: SimNode[];
  edges: Edge[];
  /** Game clock and aging options from the last save import. */
  saveGame: SaveGameInfo | null;
  /** Each dynasty member's generation (dynastyGenerations). */
  generations: Map<string, DynastyGeneration>;
  /** Show a possible partner on the board. */
  onPickPartner: (id: string) => void;
  left: number;
  top: number;
  editorRef: RefObject<HTMLDivElement | null>;
  onSave: (patch: {
    first: string;
    sur: string;
    age: string;
    gender: string;
    state: string;
    oplay: string;
    dynastyRole: DynastyRole | undefined;
    /** Count this dynasty's generations from another Gen 1 (null: the oldest known ancestor). */
    genRoot?: { key: string; id: string | null };
  }) => void;
  onMove: (world: string, houseGid: string, newName: string) => void;
  onLayout: () => void;
  onClose: () => void;
  /** Focus the name, selected, so a sim just added can be named straight away. */
  focusName?: boolean;
};

export function SimEditor({
  node: n,
  worlds,
  groups,
  nodes,
  edges,
  saveGame,
  generations,
  onPickPartner,
  left,
  top,
  editorRef,
  onSave,
  onMove,
  onLayout,
  onClose,
  focusName,
}: Props) {
  const compact = useCompactChrome();
  const [name, setName] = useState(`${n.first} ${n.sur}`);
  /** The game's surname from a spouse, when the card shows another. */
  const married =
    n.marriedSur && n.marriedSur.trim().toLowerCase() !== n.sur.trim().toLowerCase()
      ? n.marriedSur
      : '';
  const [age, setAge] = useState(n.age);
  const [gender, setGender] = useState(n.gender);
  const [state, setState] = useState(n.state || 'Sim');
  const [oplay, setOplay] = useState(n.oplay || 'Resident');
  const [dynastyRole, setDynastyRole] = useState<DynastyRole | ''>(n.dynastyRole ?? '');
  const [moveOpen, setMoveOpen] = useState(false);
  const boardHasSave = useMemo(() => nodes.some((x) => x.saveSimId), [nodes]);
  const byId = useMemo(() => Object.fromEntries(nodes.map((x) => [x.id, x])), [nodes]);
  const life = useMemo(() => lifeView(n, saveGame), [n, saveGame]);
  const gen = generations.get(n.id);
  const genLabel = gen ? dynastyLabel(gen, generations, byId) : '';
  const genLine = gen ? generationText(gen, genLabel) : null;
  /** Who is Gen 1 of the dynasty's count; changed here, applied on Save. */
  const [genRoot, setGenRootPick] = useState(gen?.rootPicked ? gen.rootId : AUTO_ROOT);
  const rootChoices = useMemo(() => {
    if (!gen) return [];
    // The line and the members: anyone the count numbers, in generation order.
    const ids = new Set([gen.rootId, gen.autoRootId, gen.firstHeadId]);
    for (const [id, g] of generations) if (g.key === gen.key && g.gen !== undefined && !g.byMarriage) ids.add(id);
    return [...ids]
      .map((id) => byId[id])
      .filter((x): x is SimNode => !!x && !x.species && x.id !== gen.autoRootId)
      .sort(
        (a, b) =>
          (generations.get(a.id)?.gen ?? 99) - (generations.get(b.id)?.gen ?? 99) ||
          `${a.first} ${a.sur}`.localeCompare(`${b.first} ${b.sur}`),
      );
  }, [gen, generations, byId]);
  const nameOf = (id: string | undefined) => {
    const x = id ? byId[id] : undefined;
    return x ? `${x.first} ${x.sur}`.trim() : 'someone not on the board';
  };
  const [partnersOpen, setPartnersOpen] = useState(false);
  const [partnerGender, setPartnerGender] = useState('');
  const partners = useMemo(
    () =>
      partnersOpen
        ? partnerCandidates({ id: n.id, nodes, edges, game: saveGame, gender: partnerGender || undefined })
        : [],
    [partnersOpen, n.id, nodes, edges, saveGame, partnerGender],
  );
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!focusName) return;
    nameRef.current?.focus();
    nameRef.current?.select();
  }, [focusName]);
  useEffect(() => () => {
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
  }, []);

  const copySimId = async () => {
    const id = n.saveSimId;
    if (!id) return;
    try {
      await navigator.clipboard.writeText(id);
    } catch {
      // No clipboard access (an http page, an old browser): copy the selection.
      idRef.current?.select();
      document.execCommand('copy');
    }
    setCopied(true);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), 1600);
  };

  const save = () => {
    const parts = name.trim().split(' ');
    const first = parts.shift() || name;
    const sur = parts.join(' ');
    onSave({
      first,
      sur,
      age,
      gender,
      state,
      oplay,
      dynastyRole: dynastyRole || undefined,
      ...(gen && (genRoot === AUTO_ROOT ? null : genRoot) !== (gen.rootPicked ? gen.rootId : null)
        ? { genRoot: { key: gen.key, id: genRoot === AUTO_ROOT ? null : genRoot } }
        : {}),
    });
  };

  /**
   * Enter saves and closes, as in any form; in the move section it moves the
   * sim, that section's own action. A button keeps Enter for itself, and an
   * Enter that finishes typing with an input method (Japanese, Chinese…) is
   * left to it: Safari reports that one as key code 229.
   */
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Enter' || e.nativeEvent.isComposing || e.keyCode === 229) return;
    const t = e.target as HTMLElement;
    if (t.closest('button, a, textarea')) return;
    // The move form handles its own Enter.
    if (t.closest('#edMove')) return;
    e.preventDefault();
    save();
  };

  const mid =
    n.onb && n.onb !== '-'
      ? n.onb
      : n.oplay === 'NPC'
        ? 'NPC'
        : n.oplay !== 'Resident'
          ? 'Townie'
          : '—';

  useEffect(() => {
    onLayout();
  }, [moveOpen, partnersOpen, onLayout]);

  useEffect(() => {
    if (!compact) return;
    const el = editorRef.current;
    const vv = window.visualViewport;
    if (!el || !vv) return;
    const sync = () => {
      const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      el.style.bottom = `${kb}px`;
    };
    sync();
    vv.addEventListener('resize', sync);
    vv.addEventListener('scroll', sync);
    return () => {
      vv.removeEventListener('resize', sync);
      vv.removeEventListener('scroll', sync);
      el.style.bottom = '';
    };
  }, [compact, editorRef]);

  return (
    <div
      ref={editorRef}
      id="editor"
      className={compact ? 'editor editor--sheet' : 'editor'}
      onKeyDown={onKeyDown}
      style={
        compact
          ? { display: 'block' }
          : { display: 'block', left, top }
      }
    >
      <button className="edx" title="close" onClick={onClose}>
        ✕
      </button>
      <label>Name</label>
      <input
        ref={nameRef}
        value={name}
        enterKeyHint="done"
        aria-describedby={married ? 'edMarried' : undefined}
        onChange={(e) => setName(e.target.value)}
      />
      {married && (
        <div id="edMarried" className="edhint">
          In the game: {n.first} {married}, their spouse's surname. Type it here to
          show it on the card.
        </div>
      )}
      <label>Age / life stage</label>
      <select value={age} onChange={(e) => setAge(e.target.value)}>
        {AGES.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
        {!AGES.includes(age as (typeof AGES)[number]) && (
          <option value={age}>{age}</option>
        )}
      </select>
      {life && <LifeFacts v={life} />}
      {!life && n.life && !n.species && n.life.stage !== n.age && (
        <div className="edhint">
          Life stage changed on the board since your save, so its days are hidden. Load the
          save again to see them.
        </div>
      )}
      <label>Gender</label>
      <select value={gender} onChange={(e) => setGender(e.target.value)}>
        {GENDERS.map((g) => (
          <option key={g} value={g}>
            {g}
          </option>
        ))}
        {!GENDERS.includes(gender as (typeof GENDERS)[number]) && (
          <option value={gender}>{gender}</option>
        )}
      </select>
      <label>Life state</label>
      <select value={state} onChange={(e) => setState(e.target.value)}>
        {LIFE_STATE_OPTIONS.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
        {!LIFE_STATES.includes(state as (typeof LIFE_STATES)[number]) && (
          <option value={state}>{state}</option>
        )}
      </select>
      <label>Playability</label>
      <select value={oplay} onChange={(e) => setOplay(e.target.value)}>
        {PLAYABILITY_OPTIONS.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
        {!PLAYABILITY.includes(oplay as (typeof PLAYABILITY)[number]) && (
          <option value={oplay}>{oplay}</option>
        )}
      </select>
      {!n.species && (
        <>
          <label htmlFor="edDynasty">Dynasty role</label>
          <select
            id="edDynasty"
            value={dynastyRole}
            aria-describedby={n.dynasty ? 'edDynastyHint' : undefined}
            onChange={(e) => setDynastyRole(e.target.value as DynastyRole | '')}
          >
            <option value="">None</option>
            {(Object.keys(DYNASTY_ROLES) as DynastyRole[]).map((r) => (
              <option key={r} value={r}>
                {DYNASTY_ROLES[r].mark} {DYNASTY_ROLES[r].noun}
              </option>
            ))}
          </select>
          {n.dynasty && (
            <div id="edDynastyHint" className="edhint">
              In the {n.dynasty} dynasty. It has one head and one heir, so
              choosing either here takes it from whoever has it now.
            </div>
          )}
          {gen && (
            <>
              <label htmlFor="edGenRoot">Generation</label>
              <div className="ro edgen" id="edGen">
                {genLine ?? `No number: no family link to ${nameOf(gen.rootId)}`}
                {gen.planned && <span className="edgen__planned"> · through a planned link</span>}
              </div>
              <select
                id="edGenRoot"
                value={genRoot}
                aria-describedby="edGenRootHint"
                onChange={(e) => setGenRootPick(e.target.value)}
              >
                <option value={AUTO_ROOT}>Count from the oldest ancestor: {nameOf(gen.autoRootId)}</option>
                {rootChoices.map((x) => (
                  <option key={x.id} value={x.id}>
                    Count from {x.first} {x.sur}
                    {x.id === gen.firstHeadId ? ' (first head)' : ''}
                  </option>
                ))}
              </select>
              <div id="edGenRootHint" className="edhint">
                {gen.rootPicked
                  ? `Gen 1 is ${nameOf(gen.rootId)}, picked here. `
                  : gen.autoRootId === gen.firstHeadId
                    ? `Gen 1 is ${nameOf(gen.firstHeadId)}, the ${genLabel} dynasty's first head: the board knows none of their parents. `
                    : `Gen 1 is ${nameOf(gen.autoRootId)}, the oldest known ancestor of ${nameOf(gen.firstHeadId)}, the ${genLabel} dynasty's first head. `}
                Each child is one more, counting the deceased and family-tree relatives.
              </div>
            </>
          )}
        </>
      )}
      <label>Game pack</label>
      <div className="ro">{n.pack || '—'}</div>
      <label>Original household</label>
      <div className="ro">
        {n.oworld || '—'} · {mid} · {n.ohh || '—'}
      </div>
      <label id="edSimIdLabel" htmlFor={n.saveSimId ? 'edSimId' : undefined}>
        Sim ID
      </label>
      {/* The game's own id for the sim: shown, never edited. */}
      {n.saveSimId ? (
        <div className="idrow">
          <input
            id="edSimId"
            ref={idRef}
            className="ro ro--id"
            readOnly
            value={n.saveSimId}
            onFocus={(e) => e.currentTarget.select()}
          />
          <button type="button" className="copybtn" onClick={copySimId}>
            {copied ? 'Copied ✓' : 'Copy ID'}
          </button>
          <span className="sr-only" role="status">
            {copied ? 'Sim ID copied' : ''}
          </span>
        </div>
      ) : (
        <div className="ro ro--muted" aria-labelledby="edSimIdLabel" aria-disabled="true">
          {noSimIdNote(n, boardHasSave)}
        </div>
      )}
      <button
        className="movebtn"
        aria-expanded={moveOpen}
        aria-controls="edMove"
        onClick={() => setMoveOpen(!moveOpen)}
      >
        ↪ Move to another household
      </button>
      {!n.species && (
        <button
          type="button"
          className="movebtn partnerbtn"
          aria-expanded={partnersOpen}
          aria-controls="edPartners"
          onClick={() => setPartnersOpen(!partnersOpen)}
        >
          ♡ Possible partners
        </button>
      )}
      {partnersOpen && (
        <div id="edPartners">
          <label htmlFor="edPartnerGender">Show</label>
          <select
            id="edPartnerGender"
            value={partnerGender}
            onChange={(e) => setPartnerGender(e.target.value)}
          >
            <option value="">Anyone</option>
            {PARTNER_GENDERS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
          <div className="edhint">
            Closest in life first: living sims who aren't blood relatives or married. Click one to
            find them on the board.
          </div>
          {partners.length ? (
            <ul className="partners">
              {partners.map((c) => {
                const p = byId[c.id];
                if (!p) return null;
                const mark = p.dynastyRole ? `${DYNASTY_ROLES[p.dynastyRole].mark} ` : '';
                const flags = [
                  c.frozen ? 'not aging now' : '',
                  c.taken ? 'in a romance' : '',
                  p.dynasty ? `${p.dynasty} dynasty` : '',
                ].filter(Boolean);
                return (
                  <li key={c.id}>
                    <button type="button" onClick={() => onPickPartner(c.id)}>
                      <span className="partners__name">
                        {mark}
                        {p.first} {p.sur}
                      </span>
                      <span className="partners__meta">
                        {p.age} · {gapText(c)} · {p.hh}
                      </span>
                      {flags.length > 0 && <span className="partners__flags">{flags.join(' · ')}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="edhint">No one on the board fits.</div>
          )}
        </div>
      )}
      {moveOpen && (
        <div id="edMove">
          <HouseholdMoveForm
            idPrefix="edMove"
            worlds={worlds}
            groups={groups}
            nodes={nodes}
            initialWorld={n.oworld || n.world || worlds[0]?.name || ''}
            exclude={n.gid}
            submitLabel={`Move ${n.first || 'this sim'} here`}
            onMove={onMove}
          />
        </div>
      )}
      <div className="row">
        <button onClick={save}>Save</button>
      </div>
    </div>
  );
}
