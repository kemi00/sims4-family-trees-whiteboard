import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Group, SimNode, World } from '../types/whiteboard.ts';
import {
  NEW_HOUSEHOLD,
  commonWorld,
  householdMovePlan,
  householdNamed,
  householdOptions,
  moveDestination,
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
