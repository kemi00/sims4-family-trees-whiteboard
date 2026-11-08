import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from 'react';
import { AGES, DYNASTY_ROLES, GENDERS, LIFE_STATES, PLAYABILITY } from '../lib/constants.ts';
import { useCompactChrome } from '../hooks/useCompactChrome.ts';
import { Info } from '../icons.ts';
import { trackAction } from '../lib/analytics.ts';
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
import { gapText, partnerBand, partnerCandidates, type PartnerCandidate } from '../lib/partners.ts';
import {
  GENDER_NOT_KNOWN,
  NOT_YET_AGE,
  cardName,
  conflictText,
  isPlannedSim,
  notYetText,
  type PlanChoice,
  type PlanConflict,
} from '../lib/plan.ts';
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

/** "Not aging now: …" as a line of its own. */
function frozenLine(frozen: NonNullable<LifeView['frozen']>): string {
  const t = frozenText(frozen);
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** " of aging" after a count of days, while the sim's household isn't aging. */
function ofAging(v: LifeView): string {
  return v.frozen ? ' of aging' : '';
}

/** When old age can come: "in 2 days at the earliest", or "any day now" once past. */
function oldAgeText(v: LifeView): string {
  if (!v.oldAgeIn) return 'could come any day now';
  return `in ${wholeDaysText(v.oldAgeIn)}${ofAging(v)} at the earliest`;
}

/** The age in one line, under the life stage: "2% through · Adult in 13 days". */
function lifeSummary(v: LifeView): string {
  if (v.elderDays !== undefined) {
    const n = Math.floor(v.oldAgeIn ?? 0);
    const soon = !v.oldAgeIn
      ? 'old age any day now'
      : n < 1
        ? 'old age in under a day'
        : `old age in ${n}+ ${n === 1 ? 'day' : 'days'}`;
    return `Elder for ${daysText(v.elderDays)} · ${soon}`;
  }
  const parts: string[] = [];
  if (v.newborn) parts.push('Newborn');
  if (v.through !== undefined) parts.push(`${Math.round(v.through * 100)}% through`);
  if (v.next && v.daysToNext !== undefined) {
    parts.push(`${v.next} in ${wholeDaysText(v.daysToNext)}${v.frozen ? ' of aging' : ''}`);
  }
  return parts.join(' · ');
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
    rows.push([`${v.next} in`, `${wholeDaysText(v.daysToNext)}${ofAging(v)}`]);
  }
  if (v.grownUpIn !== undefined && v.next !== 'Young Adult') {
    rows.push(['Young Adult in', `${wholeDaysText(v.grownUpIn)}${ofAging(v)}`]);
  }
  if (v.elderDays !== undefined) rows.push(['Old age', oldAgeText(v)]);
  return (
    <div id="edLife" className="ro edlife">
      {rows.map(([k, val]) => (
        <div key={k} className="edlife__row">
          <span>{k}</span>
          <b>{val}</b>
        </div>
      ))}
      {v.frozen && <div className="edlife__note edlife__note--frozen">{frozenText(v.frozen)}</div>}
      {v.elderDays !== undefined && (
        <div className="edlife__note">
          Old age usually comes a few days after the earliest day. Traits like Long Lived stretch it, and
          your save doesn’t say by how much.
        </div>
      )}
      <div className="edlife__note">
        {v.fromEarlierImport ? 'From an earlier save import, at ' : 'From your save at '}
        {clockText(v.at)} · {v.lifespan} lifespan{v.lifespanGuessed ? ' (assumed)' : ''}
        {v.fromEarlierImport ? '. Load the save again to refresh.' : ''}
      </div>
    </div>
  );
}

/**
 * An ⓘ beside a field's label that shows or hides its explanation, so the
 * paragraphs are there when wanted and out of the way the rest of the time.
 * A press, not a hover: it works the same with touch and the keyboard.
 */
function TipButton({
  open,
  onToggle,
  controls,
  about,
}: {
  open: boolean;
  onToggle: () => void;
  controls: string;
  about: string;
}) {
  return (
    <button
      type="button"
      className="edtip"
      aria-expanded={open}
      aria-controls={controls}
      aria-label={`About ${about}`}
      title={`About ${about}`}
      onClick={onToggle}
    >
      <Info weight={open ? 'fill' : 'regular'} aria-hidden="true" />
    </button>
  );
}

const PARTNER_GENDERS = ['Female', 'Male', 'Non-Binary'] as const;

/** Partners listed before "Show more". */
const PARTNERS_SHOWN = 4;

/** Where this browser remembers the partner list's "Hide sims with no home". */
const HOUSED_ONLY_KEY = 'partners-housed-only';

function readHousedOnly(): boolean {
  try {
    return localStorage.getItem(HOUSED_ONLY_KEY) === '1';
  } catch {
    return false;
  }
}

/** A life stage as a group heading: "Young adults". */
const STAGE_PLURAL: Record<string, string> = {
  Infant: 'Infants',
  Toddler: 'Toddlers',
  Child: 'Children',
  Teen: 'Teens',
  'Young Adult': 'Young adults',
  Adult: 'Adults',
  Elder: 'Elders',
};

/** The Generation menu's choice for counting from the oldest known ancestor. */
const AUTO_ROOT = '__oldest';

const LIFE_STATE_OPTIONS = pinnedAlpha(LIFE_STATES, 'Sim');
const PLAYABILITY_OPTIONS = pinnedAlpha(PLAYABILITY, 'Resident');

/**
 * The editor's sections, by what you came to do: change the sim, see their
 * place in the family, or look up where they come from.
 */
type Tab = 'sim' | 'family' | 'details';

const TAB_LABELS: Record<Tab, string> = { sim: 'Sim', family: 'Family', details: 'Details' };

/**
 * The tab last used, so going through sims to check one thing (each one's
 * generation, say) keeps you on it. For this visit only, not saved.
 */
let lastTab: Tab = 'sim';

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
    /** A planned sim's role in the plan; undefined clears it. */
    planLabel?: string;
  }) => void;
  onMove: (world: string, houseGid: string, newName: string) => void;
  onLayout: () => void;
  onClose: () => void;
  /** Focus the first name, selected, so a sim just added can be named straight away. */
  focusName?: boolean;
  /** Every plan the game went against (planConflicts); the editor shows this sim's. */
  planIssues: PlanConflict[];
  /** A planned sim with planned parents: "Not born yet" rather than "Not in the game yet". */
  plannedChild: boolean;
  onResolvePlan: (edgeId: string, choice: PlanChoice) => void;
  /** A sim from the save fills this planned sim (linkPlannedSim). */
  onLinkPlanned: (realId: string) => void;
  /** This sim stops filling the planned sim it filled (unlinkPlannedSim). */
  onUnlinkPlanned: () => void;
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
  planIssues,
  plannedChild,
  onResolvePlan,
  onLinkPlanned,
  onUnlinkPlanned,
}: Props) {
  const compact = useCompactChrome();
  const isPet = !!n.species;
  // Pets have no dynasty and no partners: no Family tab.
  const tabs: Tab[] = isPet ? ['sim', 'details'] : ['sim', 'family', 'details'];
  /** This sim's plans the game went against. */
  const myIssues = planIssues.filter((c) => c.a === n.id || c.b === n.id || c.children.includes(n.id));
  const planned = isPlannedSim(n);
  // An off-plan sim opens where its plan is decided.
  const [tab, setTabState] = useState<Tab>(() =>
    focusName || !tabs.includes(lastTab) ? 'sim' : myIssues.length && !isPet ? 'family' : lastTab,
  );
  const tabRefs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({});
  const setTab = (t: Tab) => {
    if (t === tab) return;
    lastTab = t;
    trackAction(`/action/editor/${t}`);
    setTabState(t);
  };
  // First and last name apart, as the game keeps them: "Cordelia" and
  // "Thebe V", not one field split at its first space.
  const [first, setFirst] = useState(n.first);
  const [sur, setSur] = useState(n.sur);
  /** A planned sim's role in the plan: "Heir 1". */
  const [planLabel, setPlanLabel] = useState(n.planLabel ?? '');
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkQuery, setLinkQuery] = useState('');
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
  /** Explanations opened with ⓘ, by field. */
  const [tips, setTips] = useState<Record<string, boolean>>({});
  const toggleTip = (k: string) => setTips((t) => ({ ...t, [k]: !t[k] }));
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
  /** A sim's name as the board shows it, for plan sentences. */
  const planName = (id: string) => (byId[id] ? cardName(byId[id]!) : 'someone');
  /**
   * Sims from the save that could fill this planned sim: its planned parents'
   * children and its planned partners' partners first, or anyone by name.
   */
  const linkChoices = useMemo(() => {
    if (!planned || !linkOpen) return [];
    const couple = (e: Edge) => e.type === 'marriage' || e.type === 'romance';
    const plannedParents = new Set(edges.filter((e) => e.type === 'parent' && e.b === n.id).map((e) => e.a));
    const plannedPartners = new Set(
      edges.filter((e) => couple(e) && (e.a === n.id || e.b === n.id)).map((e) => (e.a === n.id ? e.b : e.a)),
    );
    // How many of the planned parents (or partners) each sim shares: a child
    // of both comes before a half-sibling.
    const score = new Map<string, number>();
    const bump = (id: string) => score.set(id, (score.get(id) ?? 0) + 1);
    for (const e of edges) {
      if (e.type === 'parent' && plannedParents.has(e.a)) bump(e.b);
      if (couple(e) && plannedPartners.has(e.a)) bump(e.b);
      if (couple(e) && plannedPartners.has(e.b)) bump(e.a);
    }
    const best = Math.max(0, ...score.values());
    const q = linkQuery.trim().toLowerCase();
    return nodes
      .filter(
        (x) =>
          !!x.saveSimId &&
          !x.species &&
          x.id !== n.id &&
          (q ? cardName(x).toLowerCase().includes(q) : score.has(x.id)),
      )
      .map((x) => ({ sim: x, score: score.get(x.id) ?? 0, likely: best > 0 && score.get(x.id) === best }))
      .sort((a, b) => b.score - a.score || cardName(a.sim).localeCompare(cardName(b.sim)))
      .slice(0, 8);
  }, [planned, linkOpen, edges, nodes, n.id, linkQuery]);
  const nameOf = (id: string | undefined) => {
    const x = id ? byId[id] : undefined;
    return x ? `${x.first} ${x.sur}`.trim() : 'someone not on the board';
  };
  /**
   * Who loses the role on Save: a dynasty has one head and one heir, so
   * naming one here takes it from whoever has it (as updateNode does).
   */
  const roleHolder = useMemo(() => {
    if (!n.dynasty || (dynastyRole !== 'head' && dynastyRole !== 'heir')) return null;
    if (dynastyRole === n.dynastyRole) return null;
    return (
      nodes.find(
        (x) =>
          x.id !== n.id &&
          x.dynastyRole === dynastyRole &&
          (n.dynastyId && x.dynastyId ? x.dynastyId === n.dynastyId : x.dynasty === n.dynasty),
      ) ?? null
    );
  }, [n.id, n.dynasty, n.dynastyId, n.dynastyRole, dynastyRole, nodes]);
  const [partnerGender, setPartnerGender] = useState('');
  /** The life stage picked in the partner list's Age menu; none yet picked. */
  const [stagePick, setStagePick] = useState<string | null>(null);
  const [allPartners, setAllPartners] = useState(false);
  /** Leave out townies with no home lot; kept for the next sim too. */
  const [housedOnly, setHousedOnlyState] = useState(readHousedOnly);
  const setHousedOnly = (on: boolean) => {
    setHousedOnlyState(on);
    setAllPartners(false);
    try {
      localStorage.setItem(HOUSED_ONLY_KEY, on ? '1' : '0');
    } catch {
      // Private mode: it is forgotten when the page closes.
    }
  };
  // Worked out on every tab, so the Family tab's height is known before it opens.
  const partners = useMemo(
    () =>
      isPet
        ? []
        : partnerCandidates({
            id: n.id,
            nodes,
            edges,
            game: saveGame,
            gender: partnerGender || undefined,
            housedOnly,
          }),
    [isPet, n.id, nodes, edges, saveGame, partnerGender, housedOnly],
  );
  /** Partners by life stage, for the Age menu and its counts. */
  const partnersByStage = useMemo(() => {
    const by = new Map<string, PartnerCandidate[]>();
    for (const c of partners) {
      const age = byId[c.id]?.age ?? '';
      by.set(age, [...(by.get(age) ?? []), c]);
    }
    return by;
  }, [partners, byId]);
  /** The stages this sim is suggested partners from, in life order. */
  const partnerStages = partnerBand(n.age) ?? [];
  // Their own stage until another is picked, or the first with anyone in it.
  const partnerStage =
    stagePick ??
    (partnersByStage.get(n.age)?.length
      ? n.age
      : (partnerStages.find((st) => partnersByStage.get(st)?.length) ?? n.age));
  const stagePartners = partnersByStage.get(partnerStage) ?? [];
  const shownPartners = allPartners ? stagePartners : stagePartners.slice(0, PARTNERS_SHOWN);
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
    onSave({
      // A sim always has a first name; a last name can be blank (Mayor Whiskers).
      // A planned sim may have no name yet; its plan label stands in.
      first: first.trim() || (planned ? '' : n.first),
      planLabel: planned ? planLabel.trim() || undefined : n.planLabel,
      sur: sur.trim(),
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
    // The move form and the link search handle their own Enter.
    if (t.closest('#edMove, #edLink')) return;
    e.preventDefault();
    save();
  };

  /** Arrow keys, Home and End move between tabs, as in any tab list. */
  const onTabKey = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    const i = tabs.indexOf(tab);
    const next =
      e.key === 'ArrowRight'
        ? tabs[(i + 1) % tabs.length]
        : e.key === 'ArrowLeft'
          ? tabs[(i - 1 + tabs.length) % tabs.length]
          : e.key === 'Home'
            ? tabs[0]
            : e.key === 'End'
              ? tabs[tabs.length - 1]
              : null;
    if (!next) return;
    e.preventDefault();
    setTab(next);
    tabRefs.current[next]?.focus();
  };

  const mid =
    n.onb && n.onb !== '-'
      ? n.onb
      : n.oplay === 'NPC'
        ? 'NPC'
        : n.oplay !== 'Resident'
          ? 'Townie'
          : '—';

  /**
   * The height the tallest tab needs, in data-reserve, for placing the
   * editor: placed for that, switching tabs never moves the tab bar from
   * under the pointer. Measured once, as it opens: what opens inside a tab
   * later (an ⓘ, more partners, the move form) scrolls within the editor
   * rather than moving it. Hidden tabs are shown just long enough to measure.
   */
  useLayoutEffect(() => {
    const el = editorRef.current;
    const body = el?.querySelector<HTMLElement>('.ed__body');
    if (!el || !body) return;
    let tallest = 0;
    for (const p of body.querySelectorAll<HTMLElement>('[role=tabpanel]')) {
      const hidden = p.hidden;
      if (hidden) p.hidden = false;
      tallest = Math.max(tallest, p.offsetHeight);
      if (hidden) p.hidden = true;
    }
    const cs = getComputedStyle(body);
    const pad = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    const reserve = Math.ceil(el.offsetHeight - body.offsetHeight + pad + tallest);
    el.dataset.reserve = String(reserve);
    // The phone sheet rises from the bottom, so a shorter tab would drop the
    // tab bar: it keeps the tallest tab's height instead (within its cap).
    el.style.minHeight = compact ? `min(${reserve}px, 70dvh)` : '';
  }, [editorRef, compact]);

  useEffect(() => {
    onLayout();
  }, [tab, moveOpen, linkOpen, allPartners, partnerStage, tips, onLayout]);

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

  /** Why the age has no days, when it has none. */
  const noLifeNote = isPet
    ? ''
    : n.life && n.life.stage !== n.age
      ? 'Life stage changed on the board since your save, so its days are hidden. Load the save again to see them.'
      : !saveGame
        ? 'Load your save to see when they were born and how long they have lived.'
        : 'Your save has no age for this sim.';

  return (
    <div
      ref={editorRef}
      id="editor"
      className={compact ? 'editor editor--sheet' : 'editor'}
      role="dialog"
      aria-label={`Edit ${cardName(n)}`}
      onKeyDown={onKeyDown}
      style={
        compact
          ? { display: 'flex' }
          : // Down to the window's foot from where it was placed, then the tab scrolls.
            { display: 'flex', left, top, maxHeight: `calc(100vh - ${Math.round(top) + 8}px)` }
      }
    >
      <div className="ed__head">
        <button type="button" className="edx" title="Close without saving" aria-label="Close" onClick={onClose}>
          ✕
        </button>
        <div className="edpair edpair--name">
          <div>
            <label htmlFor="edFirst">First name</label>
            <input
              id="edFirst"
              ref={nameRef}
              className="edname"
              value={first}
              autoComplete="off"
              enterKeyHint="done"
              onChange={(e) => setFirst(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="edLast">Last name</label>
            <input
              id="edLast"
              className="edname"
              value={sur}
              autoComplete="off"
              enterKeyHint="done"
              aria-describedby={married ? 'edMarried' : undefined}
              onChange={(e) => setSur(e.target.value)}
            />
          </div>
        </div>
        {married && (
          <div id="edMarried" className="edhint">
            In the game: {n.first} {married}, their spouse's surname. Type {married} as the last
            name to show it on the card.
          </div>
        )}
        <div className="edtabs" role="tablist" aria-label="Sections">
          {tabs.map((t) => (
            <button
              key={t}
              ref={(el) => {
                tabRefs.current[t] = el;
              }}
              type="button"
              role="tab"
              id={`edTab-${t}`}
              className="edtab"
              aria-selected={tab === t}
              aria-controls={`edPanel-${t}`}
              tabIndex={tab === t ? 0 : -1}
              onClick={() => setTab(t)}
              onKeyDown={onTabKey}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      <div className="ed__body">
        {/* Hidden panels stay mounted, so a half-filled move form survives a look at another tab. */}
        <div role="tabpanel" id="edPanel-sim" aria-labelledby="edTab-sim" hidden={tab !== 'sim'}>
          {planned && (
            <>
              <label htmlFor="edPlanLabel">Plan label</label>
              <input
                id="edPlanLabel"
                value={planLabel}
                placeholder="e.g. Firstborn, Future spouse"
                autoComplete="off"
                aria-describedby="edPlanLabelHint"
                onChange={(e) => setPlanLabel(e.target.value)}
              />
              <div id="edPlanLabelHint" className="edhint">
                Their role in your plan, on the card until they have a first name. Leave what you
                don't know yet: the game fills it in.
              </div>
            </>
          )}
          <div className="edpair">
            <div>
              <label htmlFor="edAge">Life stage</label>
              <select
                id="edAge"
                value={age}
                aria-describedby={life ? 'edLifeSum' : undefined}
                onChange={(e) => setAge(e.target.value)}
              >
                {planned && <option value={NOT_YET_AGE}>{notYetText(plannedChild)}</option>}
                {AGES.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
                {!AGES.includes(age as (typeof AGES)[number]) && !(planned && age === NOT_YET_AGE) && (
                  <option value={age}>{age}</option>
                )}
              </select>
            </div>
            <div>
              <label htmlFor="edGender">Gender</label>
              <select id="edGender" value={gender} onChange={(e) => setGender(e.target.value)}>
                {planned && <option value={GENDER_NOT_KNOWN}>Not known yet</option>}
                {GENDERS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
                {!GENDERS.includes(gender as (typeof GENDERS)[number]) &&
                  !(planned && gender === GENDER_NOT_KNOWN) && <option value={gender}>{gender}</option>}
              </select>
            </div>
          </div>
          {life && (
            <div id="edLifeSum" className="edsum">
              <span className="edsum__text">
                {lifeSummary(life)}
                {life.frozen && <span className="edsum__frozen">{frozenLine(life.frozen)}</span>}
              </span>
              <button type="button" className="edlink" onClick={() => setTab('details')}>
                Age details
              </button>
            </div>
          )}
          {!life && n.life && !isPet && n.life.stage !== n.age && (
            <div className="edhint">Changed since your save: load it again to see its days.</div>
          )}
          <div className="edpair">
            <div>
              <label htmlFor="edState">Life state</label>
              <select id="edState" value={state} onChange={(e) => setState(e.target.value)}>
                {LIFE_STATE_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
                {!LIFE_STATES.includes(state as (typeof LIFE_STATES)[number]) && (
                  <option value={state}>{state}</option>
                )}
              </select>
            </div>
            <div>
              <label htmlFor="edPlay">Playability</label>
              <select id="edPlay" value={oplay} onChange={(e) => setOplay(e.target.value)}>
                {PLAYABILITY_OPTIONS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
                {!PLAYABILITY.includes(oplay as (typeof PLAYABILITY)[number]) && (
                  <option value={oplay}>{oplay}</option>
                )}
              </select>
            </div>
          </div>
          <button
            type="button"
            className="movebtn"
            aria-expanded={moveOpen}
            aria-controls="edMove"
            onClick={() => setMoveOpen(!moveOpen)}
          >
            ↪ Move to another household
          </button>
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
          {planned && (
            <>
              <button
                type="button"
                className="movebtn linkbtn"
                aria-expanded={linkOpen}
                aria-controls="edLink"
                onClick={() => setLinkOpen(!linkOpen)}
              >
                ↔ This is a sim from my save…
              </button>
              {linkOpen && (
                <div id="edLink">
                  <label htmlFor="edLinkQuery">Who fills {cardName(n)}?</label>
                  <input
                    id="edLinkQuery"
                    type="search"
                    value={linkQuery}
                    placeholder="Type a name"
                    autoComplete="off"
                    onChange={(e) => setLinkQuery(e.target.value)}
                  />
                  {linkChoices.length ? (
                    <ul className="partners">
                      {linkChoices.map(({ sim: x, likely }) => (
                        <li key={x.id}>
                          <button type="button" onClick={() => onLinkPlanned(x.id)}>
                            <span className="partners__name">{cardName(x)}</span>
                            <span className="partners__meta">
                              {x.age} · {x.hh}
                              {likely ? ' · likely' : ''}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="edhint">
                      {linkQuery.trim() ? 'No sim from your save by that name.' : 'Type the name the game gave them.'}
                    </div>
                  )}
                  <div className="edhint">
                    Their name, gender, age and parents come from your save; this planned sim's
                    other links move to their card. Unlink in their Family tab if it's the wrong one.
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {!isPet && (
          <div role="tabpanel" id="edPanel-family" aria-labelledby="edTab-family" hidden={tab !== 'family'}>
            {(myIssues.length > 0 || n.plannedAs) && (
              <section className="edplan" aria-labelledby="edPlanHead">
                <div className="edlabel">
                  <span className="edlabel__text" id="edPlanHead">
                    Your plan
                  </span>
                </div>
                {myIssues.map((c) => (
                  <div key={c.edgeId} className="edplan__issue">
                    <p>
                      <b>⚠ Off plan.</b> {conflictText(c, planName)}
                    </p>
                    <div className="edplan__actions">
                      <button type="button" className="edplan__go" onClick={() => onResolvePlan(c.edgeId, 'follow')}>
                        Follow the game
                      </button>
                      <button type="button" onClick={() => onResolvePlan(c.edgeId, 'keep')}>
                        Keep my plan
                      </button>
                      <button type="button" onClick={() => onResolvePlan(c.edgeId, 'drop')}>
                        Drop it
                      </button>
                    </div>
                  </div>
                ))}
                {n.plannedAs && (
                  <div className="edplan__was">
                    <span>
                      Planned as <b>{n.plannedAs.label}</b>
                    </span>
                    <button type="button" className="edlink" onClick={onUnlinkPlanned}>
                      Unlink
                    </button>
                  </div>
                )}
              </section>
            )}
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
              <div id="edDynastyHint" className={roleHolder ? 'edhint edhint--warn' : 'edhint'}>
                {roleHolder && (dynastyRole === 'head' || dynastyRole === 'heir')
                  ? `Saving makes ${n.first || 'them'} the ${DYNASTY_ROLES[dynastyRole].noun.toLowerCase()} instead of ${roleHolder.first} ${roleHolder.sur}: a dynasty has one.`
                  : `In the ${n.dynasty} dynasty.`}
              </div>
            )}
            {gen && (
              <>
                <div className="edlabel">
                  <label htmlFor="edGenRoot">Generation</label>
                  <TipButton
                    open={!!tips.gen}
                    onToggle={() => toggleTip('gen')}
                    controls="edGenRootHint"
                    about="how generations are counted"
                  />
                </div>
                <div className="ro edgen" id="edGen">
                  {genLine ?? `No number: no family link to ${nameOf(gen.rootId)}`}
                  {gen.planned && <span className="edgen__planned"> · through a planned link</span>}
                  {/* An ancestor shared by more than one dynasty's line. */}
                  {gen.also?.map((g) => {
                    const t = generationText(g, dynastyLabel(g, generations, byId));
                    return t ? (
                      <div key={g.key} className="edgen__also">
                        Also {t}
                      </div>
                    ) : null;
                  })}
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
                <div id="edGenRootHint" className="edhint" hidden={!tips.gen}>
                  {gen.rootPicked
                    ? `Gen 1 is ${nameOf(gen.rootId)}, picked here. `
                    : gen.autoRootId === gen.firstHeadId
                      ? `Gen 1 is ${nameOf(gen.firstHeadId)}, the ${genLabel} dynasty's first head: the board knows none of their parents. `
                      : `Gen 1 is ${nameOf(gen.autoRootId)}, the oldest known ancestor of ${nameOf(gen.firstHeadId)}, the ${genLabel} dynasty's first head. `}
                  Each child is one more, counting the deceased and family-tree relatives.
                </div>
              </>
            )}
            <div className="edlabel">
              <span className="edlabel__text" id="edPartnersLabel">
                Possible partners
              </span>
              <TipButton
                open={!!tips.partners}
                onToggle={() => toggleTip('partners')}
                controls="edPartnersHint"
                about="possible partners"
              />
            </div>
            {/* Two ways of narrowing one list, side by side. A teen or a child
                has one stage to choose from, so no Age menu. */}
            <div className="edfilters">
              {partnerStages.length > 1 && (
                <select
                  aria-label="Partners' life stage"
                  value={partnerStage}
                  onChange={(e) => {
                    setStagePick(e.target.value);
                    setAllPartners(false);
                  }}
                >
                  {partnerStages.map((st) => (
                    <option key={st} value={st}>
                      {STAGE_PLURAL[st] ?? st} ({partnersByStage.get(st)?.length ?? 0})
                    </option>
                  ))}
                </select>
              )}
              <select
                aria-label="Partners' gender"
                value={partnerGender}
                onChange={(e) => {
                  setPartnerGender(e.target.value);
                  setAllPartners(false);
                }}
              >
                <option value="">Any gender</option>
                {PARTNER_GENDERS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>
            {/* On or off, so a checkbox rather than a third menu. Named as the
                board names those places, so it is clear who goes. */}
            <label className="edcheck">
              <input
                type="checkbox"
                checked={housedOnly}
                onChange={(e) => setHousedOnly(e.target.checked)}
              />
              Hide sims in Not in any world or Unhoused
            </label>
            <div id="edPartnersHint" className="edhint" hidden={!tips.partners}>
              Young adults, adults and elders are suggested to each other; teens to teens, children
              to children, and infants and toddlers together. Closest in life first: living sims who
              aren't blood relatives or married. Click one to find them on the board.
            </div>
            {stagePartners.length ? (
              <ul className="partners" aria-labelledby="edPartnersLabel">
                {shownPartners.map((c) => {
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
                          {gapText(c)} · {p.hh}
                        </span>
                        {flags.length > 0 && <span className="partners__flags">{flags.join(' · ')}</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="edhint">
                {STAGE_PLURAL[partnerStage]
                  ? `No ${partnerGender ? `${partnerGender.toLowerCase()} ` : ''}${STAGE_PLURAL[partnerStage]!.toLowerCase()}${housedOnly ? ' with a home' : ''} on the board fit.`
                  : 'No one on the board fits.'}
              </div>
            )}
            {stagePartners.length > PARTNERS_SHOWN && (
              <button
                type="button"
                className="edlink edlink--more"
                aria-expanded={allPartners}
                onClick={() => setAllPartners(!allPartners)}
              >
                {allPartners
                  ? 'Show fewer'
                  : `Show ${stagePartners.length - PARTNERS_SHOWN} more`}
              </button>
            )}
          </div>
        )}

        <div role="tabpanel" id="edPanel-details" aria-labelledby="edTab-details" hidden={tab !== 'details'}>
          {!isPet && (
            <>
              <label id="edLifeLabel">Age from your save</label>
              {life ? (
                <LifeFacts v={life} />
              ) : (
                <div className="ro ro--muted" aria-labelledby="edLifeLabel">
                  {noLifeNote}
                </div>
              )}
            </>
          )}
          <label id="edOriginLabel">Where they come from</label>
          <dl className="ro edfacts" aria-labelledby="edOriginLabel">
            <div className="edlife__row">
              <dt>Game pack</dt>
              <dd>{n.pack || '—'}</dd>
            </div>
            <div className="edlife__row">
              <dt>Household</dt>
              <dd>{n.ohh || '—'}</dd>
            </div>
            <div className="edlife__row">
              <dt>World</dt>
              <dd>
                {n.oworld || '—'}
                {mid !== '—' ? ` · ${mid}` : ''}
              </dd>
            </div>
          </dl>
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
        </div>
      </div>

      <div className="ed__foot">
        <button type="button" className="edsave" onClick={save}>
          Save
        </button>
      </div>
    </div>
  );
}
