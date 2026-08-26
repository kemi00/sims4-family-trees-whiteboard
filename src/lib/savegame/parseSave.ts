import { AGES_H } from '../constants.ts';
import { readDbpf, SAVE_GAME_DATA_TYPE } from './dbpf.ts';
import { decodeFields, firstBytes, utf8 } from './protobuf.ts';
import { refpackDecompress } from './refpack.ts';

export type SaveRelType = 'parent' | 'marriage' | 'romance';

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
};

export type ParsedSaveRel = {
  a: string;
  b: string;
  type: SaveRelType;
};

export type ParsedSave = {
  sims: ParsedSaveSim[];
  rels: ParsedSaveRel[];
  /** Household id → world name, from lot occupancy in the save. */
  householdWorld?: Record<string, string>;
  /** World name strings present in the save (installed worlds), from the file. */
  worlds?: string[];
};

/** SimInfo protobuf field numbers as stored in Save Game Data. */
const SIM = {
  id: 1,
  householdId: 2,
  first: 5,
  last: 6,
  gender: 7,
  age: 8,
  householdName: 22,
  species: 60,
} as const;

/** Family-tree node / edge types from the persistent graph. */
const TREE = {
  relParent: 1n,
  relChild: 2n,
  relMarriage: 4n,
  relRomance: 16n,
} as const;

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

const SPECIES: Record<number, string> = {
  2: 'Dog',
  3: 'Cat',
  4: 'Horse',
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
  for (const f of fields) {
    if (f.field === SIM.id && (f.wire === 0 || f.wire === 1) && f.int > 0n) {
      saveSimId = idStr(f.int);
    } else if (f.field === SIM.householdId && (f.wire === 0 || f.wire === 1)) {
      householdId = idStr(f.int);
    } else if (f.field === SIM.first && f.bytes) {
      first = utf8(f.bytes) ?? '';
    } else if (f.field === SIM.last && f.bytes) {
      last = utf8(f.bytes) ?? '';
    } else if (f.field === SIM.householdName && f.bytes) {
      household = utf8(f.bytes) ?? '';
    } else if (f.field === SIM.gender && f.wire === 0) {
      gender = mapGender(f.int);
    } else if (f.field === SIM.age && f.wire === 0) {
      age = mapAge(f.int);
    } else if (f.field === SIM.species && f.wire === 0) {
      species = SPECIES[Number(f.int)];
    }
  }
  if (!saveSimId || (!first && !last)) return null;
  return { saveSimId, householdId, first, last, household, age, gender, species };
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

/**
 * Lot records live under SaveGameData field 4 (world). Field 3 is the world
 * name string; each nested field 5 is a lot whose field 2 is the occupying
 * household id. Only those strings from the file are used — no zone→world table.
 */
function parseWorldIndex(saveGame: Uint8Array): {
  householdWorld: Record<string, string>;
  worlds: string[];
} {
  const householdWorld: Record<string, string> = {};
  const worlds = new Set<string>();
  for (const rec of decodeFields(saveGame)) {
    if (rec.field !== 4 || !rec.bytes) continue;
    const fields = decodeFields(rec.bytes);
    let world = '';
    for (const f of fields) {
      if (f.field === 3 && f.bytes) world = utf8(f.bytes) ?? '';
    }
    if (!world) continue;
    worlds.add(world);
    for (const f of fields) {
      if (f.field !== 5 || !f.bytes) continue;
      for (const lot of decodeFields(f.bytes)) {
        if (lot.field !== 2 || (lot.wire !== 0 && lot.wire !== 1) || lot.int <= 0n) {
          continue;
        }
        householdWorld[idStr(lot.int)] = world;
      }
    }
  }
  return { householdWorld, worlds: [...worlds].sort((a, b) => a.localeCompare(b)) };
}

function familyTreeGraph(saveGame: Uint8Array): Uint8Array | null {
  const slot = firstBytes(saveGame, 2);
  if (!slot) return null;
  const gameplay = firstBytes(slot, 8);
  if (!gameplay) return null;
  const tree = firstBytes(gameplay, 62);
  if (!tree) return null;
  return firstBytes(tree, 1);
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
  const { householdWorld, worlds } = parseWorldIndex(data);
  for (const sim of sims) {
    const world = householdWorld[sim.householdId];
    if (world) sim.world = world;
  }
  const graph = familyTreeGraph(data);
  const rels = graph ? parseTreeRels(graph) : [];
  return { sims, rels, householdWorld, worlds };
}
