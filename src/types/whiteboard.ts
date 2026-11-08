/** 👑 the dynasty's head, ⚜️ its heir, 🥀 an outcast it declared. */
export type DynastyRole = 'head' | 'heir' | 'outcast';

/** A sim card on the whiteboard. */
export interface SimNode {
  id: string;
  gid: string;
  first: string;
  sur: string;
  age: string;
  state: string;
  gender: string;
  hh: string;
  world: string;
  nb: string;
  color: string;
  townie: boolean;
  oworld: string;
  onb: string;
  ohh: string;
  oplay: string;
  pack: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Drag offset from the auto-layout base position. Persisted; x/y are derived. */
  ox?: number;
  oy?: number;
  /** Pet only — Cat, Dog, or Horse. */
  species?: string;
  /** Pet only — breed name shown on the card detail line. */
  breed?: string;
  /** Present on user-added sims (editor). */
  added?: boolean;
  /**
   * A planned sim's role in the plan ("Heir 1", "Spare 1"), shown when it has
   * no name yet. Kept in `plannedAs` once a sim from the save fills it.
   */
  planLabel?: string;
  /**
   * What this card was while planned, before a sim from the save filled it:
   * the editor's "Planned as Heir 1", and what Unlink restores.
   */
  plannedAs?: PlannedAs;
  /** Sims 4 sim id from an imported .save, as a decimal string. */
  saveSimId?: string;
  /** In the save and not on the shipped xlsx roster. */
  fromSave?: boolean;
  /**
   * The surname the game gives this sim from their spouse (Vatore for
   * Cassandra Goth once she married Caleb). The card keeps `sur`, the
   * sim's own; when the two are the same, the player chose to show it.
   */
  marriedSur?: string;
  /** The dynasty this sim belongs to in the game (Royalty & Legacy), by name. */
  dynasty?: string;
  /** The game's id for that dynasty: two can share a name (a second "Ngata"). */
  dynastyId?: string;
  /** Their place in it, marked on the card. Plain members have none. */
  dynastyRole?: DynastyRole;
  /**
   * The role is a plan, set on the board and not in a save yet, like a
   * violet link: `role` when the save has them in the dynasty with another
   * role (or none), `member` when the board also put them in it. A save
   * showing the role ends the plan; one with them in another dynasty
   * overrules it.
   */
  dynastyPlan?: 'role' | 'member';
  /**
   * The dynasty (its `dynastyKey`) this sim was the first head of. Its
   * generations count from them, so a new head does not renumber anyone,
   * and it stays when they die or leave the dynasty.
   */
  firstHeadOf?: string;
  /**
   * The dynasty (its `dynastyKey`) whose generations count from this sim, as
   * Gen 1, picked in the editor. Without one, the count starts at the first
   * head's oldest known ancestor.
   */
  genRootOf?: string;
  /** Age facts from the last save import (see SimLife). Pets have none. */
  life?: SimLife;
  /**
   * Sims 4 family-tree id of a relative the save keeps only in its family
   * tree, with no sim and no name (an "Unknown" card), as a decimal string.
   */
  treeId?: string;
}

/** A planned sim as it was before a sim from the save filled it. */
export interface PlannedAs {
  /** Its plan label, or its name when it had none. */
  label: string;
  first: string;
  sur: string;
  gender: string;
  age: string;
  /** Its plan label, to restore on Unlink. */
  planLabel?: string;
  /** Its household box, to return to on Unlink. */
  gid: string;
  hh: string;
  world: string;
  nb: string;
  color: string;
  /**
   * Its planned parents the save overruled: the real sim has two other
   * parents (Dirk, planned father of the baby Beatrice had with Adekoya).
   * Unlink plans them again.
   */
  parents?: string[];
  /** ISO time it was filled. */
  at: string;
}

/** The game's Sim Lifespan option. */
export type Lifespan = 'Short' | 'Normal' | 'Long';

/**
 * A sim's age as the last save import read it. Stored raw, so the editor
 * works out days and years from the save's current settings.
 */
export interface SimLife {
  /** Game tick of birth: the save's clock minus the ticks they have lived. */
  born: number;
  /**
   * Days into their life stage, in Normal-lifespan days. The game keeps the
   * fraction of the stage when the lifespan changes, so this survives it.
   */
  stageDays: number;
  /** The life stage those days belong to; changing the card's age voids them. */
  stage: string;
  /** Still a newborn, the first part of infancy. */
  newborn?: true;
  /** Born during play. */
  inPlay?: true;
  /** The save's clock when this was read. */
  at: number;
  /** Why they were not aging when the game saved; absent when they were. */
  frozen?: 'inactive' | 'played' | 'unplayed';
}

/** The game clock and aging options from the last save import. */
export interface SaveGameInfo {
  /** The save file's name. */
  fileName?: string;
  /** When the board read it (ISO time). */
  importedAt: string;
  /** Game ticks (90,000 a sim hour). */
  clock: number;
  lifespan?: Lifespan;
  /** Days in a season (Seasons); a year is four seasons. */
  seasonDays?: number;
  /** Auto Age (Played Households): No, Yes or Only Active Household. */
  playedAging?: 'No' | 'Yes' | 'Active';
  /** Auto Age (Unplayed Households). */
  unplayedAging?: boolean;
  /** The household being played when the game saved. */
  activeHousehold?: string;
  /**
   * The households played at earlier imports, newest first, without the
   * one active now: Up next suggests the one played longest ago first.
   */
  playedBefore?: string[];
  /** Clock of the first import where every household was aging. */
  allAgingSince?: number;
}

export type EdgeType =
  | 'marriage'
  | 'romance'
  | 'divorced'
  | 'parent'
  | 'sibling'
  | 'custom';

/** What the Connect menu can make; see CONNECT_LINKS for the links each one adds. */
export type ConnectChoice =
  | 'marriage'
  | 'romance'
  | 'secretromance'
  | 'divorced'
  | 'parent'
  | 'secretparent'
  | 'childof'
  | 'secretchildof'
  | 'coparents'
  | 'sibling'
  | 'custom';

export type EdgeSource = 'seed' | 'save' | 'planned';

export interface Edge {
  id: string;
  a: string;
  b: string;
  type: EdgeType;
  /**
   * seed = shipped canon (gray, not in the log).
   * save = confirmed or created by a .save import (gray, in the log).
   * planned = board edit not in the save (violet, in the log).
   * Absent on older json: inferred from id (`u…` → planned, else seed).
   */
  source?: EdgeSource;
  /** ISO time when the user created this link. Absent on canon and older saves. */
  createdAt?: string;
  /** Shared by parent links created together (child of a couple). */
  bundleId?: string;
  /**
   * A planned link the game went against, kept anyway ("Keep my plan"): it
   * stays violet and stops being flagged off plan.
   */
  plan?: 'kept';
  /** Was planned on the board before a save confirmed it: a plan done. */
  wasPlanned?: true;
  /**
   * The save keeps this link secret: on a parent link, a secret parent the
   * family tree does not list; on a romance link, secret lovers.
   */
  secret?: true;
}

/** What two sims are to each other in the save (strongest of each kind). */
export type PairTag =
  | 'married'
  | 'engaged'
  | 'partners'
  | 'secretLovers'
  | 'divorced'
  | 'exes'
  | 'bestFriends'
  | 'goodFriends'
  | 'friends'
  | 'disliked'
  | 'despised'
  | 'enemies';

/** Relationship status between two board sims, from the last save import. */
export interface PairStatus {
  a: string;
  b: string;
  tags: PairTag[];
}

export interface Group {
  gid: string;
  hh: string;
  world: string;
  nb: string;
  color: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface World {
  name: string;
  color: string;
}

export interface HouseholdMove {
  id: string;
  simId: string;
  createdAt: string;
  fromGid: string;
  fromHh: string;
  fromWorld: string;
  fromNb: string;
  toGid: string;
  toHh: string;
  toWorld: string;
  toNb: string;
}

export interface DeceasedMark {
  id: string;
  simId: string;
  createdAt: string;
  /** Set when the sim died on a household age-up. Omitted for editor-set deceased. */
  cause?: 'ageUp';
}

/** Editor changed this sim to a later life stage on AGES_H. */
export interface SimAgeUp {
  id: string;
  simId: string;
  createdAt: string;
  /** Life stage after the edit. */
  age: string;
  hh: string;
  nb: string;
  world: string;
}

export interface HouseholdAgeUp {
  id: string;
  createdAt: string;
  gid: string;
  hh: string;
  nb: string;
  world: string;
  /** Sims whose age actually changed. */
  simIds: string[];
}

export interface WhiteboardData {
  nodes: SimNode[];
  edges: Edge[];
  groups: Group[];
  worlds: World[];
  /**
   * Packing-rules generation used when ox/oy were last meaningful.
   * Absent on older downloads — load may clear offsets and re-pack.
   */
  layoutEpoch?: number;
  /** Last loaded whiteboard JSON filename, if any. */
  sourceFileName?: string | null;
  /** Snapshot of user-made connection sentences, written on save. */
  connectionLog?: string[];
  /** Household moves the user made in the editor. Load trusts this, not the text snapshot. */
  householdMoves?: HouseholdMove[];
  /** Household age-up events. Load trusts this, not the text snapshot. */
  householdAgeUps?: HouseholdAgeUp[];
  /** Sims marked Deceased in the editor or by household age-up. Load trusts this, not the text snapshot. */
  deceasedMarks?: DeceasedMark[];
  /** Editor life-stage increases. Load trusts this, not the text snapshot. */
  simAgeUps?: SimAgeUp[];
  /** Relationship statuses read from the last save import. */
  pairStatus?: PairStatus[];
  /** Game clock and aging options from the last save import. */
  saveGame?: SaveGameInfo | null;
  /** Pack names hidden by the Games filter. */
  hiddenPacks?: string[];
  /** Origin-playability values hidden by the Play filter. */
  hiddenPlay?: string[];
  /** Age and pet-species chips highlighted by the Ages filter. */
  hiAges?: string[];
  /** Single-sims chip from the Ages filter. */
  hiSingle?: boolean;
  /** Hide secrets filter: secret lovers and secret parents stay off the board. */
  hideSecrets?: boolean;
  /** Hide deceased filter: sims marked Deceased stay off the board. */
  hideDeceased?: boolean;
  /** Sim whose ancestors and descendants stay undimmed. */
  bloodlineId?: string | null;
}

export type Selection =
  | { type: 'node'; id: string }
  | { type: 'link'; ids: string[] }
  | null;

/**
 * Marquee / multi-object selection for group drag.
 * One kind at a time: 2+ world frames → worlds; else tags/cards;
 * single world only via its name chip.
 */
export type BoardMultiSel =
  | { kind: 'worlds'; worlds: string[] }
  | { kind: 'households'; gids: string[] }
  | { kind: 'nodes'; ids: string[] };

/** Household and world boxes. Family links have their own view (LinksView). */
export interface ShowToggles {
  groups: boolean;
  worlds: boolean;
}

/** Axis-aligned obstacle rectangle for routing. */
export interface Rect {
  l: number;
  t: number;
  r: number;
  b: number;
  id: string;
}

/** 2D point as [x, y] tuple (path vertices). */
export type Point = [number, number];

export interface Viewport {
  tx: number;
  ty: number;
  k: number;
}

/** Connect-mode source: a sim id or a selected couple. */
export type ConnSrc = string | { union: [string, string] } | null;

/** Node-bounds box used by snapHousehold. */
export interface HhBox {
  minx: number;
  miny: number;
  maxx: number;
  maxy: number;
}

/** Drawn household box extent (includes title band). */
export interface HhBoxDraw {
  l: number;
  t: number;
  r: number;
  b: number;
}

export interface UnionGeom {
  sx: number;
  sy: number;
  ex: number;
  ey: number;
  rx: number;
  ry: number;
  pts: string;
}

/** Vertical segment in a blood-line polyline (for hop rendering). */
export interface BloodVert {
  x: number;
  y1: number;
  y2: number;
  pi: number;
}

/** A parent/sibling blood-line polyline. */
export interface BloodPath {
  ids: string[];
  pts: Point[];
  /** Joins sims in different households: drawn thin and dashed. */
  cross?: true;
}

/** Render data for a spouse union (marriage / romance / divorced). */
export interface UnionRender {
  edgeId: string;
  type: 'marriage' | 'romance' | 'divorced';
  a: string;
  b: string;
  pts: string;
  rx: number;
  ry: number;
  isUser: boolean;
  /** Secret lovers (a romance the save marks secret). */
  secret?: boolean;
  /** The partners live in different households: the line is thin and dashed. */
  cross?: true;
}

/** Lock badge on a child's top stem: one of its parents is secret. */
export interface SecretMark {
  child: string;
  at: Point;
  /** The secret parent links, so clicking the badge selects them. */
  ids: string[];
}

/** Render data for a custom link. */
export interface CustomRender {
  edgeId: string;
  a: string;
  b: string;
  pts: Point[];
  isUser: boolean;
}

export interface EdgeRenderData {
  blood: BloodPath[];
  unions: UnionRender[];
  customs: CustomRender[];
  /** Secret-parent badges. Absent when there are none. */
  secrets?: SecretMark[];
  rects: Rect[];
}

export interface BuildRectsResult {
  rects: Rect[];
  rbands: Record<number, Rect[]>;
}

export interface Guides {
  gx: number[];
  gy: number[];
}
