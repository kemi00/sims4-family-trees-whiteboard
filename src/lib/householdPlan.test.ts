import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Edge, Group, SaveGameInfo, SimNode } from '../types/whiteboard.ts';
import {
  eldersOf,
  householdName,
  householdPlans,
  itemsFor,
  planTallies,
  unblockedBy,
  waitText,
  type PlanItem,
} from './householdPlan.ts';
import { cardName, planConflicts } from './plan.ts';

const sim = (id: string, hh: string, extra: Partial<SimNode> = {}): SimNode =>
  ({
    id,
    gid: `W||${hh}`,
    first: id,
    sur: hh,
    age: 'Young Adult',
    state: 'Sim',
    gender: 'Female',
    hh,
    world: 'W',
    nb: '',
    color: '#999',
    saveSimId: `s-${id}`,
    ...extra,
  }) as SimNode;
const planned = (id: string, hh: string, extra: Partial<SimNode> = {}) =>
  sim(id, hh, { added: true, saveSimId: undefined, age: 'Unknown', gender: '-', ...extra });
const link = (id: string, a: string, b: string, type: Edge['type'], source: Edge['source'] = 'planned'): Edge => ({
  id,
  a,
  b,
  type,
  source,
});
/** Short lifespan, only the active household aging: the user's own settings. */
const game: SaveGameInfo = { importedAt: 'now', clock: 0, lifespan: 'Short', playedAging: 'Active', unplayedAging: false };
const child = (id: string, hh: string, frozen?: 'inactive') =>
  sim(id, hh, { age: 'Child', life: { born: 0, stageDays: 0, stage: 'Child', at: 0, ...(frozen ? { frozen } : {}) } });

const plans = (nodes: SimNode[], edges: Edge[], extra: Partial<Parameters<typeof householdPlans>[0]> = {}) =>
  householdPlans({ nodes, edges, conflicts: planConflicts(nodes, edges), saveGame: game, ...extra });
const one = (items: PlanItem[], id: string) => {
  const i = items.find((x) => x.id === id);
  assert.ok(i, `no item ${id} in ${items.map((x) => x.id).join(', ')}`);
  return i;
};

describe('planned couples', () => {
  it('are ready when both are grown up, in both households', () => {
    const nodes = [sim('Lysander', 'Capp'), sim('Spare', 'Munch')];
    const i = one(plans(nodes, [link('u1', 'Lysander', 'Spare', 'marriage')]), 'couple:u1');
    assert.deepEqual([i.state, i.text, i.gids], ['ready', 'Marry Lysander Capp and Spare Munch', ['W||Capp', 'W||Munch']]);
  });

  it('say the wedding is next when the save has them engaged', () => {
    const nodes = [sim('Lysander', 'Capp'), sim('Spare', 'Munch')];
    const items = plans(nodes, [link('u1', 'Lysander', 'Spare', 'marriage')], {
      pairStatus: [{ a: 'Spare', b: 'Lysander', tags: ['engaged'] }],
    });
    assert.equal(one(items, 'couple:u1').text, 'Lysander Capp and Spare Munch are engaged: the wedding is next');
  });

  it('wait on a sim too young, for the days of playing their household', () => {
    const nodes = [sim('Gunther', 'Fyres'), child('Lucas', 'Munch', 'inactive')];
    const i = one(plans(nodes, [link('u1', 'Gunther', 'Lucas', 'marriage')]), 'couple:u1');
    assert.equal(i.state, 'waiting');
    const [w] = i.waits;
    assert.deepEqual([w!.why, w!.now, w!.stage, w!.gid, w!.move, w!.days], ['tooYoung', 'Child', 'Young Adult', 'W||Munch', 'play', 17.5]);
    const nameOf = (id: string) => cardName(nodes.find((n) => n.id === id)!);
    const hhOf = (gid: string) => householdName(gid, [], nodes);
    assert.equal(waitText(w!, nameOf, hhOf), 'Lucas Munch is a Child: Young Adult in 17 days of playing the Munch household');
  });

  it('count plain days when the household ages anyway', () => {
    const nodes = [sim('Gunther', 'Fyres'), child('Lucas', 'Munch')];
    const [w] = one(plans(nodes, [link('u1', 'Gunther', 'Lucas', 'marriage')]), 'couple:u1').waits;
    assert.equal(w!.move, 'time');
    assert.equal(waitText(w!, (id) => id, (gid) => gid), 'Lucas is a Child: Young Adult in 17 days');
  });

  it('let two teens date', () => {
    const teen = (id: string, hh: string) => sim(id, hh, { age: 'Teen' });
    const items = plans([teen('Ana', 'A'), teen('Ben', 'B')], [link('u1', 'Ana', 'Ben', 'romance')]);
    assert.deepEqual([one(items, 'couple:u1').state, one(items, 'couple:u1').text], ['ready', 'Get Ana A and Ben B together']);
  });

  it('wait on a planned partner not born yet, and playing the parents unblocks them', () => {
    const nodes = [
      sim('Dirk', 'Dreamer'),
      sim('Dina', 'Dreamer'),
      planned('Heir', 'Dreamer', { first: '', planLabel: 'Heir' }),
      sim('Spare', 'Munch'),
    ];
    const edges = [
      link('u1', 'Dirk', 'Heir', 'parent'),
      link('u2', 'Dina', 'Heir', 'parent'),
      link('u3', 'Heir', 'Spare', 'marriage'),
    ];
    const items = plans(nodes, edges);
    const i = one(items, 'couple:u3');
    assert.equal(i.state, 'waiting');
    assert.deepEqual([i.waits[0]!.why, i.waits[0]!.gid, i.waits[0]!.days], ['notBorn', 'W||Dreamer', 24]);
    assert.equal(
      waitText(i.waits[0]!, () => 'Heir Dreamer', (gid) => householdName(gid, [], nodes)),
      'Heir Dreamer isn’t born yet: play the Dreamer household for the birth, then about 24 days to Young Adult',
    );
    assert.deepEqual(unblockedBy(items, 'W||Dreamer').map((x) => x.id), ['couple:u3']);
    assert.deepEqual(unblockedBy(items, 'W||Munch'), []);
  });

  it('ask to find a planned spouse the game doesn’t have yet, ready now', () => {
    const nodes = [sim('Heir', 'Munch'), planned('Spouse', 'Munch', { first: '', planLabel: 'Future spouse', age: 'Young Adult' })];
    const items = plans(nodes, [link('u1', 'Heir', 'Spouse', 'marriage')]);
    const i = one(items, 'couple:u1');
    assert.deepEqual([i.state, i.text], ['ready', 'Find or create Future spouse Munch to marry Heir Munch']);
    assert.equal(items.filter((x) => x.kind === 'find').length, 0);
  });

  it('leave a couple the game went against to off plan', () => {
    const nodes = [sim('Beatrice', 'Capp'), sim('Dirk', 'Dreamer'), sim('Adekoya', 'Capp')];
    const edges = [link('u1', 'Beatrice', 'Dirk', 'marriage'), link('v1', 'Beatrice', 'Adekoya', 'marriage', 'save')];
    const items = plans(nodes, edges);
    assert.deepEqual(items.map((x) => [x.id, x.state]), [['off:u1', 'offPlan']]);
    assert.equal(items[0]!.text, 'Beatrice Capp married Adekoya Capp, not Dirk Dreamer as planned.');
  });
});

describe('planned babies', () => {
  const parents = [sim('Sergio', 'Romeo', { gender: 'Male' }), sim('Siobhan', 'Romeo')];
  const kid = (id: string, label: string) => planned(id, 'Romeo', { first: '', planLabel: label });
  const parentLinks = (k: string) => [link(`${k}a`, 'Sergio', k, 'parent'), link(`${k}b`, 'Siobhan', k, 'parent')];

  it('make one line per couple, ready when both parents are grown up', () => {
    const items = plans([...parents, kid('k1', 'Heir'), kid('k2', 'Spare')], [...parentLinks('k1'), ...parentLinks('k2')]);
    const i = one(items, 'baby:Sergio|Siobhan');
    assert.deepEqual([i.state, i.text, i.gids], ['ready', 'Sergio Romeo ＋ Siobhan Romeo: Heir Romeo and Spare Romeo', ['W||Romeo']]);
    assert.equal(items.length, 1);
  });

  it('warn, without blocking, when a parent is an elder', () => {
    const old = [sim('Sergio', 'Romeo', { age: 'Elder' }), sim('Siobhan', 'Romeo')];
    const i = one(plans([...old, kid('k1', 'Heir')], parentLinks('k1')), 'baby:Sergio|Siobhan');
    assert.equal(i.state, 'ready');
    assert.equal(i.note, 'Sergio Romeo is an elder: in the game, elders can’t carry a baby.');
  });

  it('wait on a parent too young', () => {
    const young = [sim('Sergio', 'Romeo', { age: 'Teen' }), sim('Siobhan', 'Romeo')];
    const i = one(plans([...young, kid('k1', 'Heir')], parentLinks('k1')), 'baby:Sergio|Siobhan');
    assert.deepEqual([i.state, i.waits[0]!.sim, i.waits[0]!.days], ['waiting', 'Sergio', null]);
  });

  it('can’t come once a parent has died', () => {
    const gone = [sim('Sergio', 'Romeo', { state: 'Deceased' }), sim('Siobhan', 'Romeo')];
    const i = one(plans([...gone, kid('k1', 'Heir')], parentLinks('k1')), 'baby:Sergio|Siobhan');
    assert.deepEqual([i.state, i.text], ['offPlan', 'Sergio Romeo has died, so Heir Romeo can’t come']);
  });
});

describe('a household’s plan at a glance', () => {
  const nodes = [
    sim('Lysander', 'Capp'),
    sim('Spare', 'Munch'),
    sim('Gunther', 'Munch'),
    child('Lucas', 'Munch', 'inactive'),
    planned('Loner', 'Munch', { first: '', planLabel: 'Pen pal' }),
  ];
  const edges = [link('u1', 'Lysander', 'Spare', 'marriage'), link('u2', 'Gunther', 'Lucas', 'romance')];
  const items = plans(nodes, edges);

  it('lists a planned sim with no one planned as its own item', () => {
    assert.deepEqual([one(items, 'find:Loner').state, one(items, 'find:Loner').text], ['ready', 'Find or create Pen pal Munch']);
  });

  it('counts each household’s ready, waiting and off-plan items', () => {
    const t = planTallies(items);
    assert.deepEqual(t.get('W||Munch'), { ready: 2, waiting: 1, offPlan: 0 });
    assert.deepEqual(t.get('W||Capp'), { ready: 1, waiting: 0, offPlan: 0 });
    assert.equal(itemsFor(items, 'W||Capp').length, 1);
  });

  it('names households by their tag, and the unhoused box as such', () => {
    const groups = [{ gid: 'W||Munch', hh: 'Munch' } as Group];
    assert.equal(householdName('W||Munch', groups, nodes), 'the Munch household');
    assert.equal(householdName('W||Unhoused sims', groups, nodes), 'the unhoused sims');
  });

  it('lists elders nearest to old age first', () => {
    const elder = (id: string, stageDays: number) =>
      sim(id, 'Munch', { age: 'Elder', life: { born: 0, stageDays, stage: 'Elder', at: 0 } });
    const list = eldersOf([elder('Gran', 4), elder('Gramps', 12), sim('Mila', 'Munch')], 'W||Munch', game);
    assert.deepEqual(list.map((e) => [e.id, e.elderDays, e.oldAgeIn]), [['Gramps', 6, 1], ['Gran', 2, 5]]);
  });
});
