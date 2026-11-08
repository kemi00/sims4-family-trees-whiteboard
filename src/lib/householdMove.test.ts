import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Group, SimNode, World, HouseholdMove } from '../types/whiteboard.ts';
import {
  NEW_HOUSEHOLD,
  commonWorld,
  householdMovePlan,
  householdNamed,
  householdOptions,
  householdSurnames,
  moveDestination,
  movesDoneBySave,
} from './householdMove.ts';

const worlds: World[] = [
  { name: 'Willow Creek', color: '#3a7' } as World,
  { name: 'Oasis Springs', color: '#d84' } as World,
];
const group = (world: string, hh: string, nb = 'Pendula View'): Group => ({
  gid: `${world}||${hh}`,
  hh,
  world,
  nb,
  color: '#3a7',
  x: 0,
  y: 0,
  w: 0,
  h: 0,
});
const sim = (id: string, g: Group, extra: Partial<SimNode> = {}): SimNode =>
  ({
    id,
    first: id,
    sur: g.hh,
    gid: g.gid,
    hh: g.hh,
    world: g.world,
    nb: g.nb,
    color: g.color,
    ...extra,
  }) as SimNode;

const goth = group('Willow Creek', 'Goth');
const pancakes = group('Willow Creek', 'Pancakes', 'Courtyard Lane');
const empty = group('Willow Creek', 'Gone');
const landgraab = group('Oasis Springs', 'Landgraab');
const groups = [goth, pancakes, empty, landgraab];
const nodes = [
  sim('Bella', goth),
  sim('Mortimer', goth),
  sim('Cassandra', goth),
  sim('Bob', pancakes, { onb: 'Courtyard Lane' }),
  sim('Geoffrey', landgraab),
];

describe('household picker', () => {
  it('lists the households in the world that have sims, A to Z, with their counts', () => {
    assert.deepEqual(householdOptions(groups, nodes, 'Willow Creek'), [
      { gid: goth.gid, hh: 'Goth', count: 3 },
      { gid: pancakes.gid, hh: 'Pancakes', count: 1 },
    ]);
  });

  it('leaves out the household everyone moving already lives in', () => {
    assert.deepEqual(
      householdOptions(groups, nodes, 'Willow Creek', goth.gid).map((o) => o.hh),
      ['Pancakes'],
    );
  });

  it('finds a household by name in any case, only in that world', () => {
    assert.equal(householdNamed(groups, nodes, 'Willow Creek', ' pancakes ')?.gid, pancakes.gid);
    assert.equal(householdNamed(groups, nodes, 'Oasis Springs', 'Pancakes'), undefined);
    assert.equal(householdNamed(groups, nodes, 'Willow Creek', 'Gone'), undefined);
  });

  it('starts on the world most of the sims live in', () => {
    assert.equal(commonWorld([nodes[4]!, nodes[0]!, nodes[1]!], worlds), 'Willow Creek');
    assert.equal(commonWorld([], worlds), 'Willow Creek');
  });
});

describe('moving sims to a household', () => {
  it('creates a new household with the name given', () => {
    const dest = moveDestination(groups, nodes, worlds, 'Oasis Springs', NEW_HOUSEHOLD, ' Goth Heirs ');
    assert.deepEqual(dest, {
      gid: 'Oasis Springs||Goth Heirs',
      hh: 'Goth Heirs',
      world: 'Oasis Springs',
      nb: '-',
      color: '#d84',
      isNew: true,
    });
    assert.equal(moveDestination(groups, nodes, worlds, 'Oasis Springs', NEW_HOUSEHOLD, '  '), null);
  });

  it('joins the household a new name already belongs to instead of making a twin', () => {
    const dest = moveDestination(groups, nodes, worlds, 'Willow Creek', NEW_HOUSEHOLD, 'pancakes');
    assert.equal(dest?.gid, pancakes.gid);
    assert.equal(dest?.isNew, false);
  });

  it('moves every picked sim in one plan and skips those already there', () => {
    const dest = moveDestination(groups, nodes, worlds, 'Willow Creek', pancakes.gid)!;
    const { patches, moves } = householdMovePlan(nodes, ['Bella', 'Cassandra', 'Bob'], dest);
    assert.deepEqual([...patches.keys()], ['Bella', 'Cassandra']);
    assert.deepEqual(patches.get('Bella'), {
      gid: pancakes.gid,
      hh: 'Pancakes',
      world: 'Willow Creek',
      color: '#3a7',
    });
    assert.deepEqual(
      moves.map((m) => [m.simId, m.fromHh, m.toHh, m.toNb]),
      [
        ['Bella', 'Goth', 'Pancakes', 'Courtyard Lane'],
        ['Cassandra', 'Goth', 'Pancakes', 'Courtyard Lane'],
      ],
    );
  });

  it('makes a sim added on the board a resident of the household it joins', () => {
    const board = [...nodes, sim('Heir', goth, { added: true, oplay: 'Townie', townie: true })];
    const toPancakes = moveDestination(groups, board, worlds, 'Willow Creek', pancakes.gid)!;
    assert.deepEqual(householdMovePlan(board, ['Heir'], toPancakes).patches.get('Heir'), {
      gid: pancakes.gid,
      hh: 'Pancakes',
      world: 'Willow Creek',
      color: '#3a7',
      oworld: 'Willow Creek',
      ohh: 'Pancakes',
      oplay: 'Resident',
      townie: false,
      onb: 'Courtyard Lane',
    });
    const toNew = moveDestination(groups, board, worlds, 'Willow Creek', NEW_HOUSEHOLD, 'Heirs')!;
    assert.equal(householdMovePlan(board, ['Heir'], toNew).patches.get('Heir')?.onb, '-');
  });
});

describe('a planned baby\'s last name', () => {
  const sur = (...names: string[]) => names.map((s) => ({ sur: s }));

  it('takes the household\'s own name when a parent has it', () => {
    assert.deepEqual(householdSurnames(sur('Munch', 'Fyres'), 'Munch', ['Fyres', 'Munch']), ['Munch']);
    assert.deepEqual(householdSurnames(sur('Munch', 'Fyres'), 'fyres', ['Munch', 'Fyres']), ['Fyres']);
  });

  it('otherwise takes the parent\'s name more of the household shares', () => {
    assert.deepEqual(householdSurnames(sur('Munch', 'Fyres', 'Munch'), 'Love Nest', ['Fyres', 'Munch']), ['Munch']);
  });

  it('never takes a roommate\'s name, however many share it', () => {
    const home = sur('Munch', 'Fyres', 'Pancakes', 'Pancakes');
    assert.deepEqual(householdSurnames(home, 'Love Nest', ['Munch', 'Fyres']), ['Munch', 'Fyres']);
  });

  it('leaves a tie open, parents in order, for you to pick', () => {
    assert.deepEqual(householdSurnames(sur('Munch', 'Fyres'), 'Love Nest', ['Munch', 'Fyres']), ['Munch', 'Fyres']);
  });

  it('has nothing to ask when the parents share a name', () => {
    assert.deepEqual(householdSurnames(sur('Munch', 'Munch'), 'Love Nest', ['Munch', ' Munch ']), ['Munch']);
  });

  it('goes with the parent who lives there when the other does not', () => {
    // Akira Kibo's household; Diego Lobo lives elsewhere.
    assert.deepEqual(householdSurnames(sur('Kibo', 'Ojo'), 'Karaoke Legends', ['Kibo', 'Lobo']), ['Kibo']);
  });

  it('gives anyone else the household\'s most shared name', () => {
    assert.deepEqual(householdSurnames(sur('Ojo', 'Kibo', 'Kibo'), 'Karaoke Legends'), ['Kibo']);
    assert.deepEqual(householdSurnames(sur('', ''), 'Karaoke Legends'), []);
  });
});

describe('moves a save shows done', () => {
  const mv = (id: string, simId: string, toHh: string, extra: Record<string, unknown> = {}) =>
    ({ id, simId, createdAt: id, fromGid: 'W||A', fromHh: 'A', fromWorld: 'W', fromNb: '', toGid: `W||${toHh}`, toHh, toWorld: 'W', toNb: '', ...extra }) as HouseholdMove;
  const nodes = [{ id: 'j', saveSimId: '7' }, { id: 'p' }];

  it('is done once the save has the sim in the household they were moved to, earlier moves with it', () => {
    const moves = [mv('m1', 'j', 'Bro'), mv('m2', 'j', 'Le Chien'), mv('m3', 'p', 'Le Chien')];
    assert.deepEqual([...movesDoneBySave(moves, nodes, [{ saveSimId: '7', household: 'le chien' }])], ['m1', 'm2']);
  });

  it('is still a plan while the save has them elsewhere', () => {
    assert.equal(movesDoneBySave([mv('m1', 'j', 'Le Chien')], nodes, [{ saveSimId: '7', household: 'Bro' }]).size, 0);
  });
});
