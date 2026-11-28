import type { ChronicleEntry } from '../lib/chronicle.ts';

/** 👑 the dynasty's head, ⚜️ its heir, 🥀 an outcast it declared. */
export type DynastyRole = 'head' | 'heir' | 'outcast';

/**
 * A sim's own pronouns, as the game keeps them when a player sets them in
 * Create a Sim: they / them / their / theirs / themself.
 */
export type SimPronouns = {
  subject: string;
  object: string;
  /** Before a noun: their name. */
  possessive: string;
  /** On its own: it is theirs. */
  independent: string;
  reflexive: string;
};

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
  /**
   * The game lot their household lives on ("Brook Bungalow"), once a move
   * into a lot or a save import says; '-' for a household with none. Absent
   * on boards from before lots: a premade household is then where the game
   * puts it (see householdLots).
   */
  lot?: string;
  /** The save's exact zone ID for a residential rental unit. */
  lotZone?: string;
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
   * A planned sim's number among the unnamed planned sims sharing its last
   * name, when two or more do: "Planned (2) Le Chien" until it has a name or
   * a plan label. Counted afresh on every change (numberPlannedSims).
   */
  planNo?: number;
  /**
   * How a planned child joins, when chosen from a household's ＋ ("A
   * child"): born, or adopted. Their parents are links, if any; this says
   * a child with none is still a child (Not born yet, Parents not on the
   * board), not a sim moving in.
   */
  arrives?: 'born' | 'adopted';
  /**
   * What this card was while planned, before a sim from the save filled it:
   * the editor's "Planned as Heir 1", and what Unlink restores.
   */
  plannedAs?: PlannedAs;
  /**
   * The pronouns the game uses for this sim, when the player set them in
   * Create a Sim. They decide `gender` on import: she is Female, he is
   * Male, and any other (they, xie) is Non-Binary.
   */
  pronouns?: SimPronouns;
  /** Sims 4 sim id from an imported .save, as a decimal string. */
  saveSimId?: string;
  /**
   * Game ids this sim had in other saves the board read (a Save As, a split
   * save, a gallery re-import): an older save still finds them by id.
   */
  pastSaveIds?: string[];
  /** Titles they hold or held: the game's noble titles from the save, and your own (see SimTitle). */
  titles?: SimTitle[];
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
  /**
   * A dynasty planned on the board with a name another dynasty already has
   * (a second "Scott"): its own board id, so the two stay apart until a
   * save gives it the game's id. A dynasty with a name of its own has none.
   */
  dynastyRef?: string;
  /** Their place in it, marked on the card. Plain members have none. */
  dynastyRole?: DynastyRole;
  /**
   * Their dynasty or role is a plan, set on the board and not in a save yet,
   * like a violet link: `member` when the board puts them in `dynasty`
   * (with `dynastyRole`, or none), `role` when the save has them in it with
   * another role, `none` when they are to leave it (the fields stay the
   * game's until then). A save showing it done ends the plan.
   */
  dynastyPlan?: 'role' | 'member' | 'none';
  /**
   * A plan generations ahead: this sim becomes heir once the sim with this
   * id (their dynasty's heir, or one planned after them) is head. Always a
   * plan; one sim per place in line. A save that makes that sim head turns
   * it into a planned heir (see advanceSuccession).
   */
  heirAfter?: string;
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
   * Expecting, by the last save: when the baby is due, in game ticks (labour
   * comes when the game's pregnancy reaches 100, a point a sim hour, played
   * or not) and the other parent's card. Every upload refreshes it; it goes
   * once the baby comes.
   */
  pregnancy?: { dueAt: number; with?: string };
  /**
   * The tries for a baby that led to this one, as the player logged them on
   * its planned card, in order. The card keeps them once the save brings the
   * baby: "Born after 4 tries".
   */
  tries?: BabyTry[];
  /** Work, school, traits, skills and aspiration from the last save import (see SimAbout). */
  about?: SimAbout;
  /**
   * The household the game has them in, by the save's id for it, from the
   * last save that had them: a move planned on the board doesn't change it.
   * Their household's money (SaveGameInfo.households) is found by it.
   */
  hhId?: string;
  /**
   * Sims 4 family-tree id of a relative the save keeps only in its family
   * tree, with no sim and no name (an "Unknown" card), as a decimal string.
   */
  treeId?: string;
  /**
   * An import marked this relative deceased: their save, or the roster's
   * story for a nameless one. Later imports leave their life state as it
   * is, so one brought back to life by hand stays alive.
   */
  diedOnImport?: true;
  /** What family and friends call them ("Leo" for Leofstan), shown in quotes on the card. Set on the board. */
  nick?: string;
  /** The player's own words about them: their story, quirks, fun facts. Set on the board. */
  bio?: string;
  /**
   * How they died, in the player's words ("Childbirth", "The plague"). Set
   * on the board; it comes before the game's own cause (deathTrait).
   */
  deathCause?: string;
  /**
   * The game's record of how they died: the id of the ghost trait it gives
   * them (old age, fire, drowning…), from the last save that had one.
   */
  deathTrait?: string;
  /**
   * When they died in play, in game ticks, from the save's death record.
   * Set once, by the upload that first saw the death: their life state
   * changed then, and is the player's afterwards. Gone if the game brings
   * them back to life.
   */
  diedAt?: number;
  /**
   * Year of birth or death typed on the board, in the board's calendar
   * years (PlannerCalendar). They come before what the save tells, for a sim
   * born or dead before play, or one the save can't date.
   */
  yearBorn?: number;
  yearDied?: number;
}

/**
 * The board's own calendar for a historical or decades playthrough: game
 * Day 1 is `startYear`, and a year passes every `daysPerYear` sim days
 * ("1300", "2 days a year"). Years before 1 are told BCE.
 */
export interface PlannerCalendar {
  startYear: number;
  daysPerYear: number;
  /** Turned off on the board: the game's days show, and these years wait for it to be turned on again. */
  off?: true;
}

/** Days each life stage lasts, by stage name ("Teen": 12), as a mod like MCCC sets them. */
export type StageLengths = Partial<Record<string, number>>;

/** A try for a baby, logged by the player: the game day, and whether it took. */
export interface BabyTry {
  day: number;
  pregnant: boolean;
}

/** What the player keeps on the board beyond the family tree itself. */
export interface PlannerData {
  /**
   * The week's to-do in Up next (weekTodo.ts): the households it covers, and
   * what's ticked off, by item key. Undo leaves both as they are.
   */
  week?: { scope?: 'active' | 'played' | 'all'; done?: string[] };
  /**
   * Years for days on the board's cards, couples, story and posters, while
   * not `off`. None: the game's own days, and the player never set one.
   */
  calendar?: PlannerCalendar;
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
  /** Its number among planned sims of its surname, to restore on Unlink. */
  planNo?: number;
  /** How it was planned to join (born or adopted), to restore on Unlink. */
  arrives?: 'born' | 'adopted';
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
/**
 * A title a sim holds or held. The save gives Royalty & Legacy's noble
 * titles: a Noble career's (its level is the rank, 1 Knight to 10 King or
 * Queen), one held by marriage to a noble or as a noble's child, and a family
 * tree ancestor's (with its realm). You can give any sim titles of your own,
 * in your words, with a rank to order them and the days they began and ended.
 */
export type SimTitle = {
  /** "Grand Duchess", "High Priestess of the Moon". */
  title: string;
  /** What it is of: "Ondarion". */
  realm?: string;
  /** Higher outranks lower; the game's noble ranks are 1 to 10. */
  rank?: number;
  /** Game days it began and ended (abdicated, stripped, passed on). Typed years are kept as their first day. */
  from?: number;
  to?: number;
  /** From the save, which keeps it current: career, marriage, birth, or the family tree. */
  game?: 'career' | 'marriage' | 'birth' | 'tree';
  /** For a title by marriage or birth: the card of the noble it comes from. */
  via?: string;
};

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

/** A lot or unit from the save's world and zone records. */
export type SaveLotZone = {
  world: string;
  zone: string;
  hash: number;
  venue: number;
  name?: string;
  /** 0 for a residential rental's shared zone, 1 or higher for a unit. */
  unit?: number;
  beds?: number;
  baths?: number;
  occupied?: true;
};

/** The game clock, aging options and lot inventory from the last save import. */
/** A household as the save has it (SaveGameInfo.households). */
export interface SaveHousehold {
  name: string;
  /** Its money, in §. */
  funds: number;
  /** The lot it lives on; none for a household with no home. */
  lot?: string;
}

export interface SaveGameInfo {
  /** The save file's name. */
  fileName?: string;
  /** When the board read it (ISO time). */
  importedAt: string;
  /** Game ticks (90,000 a sim hour). */
  clock: number;
  lifespan?: Lifespan;
  /**
   * Days each life stage lasts in this game, as the player set them with a
   * mod like MCCC (Infant, Toddler, Child, Teen, Young Adult, Adult, Elder).
   * A stage set here counts by it; the rest by the game's lifespan. Kept
   * across uploads: the save can't say it.
   */
  stageLengths?: StageLengths;
  /** The player's stage lengths turned off: kept for when they turn them on again. */
  stageLengthsOff?: true;
  /** Days in a season (Seasons); a year is four seasons. */
  seasonDays?: number;
  /**
   * The season when the game saved and the tick it began, from the Seasons
   * calendar. Absent without Seasons: the board then counts days only.
   */
  season?: 'Spring' | 'Summer' | 'Fall' | 'Winter';
  seasonSince?: number;
  /**
   * The save's calendar: Seasons, or days alone (no Seasons pack). Absent
   * on imports from before the board read it.
   */
  calendar?: 'seasons' | 'days';
  /** Auto Age (Played Households): No, Yes or Only Active Household. */
  playedAging?: 'No' | 'Yes' | 'Active';
  /** Auto Age (Unplayed Households). */
  unplayedAging?: boolean;
  /** The household being played when the game saved: the last one played. */
  activeHousehold?: string;
  /** Its box on the board, as the import found its sims. */
  lastPlayedGid?: string;
  /** The game's ids of every household played in this save (the household record's played mark). */
  playedHouseholds?: string[];
  /**
   * The board read noble titles at this import (SimTitle): the next upload
   * tells a title that changed as news. Before, the board had none to compare.
   */
  titlesRead?: true;
  /**
   * The households played at earlier imports, newest first, without the
   * one active now: Up next suggests the one played longest ago first.
   */
  playedBefore?: string[];
  /** Clock of the first import where every household was aging. */
  allAgingSince?: number;
  /**
   * Each game dynasty's standing as the save stores it, by the board's key
   * for it (dynastyKey): its prestige, perk points and perks.
   */
  dynastyStanding?: Record<string, DynastyStanding>;
  lotZones?: SaveLotZone[];
  /**
   * The games this save doesn't have (packs.ts gamesMissingFromSave): their
   * features (dynasties, secrets, pets, life states) stay off. Absent on
   * boards from before, where the Games filter stands in.
   */
  gamesMissing?: string[];
  /**
   * Each household in the save, by the save's id for it: its name, its funds
   * (§), and the lot it lives on, which a move sells.
   */
  households?: Record<string, SaveHousehold>;
  /** What the board read from the save, with no names: for the problem report. */
  read?: SaveReadInfo;
  /** What the last upload did, in counts: for the problem report. */
  lastUpload?: SaveUploadInfo;
}

/**
 * A game dynasty's standing (Royalty & Legacy), as a save stores it. Boards
 * from before 2026-11-20 called the perk points "prestige"; they load as
 * perk points.
 */
export interface DynastyStanding {
  /** Prestige points: the game shows them as Prestige Level 0 to 10 (prestigeLevel). */
  prestige?: number;
  /** Perk points left to spend on Dynasty Perks. */
  perkPoints?: number;
  /** How many Dynasty Perks are active. */
  perks?: number;
  /**
   * The dynasty's crest as the game draws it: a shield and the emblem on it,
   * each a picture of the pack by its instance (public/game-crests/<id>.webp).
   */
  crest?: { shield?: string; emblem?: string };
  /** The dynasty's description, as written in the game (premades come with one). */
  description?: string;
}

/** A world record in an uploaded save, as the problem report lists it. */
export interface SaveWorldRecord {
  /** The game's id for the world, the same in every save and language. */
  id: number;
  /** Its name as the save stores it: in the game's language, or empty. */
  stored: string;
  /** The board world it was taken as; empty when none could be found. */
  world: string;
  /** How it was found: by its id, by its lots, or by the stored name. */
  by: 'id' | 'lots' | 'name';
  lots: number;
  /** Households whose home lot is in it. */
  homes: number;
}

/** Counts read from an uploaded save, and its world records. */
export interface SaveReadInfo {
  sims: number;
  households: number;
  /** Households the save lists with no home lot. */
  unhoused: number;
  worlds: SaveWorldRecord[];
}

/** What the last upload did to the board, in counts. */
export interface SaveUploadInfo {
  mode: 'merge' | 'replace';
  updated: number;
  added: number;
  toNotInWorld: number;
  unhoused: number;
  relatives: number;
  skipped: number;
  /** World names in the save that are not a board world (game text, no player names). */
  extraWorlds: string[];
  hidePacks: string[];
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
  | 'adoptive'
  | 'adoptedby'
  | 'coparents'
  | 'divorce'
  | 'breakup'
  | 'sibling'
  | 'custom';

export type EdgeSource = 'seed' | 'save' | 'planned';

/**
 * What a save says a sim does and is, as the game's ids: the board names
 * them from src/data/gameNames.json (built from the installed game) when
 * it shows them, so a pack the names don't cover yet shows nothing rather
 * than a number. Replaced by every save upload: the game's word, not the plan's.
 */
export type SimAbout = {
  /** Every trait id the save lists; the names say which are personality or earned, the rest stay off. */
  traits?: string[];
  /** Jobs, school, part-time work and after-school clubs: the career track (the branch), its level in that track (from 0), the level the game shows. */
  jobs?: { track: string; at: number; level: number }[];
  /** Skills and their points; the game's steps turn points into levels. */
  skills?: { id: string; points: number }[];
  /** The aspiration being followed (an aspiration track id). */
  aspiration?: string;
};

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
  /** On a parent link: an adoptive parent, as the save marks it. */
  adopted?: true;
  /**
   * Your note on this link: why you planned it. Stays when a save shows the
   * plan done, so the reason is still there in your game's history.
   */
  note?: string;
  /**
   * A planned end to a couple: a divorce for a marriage, a breakup for a
   * romance. The link stays as the game has it until a save shows it over;
   * then a marriage becomes the game's divorce, and a romance goes.
   */
  ending?: { createdAt: string; note?: string };
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
  /** The game lot it lives on, as its sims' `lot` says. */
  lot?: string;
  lotZone?: string;
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
  /**
   * A save import found the sim living in this household: the move, part of
   * your plan until then, is done, and later saves may move them on.
   */
  done?: true;
  /** Your note on this move: why you planned it. Stays once it's done. */
  note?: string;
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
  /** Where each world's Free lots box stands (LotBoxPins): it moves only when dragged or on Organise. */
  lotBoxAt?: LotBoxPins;
  /** Lot prices typed from the game, by lotKey: a planned move into the lot is checked against its household's funds. */
  lotPrices?: Record<string, number>;
  /** Game clock and aging options from the last save import. */
  saveGame?: SaveGameInfo | null;
  /** The board's story, one entry per save upload (absent on older files). */
  chronicle?: ChronicleEntry[];
  /** The player's calendar and records beyond the tree (absent on older files). */
  planner?: PlannerData;
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
  /** Each household's funds beside its tag's buttons. */
  funds: boolean;
}

/** Axis-aligned obstacle rectangle for routing. */
export interface Rect {
  l: number;
  t: number;
  r: number;
  b: number;
  id: string;
  /**
   * A stretch of a partner line, flat ('h') or upright ('v'), rather than a
   * box: other lines may cross it at right angles but not run along it.
   */
  line?: 'h' | 'v';
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
/**
 * An arrowhead on a line, showing which way the link runs: its tip, and the
 * way it points (a unit step along x or y).
 */
export interface Arrow {
  tip: Point;
  dir: Point;
}

export interface BloodPath {
  ids: string[];
  pts: Point[];
  /** Joins sims in different households: drawn thin and dashed. */
  cross?: true;
  /** Arrowheads drawn in the line's colour. */
  arrows?: Arrow[];
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
  /** A planned divorce or breakup: drawn violet, as it will be. */
  ending?: true;
  /** Arrowheads into each partner's card. */
  arrows?: Arrow[];
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
  /** Arrowhead into `b`'s card. */
  arrows?: Arrow[];
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

/**
 * Where a world's Free lots box stands, once the board first placed it: its
 * top-left and its columns, so it keeps its place and width while the lots
 * in it change. Only a drag (`byHand`) or Organise moves it.
 */
export type LotBoxPin = { x: number; y: number; cols: number; byHand?: true };
export type LotBoxPins = Record<string, LotBoxPin>;
