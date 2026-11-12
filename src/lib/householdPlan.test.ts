import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Edge, Group, HouseholdMove, SaveGameInfo, SimNode } from '../types/whiteboard.ts';
import {
  eldersOf,
  gameHomes,
  householdName,
  householdPlans,
  householdsNotInGame,
  itemsFor,
  planBadge,
  planTallies,
  unblockedBy,
  upNext,
  upNextReason,
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

  it('wait on a baby born to parents in another household than the one it is planned for', () => {
    const nodes = [
      sim('Sergio', 'Bro'),
      sim('Siobhan', 'Bro'),
      planned('Kid', 'Le Chien', { first: '', planLabel: 'Spare' }),
      sim('Joaquin', 'Le Chien'),
    ];
    const edges = [
      link('p1', 'Sergio', 'Kid', 'parent'),
      link('p2', 'Siobhan', 'Kid', 'parent'),
      link('u1', 'Kid', 'Joaquin', 'marriage'),
    ];
    const items = plans(nodes, edges);
    assert.equal(one(items, 'couple:u1').waits[0]!.gid, 'W||Bro');
    assert.deepEqual(unblockedBy(items, 'W||Bro').map((x) => x.id), ['couple:u1']);
    assert.deepEqual(unblockedBy(items, 'W||Le Chien'), []);
  });

  it('wait on a baby with parents apart where most of them are, else where it is planned', () => {
    const parents = [sim('Ana', 'A'), sim('Ben', 'B')];
    const edges = (kid: string) => [link('p1', 'Ana', kid, 'parent'), link('p2', 'Ben', kid, 'parent'), link('u1', kid, 'Cy', 'marriage')];
    const wait = (kidHh: string) => {
      const nodes = [...parents, planned('Kid', kidHh, { first: '' }), sim('Cy', 'C')];
      return one(plans(nodes, edges('Kid')), 'couple:u1').waits[0]!.gid;
    };
    assert.equal(wait('B'), 'W||B');
    assert.equal(wait('C'), 'W||A');
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

describe('your notes on plans', () => {
  it('show on a couple, and on one off plan, to help decide', () => {
    const nodes = [sim('Beatrice', 'Capp'), sim('Dirk', 'Dreamer'), sim('Adekoya', 'Capp'), sim('Lilith', 'Vatore')];
    const couple = { ...link('u1', 'Lilith', 'Dirk', 'romance'), note: 'Vampire heirs' };
    assert.equal(one(plans(nodes, [couple]), 'couple:u1').yourNote, 'Vampire heirs');
    const off = [{ ...link('u2', 'Beatrice', 'Dirk', 'marriage'), note: 'Merge the money' }, link('v1', 'Beatrice', 'Adekoya', 'marriage', 'save')];
    assert.equal(one(plans(nodes, off), 'off:u2').yourNote, 'Merge the money');
    assert.equal(one(plans(nodes, [link('u3', 'Lilith', 'Dirk', 'romance')]), 'couple:u3').yourNote, undefined);
  });

  it('show on babies, each note once, and on a move', () => {
    const nodes = [sim('Sergio', 'Romeo', { gender: 'Male' }), sim('Siobhan', 'Romeo'), planned('k1', 'Romeo', { first: '', planLabel: 'Heir' }), planned('k2', 'Romeo', { first: '', planLabel: 'Spare' })];
    const edges = [
      { ...link('k1a', 'Sergio', 'k1', 'parent'), note: 'The heir' },
      { ...link('k1b', 'Siobhan', 'k1', 'parent'), note: 'The heir' },
      link('k2a', 'Sergio', 'k2', 'parent'),
      { ...link('k2b', 'Siobhan', 'k2', 'parent'), note: 'A spare, in case' },
    ];
    assert.equal(one(plans(nodes, edges), 'baby:Sergio|Siobhan').yourNote, 'The heir\nA spare, in case');
    const moved = sim('Joaquin', 'Le Chien');
    const moves: HouseholdMove[] = [
      { id: 'm1', simId: 'Joaquin', createdAt: 'm1', fromGid: 'W||Bro', fromHh: 'Bro', fromWorld: 'W', fromNb: '', toGid: 'W||Le Chien', toHh: 'Le Chien', toWorld: 'W', toNb: '', note: 'Closer to Elsa' },
    ];
    assert.equal(one(plans([moved], [], { moves }), 'move:m1').yourNote, 'Closer to Elsa');
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

  it('warn, without blocking, when every parent who could carry is an elder', () => {
    const old = [sim('Sergio', 'Romeo', { age: 'Elder' }), sim('Siobhan', 'Romeo', { gender: 'Male' })];
    const i = one(plans([...old, kid('k1', 'Heir')], parentLinks('k1')), 'baby:Sergio|Siobhan');
    assert.equal(i.state, 'ready');
    assert.equal(i.note, 'Sergio Romeo is an elder: in the game, elders can’t carry a baby.');
    // A younger one who could carry: no warning.
    const young = [sim('Sergio', 'Romeo', { age: 'Elder', gender: 'Male' }), sim('Siobhan', 'Romeo')];
    assert.equal(one(plans([...young, kid('k1', 'Heir')], parentLinks('k1')), 'baby:Sergio|Siobhan').note, undefined);
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

describe('planned dynasty roles', () => {
  it('are ready for a sim in the game, with a note when the save has them in no dynasty', () => {
    const nodes = [
      sim('Dirk', 'Dreamer', { dynasty: 'Dreamer', dynastyRole: 'head', dynastyPlan: 'role' }),
      sim('Gunther', 'Munch', { dynasty: 'Dreamer', dynastyRole: 'outcast', dynastyPlan: 'member' }),
      sim('Bella', 'Goth', { dynasty: 'Goth', dynastyRole: 'heir' }),
    ];
    const items = plans(nodes, []);
    assert.deepEqual(
      items.map((i) => [i.id, i.state, i.text, i.note ?? '']),
      [
        ['role:Dirk', 'ready', 'Make Dirk Dreamer head of the Dreamer dynasty', ''],
        ['role:Gunther', 'ready', 'Declare Gunther Munch an outcast of the Dreamer dynasty', 'Not in the Dreamer dynasty in your save yet.'],
      ],
    );
  });

  it('join, start or leave a dynasty', () => {
    const nodes = [
      sim('Bjorn', 'Bjergsen', { dynasty: 'Bjergsen', dynastyRole: 'head', dynastyPlan: 'member' }),
      sim('Clara', 'Bjergsen', { dynasty: 'Bjergsen', dynastyPlan: 'member' }),
      sim('Arnessa', 'Thebe', { dynasty: 'Thebe', dynastyId: '3', dynastyPlan: 'none' }),
    ];
    assert.deepEqual(
      plans(nodes, []).map((i) => i.text),
      [
        'Start the Bjergsen dynasty with Bjorn Bjergsen as its head',
        'Bring Clara Bjergsen into the Bjergsen dynasty',
        'Take Arnessa Thebe out of the Thebe dynasty',
      ],
    );
  });

  it('tell apart two dynasties of one name by their founder', () => {
    const nodes = [
      sim('Sara', 'Scott', { dynasty: 'Scott', dynastyId: '5', dynastyRole: 'head' }),
      sim('Lia', 'Scott', { dynasty: 'Scott', dynastyId: '5', dynastyPlan: 'member' }),
      sim('Travis', 'Scott', { dynasty: 'Scott', dynastyRef: 'r1', dynastyRole: 'head', dynastyPlan: 'member' }),
    ];
    assert.deepEqual(
      plans(nodes, []).map((i) => i.text),
      [
        'Bring Lia Scott into the Scott dynasty (Sara’s line)',
        'Start the Scott dynasty (Travis’s line) with Travis Scott as its head',
      ],
    );
  });

  it('wait for a teen or a planned baby to grow up before they start a dynasty', () => {
    const nodes = [
      sim('Darling', 'Walsh', { age: 'Teen', dynasty: 'Walsh', dynastyRole: 'head', dynastyPlan: 'member' }),
      sim('Miko', 'Ojo'),
      planned('Kid', 'Ojo', { first: '', dynasty: 'Ojo', dynastyRole: 'head', dynastyPlan: 'member' }),
      sim('Abe', 'Alto', { age: 'Teen', dynasty: 'Alto', dynastyRole: 'heir', dynastyPlan: 'member' }),
    ];
    const items = plans(nodes, [link('p1', 'Miko', 'Kid', 'parent')]);
    const teen = one(items, 'role:Darling');
    assert.deepEqual(
      [teen.state, teen.waits[0]!.why, teen.waits[0]!.stage, teen.note],
      ['waiting', 'tooYoung', 'Young Adult', 'In the game, only a young adult or older can start a dynasty.'],
    );
    const baby = one(items, 'role:Kid');
    assert.deepEqual([baby.state, baby.waits[0]!.why, baby.waits[0]!.stage], ['waiting', 'notBorn', 'Young Adult']);
    // An heir has no age to wait for.
    assert.equal(one(items, 'role:Abe').state, 'ready');
  });

  it('plan an heir after another, waiting until that sim is head', () => {
    const nodes = [
      sim('Vivian', 'Lewis', { age: 'Elder', dynasty: 'Lewis', dynastyRole: 'head' }),
      sim('Eric', 'Lewis', { dynasty: 'Lewis', dynastyRole: 'heir' }),
      sim('Olivia', 'Lewis', { age: 'Child', dynasty: 'Lewis', heirAfter: 'Eric' }),
      planned('Rose', 'Lewis', { first: 'Rose', dynasty: 'Lewis', dynastyPlan: 'member', heirAfter: 'Olivia' }),
    ];
    const items = plans(nodes, [link('p1', 'Olivia', 'Rose', 'parent')]);
    const olivia = one(items, 'heir:Olivia');
    assert.deepEqual(
      [olivia.state, olivia.text, olivia.waits.map((w) => [w.sim, w.why])],
      ['waiting', 'Make Olivia Lewis heir of the Lewis dynasty', [['Eric', 'notHead']]],
    );
    assert.equal(waitText(olivia.waits[0]!, (id) => `${id} Lewis`, () => 'the Lewis household'), 'Eric Lewis isn’t head yet');
    // Rose waits on her mother too, and on being born.
    assert.deepEqual(one(items, 'heir:Rose').waits.map((w) => w.why), ['notHead', 'notBorn']);
    // Once the save has Eric as head, making Olivia heir is ready.
    const later = plans(
      nodes.map((n) => (n.id === 'Vivian' ? { ...n, dynastyRole: undefined } : n.id === 'Eric' ? { ...n, dynastyRole: 'head' as const } : n)),
      [],
    );
    assert.equal(one(later, 'heir:Olivia').state, 'ready');
  });

  it('wait on a planned heir not born yet', () => {
    const nodes = [
      sim('Dirk', 'Dreamer'),
      planned('Heir', 'Dreamer', { first: '', planLabel: 'Heir', dynasty: 'Dreamer', dynastyRole: 'heir', dynastyPlan: 'member' }),
    ];
    const i = one(plans(nodes, [link('p1', 'Dirk', 'Heir', 'parent')]), 'role:Heir');
    assert.deepEqual([i.state, i.waits[0]!.why, i.waits[0]!.days], ['waiting', 'notBorn', null]);
    assert.equal(
      waitText(i.waits[0]!, () => 'Heir Dreamer', (gid) => householdName(gid, [], nodes)),
      'Heir Dreamer isn’t born yet: play the Dreamer household for the birth',
    );
  });
});

describe('household moves', () => {
  const move = (id: string, simId: string, from: string, to: string, extra: Partial<HouseholdMove> = {}): HouseholdMove => ({
    id,
    simId,
    createdAt: id,
    fromGid: `W||${from}`,
    fromHh: from,
    fromWorld: 'W',
    fromNb: '',
    toGid: `W||${to}`,
    toHh: to,
    toWorld: 'W',
    toNb: '',
    ...extra,
  });

  it('are ready to do in the game until a save shows them done, in both households', () => {
    const nodes = [sim('Joaquin', 'Le Chien'), planned('Kid', 'Le Chien', { first: '', planNo: 1 })];
    const moves = [move('m1', 'Joaquin', 'Bro', 'Le Chien'), move('m2', 'Kid', 'Bro', 'Le Chien')];
    // The planned sim lives there only in the plan: no move to make in the game.
    const items = plans(nodes, [], { moves }).filter((i) => i.kind === 'move');
    assert.deepEqual(
      items.map((i) => [i.id, i.state, i.text, i.gids]),
      [['move:m1', 'ready', 'Move Joaquin Le Chien from Bro to the Le Chien household', ['W||Le Chien', 'W||Bro']]],
    );
    assert.deepEqual(plans(nodes, [], { moves: [{ ...moves[0]!, done: true }] }).filter((i) => i.kind === 'move'), []);
  });

  it('make a household that changes worlds one move, and name the worlds of a sim who changes them', () => {
    const inOndarion = (id: string) => sim(id, 'Dreamer', { gid: 'Ondarion||Dreamer', world: 'Ondarion' });
    const nodes = [inOndarion('Dirk'), inOndarion('Amarachi'), sim('Lucas', 'Summerdream', { gid: 'Innisgreen||Summerdream', world: 'Innisgreen' })];
    const world = { fromGid: 'Not in any world||Dreamer', fromWorld: 'Not in any world', toGid: 'Ondarion||Dreamer', toWorld: 'Ondarion' };
    const moves = [
      move('m1', 'Dirk', 'Dreamer', 'Dreamer', world),
      move('m2', 'Amarachi', 'Dreamer', 'Dreamer', { ...world, note: 'Room to grow' }),
      move('m3', 'Lucas', 'Munch', 'Summerdream', { fromGid: 'Windenburg||Munch', fromWorld: 'Windenburg', toGid: 'Innisgreen||Summerdream', toWorld: 'Innisgreen' }),
    ];
    assert.deepEqual(
      plans(nodes, [], { moves }).filter((i) => i.kind === 'move').map((i) => [i.text, i.sims, i.yourNote]),
      [
        ['Move Lucas Summerdream from Munch (Windenburg) to the Summerdream household (Innisgreen)', ['Lucas'], undefined],
        ['Move the Dreamer household from Not in any world to Ondarion', ['Dirk', 'Amarachi'], 'Room to grow'],
      ],
    );
  });

  it('take a story step by step, from where the game has them', () => {
    const nodes = [child('Elsa', 'Le Chien')];
    const moves = [move('m1', 'Elsa', 'Bjergsen', 'Bro'), move('m2', 'Elsa', 'Bro', 'Le Chien')];
    assert.deepEqual(
      plans(nodes, [], { moves }).map((i) => [i.id, i.text, i.gids, i.note]),
      [['move:m1', 'Move Elsa Le Chien from Bjergsen to the Bro household', ['W||Bro', 'W||Bjergsen'], 'Then to the Le Chien household.']],
    );
    // A save that showed the first move done leaves the second.
    const later = [{ ...moves[0]!, done: true as const }, moves[1]!];
    assert.deepEqual(plans(nodes, [], { moves: later }).map((i) => i.text), ['Move Elsa Le Chien from Bro to the Le Chien household']);
  });

  it('keep a story that comes back where it started: its first step is still to do', () => {
    const nodes = [sim('Joaquin', 'Bro')];
    const moves = [move('m1', 'Joaquin', 'Bro', 'Le Chien'), move('m2', 'Joaquin', 'Le Chien', 'Bro')];
    assert.deepEqual(
      plans(nodes, [], { moves }).map((i) => [i.id, i.text, i.note]),
      [['move:m1', 'Move Joaquin Bro from Bro to the Le Chien household', 'Then to the Bro household.']],
    );
  });

  it('plan a divorce or a breakup, ready for a couple the game has and waiting for a planned one', () => {
    const nodes = [sim('Dirk', 'Dreamer'), sim('Ama', 'Darong'), sim('Lucas', 'Munch'), sim('Mara', 'Summerdream')];
    const edges: Edge[] = [
      { id: 's1', a: 'Dirk', b: 'Ama', type: 'marriage', source: 'save', ending: { createdAt: 'x', note: 'Drama' } },
      { id: 'u1', a: 'Lucas', b: 'Mara', type: 'romance', source: 'planned', ending: { createdAt: 'y' } },
    ];
    const ends = plans(nodes, edges).filter((i) => i.id.startsWith('end:'));
    assert.deepEqual(
      ends.map((i) => [i.text, i.state, i.yourNote]),
      [
        ['Divorce Dirk Dreamer and Ama Darong', 'ready', 'Drama'],
        ['Break up Lucas Munch and Mara Summerdream', 'waiting', undefined],
      ],
    );
  });

  it('leave a sim to grow up where the game has them, so playing that household helps', () => {
    const nodes = [sim('Joaquin', 'Le Chien'), child('Elsa', 'Le Chien', 'inactive')];
    const moves = [move('m1', 'Elsa', 'Bjergsen', 'Le Chien')];
    const items = plans(nodes, [link('u1', 'Joaquin', 'Elsa', 'marriage')], { moves });
    const [w] = one(items, 'couple:u1').waits;
    assert.equal(w!.gid, 'W||Bjergsen');
    assert.equal(
      waitText(w!, (id) => id, (gid) => householdName(gid, [], nodes)),
      'Elsa is a Child: Young Adult in 17 days of playing the Bjergsen household',
    );
    assert.deepEqual(unblockedBy(items, 'W||Bjergsen').map((i) => i.id), ['couple:u1']);
    assert.deepEqual(unblockedBy(items, 'W||Le Chien'), []);
  });

  it('know where sims are in the game and which households it doesn’t have yet', () => {
    const nodes = [
      sim('Joaquin', 'Le Chien'),
      child('Elsa', 'Le Chien'),
      planned('Kid', 'Le Chien', { first: '', planNo: 1 }),
      sim('Sergio', 'Bro'),
      sim('Siobhan', 'Bro'),
      planned('Lone', 'New', { first: '', planNo: 1 }),
    ];
    const moves = [
      move('m1', 'Elsa', 'Bjergsen', 'Bro'),
      move('m2', 'Elsa', 'Bro', 'Le Chien'),
      move('m3', 'Joaquin', 'Bro', 'Le Chien'),
      move('m4', 'Kid', 'Bro', 'Le Chien'),
      move('m5', 'Siobhan', 'Fyres', 'Bro'),
    ];
    assert.deepEqual([...gameHomes(nodes, moves)], [
      ['Elsa', 'W||Bjergsen'],
      ['Joaquin', 'W||Bro'],
      ['Siobhan', 'W||Fyres'],
    ]);
    // Bro has Sergio in the game; New is made by creating its planned sim.
    assert.deepEqual([...householdsNotInGame(nodes, moves)], [['W||Le Chien', ['Joaquin', 'Elsa']]]);
    // Once a save shows Joaquin there, it is.
    const done = moves.map((m) => (m.simId === 'Joaquin' ? { ...m, done: true as const } : m));
    assert.deepEqual([...householdsNotInGame(nodes, done)], []);
    // A household everyone left on the board is still named from its key.
    assert.equal(householdName('W||Bjergsen', [], nodes), 'the Bjergsen household');
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

  it('badges a household with what is ready first, then off plan, then waiting', () => {
    assert.deepEqual(planBadge({ ready: 2, waiting: 1, offPlan: 1 }), {
      text: '2 ready',
      tone: 'ready',
      title: '2 ready, 1 waiting, 1 off plan',
    });
    assert.equal(planBadge({ ready: 0, waiting: 3, offPlan: 1 })!.text, '1 off plan');
    assert.deepEqual(planBadge({ ready: 0, waiting: 3, offPlan: 0 }), { text: 'waiting', tone: 'waiting', title: '3 waiting' });
    assert.equal(planBadge({ ready: 0, waiting: 0, offPlan: 0 }), null);
    assert.equal(planBadge(undefined), null);
    // A window for babies closing comes first: play soon.
    assert.deepEqual(planBadge({ ready: 1, waiting: 1, offPlan: 0, closing: 1 }), {
      text: '⏳ 1 closing',
      tone: 'closing',
      title: '1 window for babies closing, 1 ready, 1 waiting',
    });
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

describe('Up next', () => {
  const nodes = [
    sim('Dirk', 'Dreamer'),
    sim('Dina', 'Dreamer'),
    planned('Heir', 'Dreamer', { first: '', planLabel: 'Heir' }),
    sim('Spare', 'Munch'),
    sim('Lysander', 'Capp'),
    sim('Bella', 'Capp'),
    sim('Sergio', 'Romeo'),
    sim('Siobhan', 'Romeo'),
    planned('k1', 'Romeo', { first: '', planLabel: 'Heir' }),
    sim('Fyr', 'Fyres'),
    sim('Fay', 'Fyres'),
  ];
  const edges = [
    link('p1', 'Dirk', 'Heir', 'parent'),
    link('p2', 'Dina', 'Heir', 'parent'),
    link('u1', 'Heir', 'Spare', 'marriage'),
    link('u2', 'Lysander', 'Bella', 'marriage'),
    link('u3', 'Sergio', 'Siobhan', 'marriage'),
    link('p3', 'Sergio', 'k1', 'parent'),
    link('p4', 'Siobhan', 'k1', 'parent'),
    link('u4', 'Fyr', 'Fay', 'romance'),
  ];
  const items = plans(nodes, edges);
  const order = (extra: Partial<Parameters<typeof upNext>[0]> = {}) =>
    upNext({ items, nodes, groups: [], saveGame: game, ...extra }).map((r) => r.gid.slice(3));

  it('puts plays that unblock others first, then the most ready, and leaves out who can’t move', () => {
    assert.deepEqual(order(), ['Dreamer', 'Romeo', 'Capp', 'Fyres']);
  });

  it('breaks ties by who was played longest ago, never played first', () => {
    // Capp and Fyres tie on everything else; by name, Capp comes first.
    assert.deepEqual(order().slice(2), ['Capp', 'Fyres']);
    const capp = { ...game, activeHousehold: 'Capp' };
    assert.deepEqual(order({ saveGame: capp }).slice(2), ['Fyres', 'Capp']);
    const both = { ...game, activeHousehold: 'Capp', playedBefore: ['Fyres'] };
    assert.deepEqual(order({ saveGame: both }).slice(2), ['Fyres', 'Capp']);
    const flipped = { ...game, activeHousehold: 'Fyres', playedBefore: ['Capp'] };
    assert.deepEqual(order({ saveGame: flipped }).slice(2), ['Capp', 'Fyres']);
  });

  it('prefers an older generation before who was played', () => {
    const generations = new Map([['Fyr', { gen: 1 }], ['Lysander', { gen: 3 }]]);
    assert.deepEqual(order({ generations }).slice(2), ['Fyres', 'Capp']);
  });

  it('moves an elder with a plan left and few days up, and skipped households to the end', () => {
    const old = nodes.map((n) =>
      n.id === 'Fyr' ? { ...n, age: 'Elder', life: { born: 0, stageDays: 12, stage: 'Elder', at: 0 } } : n,
    );
    const rows = upNext({ items: plans(old, edges), nodes: old, groups: [], saveGame: game, skipped: new Set(['W||Dreamer']) });
    assert.deepEqual(rows.map((r) => [r.gid.slice(3), r.skipped]), [
      ['Fyres', false],
      ['Romeo', false],
      ['Capp', false],
      ['Dreamer', true],
    ]);
    assert.deepEqual(rows[0]!.elder, { id: 'Fyr', oldAgeIn: 1 });
  });

  it('says why in a line', () => {
    const rows = upNext({ items, nodes, groups: [], saveGame: game });
    const nameOf = (id: string) => cardName(nodes.find((n) => n.id === id)!);
    const hhOf = (gid: string) => householdName(gid, [], nodes);
    assert.deepEqual(
      rows.map((r) => upNextReason(r, nameOf, hhOf)),
      [
        'Helps the Munch household: Heir Dreamer is born here',
        'Ready: Marry Sergio Romeo and Siobhan Romeo (and 1 more)',
        'Ready: Marry Lysander Capp and Bella Capp',
        'Ready: Get Fyr Fyres and Fay Fyres together',
      ],
    );
  });

  it('counts the other plans it helps and names who grows up here', () => {
    const kids = [child('Lucas', 'Munch', 'inactive'), child('Mia', 'Munch', 'inactive')];
    const more = [...nodes, ...kids, sim('Gus', 'Fyres'), sim('Pia', 'Pike')];
    const edges2 = [...edges, link('u5', 'Lucas', 'Gus', 'marriage'), link('u6', 'Mia', 'Pia', 'marriage')];
    const rows = upNext({ items: plans(more, edges2), nodes: more, groups: [], saveGame: game });
    const munch = rows.find((r) => r.gid === 'W||Munch')!;
    const nameOf = (id: string) => cardName(more.find((n) => n.id === id)!);
    const hhOf = (gid: string) => householdName(gid, [], more);
    assert.equal(
      upNextReason(munch, nameOf, hhOf),
      'Helps the Fyres household and the Pike household: Lucas Munch grows up here (and 1 more plan)',
    );
  });

  it('puts a household the game doesn’t have yet after the ones you can play, saying who moves in', () => {
    const notInGame = new Map([['W||Dreamer', ['Dirk', 'Dina']]]);
    const rows = upNext({ items, nodes, groups: [], saveGame: game, notInGame, skipped: new Set(['W||Capp']) });
    assert.deepEqual(rows.map((r) => r.gid.slice(3)), ['Romeo', 'Fyres', 'Dreamer', 'Capp']);
    const nameOf = (id: string) => cardName(nodes.find((n) => n.id === id)!);
    assert.equal(
      upNextReason(rows[2]!, nameOf, (gid) => gid),
      'Not in your game yet: move Dirk Dreamer and Dina Dreamer in first',
    );
  });
});
