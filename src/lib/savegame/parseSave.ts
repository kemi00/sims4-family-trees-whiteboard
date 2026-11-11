import { TREE_NAMES } from '../../data/treeNames.ts';
import { AGES_H, NON_BINARY } from '../constants.ts';
import type { DynastyRole, PairTag, SimPronouns } from '../../types/whiteboard.ts';
import { readDbpf, SAVE_GAME_DATA_TYPE } from './dbpf.ts';
import { decodeFields, firstBytes, utf8 } from './protobuf.ts';
import { refpackDecompress } from './refpack.ts';

export type SaveRelType = 'parent' | 'marriage' | 'romance' | 'divorced';

export type ParsedSaveSim = {
  saveSimId: string;
  householdId: string;
  first: string;
  last: string;
  household: string;
  age: string;
  /**
   * The sim's gender as the game speaks of them: from their pronouns when
   * the player set some (she Female, he Male, any other Non-Binary), else
   * from the game's own two-value gender.
   */
  gender: string;
  /** The pronouns the player set in Create a Sim; absent for the game's default. */
  pronouns?: SimPronouns;
  species?: string;
  /** World name string from the save lot, if present. */
  world?: string;
  /**
   * Their household's home lot: the game's id for it (a building's units
   * share it) and, when the save keeps one, its name, which tells the units
   * apart. Matched against the game's lots (places.ts); the name is never
   * shown, as the player may have renamed it.
   */
  lot?: { hash: number; name?: string };
  /** The sim's household has no home lot ("Currently Not in World"). */
  unhoused?: true;
  /**
   * The game generated this sim while the player played (a walk-by, an
   * NPC, a townie for a role): its creation source is one of the game's
   * sim filters. Premade sims, sims made in Create a Sim and babies have
   * no such source.
   */
  generated?: true;
  /** The dynasty the sim belongs to (Royalty & Legacy), by name. */
  dynasty?: string;
  /** The game's id for that dynasty, as a decimal string. */
  dynastyId?: string;
  /** Head, heir or outcast of that dynasty; plain members have none. */
  dynastyRole?: DynastyRole;
  /**
   * Game ticks since the sim's birth. It runs on the game clock whatever the
   * aging settings, and a cake does not move it. The game back-dates a
   * premade by the Normal length of the stages before its own.
   */
  aliveTicks?: number;
  /**
   * Days into the current life stage, counted in days of the save's lifespan.
   * Only moves while the sim ages; a lifespan change rescales it.
   */
  stageDays?: number;
  /** In the first part of infancy (the game's own age for it). */
  newborn?: true;
  /** Born during play: the game's creation source says pregnancy. */
  bornInPlay?: true;
};

/** Played-household aging in Game Options: No, Yes, or Only Active Household. */
export type SavePlayedAging = 'No' | 'Yes' | 'Active';

/** The save's clock and the Game Options that decide how sims age. */
export type ParsedGameInfo = {
  /** Game ticks: 90,000 a sim hour. */
  clock: number;
  lifespan?: 'Short' | 'Normal' | 'Long';
  /** Days in a season (Seasons): 7, 14 or 28. */
  seasonDays?: number;
  playedAging?: SavePlayedAging;
  unplayedAging?: boolean;
  /** Household the player was in when the game saved. */
  activeHouseholdId?: string;
  /** Households the player has played. */
  playedHouseholds: string[];
};

export type ParsedSaveRel = {
  a: string;
  b: string;
  type: SaveRelType;
  /** Secret parent (parent rels) or secret lovers (romance rels). */
  secret?: true;
  /** An adoptive parent: in the family bits, not the family tree. */
  adopted?: true;
};

/**
 * Someone in the game's family tree who is not a sim in the save: a premade's
 * parent the game never made (Felix Hoffman's), or an ancestor the game has
 * since culled. The tree keeps their gender and, for the dead, how they died,
 * but their name only as a key into the game's own text, which the file does
 * not hold; TREE_NAMES has the names behind the keys it has seen.
 */
export type ParsedTreeRelative = {
  treeId: string;
  gender: string;
  /** The tree records how they died, or inferTreeDeaths works it out. */
  deceased?: true;
  /** No death in the tree: worked out from their children (inferTreeDeaths). */
  deathInferred?: true;
  /** Key of their full name in the game's text, as a decimal uint32. */
  nameKey?: string;
  /** Their full name ("Cordelia Thebe II"), when TREE_NAMES knows the key. */
  name?: string;
};

/** Relationship status between two save sims; only pairs with a known status. */
export type ParsedSavePair = {
  a: string;
  b: string;
  tags: PairTag[];
};

export type ParsedSave = {
  sims: ParsedSaveSim[];
  rels: ParsedSaveRel[];
  /** Household id → world of its home lot. Households without one are left out. */
  householdWorld?: Record<string, string>;
  /** World name strings present in the save (installed worlds), from the file. */
  worlds?: string[];
  /** Friendship and romance statuses from the save's relationship records. */
  pairs?: ParsedSavePair[];
  /** Family-tree people with no sim; `rels` link them like sims. */
  relatives?: ParsedTreeRelative[];
  /**
   * The save keeps dynasties (Royalty & Legacy), so a sim without one has
   * none in the game. Older saves leave this out and say nothing either way.
   */
  dynasties?: true;
  /** The game clock and aging options; absent when the save has no clock. */
  game?: ParsedGameInfo;
};

/**
 * SimInfo protobuf field numbers as stored in Save Game Data. Field 2 is the
 * zone (lot) the sim was on when the game saved, not its home: a sim visiting
 * a neighbour or out at a park carries that lot's id there.
 */
const SIM = {
  id: 1,
  householdId: 4,
  first: 5,
  last: 6,
  gender: 7,
  age: 8,
  householdName: 22,
  /** A float: days into the current life stage, in days of the save's lifespan. */
  stageDays: 13,
  /**
   * Gameplay data. Field 16 is the ticks since birth; field 17 names the
   * creation source ("filter: …" when generated, "pregnancy" when born in play).
   */
  creation: 47,
  species: 60,
  /**
   * Pronouns set in Create a Sim: one entry (field 1) per case, each with
   * the case (1) and the word (2). Cases 1 to 5 are subject, object,
   * possessive, independent possessive and reflexive: they, them, their,
   * theirs, themself. Checked on 2026-11-11 in a real save, where 90 sims
   * have them (Dani Davila they/them, Esther Gomes xie/xem) and the rest
   * have none and use the game's default for their gender.
   */
  pronouns: 69,
} as const;

const PRONOUN_CASES = ['subject', 'object', 'possessive', 'independent', 'reflexive'] as const;

/** A sim's pronouns from their SimInfo field 69, or undefined with none set. */
function parsePronouns(bytes: Uint8Array): SimPronouns | undefined {
  const out: Partial<SimPronouns> = {};
  for (const entry of decodeFields(bytes)) {
    if (entry.field !== 1 || !entry.bytes) continue;
    const fields = decodeFields(entry.bytes);
    const kase = fields.find((f) => f.field === 1 && f.wire === 0)?.int;
    const word = (utf8(fields.find((f) => f.field === 2 && f.bytes)?.bytes ?? null) ?? '').trim();
    const key = kase === undefined ? undefined : PRONOUN_CASES[Number(kase) - 1];
    if (key && word) out[key] = word;
  }
  if (!out.subject) return undefined;
  return {
    subject: out.subject,
    object: out.object ?? out.subject,
    possessive: out.possessive ?? out.object ?? out.subject,
    independent: out.independent ?? out.possessive ?? out.subject,
    reflexive: out.reflexive ?? `${out.object ?? out.subject}self`,
  };
}

/**
 * A sim's gender as their pronouns say it: she is Female, he is Male, and
 * any other (they, xie, ze) is Non-Binary. Without pronouns, the game's
 * own gender stands.
 */
export function genderFromPronouns(pronouns: SimPronouns | undefined, gameGender: string): string {
  const subject = pronouns?.subject.toLocaleLowerCase();
  if (!subject) return gameGender;
  if (subject === 'she') return 'Female';
  if (subject === 'he') return 'Male';
  return NON_BINARY;
}

/** Household records (Save Game Data field 5). Field 31 is 1 once played. */
const HOUSEHOLD = {
  id: 2,
  name: 3,
  homeZone: 4,
  played: 31,
} as const;

/**
 * Game Options live in Save Game Data field 3 → 14 → 2. Checked on
 * 2026-11-06/07 by changing one option at a time in a real save: 3 is Sim
 * Lifespan, 8 Auto Age (Played Households), 9 Auto Age (Unplayed
 * Households), 12 Season Length. Played aging 0 (No) is inferred; 1 and 2
 * were seen.
 */
const OPTION = { lifespan: 3, playedAging: 8, unplayedAging: 9, seasonLength: 12 } as const;
const LIFESPANS: Record<number, ParsedGameInfo['lifespan']> = { 0: 'Short', 1: 'Normal', 2: 'Long' };
const SEASON_DAYS: Record<number, number> = { 0: 7, 1: 14, 2: 28 };
const PLAYED_AGING: Record<number, SavePlayedAging> = { 0: 'No', 1: 'Yes', 2: 'Active' };

/**
 * Family-tree node fields: 1 id, 2 and 3 first and last name (sims only),
 * 4 edges, 5 the key of the full name in the game's text (its field 1; for
 * those who are no sim), 6 the portrait's resource key, 7 the ghost trait of
 * how they died (the same ids living ghosts carry), 8 gender, 10 a royal
 * title (title, realm and rank).
 */
const TREE_NODE = {
  id: 1,
  edge: 4,
  name: 5,
  deathTrait: 7,
  gender: 8,
} as const;

/** Family-tree node / edge types from the persistent graph. */
const TREE = {
  relParent: 1n,
  relChild: 2n,
  relMarriage: 4n,
  relRomance: 16n,
} as const;

/**
 * Relationship bit tuning ids (RelationshipBit instance ids, the same in
 * every game version). Checked against the game's own tuning names:
 * romantic-Married, romantic-Engaged, romantic-Significant_Other,
 * romantic-SecretLover (Royalty & Legacy), romantic-Divorced,
 * romantic-Broken_Up / Despised_Ex / Frustrated_Ex, friendship-bff /
 * good_friends / friend / disliked / despised / nemesis, SpecialBits_Enemy,
 * and relationshipBit_SecretChild (Royalty & Legacy, one-way: held by the
 * parent about the child).
 */
const REL_BIT = {
  married: 15822n,
  engaged: 15816n,
  partners: 15825n,
  secretLover: 491011n,
  divorced: 15815n,
  brokenUp: 15811n,
  despisedEx: 15814n,
  frustratedEx: 15817n,
  bff: 15794n,
  goodFriends: 15799n,
  friend: 15797n,
  disliked: 15802n,
  despised: 15796n,
  nemesis: 15801n,
  enemy: 26560n,
  secretChild: 487507n,
} as const;

/**
 * One-way family bits: a parent holds `child` about each child, and the child
 * holds `parent` about them. Read off a save, where they match every parent
 * link the family tree has between sims in it. The tree leaves adoption out
 * (Marilla Cuthbert, who adopted Anne, is no parent of hers there), but these
 * bits have it.
 */
const FAMILY_BIT = {
  child: 8805n,
  parent: 8809n,
  /**
   * Adoption, beside the family bits: an adoptive parent holds
   * `adoptedChild` about the child, the child `adoptiveParent` about them.
   * Birth parents never have them. Read off the Nov 9 Slot 8 save: Marilla
   * Cuthbert and Anne, Crispin Black and Ollie Mark, Kristopher Volkov and
   * Jacob Volkov and Rory Oaklow. The tree lists all but Marilla.
   */
  adoptedChild: 310897n,
  adoptiveParent: 310896n,
} as const;

/** Bits that map to a tag, strongest first within each kind. */
const TAG_RULES: { kind: string; tag: PairTag; bits: bigint[] }[] = [
  { kind: 'romance', tag: 'married', bits: [REL_BIT.married] },
  { kind: 'romance', tag: 'engaged', bits: [REL_BIT.engaged] },
  { kind: 'romance', tag: 'partners', bits: [REL_BIT.partners] },
  { kind: 'romance', tag: 'secretLovers', bits: [REL_BIT.secretLover] },
  { kind: 'past', tag: 'divorced', bits: [REL_BIT.divorced] },
  {
    kind: 'past',
    tag: 'exes',
    bits: [REL_BIT.brokenUp, REL_BIT.despisedEx, REL_BIT.frustratedEx],
  },
  { kind: 'friend', tag: 'bestFriends', bits: [REL_BIT.bff] },
  { kind: 'friend', tag: 'goodFriends', bits: [REL_BIT.goodFriends] },
  { kind: 'friend', tag: 'friends', bits: [REL_BIT.friend] },
  { kind: 'foe', tag: 'enemies', bits: [REL_BIT.nemesis, REL_BIT.enemy] },
  { kind: 'foe', tag: 'despised', bits: [REL_BIT.despised] },
  { kind: 'foe', tag: 'disliked', bits: [REL_BIT.disliked] },
];

/** Strongest tag of each kind present in `bits`. */
export function pairTagsFromBits(bits: ReadonlySet<bigint>): PairTag[] {
  const kinds = new Set<string>();
  const out: PairTag[] = [];
  for (const rule of TAG_RULES) {
    if (kinds.has(rule.kind) || !rule.bits.some((b) => bits.has(b))) continue;
    kinds.add(rule.kind);
    out.push(rule.tag);
  }
  return out;
}

/** Age bit flags on SimInfo.age. */
const AGE_BITS: { bit: number; age: (typeof AGES_H)[number] }[] = [
  { bit: 128, age: 'Infant' },
  { bit: 2, age: 'Toddler' },
  { bit: 4, age: 'Child' },
  { bit: 8, age: 'Teen' },
  { bit: 16, age: 'Young Adult' },
  { bit: 32, age: 'Adult' },
  { bit: 64, age: 'Elder' },
];

/** SimInfo.age of a newborn, the first day of infancy on Normal. */
const NEWBORN_BIT = 1n;

const GENDER_MALE = 4096n;
const GENDER_FEMALE = 8192n;

/**
 * SimInfo.species, the game's Species enum (1 is human). Small dogs have a
 * value of their own; the board calls them dogs. Checked against a save:
 * Rosie the French Bulldog is 4, every horse 6. Horses used to be read at 4,
 * so they came in as humans and Rosie as a horse.
 */
const SPECIES: Record<number, string> = {
  2: 'Dog',
  3: 'Cat',
  4: 'Dog',
  6: 'Horse',
};

function idStr(n: bigint): string {
  return n.toString(10);
}

function mapAge(bits: bigint): string {
  const n = Number(bits);
  if (!Number.isFinite(n) || n === 0) return '';
  let found = '';
  for (const { bit, age } of AGE_BITS) {
    if (n & bit) found = age;
  }
  return found;
}

function mapGender(bits: bigint): string {
  if (bits === GENDER_MALE) return 'Male';
  if (bits === GENDER_FEMALE) return 'Female';
  return '';
}

/**
 * A premade household the player never renamed keeps its template's internal
 * id as its name in the save ("premadeHouseholdTemplate_EP14_MysteriousRancher");
 * the game shows a translated name from its own files instead. Turn the id
 * into words: drop the prefix and a leading pack code, split the rest at
 * underscores and capitals ("Mysterious Rancher", "Wolf Town Greg"). Any
 * other name comes back unchanged.
 */
export function readableHouseholdName(name: string): string {
  const m = /^premadeHouseholdTemplate_(.+)$/i.exec(name.trim());
  if (!m) return name;
  const parts = m[1]!.split('_').filter(Boolean);
  if (parts.length > 1 && /^(EP|GP|SP|FP|BG|PP)\d+$/i.test(parts[0]!)) parts.shift();
  const words = parts
    .join(' ')
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .trim();
  return words || name;
}

function parseSimBlob(blob: Uint8Array): ParsedSaveSim | null {
  const fields = decodeFields(blob);
  let saveSimId = '';
  let householdId = '';
  let first = '';
  let last = '';
  let household = '';
  let age = '';
  let gender = '';
  let pronouns: SimPronouns | undefined;
  let species: string | undefined;
  let generated = false;
  let newborn = false;
  let bornInPlay = false;
  let aliveTicks: number | undefined;
  let stageDays: number | undefined;
  for (const f of fields) {
    if (f.field === SIM.id && (f.wire === 0 || f.wire === 1) && f.int > 0n) {
      saveSimId = idStr(f.int);
    } else if (f.field === SIM.householdId && (f.wire === 0 || f.wire === 1)) {
      householdId = idStr(f.int);
    } else if (f.field === SIM.first && f.bytes) {
      // Trimmed: the game keeps stray spaces ("Crispin Black " in a save).
      first = (utf8(f.bytes) ?? '').trim();
    } else if (f.field === SIM.last && f.bytes) {
      last = (utf8(f.bytes) ?? '').trim();
    } else if (f.field === SIM.householdName && f.bytes) {
      household = readableHouseholdName(utf8(f.bytes) ?? '');
    } else if (f.field === SIM.gender && f.wire === 0) {
      gender = mapGender(f.int);
    } else if (f.field === SIM.age && f.wire === 0) {
      // A newborn has an age of its own (1); the board counts it an infant.
      newborn = f.int === NEWBORN_BIT;
      age = newborn ? 'Infant' : mapAge(f.int);
    } else if (f.field === SIM.stageDays && f.wire === 5) {
      const days = float32(f.int);
      if (Number.isFinite(days) && days >= 0) stageDays = days;
    } else if (f.field === SIM.pronouns && f.bytes) {
      pronouns = parsePronouns(f.bytes) ?? pronouns;
    } else if (f.field === SIM.species && f.wire === 0) {
      species = SPECIES[Number(f.int)];
    } else if (f.field === SIM.creation && f.bytes) {
      const play = decodeFields(f.bytes);
      const text = utf8(play.find((g) => g.field === 17 && g.bytes)?.bytes ?? null) ?? '';
      generated = /^filter:/.test(text);
      bornInPlay = text === 'pregnancy';
      const alive = play.find((g) => g.field === 16 && g.wire === 0)?.int;
      if (alive !== undefined && alive < BigInt(Number.MAX_SAFE_INTEGER)) aliveTicks = Number(alive);
    }
  }
  if (!saveSimId || (!first && !last)) return null;
  return {
    saveSimId,
    householdId,
    first,
    last,
    household,
    age,
    gender: genderFromPronouns(pronouns, gender),
    ...(pronouns ? { pronouns } : {}),
    species,
    ...(generated ? { generated: true as const } : {}),
    ...(aliveTicks !== undefined ? { aliveTicks } : {}),
    ...(stageDays !== undefined ? { stageDays } : {}),
    ...(newborn ? { newborn: true as const } : {}),
    ...(bornInPlay ? { bornInPlay: true as const } : {}),
  };
}

/** A protobuf fixed32 read as the float it holds. */
function float32(bits: bigint): number {
  const view = new DataView(new ArrayBuffer(4));
  view.setUint32(0, Number(bits & 0xffffffffn), true);
  return view.getFloat32(0, true);
}

/**
 * The save's clock (slot → gameplay field 1), the active household (slot
 * field 11), played households and the aging options. Absent with no clock.
 */
function parseGameInfo(saveGame: Uint8Array): ParsedGameInfo | undefined {
  const slot = firstBytes(saveGame, 2);
  const gameplay = slot ? firstBytes(slot, 8) : null;
  const clockField = gameplay
    ? decodeFields(gameplay).find((f) => f.field === 1 && f.wire === 0)
    : undefined;
  if (!slot || !clockField) return undefined;
  const info: ParsedGameInfo = { clock: Number(clockField.int), playedHouseholds: [] };
  const active = idField(decodeFields(slot), 11);
  if (active) info.activeHouseholdId = active;
  for (const rec of decodeFields(saveGame)) {
    if (rec.field === 5 && rec.bytes) {
      const fields = decodeFields(rec.bytes);
      const played = fields.some((f) => f.field === HOUSEHOLD.played && f.wire === 0 && f.int === 1n);
      const id = idField(fields, HOUSEHOLD.id);
      if (played && id) info.playedHouseholds.push(id);
    }
  }
  const account = firstBytes(saveGame, 3);
  const options = account ? firstBytes(account, 14) : null;
  const record = options ? firstBytes(options, 2) : null;
  if (record) {
    const value = (n: number) => {
      const f = decodeFields(record).find((x) => x.field === n && x.wire === 0);
      return f === undefined ? undefined : Number(f.int);
    };
    const lifespan = LIFESPANS[value(OPTION.lifespan) ?? -1];
    if (lifespan) info.lifespan = lifespan;
    const seasonDays = SEASON_DAYS[value(OPTION.seasonLength) ?? -1];
    if (seasonDays) info.seasonDays = seasonDays;
    const playedAging = PLAYED_AGING[value(OPTION.playedAging) ?? -1];
    if (playedAging) info.playedAging = playedAging;
    const unplayed = value(OPTION.unplayedAging);
    if (unplayed === 0 || unplayed === 1) info.unplayedAging = unplayed === 1;
  }
  return info;
}

/** Tree nodes that are no sim in the save, with their gender and death. */
function parseTreeRelatives(graph: Uint8Array, simIds: ReadonlySet<string>): ParsedTreeRelative[] {
  const out: ParsedTreeRelative[] = [];
  for (const node of decodeFields(graph)) {
    if (node.field !== 1 || !node.bytes) continue;
    const rec = decodeFields(node.bytes);
    const id = rec.find((f) => f.field === TREE_NODE.id && f.wire === 0)?.int;
    if (!id || simIds.has(idStr(id))) continue;
    const gender = rec.find((f) => f.field === TREE_NODE.gender && f.wire === 0)?.int;
    const died = rec.some((f) => f.field === TREE_NODE.deathTrait && f.wire === 0 && f.int > 0n);
    const nameRef = rec.find((f) => f.field === TREE_NODE.name && f.bytes)?.bytes;
    const key = nameRef ? decodeFields(nameRef).find((f) => f.field === 1)?.int : undefined;
    const nameKey = key ? idStr(key) : undefined;
    const name = nameKey ? TREE_NAMES[nameKey] : undefined;
    out.push({
      treeId: idStr(id),
      gender: gender === undefined ? '' : mapGender(gender),
      ...(died ? { deceased: true as const } : {}),
      ...(nameKey ? { nameKey } : {}),
      ...(name ? { name } : {}),
    });
  }
  return out;
}

/**
 * Deaths the family tree leaves out. A relative with no sim in the save is
 * not in the game world, and the tree records how most of them died, but not
 * all: the ancestors the game itself calls Unknown carry no death (the
 * Darongs' and the Altos' great-grandmothers). One is taken as dead when a
 * child of theirs is an elder, or when they had children and every one is
 * dead, as recorded or worked out here, so it climbs the tree. The absent
 * fathers of young premades (Felix Hoffman's, the Behrs') keep no death:
 * they may well be alive.
 */
export function inferTreeDeaths(
  relatives: ParsedTreeRelative[],
  rels: ParsedSaveRel[],
  sims: Pick<ParsedSaveSim, 'saveSimId' | 'age'>[],
): ParsedTreeRelative[] {
  const isRelative = new Set(relatives.map((r) => r.treeId));
  const ageOf = new Map(sims.map((s) => [s.saveSimId, s.age]));
  const kids = new Map<string, string[]>();
  for (const r of rels) {
    if (r.type !== 'parent' || !isRelative.has(r.a)) continue;
    kids.set(r.a, [...(kids.get(r.a) ?? []), r.b]);
  }
  const dead = new Set(relatives.filter((r) => r.deceased).map((r) => r.treeId));
  const inferred = new Set<string>();
  for (let changed = true; changed; ) {
    changed = false;
    for (const r of relatives) {
      const list = kids.get(r.treeId);
      if (dead.has(r.treeId) || !list?.length) continue;
      if (!list.some((k) => ageOf.get(k) === 'Elder') && !list.every((k) => dead.has(k))) continue;
      dead.add(r.treeId);
      inferred.add(r.treeId);
      changed = true;
    }
  }
  if (!inferred.size) return relatives;
  return relatives.map((r) =>
    inferred.has(r.treeId) ? { ...r, deceased: true as const, deathInferred: true as const } : r,
  );
}

function parseTreeRels(graph: Uint8Array): ParsedSaveRel[] {
  const rels: ParsedSaveRel[] = [];
  const seen = new Set<string>();
  const push = (a: string, b: string, type: SaveRelType) => {
    if (!a || !b || a === b) return;
    const key = type === 'parent' ? `p:${a}>${b}` : `${type}:${[a, b].sort().join('|')}`;
    if (seen.has(key)) return;
    seen.add(key);
    rels.push({ a, b, type });
  };
  for (const node of decodeFields(graph)) {
    if (node.field !== 1 || !node.bytes) continue;
    const rec = decodeFields(node.bytes);
    let self = '';
    for (const f of rec) {
      if (f.field === 1 && f.wire === 0 && f.int > 0n) self = idStr(f.int);
    }
    for (const f of rec) {
      if (f.field !== 4 || !f.bytes) continue;
      const edge = decodeFields(f.bytes);
      let a = '';
      let b = '';
      let kind = 0n;
      for (const e of edge) {
        if (e.field === 1 && e.wire === 0) a = idStr(e.int);
        if (e.field === 2 && e.wire === 0) b = idStr(e.int);
        if (e.field === 3 && e.wire === 0) kind = e.int;
      }
      const from = a || self;
      if (kind === TREE.relParent) push(from, b, 'parent');
      else if (kind === TREE.relMarriage) push(from, b, 'marriage');
      else if (kind === TREE.relRomance) push(from, b, 'romance');
    }
  }
  return rels;
}

/** Varints of a repeated field, packed (bytes) or one per field. */
function varints(fields: { field: number; wire: number; int: bigint; bytes: Uint8Array | null }[], n: number): bigint[] {
  const out: bigint[] = [];
  for (const f of fields) {
    if (f.field !== n) continue;
    if (f.wire === 0) {
      out.push(f.int);
      continue;
    }
    if (!f.bytes) continue;
    let x = 0n;
    let shift = 0n;
    for (const byte of f.bytes) {
      x |= BigInt(byte & 0x7f) << shift;
      if (byte & 0x80) {
        shift += 7n;
      } else {
        out.push(x);
        x = 0n;
        shift = 0n;
      }
    }
  }
  return out;
}

/**
 * Relationship records: slot field 2 → gameplay field 8 → field 13, one
 * repeated field 1 per sim pair. Each has the two sim ids (1, 2), the
 * shared data (3, whose field 1 lists the shared relationship bits) and
 * each side's one-way data (4 for a about b, 5 for b about a; field 1 again
 * lists bits). Shared bits give the pair's status; the one-way secret-child
 * bit, held by the parent, gives secret parents the family tree leaves out.
 */
function parseRelationships(rels: Uint8Array): {
  pairs: ParsedSavePair[];
  secretParents: { parent: string; child: string }[];
  /** Parents by the family bits (see FAMILY_BIT), adoptive ones included. */
  familyParents: { parent: string; child: string }[];
  /** Adoptive parents, by the adoption bits: `parent>child`. */
  adoptive: Set<string>;
} {
  const pairs: ParsedSavePair[] = [];
  const secretParents: { parent: string; child: string }[] = [];
  const familyParents: { parent: string; child: string }[] = [];
  const adoptive = new Set<string>();
  for (const rec of decodeFields(rels)) {
    if (rec.field !== 1 || !rec.bytes) continue;
    const fs = decodeFields(rec.bytes);
    const a = fs.find((f) => f.field === 1 && f.wire === 0)?.int;
    const b = fs.find((f) => f.field === 2 && f.wire === 0)?.int;
    if (!a || !b || a === b) continue;
    const bitsOf = (n: number) => {
      const part = fs.find((f) => f.field === n)?.bytes;
      return new Set(part ? varints(decodeFields(part), 1) : []);
    };
    const tags = pairTagsFromBits(bitsOf(3));
    if (tags.length) pairs.push({ a: idStr(a), b: idStr(b), tags });
    if (bitsOf(4).has(REL_BIT.secretChild)) {
      secretParents.push({ parent: idStr(a), child: idStr(b) });
    }
    if (bitsOf(5).has(REL_BIT.secretChild)) {
      secretParents.push({ parent: idStr(b), child: idStr(a) });
    }
    const aAboutB = bitsOf(4);
    const bAboutA = bitsOf(5);
    if (aAboutB.has(FAMILY_BIT.child) || bAboutA.has(FAMILY_BIT.parent)) {
      familyParents.push({ parent: idStr(a), child: idStr(b) });
    }
    if (bAboutA.has(FAMILY_BIT.child) || aAboutB.has(FAMILY_BIT.parent)) {
      familyParents.push({ parent: idStr(b), child: idStr(a) });
    }
    if (aAboutB.has(FAMILY_BIT.adoptedChild) || bAboutA.has(FAMILY_BIT.adoptiveParent)) {
      adoptive.add(`${idStr(a)}>${idStr(b)}`);
    }
    if (bAboutA.has(FAMILY_BIT.adoptedChild) || aAboutB.has(FAMILY_BIT.adoptiveParent)) {
      adoptive.add(`${idStr(b)}>${idStr(a)}`);
    }
  }
  return { pairs, secretParents, familyParents, adoptive };
}

/** The couple link a romantic status calls for (see withStatusCouples). */
const STATUS_COUPLE: [PairTag, SaveRelType][] = [
  ['married', 'marriage'],
  ['engaged', 'romance'],
  ['partners', 'romance'],
  ['divorced', 'divorced'],
];

/**
 * Couple links the relationship statuses have and the tree does not. The
 * family tree records marriages and partners, but not engagements: Darrel
 * Charm and Emilia Ernest, engaged when a game starts, had no link at all.
 * A pair the tree already links keeps its link.
 */
function withStatusCouples(rels: ParsedSaveRel[], pairs: ParsedSavePair[]): ParsedSaveRel[] {
  const linked = new Set(
    rels.filter((r) => r.type !== 'parent').map((r) => [r.a, r.b].sort().join('|')),
  );
  const out = [...rels];
  for (const p of pairs) {
    const key = [p.a, p.b].sort().join('|');
    if (linked.has(key)) continue;
    const type = STATUS_COUPLE.find(([tag]) => p.tags.includes(tag))?.[1];
    if (!type) continue;
    linked.add(key);
    out.push({ a: p.a, b: p.b, type });
  }
  return out;
}

/**
 * Adoptions: parent links the family bits have and the tree does not, and
 * every parent link the adoption bits mark (`adoptive`, `parent>child`),
 * which the tree may list as an ordinary parent.
 */
function withAdoptions(
  rels: ParsedSaveRel[],
  familyParents: { parent: string; child: string }[],
  adoptive: ReadonlySet<string> = new Set(),
): ParsedSaveRel[] {
  const known = new Set(rels.filter((r) => r.type === 'parent').map((r) => `${r.a}>${r.b}`));
  const out = rels.map((r) =>
    r.type === 'parent' && adoptive.has(`${r.a}>${r.b}`) ? { ...r, adopted: true as const } : r,
  );
  for (const { parent, child } of familyParents) {
    const key = `${parent}>${child}`;
    if (known.has(key)) continue;
    known.add(key);
    out.push({ a: parent, b: child, type: 'parent', adopted: true });
  }
  return out;
}

function idField(fields: ReturnType<typeof decodeFields>, n: number): string {
  const f = fields.find((x) => x.field === n && (x.wire === 0 || x.wire === 1));
  return f && f.int > 0n ? idStr(f.int) : '';
}

/**
 * Where each household lives. Lot records sit under SaveGameData field 4
 * (world): field 3 is the world name, each nested field 5 a lot with its zone
 * id (2) and owner (4, whose field 3 is the household id). Household records
 * (field 5) name their home zone. A household with no home lot (an unhoused
 * townie) is left out. Only strings from the file are used — no zone→world
 * table.
 */
function parseWorldIndex(saveGame: Uint8Array): {
  householdWorld: Record<string, string>;
  householdName: Record<string, string>;
  /** Household id → its home lot's id and name (field 5 and 3 of the lot). */
  householdLot: Record<string, { hash: number; name?: string }>;
  /** Households the save lists with no home lot. */
  unhoused: Set<string>;
  worlds: string[];
} {
  const zoneWorld = new Map<string, string>();
  const zoneLot = new Map<string, { hash: number; name?: string }>();
  const ownerWorld = new Map<string, string>();
  const homeZone = new Map<string, string>();
  const householdName: Record<string, string> = {};
  const listed = new Set<string>();
  const worlds = new Set<string>();
  for (const rec of decodeFields(saveGame)) {
    if (!rec.bytes) continue;
    if (rec.field === 5) {
      const fields = decodeFields(rec.bytes);
      const id = idField(fields, HOUSEHOLD.id);
      if (!id) continue;
      listed.add(id);
      const home = idField(fields, HOUSEHOLD.homeZone);
      if (home) homeZone.set(id, home);
      const name = utf8(fields.find((f) => f.field === HOUSEHOLD.name && f.bytes)?.bytes ?? null);
      if (name) householdName[id] = readableHouseholdName(name);
      continue;
    }
    if (rec.field !== 4) continue;
    const fields = decodeFields(rec.bytes);
    let world = '';
    for (const f of fields) {
      if (f.field === 3 && f.bytes) world = utf8(f.bytes) ?? '';
    }
    if (!world) continue;
    worlds.add(world);
    for (const f of fields) {
      if (f.field !== 5 || !f.bytes) continue;
      const lot = decodeFields(f.bytes);
      const zone = idField(lot, 2);
      if (zone) zoneWorld.set(zone, world);
      const hash = lot.find((x) => x.field === 5 && !x.bytes)?.int;
      if (zone && hash) {
        const name = utf8(lot.find((x) => x.field === 3 && x.bytes)?.bytes ?? null)?.trim();
        zoneLot.set(zone, { hash: Number(hash), ...(name ? { name } : {}) });
      }
      const owner = lot.find((x) => x.field === 4 && x.bytes)?.bytes;
      const household = owner ? idField(decodeFields(owner), 3) : '';
      if (household) ownerWorld.set(household, world);
    }
  }
  const householdWorld: Record<string, string> = {};
  const householdLot: Record<string, { hash: number; name?: string }> = {};
  for (const [id, world] of ownerWorld) householdWorld[id] = world;
  for (const [id, zone] of homeZone) {
    const world = zoneWorld.get(zone);
    if (world) householdWorld[id] = world;
    const lot = zoneLot.get(zone);
    if (lot) householdLot[id] = lot;
  }
  const unhoused = new Set([...listed].filter((id) => !homeZone.has(id) && !ownerWorld.has(id)));
  return {
    householdWorld,
    householdName,
    householdLot,
    unhoused,
    worlds: [...worlds].sort((a, b) => a.localeCompare(b)),
  };
}

/**
 * Dynasties (Royalty & Legacy) are gameplay field 60: one record (1) per
 * dynasty with its id (1), its name (2), its head's sim id (4) and its heir's (5, 0 when
 * there is none), and each member (6) as a sim id (1) and a flag (6) the
 * game sets on outcasts. A member's field 4 is the order they joined, not a
 * rank: Marilla Cuthbert heads her dynasty as its third. Read from a save
 * with 34 dynasties on 2026-11-06, where the flag was on Virgilio Capp and
 * Johnny Zest (in the Landgraabs') alone. An outcast is never the heir.
 */
type DynastyPlace = { dynasty: string; dynastyId: string; role?: DynastyRole };

function parseDynasties(gameplay: Uint8Array | null): Map<string, DynastyPlace> | null {
  const list = gameplay ? firstBytes(gameplay, 60) : null;
  if (!list) return null;
  const out = new Map<string, DynastyPlace>();
  for (const rec of decodeFields(list)) {
    if (rec.field !== 1 || !rec.bytes) continue;
    const fields = decodeFields(rec.bytes);
    const dynastyId = idField(fields, 1);
    const dynasty = (utf8(fields.find((f) => f.field === 2 && f.bytes)?.bytes ?? null) ?? '').trim();
    const head = idField(fields, 4);
    const heir = idField(fields, 5);
    for (const m of fields) {
      if (m.field !== 6 || !m.bytes) continue;
      const member = decodeFields(m.bytes);
      const id = idField(member, 1);
      if (!id) continue;
      const outcast = member.some((f) => f.field === 6 && f.wire === 0 && f.int === 1n);
      const role: DynastyRole | undefined =
        id === head ? 'head' : id === heir ? 'heir' : outcast ? 'outcast' : undefined;
      out.set(id, role ? { dynasty, dynastyId, role } : { dynasty, dynastyId });
    }
  }
  return out;
}

function gameplayData(saveGame: Uint8Array): Uint8Array | null {
  const slot = firstBytes(saveGame, 2);
  return slot ? firstBytes(slot, 8) : null;
}

function familyTreeGraph(gameplay: Uint8Array | null): Uint8Array | null {
  const tree = gameplay ? firstBytes(gameplay, 62) : null;
  return tree ? firstBytes(tree, 1) : null;
}

/**
 * Add secret parents and secret lovers to the family-tree rels. A secret
 * parent the tree already lists (a revealed secret is dropped by the game,
 * but be safe) is marked secret rather than added twice.
 */
function withSecrets(
  rels: ParsedSaveRel[],
  pairs: ParsedSavePair[],
  secretParents: { parent: string; child: string }[],
): ParsedSaveRel[] {
  const out = rels.map((r) => ({ ...r }));
  for (const { parent, child } of secretParents) {
    const known = out.find((r) => r.type === 'parent' && r.a === parent && r.b === child);
    if (known) known.secret = true;
    else out.push({ a: parent, b: child, type: 'parent', secret: true });
  }
  for (const p of pairs) {
    if (!p.tags.includes('secretLovers')) continue;
    const same = (r: ParsedSaveRel) =>
      r.type !== 'parent' && ((r.a === p.a && r.b === p.b) || (r.a === p.b && r.b === p.a));
    const known = out.find(same);
    if (known?.type === 'romance') known.secret = true;
    else if (!known) out.push({ a: p.a, b: p.b, type: 'romance', secret: true });
  }
  return out;
}

export function parseSaveGame(buf: Uint8Array): ParsedSave {
  const resources = readDbpf(buf);
  const sgd = resources.find((r) => r.type === SAVE_GAME_DATA_TYPE);
  if (!sgd) throw new Error('No Save Game Data in this file');
  const data = refpackDecompress(sgd.bytes);
  const sims: ParsedSaveSim[] = [];
  const seen = new Set<string>();
  for (const f of decodeFields(data)) {
    if (f.field !== 6 || !f.bytes) continue;
    const sim = parseSimBlob(f.bytes);
    if (!sim || seen.has(sim.saveSimId)) continue;
    seen.add(sim.saveSimId);
    sims.push(sim);
  }
  if (!sims.length) throw new Error('No sims found in this save');
  const { householdWorld, householdName, householdLot, unhoused, worlds } = parseWorldIndex(data);
  for (const sim of sims) {
    const world = householdWorld[sim.householdId];
    if (world) sim.world = world;
    const lot = householdLot[sim.householdId];
    if (lot) sim.lot = lot;
    if (unhoused.has(sim.householdId)) sim.unhoused = true;
    // The household record's name is the game's; a sim's copy can be blank.
    const name = householdName[sim.householdId];
    if (name) sim.household = name;
  }
  const gameplay = gameplayData(data);
  const graph = familyTreeGraph(gameplay);
  const treeRels = graph ? parseTreeRels(graph) : [];
  const treeRelatives = graph ? parseTreeRelatives(graph, seen) : [];
  const relData = gameplay ? firstBytes(gameplay, 13) : null;
  const { pairs, secretParents, familyParents, adoptive } = relData
    ? parseRelationships(relData)
    : { pairs: [], secretParents: [], familyParents: [], adoptive: new Set<string>() };
  const rels = withSecrets(
    withStatusCouples(withAdoptions(treeRels, familyParents, adoptive), pairs),
    pairs,
    secretParents,
  );
  const relatives = inferTreeDeaths(treeRelatives, rels, sims);
  const dynasties = parseDynasties(gameplay);
  if (dynasties) {
    for (const sim of sims) {
      const d = dynasties.get(sim.saveSimId);
      if (!d) continue;
      if (d.dynasty) sim.dynasty = d.dynasty;
      if (d.dynastyId) sim.dynastyId = d.dynastyId;
      if (d.role) sim.dynastyRole = d.role;
    }
  }
  const game = parseGameInfo(data);
  return {
    sims,
    rels,
    householdWorld,
    worlds,
    pairs,
    relatives,
    ...(dynasties ? { dynasties: true as const } : {}),
    ...(game ? { game } : {}),
  };
}
