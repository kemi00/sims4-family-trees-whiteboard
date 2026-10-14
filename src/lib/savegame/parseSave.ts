import { TREE_NAMES } from '../../data/treeNames.ts';
import { AGES_H } from '../constants.ts';
import type { PairTag } from '../../types/whiteboard.ts';
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
  gender: string;
  species?: string;
  /** World name string from the save lot, if present. */
  world?: string;
  /** The sim's household has no home lot ("Currently Not in World"). */
  unhoused?: true;
  /**
   * The game generated this sim while the player played (a walk-by, an
   * NPC, a townie for a role): its creation source is one of the game's
   * sim filters. Premade sims, sims made in Create a Sim and babies have
   * no such source.
   */
  generated?: true;
};

export type ParsedSaveRel = {
  a: string;
  b: string;
  type: SaveRelType;
  /** Secret parent (parent rels) or secret lovers (romance rels). */
  secret?: true;
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
  /** The tree records how they died. */
  deceased?: true;
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
  /** Creation info; its field 17 names the source ("filter: …" when generated). */
  creation: 47,
  species: 60,
} as const;

/** Household records (Save Game Data field 5). */
const HOUSEHOLD = {
  id: 2,
  name: 3,
  homeZone: 4,
} as const;

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
  let species: string | undefined;
  let generated = false;
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
      age = mapAge(f.int);
    } else if (f.field === SIM.species && f.wire === 0) {
      species = SPECIES[Number(f.int)];
    } else if (f.field === SIM.creation && f.bytes) {
      const source = decodeFields(f.bytes).find((g) => g.field === 17 && g.bytes);
      generated = /^filter:/.test(utf8(source?.bytes ?? null) ?? '');
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
    gender,
    species,
    ...(generated ? { generated: true as const } : {}),
  };
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
} {
  const pairs: ParsedSavePair[] = [];
  const secretParents: { parent: string; child: string }[] = [];
  const familyParents: { parent: string; child: string }[] = [];
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
  }
  return { pairs, secretParents, familyParents };
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

/** Parent links the family bits have and the tree does not: adoptions. */
function withAdoptions(
  rels: ParsedSaveRel[],
  familyParents: { parent: string; child: string }[],
): ParsedSaveRel[] {
  const known = new Set(rels.filter((r) => r.type === 'parent').map((r) => `${r.a}>${r.b}`));
  const out = [...rels];
  for (const { parent, child } of familyParents) {
    const key = `${parent}>${child}`;
    if (known.has(key)) continue;
    known.add(key);
    out.push({ a: parent, b: child, type: 'parent' });
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
  /** Households the save lists with no home lot. */
  unhoused: Set<string>;
  worlds: string[];
} {
  const zoneWorld = new Map<string, string>();
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
      const owner = lot.find((x) => x.field === 4 && x.bytes)?.bytes;
      const household = owner ? idField(decodeFields(owner), 3) : '';
      if (household) ownerWorld.set(household, world);
    }
  }
  const householdWorld: Record<string, string> = {};
  for (const [id, world] of ownerWorld) householdWorld[id] = world;
  for (const [id, zone] of homeZone) {
    const world = zoneWorld.get(zone);
    if (world) householdWorld[id] = world;
  }
  const unhoused = new Set([...listed].filter((id) => !homeZone.has(id) && !ownerWorld.has(id)));
  return {
    householdWorld,
    householdName,
    unhoused,
    worlds: [...worlds].sort((a, b) => a.localeCompare(b)),
  };
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
  const { householdWorld, householdName, unhoused, worlds } = parseWorldIndex(data);
  for (const sim of sims) {
    const world = householdWorld[sim.householdId];
    if (world) sim.world = world;
    if (unhoused.has(sim.householdId)) sim.unhoused = true;
    // The household record's name is the game's; a sim's copy can be blank.
    const name = householdName[sim.householdId];
    if (name) sim.household = name;
  }
  const gameplay = gameplayData(data);
  const graph = familyTreeGraph(gameplay);
  const treeRels = graph ? parseTreeRels(graph) : [];
  const relatives = graph ? parseTreeRelatives(graph, seen) : [];
  const relData = gameplay ? firstBytes(gameplay, 13) : null;
  const { pairs, secretParents, familyParents } = relData
    ? parseRelationships(relData)
    : { pairs: [], secretParents: [], familyParents: [] };
  const rels = withSecrets(
    withStatusCouples(withAdoptions(treeRels, familyParents), pairs),
    pairs,
    secretParents,
  );
  return { sims, rels, householdWorld, worlds, pairs, relatives };
}
