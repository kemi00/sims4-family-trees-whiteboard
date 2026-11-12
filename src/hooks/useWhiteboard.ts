import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { growHousehold, landMovedCards } from '../lib/landing.ts';
import { linkStep, named } from '../lib/undoNames.ts';
import seedData from '../data/whiteboard.json';
import { ADDED_HOUSEHOLD, AGES_H, CARD_MIN_W, DECEASED_STATE, DYNASTY_ROLES, FOCUS_SIM_K, NOT_IN_WORLD, STATUS_FLASH_MS, UEDIT, ZOOM_MIN } from '../lib/constants.ts';
import { freeLotsIn, householdLots, lotPick, type GameLot } from '../lib/places.ts';
import { placeLotBoxes } from '../lib/lotBoxes.ts';
import { idsForMultiSel } from '../lib/marquee.ts';
import { recapHasNews, saveRecap, type SaveRecap } from '../lib/saveRecap.ts';
import { chronicleEntry, mergeChronicles, withEntry, type ChronicleEntry } from '../lib/chronicle.ts';
import { pastEdges, pastView } from '../lib/lookBack.ts';
import {
  AUTOSAVE_DEBOUNCE_MS,
  AUTOSAVE_KEY,
  boardContentMatchesBuiltIn,
  boardMatchesBuiltIn,
  bootWhiteboardData,
  buildPersistPayload,
  createDraftGuard,
  toCore,
  type DraftGuard,
} from '../lib/autosave.ts';
import { trackAction } from '../lib/analytics.ts';
import { jsonLoadTargets, pinCoreToTargets, prepareLoadedBoard, realmMovedText, saveImportCore, separateLoadOverlaps, shouldRepackOffsets, withReadableHouseholdNames } from '../lib/loadLayout.ts';
import { fileFilters, filterChangeNote, loadJsonRisk, type BoardFilters, type LoadJsonRisk } from '../lib/loadJsonRisk.ts';
import { mergeJsonIntoBoard } from '../lib/mergeJson.ts';
import { isUnhousedGid } from '../lib/unhoused.ts';
import { gameHomes, householdPlans, householdsNotInGame, planTallies } from '../lib/householdPlan.ts';
import { movesDoneBySave,
  NEW_HOUSEHOLD,
  householdMovePlan,
  movesHousehold,
  movesInGame,
  householdSurnames,
  moveDestination,
  type MoveDestination,
} from '../lib/householdMove.ts';
import {
  GENDER_NOT_KNOWN,
  NOT_YET_AGE,
  cardName,
  isPlannedSim,
  linkPlannedSim,
  moveToUndo,
  offPlanMarks,
  planConflicts,
  numberPlannedSims,
  markHandSetRoles,
  resolvePlanConflict,
  shortName,
  unlinkPlannedSim,
  type PlanChoice,
} from '../lib/plan.ts';
import { planNote, planReview, type PlanChoices, type SavePlanReview } from '../lib/planReview.ts';
import {
  bbox,
  cardOriginAtViewportCenter,
  coreOffsetsAfterWorldSeparation,
  introducedWorldNames,
  dominantWorldInViewport,
  snapHouseholdDelta,
  snapPosition,
  zoomFloor,
  zoomViewportAt,
  type SnapSticky,
} from '../lib/geometry.ts';
import { bucketNodes } from '../lib/nodeIndex.ts';
import {
  bloodVerts,
  computeEdgeRenderData,
  EMPTY_EDGE_DATA,
  hopD,
  RouteCache,
} from '../lib/routing.ts';
import {
  computeLayout,
  householdAddSpot,
  petAddSpot,
  laneStrip,
  partnerSpot,
  layoutBases,
  measureCard,
  OTHER_WORLD,
  packingKey,
  rowPitch,
  spawnChildOrigin,
  lotsBaseKey,
} from '../lib/layout.ts';
import { householdChrome, snapNodesToTiles, tileSnapOrigin } from '../lib/tiles.ts';
import { holdUntouchedCards } from '../lib/holdLayout.ts';
import { lineageIds } from '../lib/bloodline.ts';
import { hasNoHome } from '../lib/partners.ts';
import { whyNotAdopt } from '../lib/adoption.ts';
import {
  buildConnectionLog,
  householdAgeUpLine,
  householdPlace,
  partsToText,
  type ConnectionLogEntry,
} from '../lib/connectionLog.ts';
import { aKind, newPetFields, petKindsAvailable, petPack, youngWord } from '../lib/pets.ts';
import { cleanNote, edgeSourceOf, fileStamp, isUserE, migrateWhiteboardData, nextEidc, ageUpPatch, isLaterSimAge, parentLinkMakesCycle, partneredIdSet, parentIdSet, randomNewSimGender, sanitizeEdges, siblingsShareParents, theHousehold, uKey, worldColor } from '../lib/utils.ts';
import { parseSaveGame, type ParsedSave } from '../lib/savegame/parseSave.ts';
import {
  fillMissingSavePacks,
  hiddenPacksAfterImport,
  isStarterBoard,
  isUntouchedStarter,
  mergeSaveIntoBoard,
  seedNameKeysFromNodes,
  type SaveMergeResult,
} from '../lib/savegame/mergeSave.ts';
import type {
  BoardMultiSel,
  ConnectChoice,
  ConnSrc,
  DeceasedMark,
  Edge,
  Group,
  HouseholdAgeUp,
  HouseholdMove,
  PairStatus,
  SaveGameInfo,
  Selection,
  ShowToggles,
  SimAgeUp,
  SimNode,
  Viewport,
  WhiteboardData,
  World,
} from '../types/whiteboard.ts';
import {
  dynastyGenerations,
  dynastyKey,
  dynastyNames,
  dynastyPhrase,
  familyGenerations,
  setGenRoot,
  type DynastyName,
} from '../lib/generations.ts';
import { dynastyIndex, removePlannedDynasty, renamePlannedDynasty, type DynastyRisk } from '../lib/dynastyMenu.ts';
import { worldTotals } from '../lib/worldTag.ts';
import { indexPairStatus, mergePairStatus } from '../lib/pairStatus.ts';
import { withoutSecretLinks, withoutSecretStatus } from '../lib/secrets.ts';
import { familyOf, linksInView, type FamilyScope, type LinksView } from '../lib/family.ts';

const INITIAL_VIEW: Viewport = { tx: 40, ty: 40, k: 0.72 };

/** localStorage key: the family highlight's last scope, close or extended. */
const FAMILY_SCOPE_KEY = 'sims4-family-trees:family-scope:v1';

/** The couple links the partner menu makes. */
export type PartnerChoice = 'marriage' | 'romance' | 'secretromance' | 'divorced';
export const PARTNER_CHOICES: readonly PartnerChoice[] = ['marriage', 'romance', 'secretromance', 'divorced'];

/** The partner menu: whose, the side clicked, where it opens, the link, and a partner picked by name. */
export type PartnerMenuState = {
  id: string;
  side: 'left' | 'right';
  x: number;
  y: number;
  choice: PartnerChoice;
  /** Picked by name and linked: the menu now asks about one household. */
  picked?: string;
};

/**
 * The menu from a ＋: a new sim (a planned baby), or an existing sim to
 * adopt; then, adopted and living apart, whether they move in. From a
 * card's foot `parents` is that sim; from under a couple's badge, both,
 * with the badge's spot (`couple`) for a new baby.
 */
export type ChildMenuState = {
  parents: string[];
  couple?: { rx: number; ry: number };
  x: number;
  y: number;
  step: 'choose' | 'adopt' | 'move';
  /** The sim just adopted, asked about moving in. */
  picked?: string;
};

/** The status line while the partner menu is open starts so. */
const PARTNER_HINT = 'Partner for ';

/** Where this browser remembers the partner menu's last link. */
const PARTNER_CHOICE_KEY = 'partner-link';

function readPartnerChoice(): PartnerChoice {
  try {
    const v = localStorage.getItem(PARTNER_CHOICE_KEY);
    return (PARTNER_CHOICES as readonly string[]).includes(v ?? '') ? (v as PartnerChoice) : 'marriage';
  } catch {
    return 'marriage';
  }
}

/**
 * The link each connect choice adds, from the first sim clicked to the
 * second (flip: the other way). Co-parents pick a child next; a divorce or
 * breakup is planned on the couple's link (setEnding), not added.
 */
const CONNECT_LINKS: Record<
  Exclude<ConnectChoice, 'coparents' | 'divorce' | 'breakup'>,
  { type: Edge['type']; flip?: true; secret?: true; adopted?: true }
> = {
  marriage: { type: 'marriage' },
  romance: { type: 'romance' },
  secretromance: { type: 'romance', secret: true },
  divorced: { type: 'divorced' },
  parent: { type: 'parent' },
  secretparent: { type: 'parent', secret: true },
  childof: { type: 'parent', flip: true },
  secretchildof: { type: 'parent', flip: true, secret: true },
  adoptive: { type: 'parent', adopted: true },
  adoptedby: { type: 'parent', flip: true, adopted: true },
  sibling: { type: 'sibling' },
  custom: { type: 'custom' },
};

/**
 * The status line's note on where new cards went, when not where the family
 * puts them: the nearest free spot, which the view glides to when it is off
 * screen, or, with none near, over other cards. Nothing else ever moves for
 * them. Empty when they took the family's spot.
 */
function placeNote(r: { outOfView: boolean; crowded: boolean; atSpot?: boolean }, many = false): string {
  const it = many ? 'them' : 'it';
  if (r.crowded) return ` There was no free spot near, so ${many ? 'they sit' : 'it sits'} over other cards: drag ${it} where you like.`;
  if (r.outOfView) return ` There was no free spot on screen, so the view moved to the nearest one: drag ${it} where you like.`;
  if (r.atSpot === false) return ` ${many ? 'They went' : 'It went'} to the nearest free spot, nothing else moving: drag ${it} where you like.`;
  return '';
}

/**
 * The last names a couple's baby can take: each parent's, once, in their
 * order. One when they share it (or only one has one).
 */
function coupleSurnames(a: SimNode, b: SimNode): string[] {
  const out: string[] = [];
  for (const sur of [a.sur.trim(), b.sur.trim()]) {
    if (sur && !out.some((s) => s.toLocaleLowerCase() === sur.toLocaleLowerCase())) out.push(sur);
  }
  return out;
}

/** A dynasty as steps and the status line say it, its name marked. */
function dynastyCalled(d: DynastyName): string {
  return named(d.name) + dynastyPhrase(d).slice(d.name.length);
}

function simCentroid(
  ids: string[],
  byid: Record<string, SimNode>,
): { ids: string[]; x: number; y: number } | null {
  const pts = ids
    .map((id) => byid[id])
    .filter((n): n is SimNode => !!n);
  if (!pts.length) return null;
  return {
    ids: pts.map((n) => n.id),
    x: pts.reduce((s, n) => s + n.x + n.w / 2, 0) / pts.length,
    y: pts.reduce((s, n) => s + n.y + n.h / 2, 0) / pts.length,
  };
}

const LINKS_STATUS: Record<LinksView, string> = {
  all: 'Family links: all — parent, sibling, and partner lines',
  inside: 'Family links: only inside households — lines between households hide',
  none: 'Family links: hidden — cards stay, relationship lines hide',
};

const LAYER_STATUS: Record<keyof ShowToggles, { on: string; off: string }> = {
  groups: {
    on: 'Household boxes on — dashed boxes around each house',
    off: 'Household boxes off — house outlines hide',
  },
  worlds: {
    on: 'World boxes on — coloured frames around each world',
    off: 'World boxes off — world frames hide',
  },
};

type BoardSnap = {
  /** What the step did, as Undo names it: "Add a sim to Gooseman". */
  what: string;
  nodesCore: SimNode[];
  edges: Edge[];
  groups: Group[];
  householdMoves: HouseholdMove[];
  householdAgeUps: HouseholdAgeUp[];
  deceasedMarks: DeceasedMark[];
  simAgeUps: SimAgeUp[];
  pairStatus: PairStatus[];
  saveGame: SaveGameInfo | null;
  /** The board's story: a save merge adds to it, and its undo takes that back. */
  chronicle: ChronicleEntry[];
  /** Set only by actions that change filters, so only their undo restores them. */
  filters?: BoardFilters;
};

/**
 * What the new-baby menu asks a couple: where the baby lives when they live
 * apart (`homes`, more than one), and which last name when theirs differ
 * (`surnames`, more than one). `surFor` is the last name in each household
 * when there is no last name to ask.
 */
export type InfantChoices = {
  title: string;
  homes: { gid: string; title: string; sub: string }[];
  surnames: { sur: string; sub: string }[];
  surFor: Record<string, string>;
};

/** A bounding box [x0, y0, x1, y1] grown to take in Free lots boxes. */
function withLots(
  box: [number, number, number, number] | null,
  lots: readonly { l: number; t: number; r: number; b: number }[],
): [number, number, number, number] {
  let [x0, y0, x1, y1] = box ?? [Infinity, Infinity, -Infinity, -Infinity];
  for (const b of lots) {
    x0 = Math.min(x0, b.l);
    y0 = Math.min(y0, b.t);
    x1 = Math.max(x1, b.r);
    y1 = Math.max(y1, b.b);
  }
  return x0 <= x1 ? [x0, y0, x1, y1] : [0, 0, 0, 0];
}

export function useWhiteboard() {
  const seed = seedData as WhiteboardData;
  const bootRef = useRef<{
    fromDraft: boolean;
    repacked: boolean;
    realmHouseholds?: number;
    data: WhiteboardData;
    stamp: string | null;
  } | null>(null);
  if (!bootRef.current) {
    const raw = bootWhiteboardData(seed);
    const migrated = migrateWhiteboardData(raw.data);
    const bootWorlds = migrated.worlds ?? seed.worlds;
    const named = withReadableHouseholdNames({
      core: fillMissingSavePacks(migrated.nodes, seed.nodes),
      groups: migrated.groups ?? seed.groups,
      worlds: bootWorlds,
      edges: sanitizeEdges(migrated.edges),
    });
    bootRef.current = {
      fromDraft: raw.fromDraft,
      repacked: raw.repacked,
      realmHouseholds: raw.realmHouseholds ?? 0,
      stamp: raw.stamp,
      data: {
        ...migrated,
        nodes: named.core,
        groups: named.groups,
        worlds: bootWorlds,
      },
    };
  }
  const boot = bootRef.current.data;
  const bootRepacked = bootRef.current.repacked;
  const bootRealm = bootRef.current.realmHouseholds ?? 0;
  const bootFromDraft = bootRef.current.fromDraft;
  const [sourceFileName, setSourceFileName] = useState<string | null>(
    () => boot.sourceFileName ?? null,
  );
  /** True when the session started from (or still represents) a browser draft without a file name. */
  const [fromBrowserDraft, setFromBrowserDraft] = useState(bootFromDraft);
  /** Every write to the shared browser draft goes through this (see createDraftGuard). */
  const draftGuardRef = useRef<DraftGuard | null>(null);
  if (!draftGuardRef.current) {
    const tab = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
    draftGuardRef.current = createDraftGuard(tab, bootRef.current.stamp);
  }
  /** Another tab saved the board since this one loaded it, so this tab stopped saving. */
  const [staleTab, setStaleTab] = useState(false);
  const [nodesCore, setNodesCore] = useState<SimNode[]>(() =>
    boot.nodes.map((n) => toCore(n)),
  );
  const [edges, setEdges] = useState<Edge[]>(() =>
    sanitizeEdges(
      boot.edges.map((e) => ({
        ...e,
        source: e.source ?? (String(e.id).charAt(0) === 'u' ? 'planned' : 'seed'),
      })),
    ),
  );
  const [groups, setGroups] = useState<Group[]>(() =>
    (boot.groups ?? seed.groups).map((g) => ({ ...g })),
  );
  const [worlds] = useState<World[]>(seed.worlds);
  const [hiddenPacks, setHiddenPacks] = useState<Set<string>>(
    () => new Set(boot.hiddenPacks || []),
  );
  const [hiddenPlay, setHiddenPlay] = useState<Set<string>>(
    () => new Set(boot.hiddenPlay || []),
  );
  /** Pets you can add: those whose pack isn't switched off in Games. */
  const petKinds = useMemo(() => petKindsAvailable(hiddenPacks), [hiddenPacks]);
  const [show, setShow] = useState<ShowToggles>({
    groups: true,
    worlds: true,
  });
  const [linksView, setLinksViewState] = useState<LinksView>('all');
  /** Highlight the selected sim's family (familyOf), whoever is selected. */
  const [familyFocus, setFamilyFocusState] = useState(false);
  /** Close or extended family; this viewer's last pick, kept across visits. */
  const [familyScope, setFamilyScopeState] = useState<FamilyScope>(() => {
    try {
      return localStorage.getItem(FAMILY_SCOPE_KEY) === 'extended' ? 'extended' : 'close';
    } catch {
      return 'close';
    }
  });
  const setFamilyScope = useCallback((scope: FamilyScope) => {
    setFamilyScopeState(scope);
    trackAction(`/action/family/${scope}`);
    try {
      localStorage.setItem(FAMILY_SCOPE_KEY, scope);
    } catch {
      // No storage: the pick lasts until the page reloads.
    }
  }, []);
  const [viewport, setViewport] = useState<Viewport>(INITIAL_VIEW);
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;
  /**
   * A pan after an edit, in screen pixels, for the stage to make: it glides
   * a long one (GLIDE_MIN) so you see where the cards went. `n` tells two
   * equal pans apart.
   */
  const [viewShift, setViewShift] = useState<{ dx: number; dy: number; n: number } | null>(null);
  const [sel, setSel] = useState<Selection>(null);
  const [connectMode, setConnectModeState] = useState(false);
  const [selectMode, setSelectModeState] = useState(false);
  const [multiSel, setMultiSel] = useState<BoardMultiSel | null>(null);
  const [connSrc, setConnSrc] = useState<ConnSrc>(null);
  const [snap, setSnap] = useState(true);
  const [hiAges, setHiAges] = useState<Set<string>>(
    () => new Set(boot.hiAges || []),
  );
  const [hiSingle, setHiSingle] = useState(() => !!boot.hiSingle);
  /** Hide secrets filter: secret lovers and secret parents stay off the board. */
  const [hideSecrets, setHideSecrets] = useState(() => !!boot.hideSecrets);
  const [hideDeceased, setHideDeceased] = useState(() => !!boot.hideDeceased);
  const [bloodlineId, setBloodlineId] = useState<string | null>(() => {
    if (boot.bloodlineId && boot.nodes.some((n) => n.id === boot.bloodlineId)) {
      return boot.bloodlineId;
    }
    return null;
  });
  const [status, setStatus] = useState('');
  const [fastRoute, setFastRoute] = useState(false);
  const [skipRoute, setSkipRoute] = useState(false);
  const [editNodeId, setEditNodeId] = useState<string | null>(null);
  /** The household whose plan is open (HouseholdBrief), and the sims a hovered line of it lights up. */
  const [briefGid, setBriefGidState] = useState<string | null>(null);
  const [briefHover, setBriefHover] = useState<Set<string> | null>(null);
  const setBriefGid = useCallback((gid: string | null) => {
    setBriefGidState(gid);
    setBriefHover(null);
  }, []);
  /** The Filters panel; Games, Play and Highlight open as views inside it. */
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [gamesOpen, setGamesOpen] = useState(false);
  const [agesOpen, setAgesOpen] = useState(false);
  const [playOpen, setPlayOpen] = useState(false);
  const [connectMenu, setConnectMenu] = useState<{
    a: string;
    b: string;
    x: number;
    y: number;
  } | null>(null);
  /**
   * The partner menu, opened from a ♥ on a card's side: the sim, the side
   * clicked (where a partner who moves in lands), and where it opens.
   */
  const [partnerMenu, setPartnerMenu] = useState<PartnerMenuState | null>(null);
  const [childMenu, setChildMenu] = useState<ChildMenuState | null>(null);
  /** What to add, a sim or a pet: from the toolbar's Add, or a household's ＋ (`gid`). In stage pixels. */
  const [addMenu, setAddMenu] = useState<{ gid?: string; x: number; y: number } | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  /** Up next is open, and the households skipped in it until the next save import. */
  const [upNextOpen, setUpNextOpen] = useState(false);
  /** The Dynasties panel: every dynasty and its members. */
  const [dynastiesOpen, setDynastiesOpen] = useState(false);
  const [upNextSkipped, setUpNextSkipped] = useState<ReadonlySet<string>>(() => new Set());
  const [householdMoves, setHouseholdMoves] = useState<HouseholdMove[]>(
    () => boot.householdMoves ?? [],
  );
  const [householdAgeUps, setHouseholdAgeUps] = useState<HouseholdAgeUp[]>(
    () => boot.householdAgeUps ?? [],
  );
  const [deceasedMarks, setDeceasedMarks] = useState<DeceasedMark[]>(
    () => boot.deceasedMarks ?? [],
  );
  const [simAgeUps, setSimAgeUps] = useState<SimAgeUp[]>(
    () => boot.simAgeUps ?? [],
  );
  /** Relationship statuses from the last save import, for link labels. */
  const [pairStatus, setPairStatus] = useState<PairStatus[]>(
    () => boot.pairStatus ?? [],
  );
  /** Game clock and aging options from the last save import. */
  const [saveGame, setSaveGame] = useState<SaveGameInfo | null>(() => boot.saveGame ?? null);
  /** The board's story, one entry per save upload (the chronicle). */
  const [chronicle, setChronicle] = useState<ChronicleEntry[]>(() => boot.chronicle ?? []);
  /** The Chronicle panel, open on the whole story or on one sim's, household's or dynasty's. */
  const [chronicleView, setChronicleView] = useState<{ label: string; ids: string[] | null; dynasties?: string[] } | null>(null);
  /** What the last save upload says happened in the game ("Previously on…"). */
  const [recap, setRecap] = useState<SaveRecap | null>(null);
  const [recapOpen, setRecapOpen] = useState(false);
  /** Cards to sparkle a moment: a planned birth or couple the save just confirmed. */
  const [celebrateIds, setCelebrateIds] = useState<ReadonlySet<string>>(() => new Set());
  const celebrateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pairIndex = useMemo(
    () => indexPairStatus(hideSecrets ? withoutSecretStatus(pairStatus) : pairStatus),
    [pairStatus, hideSecrets],
  );
  const [saveImport, setSaveImport] = useState<{
    merge: SaveMergeResult;
    parsed: ParsedSave;
    /** The board is still the starter roster: its premade sims aren't the player's. */
    starter: boolean;
    /** Nothing on it is the player's yet (no edit, plan or move), so Replace is picked. */
    untouched: boolean;
    /** Nothing on it is arranged yet, so a Merge lays it out afresh too. */
    fresh: boolean;
    /** Your plan against this save, for the import's review step. */
    plan: SavePlanReview;
  } | null>(null);
  const [pendingLoadJson, setPendingLoadJson] = useState<{
    file: File;
    /** Read once up front, so confirming does not re-read the file. */
    text: string;
    svgWidth: number;
    svgHeight: number;
    risk: LoadJsonRisk;
    /** File is too old to restore card placements; the board gets re-packed. */
    willRepack: boolean;
    /** How merging would change the filters on screen; null when it would not. */
    filtersNote: string | null;
  } | null>(null);
  const [infantHouseMenu, setInfantHouseMenu] = useState<{
    pa: string;
    pb: string;
    rx: number;
    ry: number;
    x: number;
    y: number;
  } | null>(null);
  const eidcRef = useRef(
    nextEidc(
      boot.edges,
      100000,
      [
        ...(boot.householdMoves ?? []).map((m) => m.id),
        ...(boot.householdAgeUps ?? []).map((a) => a.id),
        ...(boot.deceasedMarks ?? []).map((m) => m.id),
        ...(boot.simAgeUps ?? []).map((a) => a.id),
      ],
    ),
  );
  const undoRef = useRef<BoardSnap[]>([]);
  /** What Undo would take back now, or null with nothing to undo. */
  const [undoWhat, setUndoWhat] = useState<string | null>(null);
  const canUndo = undoWhat !== null;
  /** Steps Undo took back, latest last, for Redo; any new step clears them. */
  const redoRef = useRef<BoardSnap[]>([]);
  /** What Redo would put back now, or null with nothing to redo. */
  const [redoWhat, setRedoWhat] = useState<string | null>(null);
  const statusFlashRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectModeRef = useRef(connectMode);
  connectModeRef.current = connectMode;
  const viewAnchorRef = useRef<{
    ids: string[];
    x: number;
    y: number;
  } | null>(null);
  /** The stage's size on screen, less the legend column: the stage sets it. */
  const visibleAreaRef = useRef<(() => { w: number; h: number } | null) | null>(null);
  /** The part of the board on screen, in board units, clear of its edges and the controls along its foot. */
  const viewRect = useCallback(() => {
    const area = visibleAreaRef.current?.();
    if (!area) return null;
    const { k, tx, ty } = viewportRef.current;
    return { l: (40 - tx) / k, t: (40 - ty) / k, r: (area.w - 40 - tx) / k, b: (area.h - 96 - ty) / k };
  }, []);
  /** Glide the view just far enough to show `box` (board units) when it is off screen. */
  const revealBox = useCallback(
    (box: { l: number; t: number; r: number; b: number } | null) => {
      const v = viewRect();
      if (!box || !v) return;
      const dx = box.l < v.l ? v.l - box.l : box.r > v.r ? v.r - box.r : 0;
      const dy = box.t < v.t ? v.t - box.t : box.b > v.b ? v.b - box.b : 0;
      if (!dx && !dy) return;
      const k = viewportRef.current.k;
      setViewShift((s) => ({ dx: dx * k, dy: dy * k, n: (s?.n ?? 0) + 1 }));
    },
    [viewRect],
  );

  /** Positions and card sizes are derived on every render from layout rules. */
  const nodes = useMemo(() => {
    const laid = computeLayout(nodesCore, worlds, edges);
    return snap ? snapNodesToTiles(laid) : laid;
  }, [nodesCore, worlds, edges, snap]);

  const byid = useMemo(() => {
    const m: Record<string, SimNode> = {};
    nodes.forEach((n) => {
      m[n.id] = n;
    });
    return m;
  }, [nodes]);
  /** A sim as an undo step names them: as their card does. */
  const simCalled = useCallback((id: string) => {
    const n = byid[id];
    return n ? named(cardName(n)) : 'a sim';
  }, [byid]);

  const frameSim = useCallback(
    (n: SimNode, svgWidth: number, svgHeight: number) => {
      const k = FOCUS_SIM_K;
      setViewport({
        k,
        tx: svgWidth / 2 - (n.x + n.w / 2) * k,
        ty: svgHeight / 2 - (n.y + n.h / 2) * k,
      });
    },
    [],
  );

  /**
   * The board's promise: a change moves only the cards it is about (see
   * holdUntouchedCards). After every change, the cards it did not touch go
   * back to where they were on screen before it is painted. Changes meant to
   * move everything — Organise, loading or importing a board, Undo and
   * Redo — call `releaseLayout` with their state, so the new places stand.
   */
  const [layoutRelease, setLayoutRelease] = useState(0);
  const releaseLayout = useCallback(() => setLayoutRelease((n) => n + 1), []);
  const shownRef = useRef<{
    core: SimNode[];
    byid: Record<string, SimNode>;
    snap: boolean;
    release: number;
  } | null>(null);
  /** The hold put cards back; what is on screen now is not final yet. */
  const holdingRef = useRef(false);
  useLayoutEffect(() => {
    const was = shownRef.current;
    shownRef.current = { core: nodesCore, byid, snap, release: layoutRelease };
    holdingRef.current = false;
    if (!was || was.snap !== snap || was.release !== layoutRelease) return;
    const r = holdUntouchedCards(
      was.core,
      (id) => was.byid[id],
      nodesCore,
      (id) => byid[id],
    );
    if (!r.held) return;
    holdingRef.current = true;
    setNodesCore(r.core);
  }, [nodesCore, byid, snap, layoutRelease]);

  /**
   * New family links reflow household packing. If cards still shifted after
   * ox/oy pinning, pan so the linked sims stay on screen.
   */
  useLayoutEffect(() => {
    // The hold is putting cards back: pan once they are where they stay.
    if (holdingRef.current) return;
    const lock = viewAnchorRef.current;
    if (!lock) return;
    const next = simCentroid(lock.ids, byid);
    if (!next) {
      viewAnchorRef.current = null;
      return;
    }
    const dx = lock.x - next.x;
    const dy = lock.y - next.y;
    viewAnchorRef.current = null;
    if (dx === 0 && dy === 0) return;
    const k = viewportRef.current.k;
    setViewShift((s) => ({ dx: dx * k, dy: dy * k, n: (s?.n ?? 0) + 1 }));
  }, [byid]);

  const packVis = useCallback(
    (n: SimNode) => !!n && !hiddenPacks.has(n.pack),
    [hiddenPacks],
  );

  const playVis = useCallback(
    (n: SimNode) => !!n && !hiddenPlay.has(n.oplay),
    [hiddenPlay],
  );

  /**
   * Looking back: the chronicle upload whose board is shown (pastView),
   * read only; null for now.
   */
  const [lookBackAt, setLookBackAtState] = useState<number | null>(null);
  const past = useMemo(
    () => (lookBackAt === null ? null : pastView(chronicle, lookBackAt, nodesCore)),
    [lookBackAt, chronicle, nodesCore],
  );

  /** Combined pack, playability and Hide deceased visibility for canvas rendering; looking back, who was there then. */
  const nodeVis = useCallback(
    (n: SimNode) => {
      if (past?.hidden.has(n.id)) return false;
      const dead = n.state === DECEASED_STATE && !past?.alive.has(n.id);
      return packVis(n) && playVis(n) && !(hideDeceased && dead);
    },
    [packVis, playVis, hideDeceased, past],
  );
  /** Look back at chronicle upload `at` (null: back to now); nothing stays picked or open. */
  const setLookBackAt = useCallback((at: number | null) => {
    setLookBackAtState(at);
    if (at === null) return;
    setSel(null);
    setEditNodeId(null);
    setBriefGid(null);
  }, [setBriefGid]);

  /**
   * Links as the board shows them. Hide secrets drops secret ones here, for
   * drawing, labels, the log and bloodline — but layout still uses every
   * link, so turning the filter on or off never moves a card.
   */
  const shownEdges = useMemo(() => {
    const now = hideSecrets ? withoutSecretLinks(edges) : edges;
    // Looking back: the game's links as they were then.
    return past ? pastEdges(now, past) : now;
  }, [edges, hideSecrets, past]);
  const hasSecrets = useMemo(() => edges.some((e) => e.secret), [edges]);

  // Routes from the last pass; an edit re-routes only the links it can reach.
  const familyId =
    familyFocus && sel?.type === 'node' && byid[sel.id] ? sel.id : null;
  const family = useMemo(
    () => (familyId ? familyOf(familyId, shownEdges, familyScope) : null),
    [familyId, shownEdges, familyScope],
  );
  /** The highlighted family, the sim included: everyone else dims. */
  const familyIds = useMemo(
    () => (family ? new Set([family.id, ...family.roles.keys()]) : null),
    [family],
  );
  /** Links drawn in the current view; a highlighted family's always are. */
  const viewEdges = useMemo(
    () => linksInView(shownEdges, (id) => byid[id]?.gid, linksView, family?.edgeIds),
    [shownEdges, byid, linksView, family],
  );

  const [routeCache] = useState(() => new RouteCache());
  const edgeData = useMemo(
    () =>
      skipRoute
        ? EMPTY_EDGE_DATA
        : computeEdgeRenderData({
            nodes,
            edges: viewEdges,
            groups,
            show,
            packVis: nodeVis,
            fastRoute,
            cache: routeCache,
          }),
    [nodes, viewEdges, groups, show, nodeVis, fastRoute, skipRoute, routeCache],
  );

  const nodeBuckets = useMemo(() => bucketNodes(nodes), [nodes]);

  /** The game lot each household lives on (householdLots). */
  const homes = useMemo(() => householdLots(nodesCore), [nodesCore]);
  /**
   * Each world's lots no household lives on, in the board's world order. A
   * world whose sims are all filtered out shows none, as it shows no frame.
   */
  const freeLots = useMemo(() => {
    const shown = new Set<string>();
    const any = new Set<string>();
    for (const n of nodes) {
      any.add(n.world);
      if (nodeVis(n)) shown.add(n.world);
    }
    const out = new Map<string, GameLot[]>();
    for (const w of worlds) {
      if (w.name === NOT_IN_WORLD || (any.has(w.name) && !shown.has(w.name))) continue;
      const free = freeLotsIn(w.name, homes);
      if (free.length) out.set(w.name, free);
    }
    return out;
  }, [nodes, nodeVis, worlds, homes]);
  /** Each world's Free lots box, under its households as they stand. */
  const lotBoxes = useMemo(() => {
    const bases = layoutBases(nodesCore, worlds, edges);
    const packed = new Map<string, { x: number; y: number }>();
    for (const w of freeLots.keys()) {
      const b = bases.get(lotsBaseKey(w));
      if (b) packed.set(w, b);
    }
    return placeLotBoxes({ laid: nodes.filter(nodeVis), groups, free: freeLots, packed });
  }, [nodes, nodeVis, groups, freeLots, nodesCore, worlds, edges]);

  const bloodVertsMemo = useMemo(
    () => bloodVerts(edgeData.blood),
    [edgeData.blood],
  );

  const visibleNodes = useMemo(
    () => nodes.filter(nodeVis),
    [nodes, nodeVis],
  );

  // A world with only lots on the board is live too: there are lots to see.
  const liveWorlds = useMemo(
    () => new Set([...visibleNodes.map((n) => n.world), ...lotBoxes.keys()]),
    [visibleNodes, lotBoxes],
  );
  /** What the world tags add up to, for the Worlds card. */
  const boardTotals = useMemo(() => worldTotals(nodes, nodeVis), [nodes, nodeVis]);

  // The highlight acts as if the deceased weren't there: the widowed are
  // single, and children who died don't count.
  const alive = useCallback((id: string) => byid[id]?.state !== DECEASED_STATE, [byid]);
  const partneredIds = useMemo(() => partneredIdSet(shownEdges, alive), [shownEdges, alive]);
  /** Sims with a living child, for the No children highlight. */
  const parentIds = useMemo(() => parentIdSet(shownEdges, alive), [shownEdges, alive]);

  const connectionLog = useMemo(
    () =>
      buildConnectionLog(
        shownEdges,
        byid,
        householdMoves,
        householdAgeUps,
        deceasedMarks,
        simAgeUps,
      ),
    [shownEdges, byid, householdMoves, householdAgeUps, deceasedMarks, simAgeUps],
  );

  const bloodlineIds = useMemo(
    () => (bloodlineId ? lineageIds(bloodlineId, shownEdges) : null),
    [bloodlineId, shownEdges],
  );

  const flashStatus = useCallback((msg: string) => {
    if (statusFlashRef.current != null) clearTimeout(statusFlashRef.current);
    setStatus(msg);
    statusFlashRef.current = setTimeout(() => {
      statusFlashRef.current = null;
      setStatus((cur) => {
        if (cur !== msg) return cur;
        return connectModeRef.current
          ? 'Connect: click the FIRST sim'
          : '';
      });
    }, STATUS_FLASH_MS);
  }, []);

  useEffect(() => {
    if (bootRepacked) {
      flashStatus('Older save — board re-packed for the current layout. Download JSON to keep it.');
    } else if (bootRealm) {
      flashStatus(realmMovedText(bootRealm));
    }
  }, [bootRepacked, bootRealm, flashStatus]);

  const persistPayload = useCallback(
    () =>
      buildPersistPayload({
        nodesCore,
        edges,
        groups,
        hiddenPacks,
        hiddenPlay,
        hiAges,
        hiSingle,
        hideSecrets,
        hideDeceased,
        bloodlineId,
        householdMoves,
        householdAgeUps,
        deceasedMarks,
        simAgeUps,
        pairStatus,
        saveGame,
        chronicle,
        connectionLog,
        sourceFileName,
      }),
    [
      nodesCore,
      edges,
      groups,
      hiddenPacks,
      hiddenPlay,
      hiAges,
      hiSingle,
      hideSecrets,
      hideDeceased,
      bloodlineId,
      householdMoves,
      householdAgeUps,
      deceasedMarks,
      simAgeUps,
      pairStatus,
      saveGame,
      chronicle,
      connectionLog,
      sourceFileName,
    ],
  );

  const canResetBoard = useMemo(
    () => !boardMatchesBuiltIn(persistPayload(), seed),
    [persistPayload, seed],
  );

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      // A null key is another tab clearing all of storage.
      if (e.key !== null && e.key !== AUTOSAVE_KEY) return;
      if (e.key === null || draftGuardRef.current!.changedElsewhere(e.newValue)) {
        setStaleTab(true);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  /** Skip the immediate post-hydrate write; debounce later board edits. */
  const skipAutosaveRef = useRef(true);
  useEffect(() => {
    if (skipAutosaveRef.current) {
      skipAutosaveRef.current = false;
      return;
    }
    if (staleTab) return;
    const t = setTimeout(() => {
      const guard = draftGuardRef.current!;
      const payload = persistPayload();
      if (boardMatchesBuiltIn(payload, seed)) {
        if (guard.clear()) setFromBrowserDraft(false);
        else setStaleTab(true);
        return;
      }
      const result = guard.write(payload);
      if (result === 'stale') {
        setStaleTab(true);
        return;
      }
      if (result === 'ok') {
        if (!payload.sourceFileName) setFromBrowserDraft(true);
        flashStatus('Autosaved');
      } else if (result === 'quota')
        flashStatus('Autosave full — Download JSON to keep a copy');
      else flashStatus('Autosave failed');
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [persistPayload, flashStatus, seed, staleTab]);

  const reloadBoard = useCallback(() => window.location.reload(), []);

  /**
   * The board as it is now, as one step of history named `what`; with its
   * filters when the step changes them (a board file merged in).
   */
  const boardSnap = useCallback(
    (what: string, filters: boolean): BoardSnap => ({
      what,
      nodesCore: nodesCore.map((n) => ({ ...n })),
      edges: edges.map((e) => ({ ...e })),
      groups: groups.map((g) => ({ ...g })),
      householdMoves: householdMoves.map((m) => ({ ...m })),
      householdAgeUps: householdAgeUps.map((a) => ({ ...a })),
      deceasedMarks: deceasedMarks.map((d) => ({ ...d })),
      simAgeUps: simAgeUps.map((a) => ({ ...a })),
      pairStatus,
      saveGame,
      chronicle,
      filters: filters
        ? {
            hiddenPacks: [...hiddenPacks],
            hiddenPlay: [...hiddenPlay],
            hiAges: [...hiAges],
            hiSingle,
            hideSecrets,
            hideDeceased,
          }
        : undefined,
    }),
    [nodesCore, edges, groups, householdMoves, householdAgeUps, deceasedMarks, simAgeUps, pairStatus, saveGame, chronicle, hiddenPacks, hiddenPlay, hiAges, hiSingle, hideSecrets, hideDeceased],
  );

  /** The board as `snap` kept it; nothing stays picked or open over it. */
  const restoreSnap = useCallback((snap: BoardSnap) => {
    // The board goes back exactly as it was, every card included.
    releaseLayout();
    setNodesCore(snap.nodesCore);
    setEdges(snap.edges);
    setGroups(snap.groups);
    setHouseholdMoves(snap.householdMoves);
    setHouseholdAgeUps(snap.householdAgeUps);
    setDeceasedMarks(snap.deceasedMarks);
    setSimAgeUps(snap.simAgeUps);
    setPairStatus(snap.pairStatus);
    setSaveGame(snap.saveGame);
    setChronicle(snap.chronicle);
    if (snap.filters) {
      setHiddenPacks(new Set(snap.filters.hiddenPacks));
      setHiddenPlay(new Set(snap.filters.hiddenPlay));
      setHiAges(new Set(snap.filters.hiAges));
      setHiSingle(snap.filters.hiSingle);
      setHideSecrets(!!snap.filters.hideSecrets);
      setHideDeceased(!!snap.filters.hideDeceased);
    }
    setSel(null);
    setEditNodeId(null);
    setInfantHouseMenu(null);
  }, [releaseLayout]);

  /**
   * Keeps the board as it is, to come back to with Undo. `what` names the
   * step about to happen, as the person would say it ("Add a sim to
   * Gooseman"): the Undo button's tip and the status line after an undo use
   * it. A new step leaves nothing to redo.
   */
  const pushUndo = useCallback(
    (what: string, opts?: { filters?: boolean }) => {
      undoRef.current.push(boardSnap(what, !!opts?.filters));
      setUndoWhat(what);
      redoRef.current = [];
      setRedoWhat(null);
    },
    [boardSnap],
  );

  /** Takes back the last step; Redo can put it back. */
  const undo = useCallback(() => {
    const prev = undoRef.current.pop();
    if (!prev) return;
    redoRef.current.push(boardSnap(prev.what, !!prev.filters));
    restoreSnap(prev);
    setUndoWhat(undoRef.current.at(-1)?.what ?? null);
    setRedoWhat(prev.what);
    trackAction('/action/undo');
    flashStatus(`Undone: ${prev.what}.`);
  }, [boardSnap, restoreSnap, flashStatus]);

  /** Puts back the last step Undo took back. */
  const redo = useCallback(() => {
    const next = redoRef.current.pop();
    if (!next) return;
    undoRef.current.push(boardSnap(next.what, !!next.filters));
    restoreSnap(next);
    setUndoWhat(next.what);
    setRedoWhat(redoRef.current.at(-1)?.what ?? null);
    trackAction('/action/redo');
    flashStatus(`Redone: ${next.what}.`);
  }, [boardSnap, restoreSnap, flashStatus]);

  const toggleShow = useCallback(
    (key: keyof ShowToggles) => {
      const on = !show[key];
      setShow((s) => ({ ...s, [key]: !s[key] }));
      flashStatus(on ? LAYER_STATUS[key].on : LAYER_STATUS[key].off);
    },
    [show, flashStatus],
  );

  const setLinksView = useCallback(
    (view: LinksView) => {
      setLinksViewState(view);
      trackAction(`/action/links/${view}`);
      flashStatus(LINKS_STATUS[view]);
    },
    [flashStatus],
  );

  const setFamilyFocus = useCallback((on: boolean) => {
    setFamilyFocusState(on);
    if (!on) return;
    // One sim's relatives at a time: a family highlight replaces Bloodline.
    setBloodlineId(null);
    setDynastyFocusState(null);
    trackAction('/action/family');
  }, []);

  /**
   * A dynasty kept lit on the board from the Dynasties panel (its key), its
   * members glowing and everyone else dimmed. One highlight at a time: it
   * replaces a family highlight or Bloodline.
   */
  const [dynastyFocus, setDynastyFocusState] = useState<string | null>(null);
  const setDynastyFocus = useCallback((key: string | null) => {
    setDynastyFocusState(key);
    if (!key) return;
    setFamilyFocusState(false);
    setBloodlineId(null);
    trackAction('/action/dynasty-highlight');
  }, []);
  const dynastyFocusIds = useMemo(() => {
    if (!dynastyFocus) return null;
    const ids = nodesCore.filter((n) => !n.species && dynastyKey(n) === dynastyFocus).map((n) => n.id);
    return ids.length ? new Set(ids) : null;
  }, [dynastyFocus, nodesCore]);
  // A dynasty removed (or left by its last member) lights nothing: let go.
  useEffect(() => {
    if (dynastyFocus && !dynastyFocusIds) setDynastyFocusState(null);
  }, [dynastyFocus, dynastyFocusIds]);

  const setConnectMode = useCallback(
    (on: boolean) => {
      setConnectModeState(on);
      if (on) {
        trackAction('/action/connect');
        setSelectModeState(false);
        setMultiSel(null);
      }
      setConnSrc(null);
      setConnectMenu(null);
      setInfantHouseMenu(null);
      if (on && sel?.type === 'node' && byid[sel.id]) {
        setConnSrc(sel.id);
        setStatus(
          `First sim: ${byid[sel.id]!.first} — now click the SECOND sim; drag the board to reach them (Esc to cancel)`,
        );
      } else {
        setStatus(on ? 'Connect: click the FIRST sim' : '');
      }
    },
    [sel, byid],
  );

  const setSelectMode = useCallback((on: boolean) => {
    setSelectModeState(on);
    if (on) {
      trackAction('/action/select');
      setConnectModeState(false);
      setConnSrc(null);
      setConnectMenu(null);
      setInfantHouseMenu(null);
      setStatus(
        'Select is on: click Sims one by one, or drag a box around Sims, households or worlds. Drag them to move them. Hold Space to move around.',
      );
    } else {
      setStatus('');
    }
  }, []);

  const clearMultiSel = useCallback(() => setMultiSel(null), []);

  const cancelConnect = useCallback(() => {
    setConnSrc(null);
    setConnectMenu(null);
    setInfantHouseMenu(null);
    setStatus(
      connectMode ? 'Connect: click the FIRST sim' : selectMode
        ? 'Select is on: click Sims one by one, or drag a box around Sims, households or worlds. Drag them to move them. Hold Space to move around.'
        : '',
    );
  }, [connectMode, selectMode]);

  const selectNode = useCallback((id: string) => {
    setMultiSel(null);
    setSel({ type: 'node', id });
  }, []);

  const selectLink = useCallback(
    (ids: string[]) => {
      setMultiSel(null);
      setSel({ type: 'link', ids });
      const idSet = new Set(ids.filter(Boolean));
      const hit = edges.find((e) => idSet.has(e.id));
      if (hit) trackAction(`/action/link/${hit.type}`);
    },
    [edges],
  );

  const clearSel = useCallback(() => setSel(null), []);

  const pinCardsToCurrentPlaces = useCallback(
    (nextEdges: Edge[], nextCore: SimNode[] = nodesCore, free?: ReadonlySet<string>) => {
      const bases = layoutBases(nextCore, worlds, nextEdges);
      const next = nextCore.map((n) => {
        // A card that changed box takes its new box's place, not its old one.
        if (free?.has(n.id)) return n;
        const p = byid[n.id];
        const base = bases.get(n.id);
        if (!p || !base) return n;
        const ox = p.x - base.x;
        const oy = p.y - base.y;
        if (ox === (n.ox ?? 0) && oy === (n.oy ?? 0)) return n;
        return { ...n, ox, oy };
      });
      setNodesCore(next);
    },
    [nodesCore, worlds, byid],
  );

  const lockViewToSims = useCallback(
    (ids: string[]) => {
      const lock = simCentroid(ids, byid);
      if (lock) viewAnchorRef.current = lock;
    },
    [byid],
  );

  const freezeAfterEdgeChange = useCallback(
    (focusIds: string[], nextEdges: Edge[], nextCore?: SimNode[]) => {
      pinCardsToCurrentPlaces(nextEdges, nextCore);
      lockViewToSims(focusIds);
    },
    [pinCardsToCurrentPlaces, lockViewToSims],
  );

  /** Why `parent` → `child` can't be linked (they'd be their own ancestor), or null. */
  const parentCycleReason = useCallback(
    (parent: string, child: string) =>
      parentLinkMakesCycle(parent, child, edges)
        ? `${byid[parent]?.first ?? 'That sim'} already descends from ${byid[child]?.first ?? 'that sim'}`
        : null,
    [edges, byid],
  );

  /**
   * `secret`: a secret parent or secret lovers; `adopted`: an adoptive
   * parent. When the same link is already on the board, it is marked so
   * rather than drawn twice.
   */
  const addEdge = useCallback((a: string, b: string, type: Edge['type'], secret = false, adopted = false) => {
    if (type === 'sibling' && siblingsShareParents(a, b, edges)) return;
    pushUndo(linkStep(type, simCalled(a), simCalled(b), { secret, adopted }));
    // Built here from the links as they are, not in a setEdges updater: React
    // may run that only at the next render, leaving the cards unpinned, and a
    // new couple or parent repacks every world around them.
    const same =
      secret || adopted
        ? edges.find(
            (x) =>
              x.type === type &&
              ((x.a === a && x.b === b) || (type !== 'parent' && x.a === b && x.b === a)),
          )
        : undefined;
    const nextEdges: Edge[] = same
      ? edges.map((x) =>
          x === same
            ? { ...x, ...(secret ? { secret: true as const } : {}), ...(adopted ? { adopted: true as const } : {}) }
            : x,
        )
      : sanitizeEdges([
          ...edges,
          {
            id: 'u' + eidcRef.current++,
            a,
            b,
            type,
            source: 'planned',
            createdAt: new Date().toISOString(),
            ...(secret ? { secret: true as const } : {}),
            ...(adopted ? { adopted: true as const } : {}),
          },
        ]);
    setEdges(nextEdges);
    freezeAfterEdgeChange([a, b], nextEdges);
  }, [edges, freezeAfterEdgeChange, pushUndo, simCalled]);

  /**
   * Sims off the board, as one undo step: their cards, their links, and
   * what the board kept about them (moves, deaths, age-ups). A sim from your
   * save comes back with the next save that has them, and the status line
   * says so.
   */
  const deleteSims = useCallback(
    (ids: string[]) => {
      const gone = new Set(ids.filter((id) => byid[id]));
      if (!gone.size) return;
      const [only] = gone;
      pushUndo(gone.size === 1 && only ? `Delete ${simCalled(only)}` : `Delete ${gone.size} sims`);
      trackAction(gone.size === 1 ? '/action/delete' : '/action/delete-sims');
      const nextCore = nodesCore.filter((n) => !gone.has(n.id));
      const nextEdges = edges.filter((e) => !gone.has(e.a) && !gone.has(e.b));
      pinCardsToCurrentPlaces(nextEdges, nextCore);
      setEdges(nextEdges);
      setHouseholdMoves((ms) => ms.filter((m) => !gone.has(m.simId)));
      setDeceasedMarks((ms) => ms.filter((m) => !gone.has(m.simId)));
      setSimAgeUps((ms) => ms.filter((m) => !gone.has(m.simId)));
      if (editNodeId && gone.has(editNodeId)) setEditNodeId(null);
      if (bloodlineId && gone.has(bloodlineId)) setBloodlineId(null);
      setSel((s) => (s?.type === 'node' && gone.has(s.id) ? null : s));
      setMultiSel(null);
      const fromGame = [...gone].filter((id) => {
        const n = byid[id]!;
        return !!n.saveSimId || !!n.treeId || !!n.fromSave;
      }).length;
      const what = gone.size === 1 && only ? named(cardName(byid[only]!)) : `${gone.size} sims`;
      const back = !fromGame
        ? ''
        : gone.size === 1
          ? ' They’re in your save, so opening your save again brings them back.'
          : fromGame === gone.size
            ? ' They’re in your save, so opening your save again brings them back.'
            : ` ${fromGame} of them are in your save, so opening your save again brings those back.`;
      flashStatus(`Deleted ${what} from the board.${back} Undo takes it back.`);
    },
    [byid, nodesCore, edges, editNodeId, bloodlineId, pushUndo, simCalled, pinCardsToCurrentPlaces, flashStatus],
  );

  /**
   * Links off the board, as one undo step. A couple the game has can't be
   * unmade there: deleting it plans its end (a divorce or a breakup), and
   * deleting it again takes it off. A sim picked stays picked.
   */
  const deleteLinks = useCallback(
    (linkIds: string[]) => {
      const chosen = edges.filter((e) => linkIds.includes(e.id));
      const e = chosen[0];
      if (!e) return;
      const pair = `${simCalled(e.a)} and ${simCalled(e.b)}`;
      const toEnd = chosen.filter(
        (x) => (x.type === 'marriage' || x.type === 'romance') && edgeSourceOf(x) !== 'planned' && !x.ending,
      );
      const ends = chosen.flatMap((x) => [x.a, x.b]);
      if (toEnd.length && toEnd.length === chosen.length) {
        pushUndo(`Plan ${e.type === 'marriage' ? 'a divorce' : 'a breakup'} of ${pair}`);
        trackAction('/action/delete');
        const at = new Date().toISOString();
        const ids = new Set(toEnd.map((x) => x.id));
        const nextEdges = edges.map((x) => (ids.has(x.id) ? { ...x, ending: { createdAt: at } } : x));
        freezeAfterEdgeChange(ends, nextEdges);
        setEdges(nextEdges);
        const [a, b] = [byid[e.a], byid[e.b]];
        const names = `${a ? cardName(a) : 'They'} and ${b ? cardName(b) : 'their partner'}`;
        flashStatus(
          `Planned: ${names} ${e.type === 'marriage' ? 'divorce' : 'break up'}, until a save shows it. Undo takes it back; Delete again takes the link off the board.`,
        );
        // Still picked, so a second Delete can take it off.
        return;
      }
      // What went, as Undo names it and the status line says it.
      const what =
        chosen.length === 1
          ? `the link between ${pair}`
          : chosen.every((x) => x.type === 'parent' && x.b === e.b)
            ? `${simCalled(e.b)}’s parent links`
            : `${chosen.length} links`;
      pushUndo(`Delete ${what}`);
      trackAction('/action/delete');
      const gone = new Set(chosen.map((x) => x.id));
      const nextEdges = edges.filter((x) => !gone.has(x.id));
      freezeAfterEdgeChange(ends, nextEdges);
      setEdges(nextEdges);
      setSel((s) => (s?.type === 'link' && s.ids.some((id) => gone.has(id)) ? null : s));
      flashStatus(
        `Deleted ${what}.${chosen.some((x) => edgeSourceOf(x) === 'save') ? ` A save that still has ${chosen.length === 1 ? 'it' : 'them'} brings ${chosen.length === 1 ? 'it' : 'them'} back.` : ''} Undo takes it back.`,
      );
    },
    [edges, byid, pushUndo, simCalled, freezeAfterEdgeChange, flashStatus],
  );

  /** The sims Delete would take: those picked together, or the one selected. */
  const simsToDelete = useMemo(() => {
    if (multiSel && multiSel.kind !== 'worlds') return idsForMultiSel(multiSel, nodes);
    return sel?.type === 'node' ? [sel.id] : [];
  }, [multiSel, sel, nodes]);
  /** Something is picked that Delete acts on. */
  const canDelete = simsToDelete.length > 0 || sel?.type === 'link';

  /** Delete (the key, or the bar's bin): the sims picked, or the link. */
  const deleteSelected = useCallback(() => {
    if (simsToDelete.length) deleteSims(simsToDelete);
    else if (sel?.type === 'link') deleteLinks(sel.ids);
  }, [simsToDelete, sel, deleteSims, deleteLinks]);

  const addSim = useCallback((svgWidth: number, svgHeight: number, species?: string) => {
    pushUndo(species ? `Add ${aKind(species)}` : 'Add a new sim');
    trackAction(species ? '/action/create-pet' : '/action/create-sim');
    const id = 'new' + eidcRef.current++;
    const world =
      dominantWorldInViewport(
        nodes,
        groups,
        nodeVis,
        viewport,
        svgWidth,
        svgHeight,
      ) ?? OTHER_WORLD;
    const hh = ADDED_HOUSEHOLD;
    const gid = `${world}||${hh}`;
    const color = worldColor(world, worlds);
    const neighbour =
      nodes.find((n) => n.world === world && n.nb && n.nb !== '-')?.nb ?? '-';
    const n: SimNode = {
      id,
      gid,
      first: 'New',
      sur: 'Sim',
      age: 'Young Adult',
      state: 'Sim',
      gender: randomNewSimGender(),
      hh,
      world,
      nb: neighbour,
      color,
      townie: false,
      oworld: world,
      onb: neighbour,
      ohh: hh,
      oplay: 'Resident',
      pack: '',
      ox: 0,
      oy: 0,
      x: 0,
      y: 0,
      w: 0,
      h: 0,
      added: true,
      ...(species ? newPetFields(species) : {}),
    };
    const size = measureCard(n);
    let { x, y } = cardOriginAtViewportCenter(
      viewport,
      svgWidth,
      svgHeight,
      size.w,
      size.h,
    );
    const pitch = rowPitch();
    for (let i = 0; i < nodes.length + 1; i++) {
      const hit = nodes.some(
        (o) =>
          x < o.x + o.w &&
          x + size.w > o.x &&
          y < o.y + o.h &&
          y + size.h > o.y,
      );
      if (!hit) break;
      y += pitch;
    }
    if (snap) {
      const t = tileSnapOrigin(x, y);
      x = t.x;
      y = t.y;
    }
    const nextCore = [...nodesCore, toCore(n)];
    const bases = layoutBases(nextCore, worlds, edges);
    const newBase = bases.get(id);
    const newOx = newBase ? x - newBase.x : x;
    const newOy = newBase ? y - newBase.y : y;
    setNodesCore(
      nextCore.map((node) => {
        if (node.id === id) return { ...node, ox: newOx, oy: newOy };
        const vis = byid[node.id];
        const base = bases.get(node.id);
        if (!vis || !base) return node;
        const ox = vis.x - base.x;
        const oy = vis.y - base.y;
        if (ox === (node.ox ?? 0) && oy === (node.oy ?? 0)) return node;
        return { ...node, ox, oy };
      }),
    );
    setGroups((gs) => {
      if (gs.some((g) => g.gid === gid)) return gs;
      return [
        ...gs,
        {
          gid,
          hh,
          world,
          nb: neighbour,
          color,
          x: 0,
          y: 0,
          w: 0,
          h: 0,
        },
      ];
    });
    setSel({ type: 'node', id });
    return id;
  }, [worlds, nodes, nodesCore, groups, nodeVis, viewport, edges, byid, pushUndo, snap]);

  /**
   * The household tag's +: a new sim in that household, beside its last card
   * or in a row under its cards (householdAddSpot), or wherever the
   * household has room (growHousehold). Every other card keeps its place;
   * with no room where it is, the household moves whole to free room in its
   * world. Returns the new sim's id.
   */
  const addSimToHousehold = useCallback(
    (gid: string, species?: string): string | null => {
      const g = groups.find((x) => x.gid === gid);
      const home = nodes.filter((n) => n.gid === gid);
      const chrome = householdChrome(home, g);
      if (!g || !chrome) return null;
      pushUndo(`Add ${aKind(species)} to ${named(g.hh)}`);
      trackAction(species ? '/action/add-household-pet' : '/action/add-household-sim');
      const id = 'new' + eidcRef.current++;
      const sur = householdSurnames(home, g.hh)[0] ?? 'Sim';
      const n: SimNode = {
        id,
        gid,
        first: 'New',
        sur,
        age: 'Young Adult',
        state: 'Sim',
        gender: randomNewSimGender(),
        hh: g.hh,
        world: g.world,
        nb: g.nb,
        color: g.color,
        townie: false,
        oworld: g.world,
        onb: g.nb,
        ohh: g.hh,
        oplay: 'Resident',
        pack: '',
        ox: 0,
        oy: 0,
        x: 0,
        y: 0,
        w: 0,
        h: 0,
        added: true,
        ...(species ? newPetFields(species) : {}),
      };
      // A pet joins the household's animals, in their lane at its right.
      const spot = species ? petAddSpot(home, nodes) : householdAddSpot(home, nodes, chrome.boxR);
      const r = growHousehold({
        core: [...nodesCore, toCore(n)],
        laid: nodes,
        worlds,
        edges,
        groups,
        gid,
        block: [{ ...n, ...spot, ...measureCard(n) }],
        spots: [spot],
        view: viewRect(),
      });
      setNodesCore(r.core);
      if (r.outOfView) revealBox(r.box);
      setSel({ type: 'node', id });
      setEditNodeId(id);
      flashStatus(`Added ${aKind(species)} to ${named(g.hh)}: name them, then press Enter.${placeNote(r)}`);
      return id;
    },
    [groups, nodes, nodesCore, worlds, edges, pushUndo, viewRect, revealBox, flashStatus],
  );

  /**
   * Count dynasty `key`'s generations from `id` as Gen 1, or with null from
   * the first head's oldest known ancestor again. `undo: false` when the
   * caller already pushed an undo step (the editor's Save).
   */
  const setDynastyGenRoot = useCallback(
    (key: string, id: string | null, opts?: { undo?: boolean }) => {
      if (opts?.undo !== false) {
        const phrase = dynastyCalled(dynastyNames(nodesCore).get(key) ?? { name: '' });
        pushUndo(`Count the ${phrase}’s generations from ${id ? simCalled(id) : 'the start'}`);
      }
      setNodesCore((ns) => setGenRoot(ns, key, id));
    },
    [pushUndo, nodesCore, simCalled],
  );

  /**
   * Renames a dynasty only the plan has (by its key) on every current
   * member's card at once (renamePlannedDynasty), undoably. A name another
   * dynasty has is allowed: the founder's tag tells the two apart. Back: its
   * key now, or null for a game dynasty or an empty name.
   */
  const renameDynasty = useCallback(
    (key: string, to: string): string | null => {
      const name = to.trim();
      const was = nodesCore.find((n) => dynastyKey(n) === key)?.dynasty ?? '';
      const from = dynastyCalled(dynastyNames(nodesCore).get(key) ?? { name: was });
      const done = renamePlannedDynasty(nodesCore, key, name);
      if (done.nodes === nodesCore) return null;
      const count = nodesCore.filter((n) => dynastyKey(n) === key && !n.species).length;
      pushUndo(`Rename the ${from} to ${named(name)}`);
      setNodesCore(done.nodes);
      // A lit dynasty stays lit under its new name.
      setDynastyFocusState((k) => (k === key ? done.key : k));
      trackAction('/action/rename-dynasty');
      flashStatus(`Renamed the ${from} to ${named(name)}, on ${count === 1 ? 'its 1 sim' : `all ${count} of its sims`}.`);
      return done.key;
    },
    [nodesCore, pushUndo, flashStatus],
  );

  /**
   * Takes a dynasty only the plan has (by its key) off every member's card at
   * once (removePlannedDynasty), undoably; the cards stay. False for a game one.
   */
  const removeDynasty = useCallback(
    (key: string): boolean => {
      const next = removePlannedDynasty(nodesCore, key);
      if (next === nodesCore) return false;
      const members = nodesCore.filter((n) => dynastyKey(n) === key && !n.species);
      const phrase = dynastyCalled(dynastyNames(nodesCore).get(key) ?? { name: members[0]?.dynasty ?? '' });
      pushUndo(`Remove the planned ${phrase}`);
      setNodesCore(next);
      trackAction('/action/remove-dynasty');
      flashStatus(
        `Removed the planned ${phrase} from ${members.length === 1 ? 'its 1 sim' : `its ${members.length} sims`}. Undo brings it back.`,
      );
      return true;
    },
    [nodesCore, pushUndo, flashStatus],
  );

  /** What each dynasty is called, by key: twins of one name carry their founder's tag. */
  const dynastyNameMap = useMemo(() => dynastyNames(nodesCore), [nodesCore]);
  // Dynasties that could die out as planned (no heir, or 2 sims or fewer), by key: their members' cards say so.
  const dynastyRisks = useMemo(
    () => new Map(dynastyIndex(nodesCore).flatMap((r): [string, DynastyRisk][] => (r.risk ? [[r.key, r.risk]] : []))),
    [nodesCore],
  );

  /** Each dynasty member's generation, counted from the first head. */
  const dynastyGens = useMemo(() => dynastyGenerations(nodesCore, edges), [nodesCore, edges]);
  /** Every sim's generation, dynasty or not, from their oldest known ancestor. */
  const familyGens = useMemo(() => familyGenerations(nodesCore, edges), [nodesCore, edges]);
  /** The generation each sim goes by: their dynasty's count, else their family's. */
  const generationOf = useMemo(() => {
    const out = new Map<string, { gen?: number }>(familyGens);
    for (const [id, g] of dynastyGens) if (g.gen !== undefined) out.set(id, g);
    return out;
  }, [familyGens, dynastyGens]);

  /** Planned links the game went against (see planConflicts). */
  const planIssues = useMemo(() => planConflicts(nodesCore, edges), [nodesCore, edges]);
  const nameOfCore = useCallback(
    (id: string) => {
      const n = nodesCore.find((x) => x.id === id);
      return n ? cardName(n) : 'someone';
    },
    [nodesCore],
  );
  /** Off-plan links and each sim's reason, for the board. */
  const offPlan = useMemo(() => offPlanMarks(planIssues, nameOfCore), [planIssues, nameOfCore]);
  /** Planned sims with planned parents: "Not born yet" rather than "Not in the game yet". */
  const plannedChildIds = useMemo(() => {
    const planned = new Set(nodesCore.filter(isPlannedSim).map((n) => n.id));
    return new Set(edges.filter((e) => e.type === 'parent' && planned.has(e.b)).map((e) => e.b));
  }, [nodesCore, edges]);
  /** Each planned child's parents, for its card ("Child of Jules ＋ Bess"). */
  const plannedParents = useMemo(() => {
    const planned = new Set(nodesCore.filter(isPlannedSim).map((n) => n.id));
    const out = new Map<string, string[]>();
    for (const e of edges) if (e.type === 'parent' && planned.has(e.b)) out.set(e.b, [...(out.get(e.b) ?? []), e.a]);
    return out;
  }, [nodesCore, edges]);
  /** Every household's plan items (householdPlan.ts): the brief, the tag badges and Up next read these. */
  const planItems = useMemo(
    () => householdPlans({ nodes: nodesCore, edges, conflicts: planIssues, pairStatus, saveGame, moves: householdMoves }),
    [nodesCore, edges, planIssues, pairStatus, saveGame, householdMoves],
  );
  const planTally = useMemo(() => planTallies(planItems), [planItems]);
  // Households the game doesn't have yet: Up next and their brief say who moves in first.
  const notInGame = useMemo(() => householdsNotInGame(nodesCore, householdMoves), [nodesCore, householdMoves]);
  // Planned sims sharing a last name are numbered afresh on every change:
  // "Planned (2) Le Chien"; a role set by hand before roles were plans
  // becomes one.
  useEffect(() => {
    const numbered = markHandSetRoles(numberPlannedSims(nodesCore));
    if (numbered !== nodesCore) setNodesCore(numbered);
  }, [nodesCore]);
  // A new save import is a fresh start for what was skipped in Up next.
  useEffect(() => setUpNextSkipped(new Set()), [saveGame?.importedAt]);
  /**
   * Your note on a log line: on every link of the line (both parents of a
   * child) or on the move. An empty note takes it off.
   */
  const setLogNote = useCallback(
    (entry: Pick<ConnectionLogEntry, 'kind' | 'edgeIds' | 'moveId' | 'moveIds' | 'note'>, text: string) => {
      const note = cleanNote(text);
      if (note === cleanNote(entry.note)) return;
      pushUndo(note ? (cleanNote(entry.note) ? 'Edit a note in the Log' : 'Add a note in the Log') : 'Remove a note from the Log');
      const put = <T extends { note?: string }>(x: T): T => {
        const { note: _old, ...rest } = x;
        return (note ? { ...rest, note } : rest) as T;
      };
      if (entry.kind === 'end') {
        // The note on a planned divorce goes with the ending, not the marriage.
        const ids = new Set(entry.edgeIds);
        setEdges((es) => es.map((e) => (ids.has(e.id) && e.ending ? { ...e, ending: put(e.ending) } : e)));
      } else if (entry.edgeIds.length) {
        const ids = new Set(entry.edgeIds);
        setEdges((es) => es.map((e) => (ids.has(e.id) ? put(e) : e)));
      } else if (entry.moveId) {
        // A household's move: the note goes on its first sim's, and only there.
        const rest = new Set((entry.moveIds ?? []).filter((id) => id !== entry.moveId));
        const drop = <T extends { note?: string }>(x: T): T => {
          const { note: _old, ...others } = x;
          return others as T;
        };
        setHouseholdMoves((ms) =>
          ms.map((m) => (m.id === entry.moveId ? put(m) : rest.has(m.id) ? drop(m) : m)),
        );
      }
    },
    [pushUndo],
  );
  /** The plan Replace would drop: planned links and planned sims. */
  const plannedCounts = useMemo(
    () => ({
      links: edges.filter((e) => edgeSourceOf(e) === 'planned').length,
      sims: nodesCore.filter(isPlannedSim).length,
    }),
    [edges, nodesCore],
  );

  const updateNode = useCallback((id: string, patch: Partial<SimNode>) => {
    const prev = nodesCore.find((n) => n.id === id);
    // Anything packing reads, a name included, can move other cards: naming
    // one of two planned kids reorders them. Pin every card where it is.
    const reflow = !!prev && packingKey(prev) !== packingKey({ ...prev, ...patch });
    // A dynasty has one head and one heir: naming one takes the role from
    // whoever held it, as the game does. A planned role takes it only from
    // another plan; the game's holder keeps it until a save says otherwise.
    const after = prev ? { ...prev, ...patch } : undefined;
    const sole =
      after?.dynasty &&
      (after.dynastyRole === 'head' || after.dynastyRole === 'heir') &&
      (after.dynastyRole !== prev?.dynastyRole || dynastyKey(after) !== dynastyKey(prev!))
        ? after.dynastyRole
        : null;
    const sameDynasty = (n: SimNode) => !!after && dynastyKey(n) === dynastyKey(after);
    const loses = (n: SimNode) =>
      !!sole && n.dynastyRole === sole && sameDynasty(n) && (!after?.dynastyPlan || !!n.dynastyPlan);
    // One sim per place in line: an heir after someone takes that place.
    const place = after?.heirAfter && after.heirAfter !== prev?.heirAfter ? after.heirAfter : null;
    const losesPlace = (n: SimNode) => !!place && n.heirAfter === place && sameDynasty(n);
    const apply = (ns: SimNode[]) =>
      ns.map((n) => {
        if (n.id !== id) {
          if (losesPlace(n) && !loses(n)) {
            const { heirAfter: _gone, ...rest } = n;
            return toCore(rest);
          }
          if (!loses(n)) return n;
          // A sim only planned into the dynasty leaves it with the role.
          const out = n.dynastyPlan === 'member' ? { dynasty: undefined, dynastyId: undefined, dynastyRef: undefined } : {};
          return toCore({ ...n, ...out, dynastyRole: undefined, dynastyPlan: undefined });
        }
        const next: SimNode = { ...n, ...patch };
        if (patch.x !== undefined || patch.y !== undefined) {
          const laid = byid[id];
          const packed = laid
            ? { x: laid.x - (laid.ox ?? 0), y: laid.y - (laid.oy ?? 0) }
            : layoutBases(ns, worlds, edges).get(id);
          if (packed) {
            const absX =
              patch.x !== undefined ? patch.x : packed.x + (n.ox ?? 0);
            const absY =
              patch.y !== undefined ? patch.y : packed.y + (n.oy ?? 0);
            next.ox = absX - packed.x;
            next.oy = absY - packed.y;
          }
        }
        return toCore(next);
      });
    if (reflow) pinCardsToCurrentPlaces(edges, apply(nodesCore));
    else setNodesCore(apply);
    const createdAt = new Date().toISOString();
    const toAge = patch.age;
    if (prev && toAge !== undefined && isLaterSimAge(prev.age, toAge)) {
      setSimAgeUps((ms) => [
        ...ms,
        {
          id: 'c' + eidcRef.current++,
          simId: id,
          createdAt,
          age: toAge,
          hh: prev.hh,
          nb: prev.nb,
          world: prev.world,
        },
      ]);
    }
    if (
      prev &&
      patch.state === DECEASED_STATE &&
      prev.state !== DECEASED_STATE
    ) {
      setDeceasedMarks((ms) => [
        ...ms,
        {
          id: 'd' + eidcRef.current++,
          simId: id,
          createdAt,
        },
      ]);
    }
  }, [nodesCore, worlds, edges, byid, pinCardsToCurrentPlaces]);

  const moveNodesByGid = useCallback(
    (
      gid: string,
      dx: number,
      dy: number,
      base: Record<string, { ox: number; oy: number }>,
    ) => {
      // A drop is one step back with ⌘Z, like any other change.
      if (dx || dy) pushUndo(`Move ${theHousehold(groups.find((g) => g.gid === gid)?.hh ?? 'a', named)}`);
      setNodesCore((ns) =>
        ns.map((n) => {
          const bb = base[n.id];
          if (n.gid === gid && bb)
            return { ...n, ox: bb.ox + dx, oy: bb.oy + dy };
          return n;
        }),
      );
    },
    [pushUndo, groups],
  );

  const moveNodesByWorld = useCallback(
    (
      world: string,
      dx: number,
      dy: number,
      base: Record<string, { ox: number; oy: number }>,
    ) => {
      if (dx || dy) pushUndo(`Move ${named(world)}`);
      setNodesCore((ns) =>
        ns.map((n) => {
          const bb = base[n.id];
          if (n.world === world && bb)
            return { ...n, ox: bb.ox + dx, oy: bb.oy + dy };
          return n;
        }),
      );
    },
    [pushUndo],
  );

  /** Rigid move for a multi-selection (worlds, households, or cards). */
  const moveNodesByIds = useCallback(
    (
      ids: string[],
      dx: number,
      dy: number,
      base: Record<string, { ox: number; oy: number }>,
    ) => {
      if (dx || dy) pushUndo(ids.length === 1 ? `Move ${simCalled(ids[0]!)}` : `Move ${ids.length} sims`);
      const set = new Set(ids);
      setNodesCore((ns) =>
        ns.map((n) => {
          const bb = base[n.id];
          if (set.has(n.id) && bb)
            return { ...n, ox: bb.ox + dx, oy: bb.oy + dy };
          return n;
        }),
      );
    },
    [pushUndo, simCalled],
  );

  const snapDragPosition = useCallback(
    (n: SimNode, rawX: number, rawY: number, sticky: SnapSticky = { x: null, y: null }) =>
      snapPosition(rawX, rawY, n.w, n.h, nodes, n.id, snap, sticky),
    [snap, nodes],
  );

  const snapHouseholdDrag = useCallback(
    (originX: number, originY: number, dx: number, dy: number) =>
      snapHouseholdDelta(originX, originY, dx, dy, snap),
    [snap],
  );

  const snapNodeAction = useCallback(
    (n: SimNode) => {
      if (!snap) return;
      const { x, y } = snapPosition(n.x, n.y, n.w, n.h, nodes, n.id, true);
      updateNode(n.id, { x, y });
    },
    [snap, nodes, updateNode],
  );

  const makeChildOfCouple = useCallback(
    (pa: string, pb: string, childId: string) => {
      if (childId === pa || childId === pb) {
        cancelConnect();
        return;
      }
      const why = parentCycleReason(pa, childId) ?? parentCycleReason(pb, childId);
      if (why) {
        setConnSrc(null);
        setConnectMenu(null);
        flashStatus(`Not linked — ${why}. Click a sim for the next link`);
        return;
      }
      pushUndo(`Make ${simCalled(childId)} a child of ${simCalled(pa)} and ${simCalled(pb)}`);
      // Built from the links as they are, not in an updater (see addEdge).
      const bundleId = 'b' + eidcRef.current++;
      const createdAt = new Date().toISOString();
      const next = [...edges];
      [pa, pb].forEach((p) => {
        const idx = next.findIndex(
          (e) => e.type === 'parent' && e.a === p && e.b === childId,
        );
        if (idx >= 0) {
          const existing = next[idx]!;
          if (isUserE(existing)) {
            next[idx] = {
              ...existing,
              bundleId,
              createdAt: existing.createdAt ?? createdAt,
            };
          }
          return;
        }
        next.push({
          id: 'u' + eidcRef.current++,
          a: p,
          b: childId,
          type: 'parent',
          source: 'planned',
          createdAt,
          bundleId,
        });
      });
      setEdges(next);
      freezeAfterEdgeChange([pa, pb, childId], next);
      flashStatus(
        `Linked ✓ — ${byid[childId]?.first ?? 'Sim'} is now a child of ${byid[pa]?.first ?? ''} ＋ ${byid[pb]?.first ?? ''}. Click a sim for the next link`,
      );
      setConnSrc(null);
      setConnectMenu(null);
    },
    [byid, edges, cancelConnect, flashStatus, freezeAfterEdgeChange, parentCycleReason, pushUndo, simCalled],
  );

  /**
   * Last names a planned baby of `a` and `b` could take in household `gid`
   * (householdSurnames): more than one is a tie to ask about. The townies'
   * and added sims' boxes aren't families, so there only the parents count.
   */
  const babySurnames = useCallback(
    (a: SimNode, b: SimNode, gid: string) => {
      const bucket = isUnhousedGid(gid) || gid.endsWith(`||${ADDED_HOUSEHOLD}`);
      const home = nodes.filter((n) => n.gid === gid && (!bucket || n.id === a.id || n.id === b.id));
      return householdSurnames(home, bucket ? '' : (home[0]?.hh ?? ''), [a.sur, b.sur]);
    },
    [nodes],
  );

  /**
   * A planned baby of `parentIds` (a couple, or one sim alone) in household
   * `destGid`, taking last name `sur`, placed under `rx` beside its full
   * siblings: those with the same parents, and no other.
   */
  const addPlannedBaby = useCallback(
    (parentIds: string[], destGid: string, sur: string, rx: number) => {
      const ps = parentIds.map((id) => byid[id]);
      if (!ps.length || ps.some((p) => !p)) return;
      const parents = ps as SimNode[];
      const a = parents[0]!;
      pushUndo(`Plan a child of ${parents.map((p) => named(cardName(p))).join(' and ')}`);
      const host = parents.find((p) => p.gid === destGid) ?? a;
      const g = groups.find((x) => x.gid === destGid);
      const dest = g
        ? {
            gid: g.gid,
            hh: g.hh,
            world: g.world,
            nb: g.nb,
            color: g.color,
          }
        : {
            gid: host.gid,
            hh: host.hh,
            world: host.world,
            nb: host.nb,
            color: host.color,
          };
      const id = 'new' + eidcRef.current++;
      // Pets have young of their kind: a planned kitten of two cats.
      const species = parents.every((p) => p.species && p.species === a.species) ? a.species : undefined;
      // A planned child: no made-up name, gender or stage until the game has them.
      const infant: SimNode = {
        id,
        gid: dest.gid,
        first: '',
        sur: sur || 'Sim',
        age: NOT_YET_AGE,
        state: 'Sim',
        gender: GENDER_NOT_KNOWN,
        hh: dest.hh,
        world: dest.world,
        nb: dest.nb,
        color: dest.color,
        townie: false,
        oworld: dest.world,
        onb: dest.nb,
        ohh: dest.hh,
        oplay: 'Resident',
        pack: '',
        ox: 0,
        oy: 0,
        x: 0,
        y: 0,
        w: 0,
        h: 0,
        added: true,
        ...(species ? { species, state: 'Pet', sur: '', pack: petPack(species) } : {}),
      };
      const size = measureCard(infant);
      const siblings = nodes.filter((n) => {
        const mine = new Set(edges.filter((e) => e.type === 'parent' && e.b === n.id).map((e) => e.a));
        // A couple's: children of both. One sim's: children of theirs alone.
        return parentIds.every((p) => mine.has(p)) && (parentIds.length > 1 || mine.size === 1);
      });
      const { x, y } = spawnChildOrigin(
        Math.min(...parents.map((p) => p.y)),
        rx,
        size.w,
        siblings,
        nodes,
        snap,
      );
      const bundleId = 'b' + eidcRef.current++;
      const createdAt = new Date().toISOString();
      const nextEdges: Edge[] = [...edges];
      parentIds.forEach((p) => {
        nextEdges.push({
          id: 'u' + eidcRef.current++,
          a: p,
          b: id,
          type: 'parent',
          source: 'planned',
          createdAt,
          bundleId,
        });
      });
      // Under the parents, beside full siblings, when the household has room
      // there; else wherever it does, nothing else moving.
      const r = growHousehold({
        core: [...nodesCore, toCore(infant)],
        laid: nodes,
        worlds,
        edges: nextEdges,
        groups,
        gid: dest.gid,
        block: [{ ...infant, x, y, ...size }],
        spots: [{ x, y }],
        view: viewRect(),
      });
      setNodesCore(r.core);
      if (r.outOfView) revealBox(r.box);
      setEdges(nextEdges);
      setSel({ type: 'node', id });
      setInfantHouseMenu(null);
      trackAction(parentIds.length > 1 ? '/action/add-infant' : '/action/add-infant-one-parent');
      const who = parents.map((p) => named(p.first || cardName(p))).join(' ＋ ');
      const room = placeNote(r);
      const name = sur || 'Sim';
      const one = `${/^[aeiou]/i.test(name) ? 'an' : 'a'} ${sur ? named(name) : name}`;
      if (species) {
        const young = youngWord(species);
        flashStatus(
          `Planned a ${young} of ${who}, not born yet.${room}${parentIds.length > 1 ? '' : ` Add its other parent in its editor’s Family tab if there is one.`}`,
        );
        return;
      }
      flashStatus(
        parentIds.length > 1
          ? `Planned a child of ${who}: ${one}, not born yet.${room} Give them a plan label in the editor.`
          : `Planned a child of ${who}: ${one}, not born yet.${room} Link another parent with Connect if there is one.`,
      );
    },
    [byid, flashStatus, groups, nodes, nodesCore, worlds, edges, pushUndo, snap, viewRect, revealBox],
  );

  const addInfantOfCouple = useCallback(
    (pa: string, pb: string, destGid: string, sur: string, rx: number, _ry: number) =>
      addPlannedBaby([pa, pb], destGid, sur, rx),
    [addPlannedBaby],
  );

  /**
   * A planned baby of one sim, with no other parent (yet): in their
   * household, with their last name (a household has no say: a baby takes
   * a parent's), under their card. Its parents come later, with Connect.
   */
  const requestInfantOfSim = useCallback(
    (id: string) => {
      const a = byid[id];
      if (!a) return;
      const sur = babySurnames(a, a, a.gid)[0] ?? a.sur;
      addPlannedBaby([id], a.gid, sur, a.x + (a.w || CARD_MIN_W) / 2);
    },
    [byid, addPlannedBaby, babySurnames],
  );

  /**
   * A planned kitten, puppy or foal of `parentIds` (one pet, or two of a
   * kind), born where the first of them lives, under their card.
   */
  const planPetYoung = useCallback(
    (parentIds: string[]) => {
      const a = byid[parentIds[0] ?? ''];
      if (!a?.species) return;
      addPlannedBaby(parentIds, a.gid, '', a.x + (a.w || CARD_MIN_W) / 2);
    },
    [byid, addPlannedBaby],
  );

  const requestInfantOfCouple = useCallback(
    (
      pa: string,
      pb: string,
      rx: number,
      ry: number,
      menuX: number,
      menuY: number,
    ) => {
      const a = byid[pa];
      const b = byid[pb];
      if (!a || !b) return;
      // One household and one last name: nothing to ask. Parents with two
      // last names are always asked which the baby takes: the board can't
      // know, and it decides which family name goes on.
      if (a.gid === b.gid && coupleSurnames(a, b).length < 2) {
        addInfantOfCouple(pa, pb, a.gid, babySurnames(a, b, a.gid)[0] ?? a.sur, rx, ry);
        return;
      }
      setInfantHouseMenu({ pa, pb, rx, ry, x: menuX, y: menuY });
    },
    [byid, addInfantOfCouple, babySurnames],
  );

  const confirmInfantHouse = useCallback(
    (gid: string, sur: string) => {
      if (!infantHouseMenu) return;
      addInfantOfCouple(
        infantHouseMenu.pa,
        infantHouseMenu.pb,
        gid,
        sur,
        infantHouseMenu.rx,
        infantHouseMenu.ry,
      );
    },
    [infantHouseMenu, addInfantOfCouple],
  );

  /**
   * The baby menu's questions and answers: which household when the parents
   * live apart, and which last name when theirs differ; one, both or (with
   * nothing to ask) neither. `surFor` is the last name in each household
   * when there is no last name to ask.
   */
  const infantHouseChoices = useMemo((): InfantChoices => {
    const none: InfantChoices = { title: '', homes: [], surnames: [], surFor: {} };
    if (!infantHouseMenu) return none;
    const a = byid[infantHouseMenu.pa];
    const b = byid[infantHouseMenu.pb];
    if (!a || !b) return none;
    const parents = [a, b];
    const homes = (a.gid === b.gid ? [a] : parents).map((n) => ({
      gid: n.gid,
      title: `With ${cardName(n)}`,
      sub: householdPlace(n.hh, n.nb, n.world),
    }));
    const surnames = coupleSurnames(a, b).map((sur) => {
      const like = parents.filter((p) => p.sur.trim().toLocaleLowerCase() === sur.toLocaleLowerCase());
      const kin = like.find((p) => p.dynasty);
      const role = kin?.dynastyRole ? DYNASTY_ROLES[kin.dynastyRole].noun.toLocaleLowerCase() : '';
      const dyn = kin?.dynasty ? dynastyPhrase({ name: kin.dynasty }) : '';
      return {
        sur,
        sub: `Like ${like.map(shortName).join(' and ')}${dyn ? `, ${role ? `${role} of` : 'in'} the ${dyn}` : ''}`,
      };
    });
    const surFor = Object.fromEntries(homes.map((h) => [h.gid, babySurnames(a, b, h.gid)[0] ?? a.sur]));
    return { title: `New baby of ${shortName(a)} ＋ ${shortName(b)}`, homes, surnames, surFor };
  }, [infantHouseMenu, byid, babySurnames]);

  const handleConnectClick = useCallback(
    (n: SimNode, clientX: number, clientY: number, stageRect: DOMRect) => {
      if (connSrc && typeof connSrc === 'object' && 'union' in connSrc) {
        makeChildOfCouple(connSrc.union[0], connSrc.union[1], n.id);
        return;
      }
      if (!connSrc) {
        setConnSrc(n.id);
        setStatus(
          'Connect: now click the SECOND sim; drag the board to reach them. Or click a ⚭/❤ to make this sim their child (Esc to cancel)',
        );
        return;
      }
      if (connSrc === n.id) return;
      setConnectMenu({
        a: connSrc as string,
        b: n.id,
        x: clientX - stageRect.left,
        y: clientY - stageRect.top,
      });
    },
    [connSrc, makeChildOfCouple],
  );

  const handleConnectUnion = useCallback(
    (ea: string, eb: string) => {
      if (!byid[ea] || !byid[eb]) return;
      if (connSrc && typeof connSrc === 'string') {
        makeChildOfCouple(ea, eb, connSrc);
        return;
      }
      setConnSrc({ union: [ea, eb] });
      setStatus(
        `Couple selected: ${byid[ea]!.first} ＋ ${byid[eb]!.first} — now click their CHILD (Esc to cancel)`,
      );
    },
    [byid, connSrc, makeChildOfCouple],
  );

  const confirmConnect = useCallback(
    (choice: ConnectChoice) => {
      if (!connectMenu) return;
      const { a, b } = connectMenu;
      if (choice === 'coparents') {
        // Sims who are not a couple and have a child: the child's two parent
        // links say it all, so the next sim clicked becomes that child.
        setConnectMenu(null);
        setConnSrc({ union: [a, b] });
        setStatus(
          `Co-parents: ${byid[a]?.first ?? ''} ＋ ${byid[b]?.first ?? ''} — now click their CHILD (Esc to cancel)`,
        );
        return;
      }
      if (choice === 'divorce' || choice === 'breakup') return;
      const link = CONNECT_LINKS[choice];
      const [from, to] = link.flip ? [b, a] : [a, b];
      if (link.type === 'parent') {
        const why =
          parentCycleReason(from, to) ??
          (link.adopted && byid[from] && byid[to]
            ? whyNotAdopt(byid[from]!, byid[to]!, edges, plannedChildIds)
            : null);
        if (why) {
          setConnectMenu(null);
          setConnSrc(null);
          flashStatus(`Not linked — ${why}. Click a sim for the next link`);
          return;
        }
      }
      addEdge(from, to, link.type, !!link.secret, !!link.adopted);
      if (link.adopted) trackAction('/action/adopt');
      setConnectMenu(null);
      flashStatus(
        link.secret && hideSecrets
          ? 'Linked ✓ — it is secret, so Hide secrets keeps it off the board. Click a sim for the next link'
          : 'Linked ✓ — click a sim for the next link',
      );
      setConnSrc(null);
    },
    [connectMenu, addEdge, byid, edges, plannedChildIds, flashStatus, hideSecrets, parentCycleReason],
  );

  /** The ♥ on a card's side: pick a partner by name, or by clicking them on the board. */
  const openPartnerMenu = useCallback(
    (id: string, side: 'left' | 'right', x: number, y: number) => {
      const n = byid[id];
      if (!n) return;
      setConnectMenu(null);
      setConnSrc(null);
      setSel({ type: 'node', id });
      setPartnerMenu({ id, side, x, y, choice: readPartnerChoice() });
      setStatus(`${PARTNER_HINT}${cardName(n)}: type a name, or click a sim on the board (Esc to cancel)`);
    },
    [byid],
  );

  /**
   * A couple link from the partner menu, as Connect makes it: false, with
   * why on the status line, when it is already there.
   */
  const linkPartner = useCallback(
    (a: string, b: string, choice: PartnerChoice): boolean => {
      const link = CONNECT_LINKS[choice];
      const there = edges.find((e) => e.type === link.type && uKey(e.a, e.b) === uKey(a, b));
      const [A, B] = [byid[a], byid[b]];
      if (!A || !B) return false;
      if (there && (!link.secret || there.secret)) {
        flashStatus(`${named(cardName(A))} and ${named(cardName(B))} already have that link.`);
        return false;
      }
      addEdge(a, b, link.type, !!link.secret);
      trackAction('/action/partner');
      flashStatus(
        link.secret && hideSecrets
          ? `Linked ✓ ${named(cardName(A))} and ${named(cardName(B))}: it is secret, so Hide secrets keeps it off the board.`
          : `Linked ✓ ${named(cardName(A))} and ${named(cardName(B))}. Undo takes it back.`,
      );
      return true;
    },
    [edges, byid, addEdge, flashStatus, hideSecrets],
  );

  /**
   * One partner moves into the other's household, as a plan (a household
   * move, done once a save shows it), and their card lands beside the
   * other's on `side`, or wherever the household has room (growHousehold).
   * No other household moves. The view keeps `follow`, the sim you were
   * working on, where you were looking, and selects them: when they are the
   * one who moves, it goes with them to their new household.
   */
  const moveInWith = useCallback(
    (mover: string, host: string, side: 'left' | 'right' | null = 'right', follow: string = host): boolean => {
      const m = nodes.find((x) => x.id === mover);
      const h = nodes.find((x) => x.id === host);
      if (!m || !h || m.gid === h.gid) return false;
      const dest = moveDestination(groups, nodes, worlds, h.world, h.gid);
      const g = groups.find((x) => x.gid === h.gid);
      if (!dest || !g) return false;
      const { patches, moves } = householdMovePlan(nodes, [mover], dest);
      const patch = patches.get(mover);
      if (!patch) return false;
      pushUndo(`Move ${named(cardName(m))} in with ${named(cardName(h))}`);
      trackAction('/action/partner-move');
      const createdAt = new Date().toISOString();
      setHouseholdMoves((ms) => [...ms, ...moves.map((mv) => ({ ...mv, id: 'h' + eidcRef.current++, createdAt }))]);
      const others = nodes.filter((x) => x.id !== mover);
      const home = others.filter((x) => x.gid === h.gid);
      const chrome = householdChrome(home, g);
      // Beside the host on the side picked, then the other, then wherever
      // the household has room; growHousehold takes the first that runs
      // the household into nothing.
      const other = side === 'left' ? 'right' : 'left';
      // A partner never takes the empty column before the animal lane.
      const strip = laneStrip(home);
      const beside = strip ? [...others, strip] : others;
      const spots = [
        side ? partnerSpot(h, beside, side) : null,
        side ? partnerSpot(h, beside, other) : null,
        chrome ? householdAddSpot(home, others, chrome.boxR) : null,
      ].filter((p): p is { x: number; y: number } => !!p);
      const r = growHousehold({
        core: nodesCore.map((x) => (x.id === mover ? toCore({ ...x, ...patch, ox: 0, oy: 0 }) : x)),
        laid: nodes,
        worlds,
        edges,
        groups,
        gid: h.gid,
        block: [{ ...m, ...patch }],
        spots: spots.length ? spots : [{ x: m.x, y: m.y }],
        view: viewRect(),
      });
      setNodesCore(r.core);
      // The view keeps the sim you acted on where it was; when that's the
      // one who stays, it shows the one who moved in.
      lockViewToSims([follow]);
      if (follow !== mover && r.outOfView) revealBox(r.box);
      setSel({ type: 'node', id: follow });
      flashStatus(
        `${named(cardName(m))} moves in with ${named(cardName(h))}, in ${theHousehold(dest.hh, named)}: a plan until a save shows it.${placeNote(r)} Undo takes it back.`,
      );
      return true;
    },
    [nodes, nodesCore, groups, worlds, edges, pushUndo, lockViewToSims, viewRect, revealBox, flashStatus],
  );

  /**
   * Sims to frame once the board is laid out again: a cancel in the Log may
   * send them somewhere off screen, so the view goes to them.
   */
  const frameNextRef = useRef<{ ids: string[]; w: number; h: number } | null>(null);

  /**
   * Cards a move sends to household `destGid` (their `patches`) land there
   * as a block, keeping their places among themselves: under the
   * household's other cards, or in free room beside the world's households
   * when they are all of it (landMovedCards). Every other card stays where
   * it is. True when they joined cards already there.
   */
  const landCards = useCallback(
    (
      patches: Map<string, Partial<SimNode>>,
      destGid: string,
      newGroup: Group | null,
    ): { joined: boolean; outOfView: boolean; crowded: boolean } => {
      const r = landMovedCards({ core: nodesCore, laid: nodes, worlds, edges, groups, patches, destGid, newGroup, view: viewRect() });
      setNodesCore(r.core);
      return r;
    },
    [nodes, nodesCore, groups, worlds, edges, viewRect],
  );

  /**
   * A household moves to another world, as the game moves one to a lot
   * elsewhere: everyone in it goes, under its own name, joining a household
   * of that name the world already has. One move in the game, a plan until
   * a save shows it; the deceased and planned sims go along on the board
   * only. The cards keep their places among themselves and land in the
   * world, under the household they join if there is one; the view follows
   * them. Returns where they went, or null when nothing moved.
   */
  const moveHouseholdToWorld = useCallback(
    /**
     * `house`: where in `world` — a free lot (lotPick) or a household of the
     * same name to join. Without it, as before lots, a household of its
     * name there or a new one with no lot (Not in any world).
     */
    (gid: string, world: string, house?: string): MoveDestination | null => {
      const g = groups.find((x) => x.gid === gid);
      const members = nodes.filter((n) => n.gid === gid);
      if (!g || !members.length || isUnhousedGid(gid) || g.world === world) return null;
      const dest = moveDestination(groups, nodes, worlds, world, house ?? NEW_HOUSEHOLD, g.hh);
      if (!dest || dest.gid === gid) return null;
      const ids = new Set(members.map((n) => n.id));
      const { patches, moves } = householdMovePlan(nodes, [...ids], dest);
      if (!patches.size) return null;
      pushUndo(`Move ${theHousehold(g.hh, named)} to ${named(world)}`);
      trackAction('/action/household-world');
      const newGroup: Group | null = dest.isNew
        ? { gid: dest.gid, hh: dest.hh, world: dest.world, nb: dest.nb, ...(dest.lot ? { lot: dest.lot } : {}), color: dest.color, x: 0, y: 0, w: 0, h: 0 }
        : null;
      if (newGroup) setGroups((gs) => (gs.some((x) => x.gid === newGroup.gid) ? gs : [...gs, newGroup]));
      const createdAt = new Date().toISOString();
      const recorded = moves.filter((m) => movesInGame(byid[m.simId] ?? members[0]!));
      // Back where the game has them: a new step in the story, which the bin
      // on the move there can take back instead.
      const homes = gameHomes(nodes, householdMoves);
      const back = recorded.length > 0 && recorded.every((m) => homes.get(m.simId) === dest.gid);
      if (recorded.length) {
        setHouseholdMoves((ms) => [...ms, ...recorded.map((m) => ({ ...m, id: 'h' + eidcRef.current++, createdAt }))]);
      }
      // Where the block lands: the household's own place in the world, or
      // under the one it joins.
      const landed = landCards(patches, dest.gid, newGroup);
      const joined = landed.joined;
      const moved = members;
      lockViewToSims([...ids]);
      if (briefGid === gid) setBriefGid(dest.gid);
      const plan = recorded.length ? ': a plan until a save shows it' : '';
      flashStatus(
        back
          ? `The ${named(g.hh)} household moves back to ${named(world)}: a new step in your plan. To drop its move instead, use the bin on it in the Log.`
          : joined
          ? `${moved.length === 1 ? `${named(cardName(moved[0]!))} of the ${named(g.hh)} household joins` : `All ${moved.length} sims of the ${named(g.hh)} household join`} the one in ${named(world)}${plan}.${placeNote({ ...landed, outOfView: false }, moved.length > 1)} Undo takes it back.`
          : `The ${g.hh} household moves to ${dest.lot ? `${dest.lot} in ` : ''}${world} with ${moved.length === 1 ? cardName(moved[0]!) : `its ${moved.length} sims`}${plan}. Undo takes it back.`,
      );
      return dest;
    },
    [groups, nodes, worlds, byid, householdMoves, briefGid, setBriefGid, pushUndo, landCards, lockViewToSims, flashStatus],
  );

  /**
   * A couple's planned end: a divorce for a marriage, a breakup for a
   * romance, or that plan cancelled. The link stays as the game has it, drawn
   * violet as it will be, until a save shows it over. True when it changed.
   */
  const setEnding = useCallback(
    (id: string, on: boolean): boolean => {
      const e = edges.find((x) => x.id === id);
      if (!e || (e.type !== 'marriage' && e.type !== 'romance') || !!e.ending === on) return false;
      const end = e.type === 'marriage' ? 'divorce' : 'breakup';
      pushUndo(`${on ? `Plan a ${end}` : `Cancel the ${end}`} of ${simCalled(e.a)} and ${simCalled(e.b)}`);
      trackAction(on ? '/action/plan-ending' : '/action/cancel-ending');
      const nextEdges = edges.map((x) => {
        if (x.id !== id) return x;
        if (on) return { ...x, ending: { createdAt: new Date().toISOString() } };
        const { ending: _gone, ...rest } = x;
        return rest;
      });
      freezeAfterEdgeChange([e.a, e.b], nextEdges);
      setEdges(nextEdges);
      const [a, b] = [byid[e.a], byid[e.b]];
      const names = `${a ? cardName(a) : 'They'} and ${b ? cardName(b) : 'their partner'}`;
      const marriage = e.type === 'marriage';
      flashStatus(
        on
          ? `Planned: ${names} ${marriage ? 'divorce' : 'break up'}, until a save shows it. Undo takes it back.`
          : `Cancelled the ${marriage ? 'divorce' : 'breakup'}: ${names} stay together. Undo brings it back.`,
      );
      return true;
    },
    [edges, byid, pushUndo, freezeAfterEdgeChange, flashStatus, simCalled],
  );

  /**
   * A line of the Log's Plan cancelled, as if that step had never been
   * planned; the rest of the story stays. A planned link goes; a planned
   * baby, or a planned sim that came onto the board, goes with its links; a
   * planned divorce or breakup goes, the couple staying together. A move
   * goes: its last step takes the sims back where the step before left them
   * (a household back to its world), and a step in the middle hands its
   * start to the next. One undo step.
   */
  const cancelPlan = useCallback(
    (entry: ConnectionLogEntry, view?: { w: number; h: number }): boolean => {
      const what = partsToText(
        entry.parts
          .filter((p) => p.kind !== 'time' && p.kind !== 'break')
          .map((p) =>
            p.kind === 'sim'
              ? { kind: 'sim' as const, id: p.id, name: named(p.name) }
              : p.kind === 'hh'
                ? { ...p, name: named(p.name), place: p.place && named(p.place) }
                : p,
          ),
      ).trim();
      // The plan as a sentence ends in a full stop; the step's name doesn't.
      const undoStep = `Cancel the plan “${what.replace(/\.\s*$/, '')}”`;
      /** Planned sims off the board, with their links and records. */
      const removeSims = (ids: ReadonlySet<string>) => {
        const nextCore = nodesCore.filter((n) => !ids.has(n.id));
        const nextEdges = edges.filter((e) => !ids.has(e.a) && !ids.has(e.b));
        pinCardsToCurrentPlaces(nextEdges, nextCore);
        setEdges(nextEdges);
        setHouseholdMoves((ms) => ms.filter((m) => !ids.has(m.simId)));
        setDeceasedMarks((ms) => ms.filter((m) => !ids.has(m.simId)));
        setSimAgeUps((ms) => ms.filter((m) => !ids.has(m.simId)));
        if (editNodeId && ids.has(editNodeId)) setEditNodeId(null);
        if (bloodlineId && ids.has(bloodlineId)) setBloodlineId(null);
        if (sel?.type === 'node' && ids.has(sel.id)) setSel(null);
      };

      if (entry.kind === 'end') {
        return setEnding(entry.edgeIds[0] ?? '', false);
      }

      if (entry.kind === 'move') {
        const wanted = new Set(entry.moveIds ?? (entry.moveId ? [entry.moveId] : []));
        const recs = householdMoves.filter((m) => wanted.has(m.id) && !m.done);
        const first = recs[0];
        if (!first) return false;
        // A planned sim that came onto the board: there is nowhere in the game to go back to.
        if (first.fromHh === ADDED_HOUSEHOLD) {
          const n = nodesCore.find((x) => x.id === first.simId);
          if (!n || !isPlannedSim(n)) return false;
          pushUndo(undoStep);
          trackAction('/action/cancel-plan');
          removeSims(new Set([n.id]));
          flashStatus(`Cancelled: ${named(cardName(n))} is off the board. Undo brings them back.`);
          return true;
        }
        // Each sim's moves are a story: this step goes, and the rest stay.
        const story = (simId: string) =>
          householdMoves
            .filter((m) => m.simId === simId && !m.done)
            .sort((x, y) => (x.createdAt < y.createdAt ? -1 : x.createdAt > y.createdAt ? 1 : 0));
        const stitched = new Map<string, HouseholdMove>();
        const lastSteps: HouseholdMove[] = [];
        for (const m of recs) {
          const chain = story(m.simId);
          const next = chain[chain.findIndex((x) => x.id === m.id) + 1];
          if (!next) {
            lastSteps.push(m);
            continue;
          }
          // A step in the middle: the next one now starts where this one did;
          // the card stays. A next step that then goes nowhere goes too.
          if (next.toGid === m.fromGid) wanted.add(next.id);
          else stitched.set(next.id, { ...next, fromGid: m.fromGid, fromHh: m.fromHh, fromWorld: m.fromWorld, fromNb: m.fromNb });
        }
        const dropMoves = () =>
          setHouseholdMoves((ms) => ms.filter((m) => !wanted.has(m.id)).map((m) => stitched.get(m.id) ?? m));
        if (!lastSteps.length) {
          pushUndo(undoStep);
          trackAction('/action/cancel-plan');
          dropMoves();
          flashStatus(
            stitched.size
              ? `Cancelled that move; the moves after it now start from the ${first.fromHh} household. Undo brings it back.`
              : `Cancelled that move, and the move back after it, which now goes nowhere. Undo brings them back.`,
          );
          return true;
        }
        // The story's last step: back where the step before it left them.
        const step = lastSteps[0]!;
        const simIds = new Set(lastSteps.map((m) => m.simId));
        const here = byid[step.simId];
        if (!here) return false;
        // A household that changed worlds goes back whole, with the deceased
        // and planned sims who went along, unless it joined others there.
        const whole = movesHousehold(step);
        const members = nodes.filter((n) => n.gid === here.gid);
        const ids = whole && members.every((n) => simIds.has(n.id) || !movesInGame(n)) ? members.map((n) => n.id) : [...simIds];
        const home = groups.find((g) => g.gid === step.fromGid);
        const dest = moveDestination(groups, nodes, worlds, step.fromWorld, home ? home.gid : NEW_HOUSEHOLD, step.fromHh);
        if (!dest) return false;
        const { patches } = householdMovePlan(nodes, ids, dest);
        pushUndo(undoStep);
        trackAction('/action/cancel-plan');
        const newGroup: Group | null = dest.isNew
          ? { gid: dest.gid, hh: dest.hh, world: dest.world, nb: dest.nb, color: dest.color, x: 0, y: 0, w: 0, h: 0 }
          : null;
        if (newGroup) setGroups((gs) => (gs.some((x) => x.gid === newGroup.gid) ? gs : [...gs, newGroup]));
        dropMoves();
        if (patches.size) {
          landCards(patches, dest.gid, newGroup);
          // From the Log they may be anywhere: show where they went.
          if (view) frameNextRef.current = { ids, ...view };
          else lockViewToSims(ids);
        }
        if (briefGid === here.gid && ids.length === members.length) setBriefGid(dest.gid);
        flashStatus(
          whole
            ? `Cancelled: the ${dest.hh} household is back in ${dest.world}. Undo brings the plan back.`
            : `Cancelled: ${ids.length === 1 ? `${named(cardName(here))} is` : `${ids.length} sims are`} back in the ${named(dest.hh)} household. Undo brings the plan back.`,
        );
        return true;
      }

      if (entry.kind !== 'link') return false;
      const wanted = new Set(entry.edgeIds);
      const planned = edges.filter((e) => wanted.has(e.id) && edgeSourceOf(e) === 'planned');
      if (!planned.length) return false;
      // A planned baby whose parents are all planned is a plan itself: it goes.
      const childId = planned.every((e) => e.type === 'parent' && e.b === planned[0]!.b) ? planned[0]!.b : null;
      const child = childId ? nodesCore.find((n) => n.id === childId) : undefined;
      if (
        child &&
        isPlannedSim(child) &&
        edges.filter((e) => e.type === 'parent' && e.b === child.id).every((e) => edgeSourceOf(e) === 'planned')
      ) {
        pushUndo(undoStep);
        trackAction('/action/cancel-plan');
        removeSims(new Set([child.id]));
        flashStatus(`Cancelled: ${named(cardName(child))} won’t be born. Undo brings the plan back.`);
        return true;
      }
      pushUndo(undoStep);
      trackAction('/action/cancel-plan');
      const gone = new Set(planned.map((e) => e.id));
      const nextEdges = edges.filter((e) => !gone.has(e.id));
      freezeAfterEdgeChange(planned.flatMap((e) => [e.a, e.b]), nextEdges);
      setEdges(nextEdges);
      if (sel?.type === 'link' && sel.ids.some((id) => gone.has(id))) setSel(null);
      flashStatus(`Cancelled the plan: “${what}” Undo brings it back.`);
      return true;
    },
    [
      edges,
      nodes,
      nodesCore,
      groups,
      worlds,
      byid,
      householdMoves,
      sel,
      editNodeId,
      bloodlineId,
      briefGid,
      setBriefGid,
      pushUndo,
      landCards,
      lockViewToSims,
      pinCardsToCurrentPlaces,
      freezeAfterEdgeChange,
      setEnding,
      flashStatus,
    ],
  );

  /** The link the partner menu makes, remembered for next time. */
  const setPartnerChoice = useCallback((choice: PartnerChoice) => {
    setPartnerMenu((m) => (m ? { ...m, choice } : m));
    try {
      localStorage.setItem(PARTNER_CHOICE_KEY, choice);
    } catch {
      // Private mode: it is forgotten when the page closes.
    }
  }, []);

  const closePartnerMenu = useCallback(() => {
    setPartnerMenu(null);
    // Its hint goes; a "Linked ✓" or a move just made stays to be read.
    setStatus((cur) => (cur.startsWith(PARTNER_HINT) ? '' : cur));
  }, []);

  /** A ＋ (a card's, or a couple's): a new sim, or one to adopt. */
  const openChildMenu = useCallback(
    (parents: string[], x: number, y: number, couple?: { rx: number; ry: number }) => {
      if (!parents.length || parents.some((id) => !byid[id])) return;
      setConnectMenu(null);
      setConnSrc(null);
      setPartnerMenu(null);
      if (parents.length === 1) setSel({ type: 'node', id: parents[0]! });
      setChildMenu({ parents, x, y, step: 'choose', ...(couple ? { couple } : {}) });
    },
    [byid],
  );

  const closeChildMenu = useCallback(() => setChildMenu(null), []);

  const setChildMenuStep = useCallback(
    (step: ChildMenuState['step']) => setChildMenu((m) => (m ? { ...m, step } : m)),
    [],
  );

  /**
   * `parents` (one sim, or a couple together) adopt `child`: a planned parent
   * link from each, marked adopted and bundled as a couple's child is, done
   * once a save shows it. One Undo takes it all back. Living apart, the menu
   * then asks whether the child moves in. False, with why on the status
   * line, when it can't be.
   */
  const adoptChild = useCallback(
    (parents: string[], child: string): boolean => {
      const C = byid[child];
      const ps = parents.map((id) => byid[id]).filter((n): n is SimNode => !!n);
      if (!C || ps.length !== parents.length || !ps.length) return false;
      for (const P of ps) {
        const why = whyNotAdopt(P, C, edges, plannedChildIds) ?? parentCycleReason(P.id, child);
        if (why) {
          flashStatus(`Not adopted: ${why}`);
          return false;
        }
      }
      pushUndo(`Plan ${ps.map((p) => named(cardName(p))).join(' and ')} adopting ${named(cardName(C))}`);
      const bundleId = 'b' + eidcRef.current++;
      const createdAt = new Date().toISOString();
      const nextEdges = sanitizeEdges([
        ...edges,
        ...ps.map((P): Edge => ({
          id: 'u' + eidcRef.current++,
          a: P.id,
          b: child,
          type: 'parent',
          source: 'planned',
          createdAt,
          adopted: true,
          ...(ps.length > 1 ? { bundleId } : {}),
        })),
      ]);
      setEdges(nextEdges);
      freezeAfterEdgeChange([...parents, child], nextEdges);
      trackAction(ps.length > 1 ? '/action/adopt-couple' : '/action/adopt');
      const who = ps.map((P) => named(cardName(P))).join(' and ');
      flashStatus(`Planned ✓ ${who} ${ps.length > 1 ? 'adopt' : 'adopts'} ${named(cardName(C))}, until a save shows it. Undo takes it back.`);
      const homes = ps.filter((P) => P.gid !== C.gid && !hasNoHome(P));
      if (homes.length && !ps.some((P) => P.gid === C.gid)) {
        setChildMenu((m) => (m ? { ...m, step: 'move', picked: child } : m));
      } else setChildMenu(null);
      return true;
    },
    [byid, edges, plannedChildIds, parentCycleReason, pushUndo, freezeAfterEdgeChange, flashStatus],
  );

  /**
   * A partner picked in the menu. Clicked on the board, the link is all:
   * you can see where they are. Picked by name for a marriage or a romance,
   * with the two in different households, the menu then asks whether one
   * moves in with the other.
   */
  const pickPartner = useCallback(
    (b: string, by: 'name' | 'board') => {
      const menu = partnerMenu;
      if (!menu || menu.picked || b === menu.id) return;
      if (!linkPartner(menu.id, b, menu.choice)) return;
      const [A, B] = [byid[menu.id], byid[b]];
      const together = menu.choice === 'marriage' || menu.choice === 'romance';
      const apart = !!A && !!B && A.gid !== B.gid && (!hasNoHome(A) || !hasNoHome(B));
      if (by === 'name' && together && apart) setPartnerMenu({ ...menu, picked: b });
      else setPartnerMenu(null);
    },
    [partnerMenu, linkPartner, byid],
  );

  const fit = useCallback((svgWidth: number, svgHeight: number) => {
    const [x0, y0, x1, y1] = bbox(nodes, nodeVis);
    const w = x1 - x0;
    const h = y1 - y0;
    const k = Math.min(svgWidth / (w + 120), svgHeight / (h + 120), 1.1);
    setViewport({
      k,
      tx: (svgWidth - w * k) / 2 - x0 * k,
      ty: (svgHeight - h * k) / 2 - y0 * k,
    });
  }, [nodes, nodeVis]);

  /**
   * Fit once a board just set is laid out. A fit queued with setTimeout ran
   * with the old board's cards, so a Replace framed the board it replaced.
   */
  const fitNextRef = useRef<{ w: number; h: number } | null>(null);
  const fitWhenLaidOut = useCallback((svgWidth: number, svgHeight: number) => {
    fitNextRef.current = { w: svgWidth, h: svgHeight };
  }, []);
  useEffect(() => {
    const next = fitNextRef.current;
    if (!next) return;
    fitNextRef.current = null;
    fit(next.w, next.h);
  }, [fit]);

  /**
   * Lay the whole board out afresh, as the starter board is: worlds in columns
   * by how many households and sims they have, each household packed tight.
   * Every card moves, so it is one undo step, and the view frames the result.
   */
  const organiseBoard = useCallback(
    (svgWidth: number, svgHeight: number) => {
      pushUndo('Organise the board');
      trackAction('/action/organise');
      const fresh = nodesCore.map((n) => (n.ox || n.oy ? { ...n, ox: 0, oy: 0 } : n));
      const laid = computeLayout(fresh, worlds, edges);
      releaseLayout();
      setNodesCore(
        coreOffsetsAfterWorldSeparation(
          fresh,
          snap ? snapNodesToTiles(laid) : laid,
          groups,
          () => true,
        ),
      );
      fitWhenLaidOut(svgWidth, svgHeight);
      flashStatus(
        'Board organised: worlds in columns by households and sims, each household packed. Undo puts it back.',
      );
    },
    [nodesCore, worlds, edges, groups, snap, pushUndo, releaseLayout, fitWhenLaidOut, flashStatus],
  );

  /**
   * Frame a single world. Two differences from `fit`: the zoom cap is above 1 so
   * picking a small world magnifies it rather than just recentring the board,
   * and `insetRight` keeps the result clear of the legend panel, which would
   * otherwise cover the right edge of the very world that was just clicked.
   */
  const zoomToWorld = useCallback(
    (
      world: string,
      svgWidth: number,
      svgHeight: number,
      insetRight: number = 0,
    ) => {
      const inWorld = (n: SimNode) => nodeVis(n) && n.world === world;
      const lots = lotBoxes.get(world);
      if (!nodes.some(inWorld) && !lots) return;
      const [x0, y0, x1, y1] = withLots(nodes.some(inWorld) ? bbox(nodes, inWorld) : null, lots ? [lots] : []);
      const w = x1 - x0;
      const h = y1 - y0;
      const pad = 80;
      const availW = Math.max(svgWidth - insetRight, 240);
      const k = Math.min(
        availW / (w + pad * 2),
        svgHeight / (h + pad * 2),
        1.4,
      );
      setViewport({
        k,
        tx: (availW - w * k) / 2 - x0 * k,
        ty: (svgHeight - h * k) / 2 - y0 * k,
      });
    },
    [nodes, nodeVis, lotBoxes],
  );

  const resetView = useCallback(() => setViewport(INITIAL_VIEW), []);

  const boardBounds = useMemo(
    () => withLots(bbox(nodes, nodeVis), [...lotBoxes.values()]),
    [nodes, nodeVis, lotBoxes],
  );
  /** Lowest zoom on a stage this size: low enough to show the whole board. */
  const minZoom = useCallback(
    (svgWidth: number, svgHeight: number) => zoomFloor(boardBounds, svgWidth, svgHeight),
    [boardBounds],
  );

  const zoomAt = useCallback(
    (f: number, cx: number, cy: number, svgRect: DOMRect) => {
      const floor = minZoom(svgRect.width, svgRect.height);
      setViewport((v) => zoomViewportAt(v, f, cx, cy, svgRect, floor));
    },
    [minZoom],
  );

  const focusLogEntry = useCallback(
    (ids: string[], svgWidth: number, svgHeight: number) => {
      setSel({ type: 'link', ids });
      const e = edges.find((x) => ids.includes(x.id));
      if (e) trackAction(`/action/link/${e.type}`);
      if (!e) return;
      const n =
        e.type === 'parent'
          ? (byid[e.b] ?? byid[e.a])
          : (byid[e.a] ?? byid[e.b]);
      if (n) frameSim(n, svgWidth, svgHeight);
    },
    [edges, byid, frameSim],
  );

  /**
   * Fits sims on screen together, however far apart they live: a dynasty's
   * members across worlds. Never closer in than a single sim is shown.
   */
  const frameSims = useCallback(
    (ids: Iterable<string>, svgWidth: number, svgHeight: number) => {
      const cards = [...ids].map((id) => byid[id]).filter((n): n is SimNode => !!n);
      if (!cards.length) return;
      const x0 = Math.min(...cards.map((n) => n.x));
      const y0 = Math.min(...cards.map((n) => n.y));
      const x1 = Math.max(...cards.map((n) => n.x + n.w));
      const y1 = Math.max(...cards.map((n) => n.y + n.h));
      // Clear of what floats over the board: the banner on top and, on a
      // wide screen, the key down the right and the minimap at the bottom.
      const wide = svgWidth > 700;
      const pad = { l: 40, r: wide ? 210 : 24, t: 110, b: wide ? 90 : 120 };
      const w = Math.max(1, svgWidth - pad.l - pad.r);
      const h = Math.max(1, svgHeight - pad.t - pad.b);
      const k = Math.max(ZOOM_MIN, Math.min(FOCUS_SIM_K, w / (x1 - x0), h / (y1 - y0)));
      setViewport({
        k,
        tx: pad.l + w / 2 - ((x0 + x1) / 2) * k,
        ty: pad.t + h / 2 - ((y0 + y1) / 2) * k,
      });
    },
    [byid],
  );
  // Frame sims a cancel moved, once their cards are in their new places.
  useEffect(() => {
    const next = frameNextRef.current;
    if (!next) return;
    frameNextRef.current = null;
    frameSims(next.ids, next.w, next.h);
  }, [frameSims]);

  const focusSim = useCallback(
    (id: string, svgWidth: number, svgHeight: number) => {
      const n = byid[id];
      if (!n) return;
      setSel({ type: 'node', id });
      frameSim(n, svgWidth, svgHeight);
    },
    [byid, frameSim],
  );

  const boardSourceLabel = sourceFileName
    ? sourceFileName
    : fromBrowserDraft
      ? 'Browser draft'
      : 'Example board';

  const resetToBuiltInBoard = useCallback(
    (svgWidth: number, svgHeight: number) => {
      if (!draftGuardRef.current!.clear()) setStaleTab(true);
      const migrated = migrateWhiteboardData(seed);
      const seedEdges = sanitizeEdges(
        migrated.edges.map((e) => ({
          ...e,
          source:
            e.source ?? (String(e.id).charAt(0) === 'u' ? 'planned' : 'seed'),
        })),
      );
      releaseLayout();
      setNodesCore(migrated.nodes.map((n) => toCore(n)));
      setEdges(seedEdges);
      setGroups((migrated.groups ?? seed.groups).map((g) => ({ ...g })));
      setHiddenPacks(new Set());
      setHiddenPlay(new Set());
      setHiAges(new Set());
      setHiSingle(false);
      setHideSecrets(false);
      setHideDeceased(false);
      setBloodlineId(null);
      setHouseholdMoves([]);
      setHouseholdAgeUps([]);
      setDeceasedMarks([]);
      setSimAgeUps([]);
      setPairStatus([]);
      setSaveGame(null);
      setChronicle([]);
      setSourceFileName(null);
      setFromBrowserDraft(false);
      undoRef.current = [];
      redoRef.current = [];
      setUndoWhat(null);
      setRedoWhat(null);
      setSel(null);
      setEditNodeId(null);
      eidcRef.current = nextEidc(seedEdges, 100000);
      skipAutosaveRef.current = true;
      trackAction('/action/reset-board');
      flashStatus('Reset the board');
      fitWhenLaidOut(svgWidth, svgHeight);
    },
    [seed, flashStatus, fitWhenLaidOut, releaseLayout],
  );

  const saveJson = useCallback(() => {
    const blob = new Blob(
      [JSON.stringify(persistPayload(), null, 1)],
      { type: 'application/json' },
    );
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `sims4_family_trees_${fileStamp()}.json`;
    a.click();
    trackAction('/action/save-json');
  }, [persistPayload]);

  const applyLoadedJson = useCallback(
    (
      file: File,
      text: string,
      svgWidth: number,
      svgHeight: number,
      keepBoardPositions = false,
    ) => {
      try {
        const parsed = JSON.parse(text) as WhiteboardData & {
          layoutEpoch?: number;
        };
        const d = migrateWhiteboardData(parsed);
        const loadedEdges = sanitizeEdges(d.edges);
        const prepared = prepareLoadedBoard({
          nodes: fillMissingSavePacks(d.nodes as SimNode[], seed.nodes),
          layoutEpoch: parsed.layoutEpoch,
          worlds,
          edges: loadedEdges,
          groups: (d.groups as Group[]) ?? groups,
        });
        // Premade template ids become readable household names, nothing moves.
        const fileNamed = withReadableHouseholdNames({
          core: prepared.nodes,
          groups: prepared.groups,
          worlds,
          edges: loadedEdges,
        });
        const fileGroups = fileNamed.groups;
        const loadedCore = keepBoardPositions
          ? separateLoadOverlaps({
              core: pinCoreToTargets(
                jsonLoadTargets({
                  keepBoardPositions: true,
                  boardVisualById: byid,
                  fileCore: fileNamed.core,
                  fileEdges: loadedEdges,
                  worlds,
                }),
                fileNamed.core,
                worlds,
                loadedEdges,
              ),
              boardById: byid,
              edges: loadedEdges,
              groups: fileGroups,
              worlds,
              snap,
            })
          : fileNamed.core;
        releaseLayout();
        setNodesCore(loadedCore);
        setEdges(loadedEdges);
        const loadedMoves = d.householdMoves ?? [];
        const loadedAgeUps = d.householdAgeUps ?? [];
        const loadedDeaths = d.deceasedMarks ?? [];
        const loadedSimAgeUps = d.simAgeUps ?? [];
        setHouseholdMoves(loadedMoves);
        setHouseholdAgeUps(loadedAgeUps);
        setDeceasedMarks(loadedDeaths);
        setSimAgeUps(loadedSimAgeUps);
        setPairStatus(d.pairStatus ?? []);
        setSaveGame(d.saveGame ?? null);
        setChronicle(d.chronicle ?? []);
        eidcRef.current = nextEidc(
          loadedEdges,
          eidcRef.current,
          [
            ...loadedMoves.map((m) => m.id),
            ...loadedAgeUps.map((a) => a.id),
            ...loadedDeaths.map((m) => m.id),
            ...loadedSimAgeUps.map((a) => a.id),
          ],
        );
        undoRef.current = [];
        redoRef.current = [];
        setUndoWhat(null);
        setRedoWhat(null);
        if (d.groups || prepared.realmHouseholds) setGroups(fileGroups);
        setHiddenPacks(new Set(d.hiddenPacks || []));
        setHiddenPlay(new Set(d.hiddenPlay || []));
        setHiAges(new Set(d.hiAges || []));
        setHiSingle(!!d.hiSingle);
        setHideSecrets(!!d.hideSecrets);
        setHideDeceased(!!d.hideDeceased);
        const loadedIds = new Set((d.nodes as SimNode[]).map((n) => n.id));
        setBloodlineId(
          d.bloodlineId && loadedIds.has(d.bloodlineId)
            ? d.bloodlineId
            : null,
        );
        setSel(null);
        setEditNodeId(null);
        setSourceFileName(file.name);
        setFromBrowserDraft(false);
        setPendingLoadJson(null);
        trackAction('/action/load-json');
        if (keepBoardPositions) {
          flashStatus(
            `Loaded ${file.name} — sims already on the board kept their positions.`,
          );
        } else if (prepared.repacked) {
          flashStatus(
            'Older save — board re-packed for the current layout. Download JSON to keep it.',
          );
        } else if (prepared.realmHouseholds) {
          flashStatus(`Loaded ${file.name}. ${realmMovedText(prepared.realmHouseholds)}`);
        } else {
          flashStatus(`Loaded ${file.name}`);
        }
        setTimeout(() => {
          if (!keepBoardPositions && prepared.repacked) {
            // Fresh pack only. A loaded board may have user-overlapped worlds.
            releaseLayout();
            setNodesCore((core) => {
              const laid = snap
                ? snapNodesToTiles(computeLayout(core, worlds, loadedEdges))
                : computeLayout(core, worlds, loadedEdges);
              return coreOffsetsAfterWorldSeparation(
                core,
                laid,
                fileGroups,
                () => true,
              );
            });
          }
          // Kept positions mean "leave my board as it is" — the view included.
          if (!keepBoardPositions) fit(svgWidth, svgHeight);
        }, 0);
      } catch {
        alert('Bad file');
        setPendingLoadJson(null);
      }
    },
    [fit, snap, worlds, groups, byid, flashStatus, seed.nodes, releaseLayout],
  );

  /**
   * Read the file up front so the dialog can say whether it is too old to
   * restore placements. Knowing that after the board had already changed
   * would be no use — the point is to decide before anything happens.
   */
  const loadJson = useCallback(
    (file: File, svgWidth: number, svgHeight: number) => {
      const rd = new FileReader();
      rd.onload = () => {
        const text = String(rd.result ?? '');
        let willRepack = false;
        let filtersNote: string | null = null;
        try {
          const parsed = JSON.parse(text) as Parameters<typeof fileFilters>[0] & {
            layoutEpoch?: number;
          };
          willRepack = shouldRepackOffsets(parsed.layoutEpoch);
          filtersNote = filterChangeNote(
            {
              hiddenPacks: [...hiddenPacks],
              hiddenPlay: [...hiddenPlay],
              hiAges: [...hiAges],
              hiSingle,
              hideSecrets,
              hideDeceased,
            },
            fileFilters(parsed),
          );
        } catch {
          // Unparseable: nothing to choose about, so say so straight away.
          applyLoadedJson(file, text, svgWidth, svgHeight);
          return;
        }
        const risk = loadJsonRisk(nodesCore, edges, {
          canUndo,
          sourceFileName,
          fromBrowserDraft,
        });
        // Always ask, even over the untouched starter board: which card
        // positions win is a choice there too (see LoadJsonDialog).
        setPendingLoadJson({
          file,
          text,
          svgWidth,
          svgHeight,
          risk,
          willRepack,
          filtersNote,
        });
      };
      rd.readAsText(file);
    },
    [
      nodesCore,
      edges,
      canUndo,
      sourceFileName,
      fromBrowserDraft,
      hiddenPacks,
      hiddenPlay,
      hiAges,
      hiSingle,
      hideSecrets,
      hideDeceased,
      applyLoadedJson,
    ],
  );

  const cancelLoadJson = useCallback(() => setPendingLoadJson(null), []);

  const confirmReplaceJson = useCallback((keepBoardPositions: boolean) => {
    const pending = pendingLoadJson;
    if (!pending) return;
    applyLoadedJson(
      pending.file,
      pending.text,
      pending.svgWidth,
      pending.svgHeight,
      keepBoardPositions,
    );
  }, [pendingLoadJson, applyLoadedJson]);

  const confirmMergeJson = useCallback((keepBoardPositions: boolean) => {
    const pending = pendingLoadJson;
    if (!pending) return;
    try {
        const parsed = JSON.parse(pending.text) as WhiteboardData & {
          layoutEpoch?: number;
        };
        const d = migrateWhiteboardData(parsed);
        const incomingEdges = sanitizeEdges(d.edges);
        const prepared = prepareLoadedBoard({
          nodes: fillMissingSavePacks(d.nodes as SimNode[], seed.nodes),
          layoutEpoch: parsed.layoutEpoch,
          worlds,
          edges: incomingEdges,
          groups: (d.groups as Group[]) ?? [],
        });
        const fileNamed = withReadableHouseholdNames({
          core: prepared.nodes,
          groups: prepared.groups,
          worlds,
          edges: incomingEdges,
        });
        pushUndo('Merge a board file', { filters: true });
        const merged = mergeJsonIntoBoard({
          boardNodes: nodesCore,
          boardEdges: edges,
          boardGroups: groups,
          incomingNodes: fileNamed.core,
          incomingEdges,
          incomingGroups: fileNamed.groups,
          keepBoardPositions,
        });
        // New sims and links move layout bases, so pin cards to real screen
        // positions rather than trusting the raw ox/oy the merge copied.
        const pinned = pinCoreToTargets(
          jsonLoadTargets({
            keepBoardPositions,
            boardVisualById: byid,
            fileCore: fileNamed.core,
            fileEdges: incomingEdges,
            worlds,
          }),
          merged.nodes,
          worlds,
          merged.edges,
        );
        releaseLayout();
        setNodesCore(
          keepBoardPositions
            ? separateLoadOverlaps({
                core: pinned,
                boardById: byid,
                edges: merged.edges,
                groups: merged.groups,
                worlds,
                snap,
              })
            : pinned,
        );
        setEdges(merged.edges);
        setGroups(merged.groups);
        eidcRef.current = nextEidc(merged.edges, eidcRef.current);
        if (d.pairStatus?.length) {
          setPairStatus((prev) => mergePairStatus(prev, d.pairStatus!));
        }
        // The board's own save details win; a board without any takes the file's.
        if (d.saveGame) setSaveGame((prev) => prev ?? d.saveGame!);
        // The file's story joins the board's: every upload once, in the game's order.
        if (d.chronicle?.length) setChronicle((prev) => mergeChronicles(prev, d.chronicle!));
        if (d.householdMoves?.length) {
          setHouseholdMoves((prev) => {
            const seen = new Set(prev.map((m) => m.id));
            const extra = d.householdMoves!.filter((m) => !seen.has(m.id));
            return extra.length ? [...prev, ...extra] : prev;
          });
        }
        const incomingFilters = fileFilters(d);
        if (pending.filtersNote && incomingFilters) {
          setHiddenPacks(new Set(incomingFilters.hiddenPacks));
          setHiddenPlay(new Set(incomingFilters.hiddenPlay));
          setHiAges(new Set(incomingFilters.hiAges));
          setHiSingle(incomingFilters.hiSingle);
          setHideSecrets(!!incomingFilters.hideSecrets);
          setHideDeceased(!!incomingFilters.hideDeceased);
        }
        setSourceFileName(pending.file.name);
        setFromBrowserDraft(false);
        setPendingLoadJson(null);
        setSel(null);
        trackAction('/action/load-json');
        const s = merged.summary;
        flashStatus(
          `JSON merged — ${s.nodesUpdated} updated, ${s.nodesAdded} added, ${s.relationshipsOverwritten} relationships overwritten.${pending.filtersNote ? ' Filters now match the file.' : ''} Download JSON to keep it.`,
        );
        setTimeout(() => {
          // New worlds from the file take free room, wherever that moves them.
          if (!keepBoardPositions) releaseLayout();
          setNodesCore((core) => {
            // Kept positions were already fitted around the board above.
            if (keepBoardPositions) return core;
            const movable = introducedWorldNames(nodesCore, core);
            if (!movable.size) return core;
            const laid = snap
              ? snapNodesToTiles(computeLayout(core, worlds, merged.edges))
              : computeLayout(core, worlds, merged.edges);
            return coreOffsetsAfterWorldSeparation(
              core,
              laid,
              merged.groups,
              () => true,
              movable,
            );
          });
          // Kept positions mean "leave my board as it is" — the view included.
          if (!keepBoardPositions) fit(pending.svgWidth, pending.svgHeight);
        }, 0);
    } catch {
      alert('Bad file');
      setPendingLoadJson(null);
    }
  }, [
    pendingLoadJson,
    nodesCore,
    edges,
    groups,
    worlds,
    byid,
    snap,
    pushUndo,
    flashStatus,
    fit,
    seed.nodes,
    releaseLayout,
  ]);

  const applySaveBoard = useCallback(
    (
      result: SaveMergeResult,
      svgWidth: number,
      svgHeight: number,
      mode: 'merge' | 'replace',
      /** Replace only: carry the board's story on (a newer save of the same game). */
      keepStory = false,
    ) => {
      // The story since the last upload, told only between two saves of the
      // same game: a board's first save, or Replace, starts the story.
      const goesOn = mode === 'merge' || keepStory;
      const told =
        goesOn && saveGame
          ? saveRecap({ nodes: nodesCore, edges, saveGame }, { nodes: result.nodes, edges: result.edges, saveGame: result.saveGame })
          : null;
      // The chronicle: this upload's story, or the start of one.
      if (result.saveGame) {
        const start = told
          ? undefined
          : {
              sims: result.nodes.filter((n) => n.saveSimId && !n.species && n.state !== DECEASED_STATE).length,
              households: new Set(result.nodes.filter((n) => n.saveSimId && !isUnhousedGid(n.gid)).map((n) => n.gid)).size,
            };
        const entry = chronicleEntry(result.saveGame, { recap: told && recapHasNews(told) ? told : null, ...(start ? { start } : {}) });
        if (told && !recapHasNews(told)) {
          // Nothing happened since: the story has no new page.
        } else setChronicle((prev) => withEntry(goesOn ? prev : [], entry));
      }
      if (told && recapHasNews(told)) {
        setRecap(told);
        setRecapOpen(true);
        setCelebrateIds(new Set(told.celebrate));
        if (celebrateTimer.current) clearTimeout(celebrateTimer.current);
        celebrateTimer.current = setTimeout(() => setCelebrateIds(new Set()), 9000);
      } else if (mode === 'replace') {
        setRecap(null);
      }
      if (mode === 'replace') {
        undoRef.current = [];
        redoRef.current = [];
        setUndoWhat(null);
        setRedoWhat(null);
        setHouseholdMoves([]);
        setHouseholdAgeUps([]);
        setDeceasedMarks([]);
        setSimAgeUps([]);
        setHiddenPlay(new Set());
        setHiAges(new Set());
        setHiSingle(false);
        setHideSecrets(false);
        setHideDeceased(false);
        setBloodlineId(null);
        setFromBrowserDraft(false);
        setSourceFileName(null);
      } else {
        pushUndo('Merge your save');
      }
      setEdges(result.edges);
      setGroups(result.groups);
      setPairStatus(result.pairStatus);
      setSaveGame(result.saveGame);
      // Nothing on an untouched starter roster is the player's arrangement,
      // so a merge into it is laid out afresh, as Replace is.
      const fresh = mode === 'merge' && isUntouchedStarter(nodesCore, seed.nodes);
      releaseLayout();
      setNodesCore(
        saveImportCore({
          mode: fresh ? 'replace' : mode,
          boardById: byid,
          nodes: fresh ? result.nodes.map((n) => (n.ox || n.oy ? { ...n, ox: 0, oy: 0 } : n)) : result.nodes,
          edges: result.edges,
          groups: result.groups,
          worlds,
          snap,
          rehomed: new Set(result.rehomed),
        }),
      );
      eidcRef.current = nextEidc(result.edges, eidcRef.current);
      const s = result.summary;
      const wasHidden = mode === 'replace' ? new Set<string>() : hiddenPacks;
      const nextHidden = hiddenPacksAfterImport({
        hidden: wasHidden,
        hidePacks: s.hidePacks,
        before: mode === 'replace' ? [] : nodesCore.map((n) => n.pack),
        after: result.nodes.map((n) => n.pack),
      });
      setHiddenPacks(nextHidden);
      const off = [...nextHidden].filter((p) => !wasHidden.has(p));
      const on = [...wasHidden].filter((p) => !nextHidden.has(p));
      const games = [
        off.length ? ` Switched off in Filters, not in your save: ${off.join(', ')}.` : '',
        on.length ? ` Switched back on: ${on.join(', ')}.` : '',
      ].join('');
      setSaveImport(null);
      setSel(null);
      setEditNodeId(null);
      trackAction('/action/load-save');
      flashStatus(
        mode === 'replace'
          ? `Board replaced from save — ${result.nodes.length} cards.${games} Download JSON to keep it.`
          : `Save merged — ${s.matched} updated, ${s.added} added.${fresh ? ' The board was still the starter roster, so it is laid out afresh.' : ''}${planNote(s.slotsFilled.length, planConflicts(result.nodes, result.edges).length)}${games} Download JSON to keep this merge.`,
      );
      fitWhenLaidOut(svgWidth, svgHeight);
    },
    [byid, worlds, pushUndo, flashStatus, fitWhenLaidOut, snap, hiddenPacks, nodesCore, edges, saveGame, releaseLayout, seed.nodes],
  );

  const previewSave = useCallback((file: File) => {
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const buf = new Uint8Array(rd.result as ArrayBuffer);
        const parsed = parseSaveGame(buf);
        let n = eidcRef.current;
        const merge = mergeSaveIntoBoard({
          nodes: nodesCore,
          edges,
          groups,
          worlds,
          pairStatus,
          parsed,
          seedNameKeys: seedNameKeysFromNodes(seed.nodes),
          packReference: seed.nodes,
          rosterEdges: seed.edges,
          movedByHand: new Set(householdMoves.filter((m) => !m.done).map((m) => m.simId)),
          game: saveGame,
          fileName: file.name,
          now: new Date().toISOString(),
          nextEdgeId: () => 'v' + n++,
        });
        setSaveImport({
          merge,
          parsed,
          starter: isStarterBoard(nodesCore, seed.nodes),
          untouched: boardContentMatchesBuiltIn(persistPayload(), seed),
          fresh: isUntouchedStarter(nodesCore, seed.nodes),
          plan: planReview(merge, parsed, nodesCore, edges, householdMoves),
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Could not read that save';
        alert(msg);
      }
    };
    rd.readAsArrayBuffer(file);
  }, [nodesCore, edges, groups, worlds, pairStatus, saveGame, seed, householdMoves, persistPayload]);

  const confirmSaveImport = useCallback(
    (svgWidth: number, svgHeight: number, choices?: PlanChoices) => {
      if (!saveImport) return;
      const matches = Object.entries(choices?.matches ?? {}).filter(([, save]) => !!save);
      const resolve = Object.entries(choices?.resolve ?? {}).filter(
        (x): x is [string, PlanChoice] => x[1] !== 'later',
      );
      if (!matches.length && !resolve.length) {
        applySaveBoard(saveImport.merge, svgWidth, svgHeight, 'merge');
        return;
      }
      // Following the game takes back a move made for the plan: the merge
      // then puts them where the save has them.
      const undone = resolve.flatMap(([edgeId, choice]) => {
        const m = choice === 'follow' ? saveImport.plan.moves[edgeId] : undefined;
        return m ? [m] : [];
      });
      const released = new Set(undone.map((m) => m.simId));
      let n = eidcRef.current;
      const merged = mergeSaveIntoBoard({
        nodes: nodesCore,
        edges,
        groups,
        worlds,
        pairStatus,
        parsed: saveImport.parsed,
        seedNameKeys: seedNameKeysFromNodes(seed.nodes),
        packReference: seed.nodes,
        rosterEdges: seed.edges,
        movedByHand: new Set(householdMoves.filter((m) => !m.done && !released.has(m.simId)).map((m) => m.simId)),
        slotMatches: new Map(matches.map(([slot, save]) => [save, slot])),
        game: saveGame,
        fileName: saveImport.merge.saveGame?.fileName,
        now: new Date().toISOString(),
        nextEdgeId: () => 'v' + n++,
      });
      // Then what you chose for each plan the game went against.
      const now = new Date().toISOString();
      let nodesR = merged.nodes;
      let edgesR = merged.edges;
      for (const [edgeId, choice] of resolve) {
        const c = planConflicts(nodesR, edgesR).find((x) => x.edgeId === edgeId);
        if (!c) continue;
        const r = resolvePlanConflict(nodesR, edgesR, c, choice, () => 'u' + n++, now);
        nodesR = r.nodes;
        edgesR = r.edges;
      }
      eidcRef.current = n;
      applySaveBoard(
        { ...merged, nodes: nodesR, edges: edgesR, rehomed: [...merged.rehomed, ...released] },
        svgWidth,
        svgHeight,
        'merge',
      );
      // Moves your save now shows done stop being plans.
      const done = movesDoneBySave(
        householdMoves.filter((m) => !released.has(m.simId)),
        nodesR,
        saveImport.parsed.sims,
      );
      if (undone.length || done.size) {
        const ids = new Set(undone.map((m) => m.id));
        setHouseholdMoves((ms) =>
          ms.filter((m) => !ids.has(m.id)).map((m) => (done.has(m.id) ? { ...m, done: true as const } : m)),
        );
      }
    },
    [saveImport, applySaveBoard, nodesCore, edges, groups, worlds, pairStatus, seed.nodes, seed.edges, householdMoves, saveGame],
  );

  /**
   * An off-plan link, resolved in the editor (see resolvePlanConflict).
   * Following the game also takes back a move into the planned partner's
   * household.
   */
  const resolvePlanItem = useCallback(
    (edgeId: string, choice: PlanChoice) => {
      const c = planIssues.find((x) => x.edgeId === edgeId);
      if (!c) return;
      const link = edges.find((e) => e.id === edgeId);
      const pair = link ? ` for ${named(nameOfCore(link.a))} and ${named(nameOfCore(link.b))}` : '';
      pushUndo(choice === 'keep' ? `Keep the plan${pair}` : choice === 'drop' ? `Drop the plan${pair}` : `Follow your game${pair}`);
      let n = eidcRef.current;
      const r = resolvePlanConflict(nodesCore, edges, c, choice, () => 'u' + n++, new Date().toISOString());
      eidcRef.current = n;
      const back = choice === 'follow' ? moveToUndo(c, nodesCore, householdMoves) : null;
      const home = back ? groups.find((g) => g.gid === back.fromGid) : undefined;
      let room = '';
      if (back && home) {
        // Back in their household as the board shows it, nothing else moving.
        const landed = landMovedCards({
          core: r.nodes,
          laid: nodes,
          worlds,
          edges: r.edges,
          groups,
          patches: new Map([[back.simId, { gid: home.gid, hh: home.hh, world: home.world, nb: home.nb, color: home.color }]]),
          destGid: home.gid,
          newGroup: null,
          view: viewRect(),
        });
        setNodesCore(landed.core);
        if (landed.outOfView) revealBox(landed.box);
        room = placeNote(landed);
        setHouseholdMoves((ms) => ms.filter((m) => m.id !== back.id));
      } else pinCardsToCurrentPlaces(r.edges, r.nodes);
      setEdges(r.edges);
      flashStatus(
        choice === 'keep'
          ? 'Plan kept: it stays violet.'
          : choice === 'drop'
            ? 'Plan dropped.'
            : `Following your game${back && home ? `: ${nameOfCore(back.simId)} is back in ${home.hh}` : ''}.${room}`,
      );
    },
    [planIssues, pushUndo, nodesCore, nodes, worlds, edges, householdMoves, groups, pinCardsToCurrentPlaces, flashStatus, nameOfCore, viewRect, revealBox],
  );

  /** "This is …": a sim from the save fills a planned sim by hand. */
  const linkPlanned = useCallback(
    (slotId: string, realId: string) => {
      const slot = nodesCore.find((x) => x.id === slotId);
      const real = nodesCore.find((x) => x.id === realId);
      if (!slot || !real) return;
      pushUndo(`Match ${named(cardName(real))} to ${named(cardName(slot))}`);
      const r = linkPlannedSim(nodesCore, edges, slotId, realId, new Date().toISOString());
      setEdges(r.edges);
      setHouseholdMoves((ms) => ms.filter((m) => m.simId !== slotId));
      if (bloodlineId === slotId) setBloodlineId(realId);
      pinCardsToCurrentPlaces(r.edges, r.nodes);
      setSel({ type: 'node', id: realId });
      setEditNodeId(null);
      const over = r.overruled.map((id) => nodesCore.find((x) => x.id === id)).filter((x) => !!x);
      flashStatus(
        `${named(cardName(real))} now fills ${named(cardName(slot))}.` +
          (over.length
            ? ` Parents come from your save, so ${over.map((x) => named(cardName(x))).join(' & ')} ${over.length === 1 ? 'is' : 'are'} no longer a planned parent.`
            : ''),
      );
    },
    [nodesCore, edges, pushUndo, bloodlineId, pinCardsToCurrentPlaces, flashStatus],
  );

  /** Undoes a fill: the planned sim comes back beside the real one. */
  const unlinkPlanned = useCallback(
    (id: string) => {
      const real = nodesCore.find((x) => x.id === id);
      if (!real?.plannedAs) return;
      pushUndo(`Unlink ${named(cardName(real))} from their plan`);
      let n = eidcRef.current;
      const r = unlinkPlannedSim(nodesCore, edges, id, () => 'new' + n++, () => 'u' + n++);
      eidcRef.current = n;
      setEdges(r.edges);
      pinCardsToCurrentPlaces(r.edges, r.nodes, r.plannedId ? new Set([r.plannedId]) : undefined);
      setEditNodeId(null);
      flashStatus(`${named(real.plannedAs.label)} is planned again; ${named(cardName(real))} stays as in your save.`);
    },
    [nodesCore, edges, pushUndo, pinCardsToCurrentPlaces, flashStatus],
  );

  const confirmSaveReplace = useCallback(
    (svgWidth: number, svgHeight: number, keepStory = false) => {
      if (!saveImport) return;
      let n = eidcRef.current;
      const replaced = mergeSaveIntoBoard({
        nodes: [],
        edges: [],
        groups: [],
        worlds,
        parsed: saveImport.parsed,
        seedNameKeys: seedNameKeysFromNodes(seed.nodes),
        packReference: seed.nodes,
        rosterEdges: seed.edges,
        fileName: saveImport.merge.saveGame?.fileName,
        now: new Date().toISOString(),
        nextEdgeId: () => 'v' + n++,
      });
      // Switch off the games the dialog said it would: the preview's list,
      // measured against the board as well as the roster. Games stay listed
      // in Filters with no sims, so one you don't have shows there, off.
      applySaveBoard(
        {
          ...replaced,
          summary: { ...replaced.summary, hidePacks: saveImport.merge.summary.hidePacks },
        },
        svgWidth,
        svgHeight,
        'replace',
        keepStory,
      );
    },
    [saveImport, worlds, seed.nodes, seed.edges, applySaveBoard],
  );

  const cancelSaveImport = useCallback(() => setSaveImport(null), []);

  const togglePack = useCallback((pack: string, visible: boolean) => {
    setHiddenPacks((s) => {
      const next = new Set(s);
      if (visible) next.delete(pack);
      else next.add(pack);
      return next;
    });
  }, []);

  const toggleAge = useCallback((age: string) => {
    setHiAges((s) => {
      const next = new Set(s);
      if (next.has(age)) next.delete(age);
      else next.add(age);
      return next;
    });
  }, []);

  const toggleSingle = useCallback(() => {
    setHiSingle((on) => !on);
  }, []);

  /**
   * Move sims to a household on the board, or to a new one, as one undo
   * step. Their cards stay where they are, as a single sim's do; the
   * selection stays too, so they can be dragged into place. Returns where
   * they went, how many moved (sims already there are skipped), and how
   * many of them are back where the game has them: a new step in their
   * story, which the bin in the Log can take back instead.
   */
  const moveSimsToHousehold = useCallback(
    (
      ids: string[],
      world: string,
      houseGid: string,
      newName?: string,
    ): { dest: MoveDestination; moved: number; back: number } | null => {
      const dest = moveDestination(groups, nodes, worlds, world, houseGid, newName);
      if (!dest) return null;
      const { patches, moves } = householdMovePlan(nodes, ids, dest);
      if (!patches.size) return { dest, moved: 0, back: 0 };
      const homes = gameHomes(nodes, householdMoves);
      const back = [...patches.keys()].filter((id) => homes.get(id) === dest.gid).length;
      const [only] = patches.keys();
      pushUndo(
        `Move ${patches.size === 1 && only ? simCalled(only) : `${patches.size} sims`} to ${dest.isNew && dest.lot ? named(dest.lot) : theHousehold(dest.hh, named)}`,
      );
      if (dest.isNew) {
        setGroups((gs) =>
          gs.some((g) => g.gid === dest.gid)
            ? gs
            : [
                ...gs,
                {
                  gid: dest.gid,
                  hh: dest.hh,
                  world: dest.world,
                  nb: dest.nb,
                  ...(dest.lot ? { lot: dest.lot } : {}),
                  color: dest.color,
                  x: 0,
                  y: 0,
                  w: 0,
                  h: 0,
                },
              ],
        );
      }
      const createdAt = new Date().toISOString();
      setHouseholdMoves((ms) => [...ms, ...moves.map((m) => ({ ...m, id: 'h' + eidcRef.current++, createdAt }))]);
      // One pass for every card: patching them one by one would each start
      // from the same old board and keep only the last.
      const apply = (ns: SimNode[]) =>
        ns.map((n) => {
          const patch = patches.get(n.id);
          return patch ? toCore({ ...n, ...patch }) : n;
        });
      pinCardsToCurrentPlaces(edges, apply(nodesCore));
      return { dest, moved: patches.size, back };
    },
    [groups, nodes, nodesCore, worlds, edges, householdMoves, pushUndo, pinCardsToCurrentPlaces, simCalled],
  );

  /**
   * Sims move into a free lot, as one undo step: a new household there
   * called `name`. A whole household that moves keeps its name; in its own
   * world it only changes lots, and from another it moves there whole.
   */
  const moveIntoLot = useCallback(
    (ids: string[], lot: GameLot, name: string) => {
      const movers = ids.map((id) => byid[id]).filter((n): n is SimNode => !!n);
      if (!movers.length) return;
      const gids = new Set(movers.map((n) => n.gid));
      const [only] = gids;
      const g = gids.size === 1 && only && !isUnhousedGid(only) ? groups.find((x) => x.gid === only) : undefined;
      const whole = !!g && nodes.filter((n) => n.gid === g.gid).every((n) => ids.includes(n.id));
      if (g && whole && g.world === lot.world) {
        const was = homes.get(g.gid);
        pushUndo(`Move ${theHousehold(g.hh, named)} to ${named(lot.name)}`);
        trackAction('/action/household-lot');
        setGroups((gs) => gs.map((x) => (x.gid === g.gid ? { ...x, lot: lot.name, nb: lot.nb } : x)));
        pinCardsToCurrentPlaces(
          edges,
          nodesCore.map((n) => (n.gid === g.gid ? toCore({ ...n, lot: lot.name, nb: lot.nb }) : n)),
        );
        flashStatus(
          `The ${named(g.hh)} household moves to ${named(lot.name)} in ${lot.nb}${was ? `, and ${named(was.name)} is free` : ''}. Undo takes it back.`,
        );
        return;
      }
      if (g && whole) {
        moveHouseholdToWorld(g.gid, lot.world, lotPick(lot));
        return;
      }
      const done = moveSimsToHousehold(ids, lot.world, lotPick(lot), name);
      if (!done || !done.moved) return;
      setMultiSel({ kind: 'nodes', ids: movers.map((n) => n.id) });
      const who = done.moved === 1 ? cardName(movers[0]!) : `${done.moved} sims`;
      flashStatus(
        `${named(who)} ${done.moved === 1 ? 'moves' : 'move'} to ${named(lot.name)} in ${lot.nb}, the ${named(done.dest.hh)} household. Their cards stay put: drag them into place. Undo with ⌘Z.`,
      );
    },
    [byid, groups, nodes, nodesCore, edges, homes, pushUndo, pinCardsToCurrentPlaces, flashStatus, moveHouseholdToWorld, moveSimsToHousehold],
  );

  const moveSimToHousehold = useCallback(
    (nodeId: string, world: string, houseGid: string, newName?: string) => {
      const done = moveSimsToHousehold([nodeId], world, houseGid, newName);
      if (!done) return;
      setEditNodeId(null);
      const n = byid[nodeId];
      if (done.back && n) {
        flashStatus(
          `${named(cardName(n))} moves back to the ${named(done.dest.hh)} household: a new step in your plan. To drop their earlier move instead, use the bin on it in the Log.`,
        );
      }
    },
    [moveSimsToHousehold, byid, flashStatus],
  );

  /**
   * Shift-click (or a tap in Select): add a sim to the selected sims, or take
   * them out. A sim selected on their own joins, so click one and Shift-click
   * the next to pick both.
   */
  const toggleSimInSelection = useCallback(
    (id: string) => {
      const base =
        multiSel?.kind === 'nodes'
          ? multiSel.ids
          : sel?.type === 'node' && sel.id !== id
            ? [sel.id]
            : [];
      const ids = base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
      setSel(null);
      setMultiSel(ids.length ? { kind: 'nodes', ids } : null);
    },
    [multiSel, sel],
  );

  const ageUpHousehold = useCallback(
    (gid: string) => {
      const members = nodesCore.filter((n) => n.gid === gid);
      if (!members.length) return;
      const nextById = new Map<string, Partial<SimNode>>();
      for (const n of members) {
        const patch = ageUpPatch(n);
        if (!patch) continue;
        nextById.set(n.id, patch);
      }
      if (!nextById.size) {
        flashStatus('No one in this household can age up.');
        return;
      }
      pushUndo(`Age up ${theHousehold(members[0]!.hh, named)}`);
      const nextCore = nodesCore.map((n) => {
        const patch = nextById.get(n.id);
        return patch ? { ...n, ...patch } : n;
      });
      pinCardsToCurrentPlaces(edges, nextCore);
      const g = groups.find((x) => x.gid === gid);
      const sample = members[0]!;
      const hh = g?.hh ?? sample.hh;
      const nb = g?.nb ?? sample.nb;
      const world = g?.world ?? sample.world;
      const createdAt = new Date().toISOString();
      const diedIds = [...nextById.entries()]
        .filter(([, patch]) => patch.state === DECEASED_STATE)
        .map(([id]) => id);
      setHouseholdAgeUps((es) => [
        ...es,
        {
          id: 'a' + eidcRef.current++,
          createdAt,
          gid,
          hh,
          nb,
          world,
          simIds: [...nextById.keys()],
        },
      ]);
      if (diedIds.length) {
        setDeceasedMarks((ms) => [
          ...ms,
          ...diedIds.map((simId) => ({
            id: 'd' + eidcRef.current++,
            simId,
            createdAt,
            cause: 'ageUp' as const,
          })),
        ]);
      }
      trackAction('/action/age-up');
      flashStatus(householdAgeUpLine(hh, nb, world));
    },
    [
      nodesCore,
      edges,
      groups,
      pinCardsToCurrentPlaces,
      pushUndo,
      flashStatus,
    ],
  );

  const toggleBloodline = useCallback(() => {
    if (sel?.type === 'node') {
      if (bloodlineId === sel.id) {
        setBloodlineId(null);
      } else {
        setBloodlineId(sel.id);
        // One sim's relatives at a time: Bloodline replaces a family highlight.
        setFamilyFocusState(false);
        setDynastyFocusState(null);
        trackAction('/action/bloodline');
      }
      return;
    }
    if (bloodlineId) {
      setBloodlineId(null);
      return;
    }
    flashStatus('Select a sim first, then Bloodline.');
  }, [sel, bloodlineId, flashStatus]);

  const toggleHideSecrets = useCallback(() => {
    const on = !hideSecrets;
    setHideSecrets(on);
    // A selected secret link would leave a label pointing at nothing.
    if (on && sel?.type === 'link' && edges.some((e) => e.secret && sel.ids.includes(e.id))) {
      setSel(null);
    }
    if (on) trackAction('/action/hide-secrets');
    flashStatus(
      on
        ? 'Secrets hidden — secret lovers and secret parents are off the board. They stay in your file.'
        : 'Secrets shown',
    );
  }, [hideSecrets, sel, edges, flashStatus]);

  /** Hide or show sims marked Deceased; their cards keep their places. */
  const toggleHideDeceased = useCallback(() => {
    const on = !hideDeceased;
    setHideDeceased(on);
    if (on && sel?.type === 'node' && byid[sel.id]?.state === DECEASED_STATE) setSel(null);
    if (on) trackAction('/action/hide-deceased');
    flashStatus(
      on
        ? 'Deceased sims hidden. They stay in your file, and their cards keep their places.'
        : 'Deceased sims shown',
    );
  }, [hideDeceased, sel, byid, flashStatus]);

  /** Sims marked Deceased on the board, shown or not. */
  const hasDeceased = useMemo(() => nodesCore.some((n) => n.state === DECEASED_STATE), [nodesCore]);

  const togglePlay = useCallback((oplay: string, visible: boolean) => {
    setHiddenPlay((s) => {
      const next = new Set(s);
      if (visible) next.delete(oplay);
      else next.add(oplay);
      return next;
    });
  }, []);

  // Every game, the roster's too, so one with no sims on the board (one you
  // don't have, switched off by a save import) stays listed and can be
  // switched on, rather than vanishing.
  const packs = useMemo(
    () =>
      [
        ...new Set(
          [...nodes.map((n) => n.pack), ...seed.nodes.map((n) => n.pack), ...hiddenPacks].filter(
            Boolean,
          ),
        ),
      ].sort((a, b) => (a === 'Base Game' ? -1 : b === 'Base Game' ? 1 : a.localeCompare(b))),
    [nodes, hiddenPacks, seed.nodes],
  );
  /** Cards on the board from each game. */
  const packCounts = useMemo(() => {
    const out = new Map<string, number>();
    for (const n of nodes) if (n.pack) out.set(n.pack, (out.get(n.pack) ?? 0) + 1);
    return out;
  }, [nodes]);
  /** Each game's colour: its world's, from the board or else the roster. */
  const packColors = useMemo(() => {
    const out = new Map<string, string>();
    for (const n of [...nodes, ...seed.nodes]) if (n.pack && !out.has(n.pack)) out.set(n.pack, n.color);
    return out;
  }, [nodes, seed.nodes]);

  const playabilities = useMemo(
    () =>
      [...new Set(nodesCore.map((n) => n.oplay).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b),
      ),
    [nodesCore],
  );

  const isSelLink = useCallback(
    (ids: string[]) =>
      sel?.type === 'link' && ids.some((i) => sel.ids.includes(i)),
    [sel],
  );

  return {
    nodes,
    edges,
    groups,
    worlds,
    hiddenPacks,
    hiddenPlay,
    show,
    viewport,
    sel,
    multiSel,
    setMultiSel,
    clearMultiSel,
    connectMode,
    selectMode,
    setSelectMode,
    connSrc,
    snap,
    hiAges,
    hiSingle,
    bloodlineId,
    bloodlineIds,
    linksView,
    setLinksView,
    familyFocus,
    dynastyFocus,
    setDynastyFocus,
    dynastyFocusIds,
    frameSims,
    setFamilyFocus,
    familyScope,
    setFamilyScope,
    family,
    familyIds,
    partneredIds,
    parentIds,
    status,
    fastRoute,
    editNodeId,
    setEditNodeId,
    briefGid,
    setBriefGid,
    briefHover,
    setBriefHover,
    planItems,
    notInGame,
    planTally,
    filtersOpen,
    setFiltersOpen,
    gamesOpen,
    setGamesOpen,
    agesOpen,
    setAgesOpen,
    playOpen,
    setPlayOpen,
    connectMenu,
    setConnectMenu,
    infantHouseMenu,
    setInfantHouseMenu,
    partnerMenu,
    openPartnerMenu,
    closePartnerMenu,
    childMenu,
    chronicle,
    lookBackAt,
    setLookBackAt,
    past,
    chronicleView,
    setChronicleView,
    addMenu,
    setAddMenu,
    openChildMenu,
    closeChildMenu,
    setChildMenuStep,
    adoptChild,
    setPartnerChoice,
    pickPartner,
    moveInWith,
    infantHouseChoices,
    requestInfantOfCouple,
    requestInfantOfSim,
    planPetYoung,
    renameDynasty,
    removeDynasty,
    confirmInfantHouse,
    logOpen,
    setLogOpen,
    upNextOpen,
    setUpNextOpen,
    dynastiesOpen,
    setDynastiesOpen,
    upNextSkipped,
    setUpNextSkipped,
    connectionLog,
    byid,
    packVis,
    playVis,
    nodeVis,
    nodeBuckets,
    homes,
    freeLots,
    lotBoxes,
    visibleAreaRef,
    recap,
    recapOpen,
    setRecapOpen,
    celebrateIds,
    edgeData,
    shownEdges,
    hideSecrets,
    hasSecrets,
    toggleHideSecrets,
    hideDeceased,
    hasDeceased,
    toggleHideDeceased,
    pairIndex,
    bloodVerts: bloodVertsMemo,
    hopD,
    visibleNodes,
    liveWorlds,
    boardTotals,
    packs,
    packCounts,
    packColors,
    playabilities,
    UEDIT,
    AGES_H,
    toggleShow,
    setConnectMode,
    cancelConnect,
    selectNode,
    selectLink,
    clearSel,
    addEdge,
    parentCycleReason,
    deleteSelected,
    deleteSims,
    deleteLinks,
    canDelete,
    simsToDelete,
    addSim,
    addSimToHousehold,
    petKinds,
    organiseBoard,
    updateNode,
    setDynastyGenRoot,
    dynastyGens,
    dynastyNames: dynastyNameMap,
    dynastyRisks,
    planIssues,
    offPlan,
    plannedChildIds,
    plannedParents,
    familyGens,
    generationOf,
    plannedCounts,
    setLogNote,
    resolvePlanItem,
    linkPlanned,
    unlinkPlanned,
    pushUndo,
    canUndo,
    undoWhat,
    undo,
    redoWhat,
    redo,
    ageUpHousehold,
    toggleBloodline,
    setBloodlineId,
    moveNodesByGid,
    moveNodesByWorld,
    moveNodesByIds,
    snapDragPosition,
    snapHouseholdDrag,
    snapNodeAction,
    handleConnectClick,
    handleConnectUnion,
    confirmConnect,
    fit,
    zoomToWorld,
    resetView,
    zoomAt,
    minZoom,
    focusLogEntry,
    focusSim,
    viewShift,
    sourceFileName,
    /** The board came from this browser's draft: someone has been here before. */
    fromBrowserDraft,
    boardSourceLabel,
    canResetBoard,
    staleTab,
    reloadBoard,
    resetToBuiltInBoard,
    saveJson,
    loadJson,
    cancelLoadJson,
    confirmReplaceJson,
    confirmMergeJson,
    pendingLoadJson,
    previewSave,
    confirmSaveImport,
    confirmSaveReplace,
    cancelSaveImport,
    saveImport,
    saveGame,
    togglePack,
    togglePlay,
    setHiddenPlay,
    toggleAge,
    toggleSingle,
    setHiAges,
    setHiSingle,
    setHiddenPacks,
    moveSimToHousehold,
    moveSimsToHousehold,
    moveIntoLot,
    moveHouseholdToWorld,
    cancelPlan,
    setEnding,
    toggleSimInSelection,
    isSelLink,
    setSnap,
    setStatus,
    flashStatus,
    setFastRoute,
    setSkipRoute,
    setViewport,
  };
}

export type WhiteboardApi = ReturnType<typeof useWhiteboard>;
