import { removalLabel, simLinkRows } from '../lib/simLinks.ts';
import { CloseButton } from './CloseButton.tsx';
import { PET_AGES, PET_GENDERS, PET_KINDS, petAgeLabel, petPack, type PetKind } from '../lib/pets.ts';
import { PetFamily } from './PetFamily.tsx';
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from 'react';
import { AGES, DECEASED_STATE, DYNASTY_ROLES, GENDERS, LIFE_STATES, PLAYABILITY } from '../lib/constants.ts';
import { useCompactChrome } from '../hooks/useCompactChrome.ts';
import { Info, Trash } from '../icons.ts';
import { trackAction } from '../lib/analytics.ts';
import {
  dynastyKey,
  dynastyLabelText,
  dynastyNames,
  dynastyPhrase,
  generationText,
  newDynastyRef,
  type DynastyGeneration,
  type FamilyGeneration,
} from '../lib/generations.ts';
import {
  clockText,
  dayText,
  daysText,
  frozenText,
  oldAgeSoonText,
  lifeView,
  wholeDaysText,
  yearText,
  type LifeView,
} from '../lib/lifeClock.ts';
import { partnerBand, partnerCandidates, type PartnerCandidate } from '../lib/partners.ts';
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
import { isUnhousedGid } from '../lib/unhoused.ts';
import {
  dynastiesNamed,
  dynastyIndex,
  dynastyRiskMap,
  familyDynasties,
  isPlannedOnlyDynasty,
  newDynastyFields,
  renamePlannedDynasty,
} from '../lib/dynastyMenu.ts';
import { HouseholdMoveForm } from './HouseholdMoveForm.tsx';
import { WorldMoveForm } from './WorldMoveForm.tsx';
import { SimCard } from './SimCard.tsx';
import { SearchSelect, type SearchGroup, type SearchOption } from './SearchSelect.tsx';
import { fold, pronounsLabel } from '../lib/utils.ts';
import { heirAfterChoices, heirAfterHolder, successionLine, withSuccessionChoice, type LinePlace } from '../lib/succession.ts';
import { simCardClass } from '../lib/simCard.ts';
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
  if (!boardHasSave) return 'Upload your save to see the sim ID';
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
  if (v.elderDays !== undefined) return `Elder for ${daysText(v.elderDays)} · ${oldAgeSoonText(v.oldAgeIn)}`;
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

/**
 * A name typed all in lowercase, as a search often is, capitalized as the
 * game writes names: "moonwood" → "Moonwood". Any capital is kept as typed.
 */
function titleCase(s: string): string {
  return s === s.toLowerCase() ? s.replace(/(^|[\s-])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase()) : s;
}

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

/** The Dynasty menu's choice for starting one the game doesn't have yet. */
const NEW_DYNASTY = '__new';

/** The Generation menu's choice for counting from the oldest known ancestor. */
const AUTO_ROOT = '__oldest';

const LIFE_STATE_OPTIONS = pinnedAlpha(LIFE_STATES, 'Sim');
/** A pet is a pet, or has passed away. */
const PET_STATES: readonly string[] = ['Pet', 'Deceased'];
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
  /** Every sim's generation from their oldest known ancestor (familyGenerations). */
  familyGenerations: Map<string, FamilyGeneration>;
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
    /**
     * A role planned on the board (SimNode.dynastyPlan), with the dynasty the
     * board puts them in; present only when they change, undefined clears.
     */
    dynastyPlan?: 'role' | 'member' | 'none';
    dynasty?: string;
    dynastyId?: string;
    /** Heir once this sim is head (SimNode.heirAfter); undefined clears. */
    heirAfter: string | undefined;
    /** Count this dynasty's generations from another Gen 1 (null: the oldest known ancestor). */
    genRoot?: { key: string; id: string | null };
    /** A planned sim's role in the plan; undefined clears it. */
    planLabel?: string;
    /** A pet's kind, breed and the pack it comes with. */
    species?: string;
    breed?: string;
    pack?: string;
  }) => void;
  onMove: (world: string, houseGid: string, newName: string) => void;
  /** Move this sim's whole household to another world (moveHouseholdToWorld). */
  onMoveHousehold: (world: string, house?: string) => void;
  onLayout: () => void;
  onClose: () => void;
  /** Take this sim off the board (the Delete key's job too). */
  onDelete: () => void;
  /** Take one of their links off the board, or plan a game couple's end. */
  onDeleteLink: (edgeId: string) => void;
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
  /** Open this sim's household's plan (HouseholdBrief). */
  onOpenPlan: () => void;
  /** Renames a dynasty only the plan has (by key), on all its members: its key now, null when refused. */
  onRenameDynasty: (key: string, to: string) => string | null;
  /** A pet's parent, linked from its Family tab. */
  onLinkParent: (parentId: string, childId: string) => void;
  /** A planned kitten, puppy or foal of these pets. */
  onPlanYoung: (parentIds: string[]) => void;
  /** The pets your packs allow, for a pet added on the board to change its kind. */
  petKinds: readonly PetKind[];
  /** Open the Chronicle on this sim's story; absent while the story is empty. */
  onStory?: () => void;
};

export function SimEditor({
  node: n,
  worlds,
  groups,
  nodes,
  edges,
  saveGame,
  generations,
  familyGenerations,
  onPickPartner,
  left,
  top,
  editorRef,
  onSave,
  onMove,
  onMoveHousehold,
  onLayout,
  onClose,
  onDelete,
  onDeleteLink,
  focusName,
  planIssues,
  plannedChild,
  onResolvePlan,
  onLinkPlanned,
  onUnlinkPlanned,
  onOpenPlan,
  onRenameDynasty,
  onLinkParent,
  onPlanYoung,
  petKinds,
  onStory,
}: Props) {
  const compact = useCompactChrome();
  const isPet = !!n.species;
  // Pets have no dynasty and no partners: their Family tab is parents, young and siblings.
  const tabs: Tab[] = ['sim', 'family', 'details'];
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
  /**
   * Every sim needs a last name, a planned one most of all: unnamed planned
   * sims go by it. Only a card the game gave none (Mayor Whiskers) may stay
   * without one.
   */
  const surMissing = !isPet && !sur.trim() && (!!n.sur.trim() || isPlannedSim(n));
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
  /** A pet's kind (changeable while it is only on the board) and breed. */
  const [species, setSpecies] = useState(n.species ?? '');
  const [breed, setBreed] = useState(n.breed ?? '');
  const [oplay, setOplay] = useState(n.oplay || 'Resident');
  const [dynastyRole, setDynastyRole] = useState<DynastyRole | ''>(n.dynastyRole ?? '');
  /** Heir after whom, for an heir planned generations ahead; '' for none. */
  const [heirAfter, setHeirAfter] = useState(n.heirAfter ?? '');
  /** In a dynasty as the game has it, not one the board planned them into. */
  const inGameDynasty = !!n.dynasty && n.dynastyPlan !== 'member';
  /** The new dynasty's name, when "Create a new dynasty…" is picked. */
  const [newDynasty, setNewDynasty] = useState(n.sur);
  const [moveOpen, setMoveOpen] = useState(false);
  const [worldOpen, setWorldOpen] = useState(false);
  /** A household of its own that can change worlds: not the Unhoused sims box. */
  const movableHome = !!n.hh && !isUnhousedGid(n.gid);
  /** Explanations opened with ⓘ, by field. */
  const [tips, setTips] = useState<Record<string, boolean>>({});
  const toggleTip = (k: string) => setTips((t) => ({ ...t, [k]: !t[k] }));
  const boardHasSave = useMemo(() => nodes.some((x) => x.saveSimId), [nodes]);
  const byId = useMemo(() => Object.fromEntries(nodes.map((x) => [x.id, x])), [nodes]);
  const life = useMemo(() => lifeView(n, saveGame), [n, saveGame]);
  /** What each dynasty is called: two of one name carry their founder's tag ("Ngata (Oliana’s line)"). */
  const names = useMemo(() => dynastyNames(nodes), [nodes]);
  /** The dynasties at risk, for "at risk" on the sim cards, as on the board. */
  const risks = useMemo(() => dynastyRiskMap(nodes), [nodes]);
  /** The board's dynasties, to plan a sim into one, by key. */
  const dynasties = useMemo(() => {
    const out = new Map<
      string,
      { key: string; dynasty: string; dynastyId?: string; dynastyRef?: string; label: string; inGame: boolean }
    >();
    for (const x of nodes) {
      const key = dynastyKey(x);
      if (!key || !x.dynasty) continue;
      const inGame = x.dynastyPlan !== 'member';
      const had = out.get(key);
      if (had) {
        had.inGame ||= inGame;
        continue;
      }
      out.set(key, {
        key,
        dynasty: x.dynasty,
        ...(x.dynastyId ? { dynastyId: x.dynastyId } : x.dynastyRef ? { dynastyRef: x.dynastyRef } : {}),
        label: dynastyLabelText(names.get(key) ?? { name: x.dynasty }),
        inGame,
      });
    }
    return [...out.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [nodes, names]);
  /** Each dynasty's members, head and heir, by key. */
  const dynastyRows = useMemo(() => new Map(dynastyIndex(nodes).map((r) => [r.key, r])), [nodes]);
  /**
   * The dynasty they are in, or planned into: theirs; for a planned sim in
   * none, a parent's, else a partner's, the one their last name carries
   * first (Heir Dreamer: the Dreamers, not their mother's Capps), then a
   * head's or heir's. A sim from the save stays as the save has them, so
   * one like Afua, outside her father's dynasty, isn't put in it unasked.
   */
  const suggestedDynasty = useMemo(() => {
    if (n.dynasty || n.dynastyPlan || !isPlannedSim(n)) return '';
    // The family's first, counting only dynasties the game has them in.
    const inGame = nodes.filter((x) => x.dynastyPlan !== 'member');
    return familyDynasties(n.id, inGame, edges)[0]?.key ?? '';
    // Worked out once, for the sim the editor opened on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  /** Their parents' and partners' dynasties: the Dynasty menu's top group. */
  const family = useMemo(() => (isPet ? [] : familyDynasties(n.id, nodes, edges)), [isPet, n.id, nodes, edges]);
  const [dynastyMenuOpen, setDynastyMenuOpen] = useState(false);
  /**
   * The Dynasty menu: no dynasty, then their family's (why each is there),
   * then the game's and the planned ones apart, A to Z, each with how many
   * sims are in it. Searching narrows all of them.
   */
  const dynastyGroups = useMemo((): SearchGroup[] => {
    const members = new Map<string, number>();
    for (const x of nodes) {
      const k = dynastyKey(x);
      if (k && !x.species) members.set(k, (members.get(k) ?? 0) + 1);
    }
    // One of two of a name also says who heads it: pick by the people.
    const option = (d: (typeof dynasties)[number]): SearchOption => {
      const c = members.get(d.key) ?? 0;
      const head = dynastyRows.get(d.key)?.head;
      const meta = names.get(d.key)?.tag
        ? head && byId[head.id]
          ? `Head: ${cardName(byId[head.id]!)}${head.planned ? ' (planned)' : ''}`
          : 'No head yet'
        : undefined;
      return { value: d.key, label: d.label, aside: `${c} ${c === 1 ? 'sim' : 'sims'}`, ...(meta ? { meta } : {}) };
    };
    const near = new Set(family.map((f) => f.key));
    return [
      { key: 'none', options: [{ value: '', label: 'No dynasty' }] },
      {
        key: 'family',
        label: 'Their family',
        options: family.flatMap((f) => {
          const d = dynasties.find((x) => x.key === f.key);
          if (!d) return [];
          const who = f.people
            .map((p) => `${byId[p.id] ? cardName(byId[p.id]!) : 'someone'}, ${p.rel}`)
            .join(' · ');
          return [{ ...option(d), meta: d.inGame ? who : `${who} · planned` }];
        }),
      },
      { key: 'game', label: 'In your game', options: dynasties.filter((d) => d.inGame && !near.has(d.key)).map(option) },
      { key: 'planned', label: 'Planned', options: dynasties.filter((d) => !d.inGame && !near.has(d.key)).map(option) },
    ];
  }, [nodes, byId, dynasties, family, dynastyRows, names]);
  const [dynastyChoice, setDynastyChoice] = useState(() =>
    n.dynastyPlan === 'none' ? '' : (dynastyKey(n) ?? suggestedDynasty),
  );
  /**
   * The picked dynasty's name when only the plan has it: it can be renamed
   * here, on every member at once. A game dynasty is named by the save.
   */
  const picked = dynasties.find((d) => d.key === dynastyChoice);
  const renamable = picked && isPlannedOnlyDynasty(nodes, picked.key) ? picked.dynasty : '';
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameTo, setRenameTo] = useState('');
  const renameName = renameTo.trim();
  /** Other dynasties that already have the name typed: allowed, told apart by founder. */
  const renameTwins = renamable && renameName ? dynastiesNamed(nodes, renameName, dynastyChoice) : [];
  /** The taken name as that dynasty spells it ("Goth" when "goth" was typed), and what this one would show as. */
  const takenName = renameTwins.length ? (dynasties.find((d) => d.key === renameTwins[0])?.dynasty ?? renameName) : '';
  const renameAs = (() => {
    if (!renameTwins.length) return '';
    const done = renamePlannedDynasty(nodes, dynastyChoice, renameName);
    const d = dynastyNames(done.nodes).get(done.key);
    return d ? dynastyLabelText(d) : renameName;
  })();
  const canRename = !!renamable && !!renameName && renameName !== renamable;
  const renameCount = nodes.filter((x) => dynastyKey(x) === dynastyChoice && !x.species).length;
  const doRename = () => {
    if (!canRename) return;
    const key = onRenameDynasty(dynastyChoice, renameName);
    if (!key) return;
    setDynastyChoice(key);
    setRenameOpen(false);
  };
  /** What the closed Dynasty menu shows. */
  const dynastyDisplay = (() => {
    if (dynastyChoice === NEW_DYNASTY) return '➕ Create a new dynasty…';
    return picked ? `${picked.label}${picked.inGame ? '' : ' · planned'}` : 'No dynasty';
  })();
  /** A board id for the new dynasty, kept while the editor is open, should its name be taken. */
  const [newRef] = useState(newDynastyRef);
  /** The dynasty picked, as a card would carry it; null for none. */
  const target = useMemo((): { key: string; dynasty: string; dynastyId?: string; dynastyRef?: string } | null => {
    if (dynastyChoice !== NEW_DYNASTY) return dynasties.find((d) => d.key === dynastyChoice) ?? null;
    const name = newDynasty.trim();
    if (!name) return null;
    // A name another dynasty has: a separate one, with its own board id.
    const fields = newDynastyFields(nodes, name, newRef);
    return { key: dynastyKey(fields)!, ...fields };
  }, [dynastyChoice, newDynasty, dynasties, nodes, newRef]);
  /**
   * What the dynasties will be called once saved: a new Scott beside
   * another, and that other, both carry their founder's tag.
   */
  const previewNames = useMemo(() => {
    if (!target || target.key === dynastyKey(n)) return names;
    const me: SimNode = {
      ...n,
      dynasty: target.dynasty,
      dynastyId: target.dynastyId,
      dynastyRef: target.dynastyRef,
      dynastyRole: dynastyRole || undefined,
      dynastyPlan: 'member',
    };
    return dynastyNames(nodes.map((x) => (x.id === n.id ? me : x)));
  }, [names, nodes, n, target, dynastyRole]);
  /** "Scott dynasty (Travis’s line)": the picked one, for sentences. */
  const targetPhrase = target ? dynastyPhrase(previewNames.get(target.key) ?? { name: target.dynasty }) : '';
  /** The other dynasties with the new dynasty's name: it is saved apart from them. */
  const newTwins = dynastyChoice === NEW_DYNASTY && target ? dynastiesNamed(nodes, target.dynasty) : [];
  const gen = generations.get(n.id);
  const familyGen = isPet ? undefined : familyGenerations.get(n.id);
  const genLabel = gen ? dynastyLabelText(names.get(gen.key) ?? { name: gen.dynasty }) : '';
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
  /** Their links, to take one off without finding its line (simLinkRows). */
  const links = useMemo(
    () =>
      simLinkRows(
        n.id,
        edges,
        (id) => {
          const x = byId[id];
          return x ? cardName(x) : 'someone not on the board';
        },
        (id) => byId[id]?.state === DECEASED_STATE,
        (id) => byId[id]?.first.trim() || 'they',
      ),
    [n.id, edges, byId],
  );
  const nameOf = (id: string | undefined) => {
    const x = id ? byId[id] : undefined;
    return x ? `${x.first} ${x.sur}`.trim() : 'someone not on the board';
  };
  /** A sim in the line of succession, a planned one with no name yet by its card's name. */
  const lineName = (id: string) => {
    const x = byId[id];
    return x ? cardName(x) : 'someone not on the board';
  };
  /**
   * Who loses the role on Save: a dynasty has one head and one heir, so
   * naming one here takes it from whoever has it (as updateNode does).
   */
  const roleHolder = useMemo(() => {
    if (dynastyRole !== 'head' && dynastyRole !== 'heir') return null;
    if (!target?.dynasty || (dynastyRole === n.dynastyRole && target.key === dynastyKey(n))) return null;
    return (
      nodes.find(
        (x) =>
          x.id !== n.id &&
          x.dynastyRole === dynastyRole &&
          dynastyKey(x) === target.key,
      ) ?? null
    );
  }, [n, dynastyRole, nodes, target]);
  /** Who they can be planned as heir after: the heir and each heir planned after them. */
  const afterChoices = useMemo(
    () => (target ? heirAfterChoices(nodes, n.id, target.key) : []),
    [nodes, n.id, target],
  );
  /** The heir-after pick that Save writes: one still in line, or the one they had. */
  const after =
    target && heirAfter && (afterChoices.includes(heirAfter) || (heirAfter === n.heirAfter && target.key === dynastyKey(n)))
      ? heirAfter
      : '';
  /** Who loses that place in line on Save. */
  const afterHolder = useMemo(
    () => (target && after && after !== n.heirAfter ? heirAfterHolder(nodes, after, target.key, n.id) : null),
    [nodes, after, target, n.id, n.heirAfter],
  );
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
  /** A name typed to find one partner; it narrows the list and its counts. */
  const [partnerQuery, setPartnerQueryState] = useState('');
  const setPartnerQuery = (text: string) => {
    setPartnerQueryState(text);
    // Back to the stage that has a match, and every match shown.
    setStagePick(null);
    setAllPartners(false);
  };
  const partnerQ = fold(partnerQuery);
  /** Partners by life stage, for the Age menu and its counts. */
  const partnersByStage = useMemo(() => {
    const by = new Map<string, PartnerCandidate[]>();
    for (const c of partners) {
      const p = byId[c.id];
      if (partnerQ && !fold(`${p?.first ?? ''} ${p?.sur ?? ''}`).includes(partnerQ)) continue;
      const age = p?.age ?? '';
      by.set(age, [...(by.get(age) ?? []), c]);
    }
    return by;
  }, [partners, byId, partnerQ]);
  /** The stages this sim is suggested partners from, in life order. */
  const partnerStages = partnerBand(n.age) ?? [];
  // Their own stage until another is picked, or the first with anyone in it.
  const partnerStage =
    stagePick ??
    (partnersByStage.get(n.age)?.length
      ? n.age
      : (partnerStages.find((st) => partnersByStage.get(st)?.length) ?? n.age));
  const stagePartners = partnersByStage.get(partnerStage) ?? [];
  // A search shows every match: there are few, and the one wanted may be fifth.
  const partnersCapped = !partnerQ && !allPartners;
  const shownPartners = partnersCapped ? stagePartners.slice(0, PARTNERS_SHOWN) : stagePartners;
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
    if (surMissing) return;
    const plan = dynastyPatch();
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
      dynastyRole: 'dynastyRole' in plan ? plan.dynastyRole : n.dynastyRole,
      ...plan,
      heirAfter: after || undefined,
      ...(isPet ? { species, breed: breed.trim() || undefined, pack: petPack(species) || n.pack } : {}),
      ...(gen && (genRoot === AUTO_ROOT ? null : genRoot) !== (gen.rootPicked ? gen.rootId : null)
        ? { genRoot: { key: gen.key, id: genRoot === AUTO_ROOT ? null : genRoot } }
        : {}),
    });
  };

  /**
   * The dynasty and role a Save writes. Anything set here that the save
   * doesn't show is a plan (SimNode.dynastyPlan), like a link drawn on the
   * board: joining a dynasty ('member'), another role in theirs ('role'),
   * leaving it ('none', the game's dynasty kept until they do).
   */
  function dynastyPatch(): Partial<Pick<SimNode, 'dynasty' | 'dynastyId' | 'dynastyRef' | 'dynastyRole' | 'dynastyPlan'>> {
    const role = target ? dynastyRole || undefined : undefined;
    const now = n.dynastyPlan === 'none' ? '' : (dynastyKey(n) ?? '');
    const want = target?.key ?? '';
    if (want === now && role === n.dynastyRole) return {};
    if (!target) {
      if (!n.dynasty) return { dynastyRole: undefined, dynastyPlan: undefined };
      if (!inGameDynasty) {
        return { dynasty: undefined, dynastyId: undefined, dynastyRef: undefined, dynastyRole: undefined, dynastyPlan: undefined };
      }
      return { dynastyPlan: 'none' };
    }
    if (inGameDynasty && want === (dynastyKey(n) ?? '')) {
      return { dynastyRole: role, dynastyPlan: role === n.dynastyRole && n.dynastyPlan === 'none' ? undefined : 'role' };
    }
    return {
      dynasty: target.dynasty,
      dynastyId: target.dynastyId,
      dynastyRef: target.dynastyRef,
      dynastyRole: role,
      dynastyPlan: 'member',
    };
  }

  /** What the dynasty fields mean now: the game's, a suggestion, or a plan. */
  function dynastyHint(): string {
    const who = n.first.trim() || cardName(n);
    const plan = dynastyPatch();
    const changed = Object.keys(plan).length > 0;
    const kind = changed ? plan.dynastyPlan : n.dynastyPlan;
    const role = target && dynastyRole ? DYNASTY_ROLES[dynastyRole].noun.toLowerCase() : '';
    const holder = roleHolder ? `${roleHolder.first} ${roleHolder.sur}`.trim() : '';
    const swap = holder
      ? roleHolder!.dynastyPlan
        ? ` Saving plans ${who} as ${role} instead of ${holder}.`
        : ` ${holder} stays ${role} until your game changes it.`
      : '';
    const faded = role ? ' Their mark shows faded until a save has it.' : '';
    const replaced = afterHolder ? cardName(afterHolder) : '';
    const later = after
      ? ` ${who} becomes heir once ${lineName(after)} is head.${replaced ? ` Saving plans ${who} in that place instead of ${replaced}.` : ''}`
      : '';
    if (suggestedDynasty && dynastyChoice === suggestedDynasty) {
      return `Suggested from their family: saving plans them into it. Pick No dynasty if they won’t join.${faded}${later}`;
    }
    if (!kind) return target ? `In the ${targetPhrase} in your save.${later ? ` A plan:${later}` : ''}` : '';
    if (kind === 'none') {
      const theirs = dynastyPhrase(names.get(dynastyKey(n) ?? '') ?? { name: n.dynasty ?? '' });
      return `A plan: ${who} leaves the ${theirs}. Your save still has them in it.`;
    }
    if (kind === 'role') return `A plan: ${who} is in the ${targetPhrase} in your save.${swap}${faded}${later}`;
    const isNew = dynastyChoice === NEW_DYNASTY || !dynasties.find((d) => d.key === target?.key)?.inGame;
    const where = isNew
      ? `the ${targetPhrase} isn’t in your game yet.`
      : `${who} isn’t in the ${targetPhrase} in your save yet.`;
    return `A plan: ${where}${swap}${faded}${later}`;
  }

  /**
   * The dynasty's line of succession as Save would leave it, this sim's
   * pick included: shown once it holds more than a head.
   */
  const succession = useMemo((): LinePlace[] => {
    if (!target) return [];
    const plan = dynastyPatch();
    const me: SimNode = {
      ...n,
      dynastyRole: 'dynastyRole' in plan ? plan.dynastyRole : n.dynastyRole,
      ...plan,
      heirAfter: after || undefined,
      ...(isPet ? { species, breed: breed.trim() || undefined, pack: petPack(species) || n.pack } : {}),
    };
    const line = successionLine(withSuccessionChoice(nodes, me), target.key);
    return line.length > 1 ? line : [];
    // dynastyPatch reads the editor's dynasty and role picks, listed here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, n, target, dynastyRole, after, inGameDynasty]);

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
    // The move form, the link search and the Dynasty menu handle their own
    // Enter; in the partner search it would close the editor mid-search.
    if (t.closest('#edMove, #edLink, .ssel, #edPartnerFind, #edDynastyRename')) return;
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
  }, [tab, moveOpen, worldOpen, linkOpen, allPartners, partnerStage, partnerQ, dynastyMenuOpen, renameOpen, tips, onLayout]);

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
        <CloseButton className="ed__close" label="Close the editor" title="Close without saving (Esc)" onClick={onClose} />
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
              className={surMissing ? 'edname edname--missing' : 'edname'}
              value={sur}
              autoComplete="off"
              enterKeyHint="done"
              required={surMissing || undefined}
              aria-invalid={surMissing || undefined}
              aria-describedby={[surMissing ? 'edLastMissing' : '', married ? 'edMarried' : ''].filter(Boolean).join(' ') || undefined}
              onChange={(e) => setSur(e.target.value)}
            />
          </div>
        </div>
        {surMissing && (
          <div id="edLastMissing" className="edhint edhint--error" role="alert">
            Enter a last name to save.
          </div>
        )}
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
              {t === 'sim' && isPet ? 'Pet' : TAB_LABELS[t]}
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
          {isPet && (
            <div className="edpair">
              <div>
                <label htmlFor="edSpecies">Kind</label>
                {n.added ? (
                  <select id="edSpecies" value={species} onChange={(e) => setSpecies(e.target.value)}>
                    {PET_KINDS.filter((k) => k.species === species || petKinds.some((x) => x.species === k.species)).map((k) => (
                      <option key={k.species} value={k.species}>
                        {k.species}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="ro" id="edSpecies">
                    {species}
                  </div>
                )}
              </div>
              <div>
                <label htmlFor="edBreed">Breed</label>
                <input
                  id="edBreed"
                  value={breed}
                  placeholder={species === 'Horse' ? 'e.g. Appaloosa' : species === 'Dog' ? 'e.g. Beagle' : 'e.g. Tabby'}
                  autoComplete="off"
                  onChange={(e) => setBreed(e.target.value)}
                />
              </div>
            </div>
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
                {(isPet ? PET_AGES : AGES).map((a) => (
                  <option key={a} value={a}>
                    {isPet ? petAgeLabel(species, a) : a}
                  </option>
                ))}
                {!(isPet ? (PET_AGES as readonly string[]) : (AGES as readonly string[])).includes(age) &&
                  !(planned && age === NOT_YET_AGE) && <option value={age}>{age}</option>}
              </select>
            </div>
            <div>
              <label htmlFor="edGender">Gender</label>
              <select id="edGender" value={gender} onChange={(e) => setGender(e.target.value)}>
                {planned && <option value={GENDER_NOT_KNOWN}>Not known yet</option>}
                {(isPet ? PET_GENDERS : GENDERS).map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
                {!(isPet ? (PET_GENDERS as readonly string[]) : (GENDERS as readonly string[])).includes(gender) &&
                  !(planned && gender === GENDER_NOT_KNOWN) && <option value={gender}>{gender}</option>}
              </select>
              {n.pronouns && (
                <div id="edPronouns" className="edhint" title="As set in your game">
                  Pronouns: {pronounsLabel(n.pronouns)}
                </div>
              )}
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
                {(isPet ? PET_STATES : LIFE_STATE_OPTIONS).map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
                {!(isPet ? PET_STATES : (LIFE_STATES as readonly string[])).includes(state) && (
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
            className="movebtn movebtn--key"
            aria-expanded={moveOpen}
            aria-controls="edMove"
            onClick={() => setMoveOpen(!moveOpen)}
          >
            <span>
              ↪ Move <b>{isPet ? 'pet' : 'sim'}</b> to another household
            </span>
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
                suggestedName={n.sur}
                onMove={onMove}
                {...(movableHome
                  ? {
                      home: {
                        hh: n.hh,
                        world: n.world,
                        others: nodes.filter((x) => x.gid === n.gid && x.id !== n.id).length,
                      },
                      who: n.first || 'this sim',
                      onMoveHousehold,
                    }
                  : {})}
              />
            </div>
          )}
          {movableHome && (
            <button
              type="button"
              className="movebtn movebtn--key"
              title={`Move the ${n.hh} household to another world`}
              aria-expanded={worldOpen}
              aria-controls="edWorld"
              onClick={() => setWorldOpen(!worldOpen)}
            >
              <span>
                ↪ Move <b>household</b> to another world
              </span>
            </button>
          )}
          {movableHome && worldOpen && (
            <div id="edWorld">
              <WorldMoveForm
                idPrefix="edWorld"
                group={{ gid: n.gid, hh: n.hh, world: n.world }}
                worlds={worlds}
                groups={groups}
                nodes={nodes}
                onMove={onMoveHousehold}
              />
            </div>
          )}
          {n.hh && !isUnhousedGid(n.gid) && (
            <button type="button" className="edlink edlink--plan" onClick={onOpenPlan}>
              See the {n.hh} household’s plan
            </button>
          )}
          {onStory && (
            <button type="button" className="edlink edlink--plan" onClick={onStory}>
              📖 {n.first || cardName(n)}’s story
            </button>
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
                    <ul className="simcards">
                      {linkChoices.map(({ sim: x, likely }) => (
                        <li key={x.id}>
                          <button type="button" className={simCardClass(x)} onClick={() => onLinkPlanned(x.id)}>
                            <SimCard sim={x} dynasties={names} risks={risks} extra={likely ? ['likely'] : []} />
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

        {isPet && (
          <div role="tabpanel" id="edPanel-family" aria-labelledby="edTab-family" hidden={tab !== 'family'}>
            <PetFamily
              pet={n}
              nodes={nodes}
              edges={edges}
              onLinkParent={(p) => onLinkParent(p, n.id)}
              onDeleteLink={onDeleteLink}
              onPlanYoung={onPlanYoung}
            />
          </div>
        )}
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
            {links.length > 0 && (
              <section aria-labelledby="edLinksHead">
                <div className="edlabel">
                  <span className="edlabel__text" id="edLinksHead">
                    Links
                  </span>
                </div>
                <ul className="edlinks">
                  {links.map((l) => (
                    <li key={l.id} className={l.ended ? 'edlinks__row--ended' : undefined}>
                      <span className="edlinks__text">
                        {l.text}
                        {l.planned && <span className="edlinks__tag">planned</span>}
                      </span>
                      <button
                        type="button"
                        className={l.removal === 'remove' ? 'edlinks__go' : 'edlinks__go edlinks__go--end'}
                        aria-label={`${removalLabel(l.removal)}: ${l.text}`}
                        title={
                          l.removal === 'remove'
                            ? 'Take this link off the board. Undo takes it back.'
                            : 'The game has this couple, so this plans its end. Use it again to take the link off.'
                        }
                        onClick={() => onDeleteLink(l.id)}
                      >
                        {removalLabel(l.removal)}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <div className="edlabel">
              <label htmlFor="edDynastyPick">Dynasty</label>
              {renamable && (
                <button
                  type="button"
                  className="edlink edlabel__action"
                  aria-expanded={renameOpen}
                  aria-controls="edDynastyRename"
                  onClick={() => {
                    setRenameTo(renamable);
                    setRenameOpen(!renameOpen);
                  }}
                >
                  Rename
                </button>
              )}
            </div>
            {/* Create leads, as "Create a new household…" leads the household
                list; typing a name no dynasty has offers to create it. */}
            <SearchSelect
              id="edDynastyPick"
              value={dynastyChoice}
              display={dynastyDisplay}
              groups={dynastyGroups}
              searchLabel="Search dynasties"
              create={{
                value: NEW_DYNASTY,
                label: (q, taken) =>
                  taken
                    ? `➕ Start a separate “${titleCase(q)}” dynasty`
                    : q
                      ? `➕ Create the “${titleCase(q)}” dynasty`
                      : '➕ Create a new dynasty…',
                taken: (q) => dynastiesNamed(nodes, q).length > 0,
                takenMeta: 'One by this name is listed above: pick it to join it.',
              }}
              onChange={(v, q) => {
                setDynastyChoice(v);
                setRenameOpen(false);
                if (v === NEW_DYNASTY && q) setNewDynasty(titleCase(q));
              }}
              emptyText={(q) => `No dynasty on the board matches “${q}”.`}
              describedBy="edDynastyHint"
              onOpenChange={setDynastyMenuOpen}
            />
            {/* Applied at once, not on Save: it changes every member's card. */}
            {renameOpen && renamable && (
              <div id="edDynastyRename" className="edrename">
                <label htmlFor="edDynastyRenameTo">
                  New name for the {dynastyPhrase(names.get(dynastyChoice) ?? { name: renamable })}
                </label>
                <input
                  id="edDynastyRenameTo"
                  value={renameTo}
                  autoFocus
                  autoComplete="off"
                  spellCheck={false}
                  aria-describedby="edDynastyRenameHint"
                  onChange={(e) => setRenameTo(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                      e.preventDefault();
                      doRename();
                    } else if (e.key === 'Escape') {
                      // Closes the form only, not the editor.
                      e.stopPropagation();
                      setRenameOpen(false);
                    }
                  }}
                />
                <div
                  id="edDynastyRenameHint"
                  className={renameTwins.length ? 'edhint edhint--warn' : 'edhint'}
                  role="status"
                >
                  {renameTwins.length
                    ? `There’s already a ${takenName} dynasty. You can still use the name: to tell them apart, this one will show as ${renameAs}.`
                    : `Renames it on ${renameCount === 1 ? 'its 1 sim' : `all ${renameCount} of its sims`} right away. Use the name it will have in the game, so a save can match it.`}
                </div>
                <div className="edrename__actions">
                  <button type="button" className="movego" disabled={!canRename} onClick={doRename}>
                    Rename
                  </button>
                  <button type="button" className="edlink" onClick={() => setRenameOpen(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
            {dynastyChoice === NEW_DYNASTY && (
              <>
                <label htmlFor="edDynastyNew">Name of the new dynasty</label>
                <input
                  id="edDynastyNew"
                  value={newDynasty}
                  autoComplete="off"
                  aria-describedby={newTwins.length ? 'edDynastyTwin' : undefined}
                  onChange={(e) => setNewDynasty(e.target.value)}
                />
                {/* Warned, not blocked: unrelated families share names in the game too. */}
                {newTwins.length > 0 && target && (
                  <div id="edDynastyTwin" className="edtwin" role="status">
                    <p>
                      {(() => {
                        if (newTwins.length > 1) return `There are already ${newTwins.length} ${target.dynasty} dynasties.`;
                        const row = dynastyRows.get(newTwins[0]!);
                        const c = row?.members.length ?? 0;
                        const head = row?.head && byId[row.head.id] ? cardName(byId[row.head.id]!) : '';
                        return `There’s already a ${row?.name ?? target.dynasty} dynasty: ${c} ${c === 1 ? 'sim' : 'sims'}, ${head ? `headed by ${head}` : 'no head yet'}.`;
                      })()}{' '}
                      Saving starts a separate one, shown as{' '}
                      <b>{dynastyLabelText(previewNames.get(target.key) ?? { name: target.dynasty })}</b> so you can tell
                      them apart.
                    </p>
                    <div className="edtwin__actions">
                      {newTwins.map((k) => (
                        <button key={k} type="button" className="edlink" onClick={() => setDynastyChoice(k)}>
                          Join {dynastyLabelText(previewNames.get(k) ?? { name: target.dynasty })} instead
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
            {target && (
              <>
                <label htmlFor="edDynasty">Role in the dynasty</label>
                <select
                  id="edDynasty"
                  value={after ? `after:${after}` : dynastyRole}
                  aria-describedby="edDynastyHint"
                  onChange={(e) => {
                    const v = e.target.value;
                    // "after:<id>": heir once that sim is head, with no role till then.
                    if (v.startsWith('after:')) {
                      setDynastyRole('');
                      setHeirAfter(v.slice('after:'.length));
                    } else {
                      setDynastyRole(v as DynastyRole | '');
                      setHeirAfter('');
                    }
                  }}
                >
                  <option value="">Member, no role</option>
                  {(['head', 'heir'] as const).map((r) => (
                    <option key={r} value={r}>
                      {DYNASTY_ROLES[r].mark} {DYNASTY_ROLES[r].noun}
                    </option>
                  ))}
                  {[...afterChoices, ...(after && !afterChoices.includes(after) ? [after] : [])].map((id) => (
                    <option key={id} value={`after:${id}`}>
                      {DYNASTY_ROLES.heir.mark} Heir after {lineName(id)}
                    </option>
                  ))}
                  <option value="outcast">
                    {DYNASTY_ROLES.outcast.mark} {DYNASTY_ROLES.outcast.noun}
                  </option>
                </select>
              </>
            )}
            {dynastyHint() && (
              <div id="edDynastyHint" className={roleHolder?.dynastyPlan || afterHolder ? 'edhint edhint--warn' : 'edhint'}>
                {dynastyHint()}
              </div>
            )}
            {succession.length > 0 && (
              <>
                <div className="edlabel">
                  <span className="edlabel__text" id="edLineLabel">
                    Line of succession
                  </span>
                </div>
                <ol className="ro edline" aria-labelledby="edLineLabel">
                  {succession.map((p, i) => {
                    const prev = succession[i - 1];
                    const what =
                      p.place === 'head'
                        ? 'Head'
                        : p.place === 'heir'
                          ? 'Heir'
                          : `Heir after ${prev ? byId[prev.id]?.first.trim() || lineName(prev.id) : ''}`;
                    return (
                      <li
                        key={p.id}
                        className={p.id === n.id ? 'edline__row edline__row--me' : 'edline__row'}
                        aria-current={p.id === n.id ? 'true' : undefined}
                        title={p.planned ? 'Planned: not in your save yet' : undefined}
                      >
                        <span className={p.planned ? 'edline__mark edline__mark--planned' : 'edline__mark'} aria-hidden>
                          {DYNASTY_ROLES[p.place === 'head' ? 'head' : 'heir'].mark}
                        </span>
                        <span className="edline__name">
                          {p.id !== n.id ? lineName(p.id) : first.trim() ? `${first.trim()} ${sur.trim()}` : cardName(n)}
                        </span>
                        <span className="edline__what">
                          {what}
                          {p.planned && <span className="sr-only"> (planned)</span>}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              </>
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
                    const t = generationText(g, dynastyLabelText(names.get(g.key) ?? { name: g.dynasty }));
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
            {!gen && familyGen && (
              <>
                <div className="edlabel">
                  <span className="edlabel__text">Generation</span>
                  <TipButton
                    open={!!tips.gen}
                    onToggle={() => toggleTip('gen')}
                    controls="edGenFamilyHint"
                    about="how generations are counted"
                  />
                </div>
                <div className="ro edgen" id="edGen">
                  Gen {familyGen.gen}
                  {familyGen.gen > 1 ? ` from ${nameOf(familyGen.rootId)}` : ''}
                  {familyGen.planned && <span className="edgen__planned"> · through a planned link</span>}
                </div>
                <div id="edGenFamilyHint" className="edhint" hidden={!tips.gen}>
                  {familyGen.gen > 1
                    ? `Gen 1 is ${nameOf(familyGen.rootId)}, their oldest known ancestor on the board. `
                    : 'Gen 1: the board knows none of their parents. '}
                  Each child is one more, counting the deceased and family-tree relatives. In a dynasty, the count
                  follows the dynasty’s first head instead, and you can pick its Gen 1.
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
            {/* For someone you have in mind: the list and the Age menu's
                counts narrow to the names that match. */}
            <input
              id="edPartnerFind"
              type="search"
              className="edfind"
              value={partnerQuery}
              placeholder="Find by name"
              aria-label="Find a possible partner by name"
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => setPartnerQuery(e.target.value)}
              onKeyDown={(e) => {
                // Esc clears the search first, then closes the editor.
                if (e.key === 'Escape' && partnerQuery) {
                  e.stopPropagation();
                  setPartnerQuery('');
                }
              }}
            />
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
            {stagePartners.length > 0 && (
              <div id="edPartnersOrder" className="edorder">
                Closest in age first, older or younger; then A to Z
              </div>
            )}
            {stagePartners.length ? (
              <ul className="simcards" aria-labelledby="edPartnersLabel" aria-describedby="edPartnersOrder">
                {shownPartners.map((c) => {
                  const p = byId[c.id];
                  if (!p) return null;
                  return (
                    <li key={c.id}>
                      <button type="button" className={simCardClass(p)} onClick={() => onPickPartner(c.id)}>
                        <SimCard sim={p} candidate={c} dynasties={names} risks={risks} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="edhint">
                {partnerQ
                  ? `No possible partner matches “${partnerQuery.trim()}”${partnerGender || housedOnly ? ' with these filters' : ''}. Blood relatives and married sims aren’t suggested.`
                  : STAGE_PLURAL[partnerStage]
                    ? `No ${partnerGender ? `${partnerGender.toLowerCase()} ` : ''}${STAGE_PLURAL[partnerStage]!.toLowerCase()}${housedOnly ? ' with a home' : ''} on the board fit.`
                    : 'No one on the board fits.'}
              </div>
            )}
            {!partnerQ && stagePartners.length > PARTNERS_SHOWN && (
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
        <button
          type="button"
          className="edsave"
          disabled={surMissing}
          title={surMissing ? 'Enter a last name to save' : undefined}
          onClick={save}
        >
          Save
        </button>
        <button
          type="button"
          className="eddelete"
          title={`${n.saveSimId || n.treeId || n.fromSave ? 'They’re in your save, so uploading your save again brings them back. ' : ''}Undo takes it back.`}
          onClick={onDelete}
        >
          <Trash aria-hidden="true" />
          Delete {cardName(n)} from the board
        </button>
      </div>
    </div>
  );
}
