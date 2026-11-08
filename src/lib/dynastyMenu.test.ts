import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Edge, SimNode } from '../types/whiteboard.ts';
import {
  dynastiesNamed,
  dynastyIndex,
  familyDynasties,
  isPlannedOnlyDynasty,
  newDynastyFields,
  removePlannedDynasty,
  renamePlannedDynasty,
  riskText,
} from './dynastyMenu.ts';
import { dynastyKey } from './generations.ts';

const sim = (id: string, extra: Partial<SimNode> = {}): SimNode =>
  ({ id, first: id, sur: 'Luna', age: 'Adult', gender: 'Female', state: 'Sim', ...extra }) as SimNode;
const parent = (a: string, b: string): Edge => ({ id: `${a}>${b}`, a, b, type: 'parent' });

describe('family dynasties', () => {
  it("lists the parents' dynasties first, the one their last name carries leading", () => {
    const nodes = [
      sim('Kid', { sur: 'Dreamer' }),
      sim('Mum', { sur: 'Capp', dynasty: 'Capp', dynastyId: '1', dynastyRole: 'heir' }),
      sim('Dad', { sur: 'Dreamer', gender: 'Male', dynasty: 'Dreamer', dynastyId: '2' }),
      sim('Wife', { sur: 'Thebe', dynasty: 'Thebe', dynastyId: '3' }),
    ];
    const edges: Edge[] = [parent('Mum', 'Kid'), parent('Dad', 'Kid'), { id: 'm', a: 'Kid', b: 'Wife', type: 'marriage' }];
    assert.deepEqual(familyDynasties('Kid', nodes, edges), [
      { key: 'id:2', people: [{ id: 'Dad', rel: 'father' }] },
      { key: 'id:1', people: [{ id: 'Mum', rel: 'mother' }] },
      { key: 'id:3', people: [{ id: 'Wife', rel: 'spouse' }] },
    ]);
  });

  it('names both parents once when they share a dynasty, and skips one planned out of it', () => {
    const nodes = [
      sim('Kid'),
      sim('Mum', { dynasty: 'Luna' }),
      sim('Dad', { gender: 'Male', dynasty: 'Luna' }),
      sim('Ex', { dynasty: 'Goth', dynastyPlan: 'none' }),
    ];
    const edges: Edge[] = [parent('Mum', 'Kid'), parent('Dad', 'Kid'), { id: 'r', a: 'Ex', b: 'Kid', type: 'romance' }];
    assert.deepEqual(familyDynasties('Kid', nodes, edges), [
      {
        key: 'name:Luna',
        people: [
          { id: 'Mum', rel: 'mother' },
          { id: 'Dad', rel: 'father' },
        ],
      },
    ]);
  });

  it('has none for a pet or a sim whose family is in no dynasty', () => {
    const nodes = [sim('Kid'), sim('Mum'), sim('Rex', { species: 'Dog' })];
    assert.deepEqual(familyDynasties('Kid', nodes, [parent('Mum', 'Kid')]), []);
    assert.deepEqual(familyDynasties('Rex', nodes, []), []);
  });
});

describe('renaming a planned dynasty', () => {
  const nodes = [
    sim('Head', { dynasty: 'Moonwood', dynastyRole: 'head', dynastyPlan: 'member', genRootOf: 'name:Moonwood' }),
    sim('Kid', { dynasty: 'Moonwood', dynastyPlan: 'member' }),
    sim('Bella', { dynasty: 'Goth', dynastyId: '7' }),
    sim('Dirk', { dynasty: 'Dreamer' }),
    sim('Plan', { dynasty: 'Dreamer', dynastyPlan: 'member' }),
  ];

  it('renames it on every member and on what is kept by its key', () => {
    const { nodes: out, key } = renamePlannedDynasty(nodes, 'name:Moonwood', ' Moonshade ');
    assert.equal(key, 'name:Moonshade');
    assert.deepEqual(
      out.map((n) => [n.id, n.dynasty, n.genRootOf ?? '']),
      [
        ['Head', 'Moonshade', 'name:Moonshade'],
        ['Kid', 'Moonshade', ''],
        ['Bella', 'Goth', ''],
        ['Dirk', 'Dreamer', ''],
        ['Plan', 'Dreamer', ''],
      ],
    );
    assert.equal(out[2], nodes[2]);
  });

  it("leaves a game dynasty, one only some are planned into, and an empty name alone", () => {
    assert.equal(isPlannedOnlyDynasty(nodes, 'name:Moonwood'), true);
    assert.equal(isPlannedOnlyDynasty(nodes, 'name:Dreamer'), false);
    assert.equal(isPlannedOnlyDynasty(nodes, 'id:7'), false);
    assert.equal(renamePlannedDynasty(nodes, 'name:Dreamer', 'Dreamers').nodes, nodes);
    assert.equal(renamePlannedDynasty(nodes, 'name:Moonwood', '  ').nodes, nodes);
  });

  it('can be renamed to a name another dynasty has, kept apart by a board id of its own', () => {
    const { nodes: out, key } = renamePlannedDynasty(nodes, 'name:Moonwood', 'Goth');
    assert.match(key, /^ref:/);
    assert.deepEqual(
      out.map((n) => [n.id, n.dynasty, dynastyKey(n), n.genRootOf ?? '']),
      [
        ['Head', 'Goth', key, key],
        ['Kid', 'Goth', key, ''],
        ['Bella', 'Goth', 'id:7', ''],
        ['Dirk', 'Dreamer', 'name:Dreamer', ''],
        ['Plan', 'Dreamer', 'name:Dreamer', ''],
      ],
    );
    // One with its own id keeps it when renamed again.
    assert.equal(renamePlannedDynasty(out, key, 'Moonwood').key, key);
  });

  it('can be removed from every member, leaving their cards and other dynasties be', () => {
    const out = removePlannedDynasty(nodes, 'name:Moonwood');
    assert.deepEqual(
      out.map((n) => [n.id, n.dynasty ?? '', n.dynastyRole ?? '', n.dynastyPlan ?? '', n.genRootOf ?? '']),
      [
        ['Head', '', '', '', ''],
        ['Kid', '', '', '', ''],
        ['Bella', 'Goth', '', '', ''],
        ['Dirk', 'Dreamer', '', '', ''],
        ['Plan', 'Dreamer', '', 'member', ''],
      ],
    );
    assert.equal(removePlannedDynasty(nodes, 'name:Dreamer'), nodes);
    assert.equal(removePlannedDynasty(nodes, 'name:Nowhere'), nodes);
  });

  it('knows the other dynasties with a name, in any case, but not its own', () => {
    assert.deepEqual(dynastiesNamed(nodes, 'goth', 'name:Moonwood'), ['id:7']);
    assert.deepEqual(dynastiesNamed(nodes, 'MOONWOOD', 'name:Moonwood'), []);
    assert.deepEqual(dynastiesNamed(nodes, 'Moonshade'), []);
  });
});

describe('a new dynasty', () => {
  it('gets a board id of its own only when another dynasty has its name', () => {
    const nodes = [sim('Sara', { sur: 'Scott', dynasty: 'Scott', dynastyRole: 'head', dynastyPlan: 'member' })];
    assert.deepEqual(newDynastyFields(nodes, ' Scott ', 'r1'), { dynasty: 'Scott', dynastyRef: 'r1' });
    assert.deepEqual(newDynastyFields(nodes, 'scott', 'r1'), { dynasty: 'scott', dynastyRef: 'r1' });
    assert.deepEqual(newDynastyFields(nodes, 'Travis', 'r1'), { dynasty: 'Travis' });
  });

  it('stays apart from the other of its name, as a dynasty of its own', () => {
    const nodes = [
      sim('Sara', { sur: 'Scott', dynasty: 'Scott', dynastyRole: 'head', dynastyPlan: 'member' }),
      sim('Travis', { sur: 'Scott', dynasty: 'Scott', dynastyRef: 'r1', dynastyRole: 'head', dynastyPlan: 'member' }),
    ];
    assert.deepEqual(
      dynastyIndex(nodes).map((r) => [r.key, r.head?.id]),
      [
        ['name:Scott', 'Sara'],
        ['ref:r1', 'Travis'],
      ],
    );
    assert.equal(removePlannedDynasty(nodes, 'ref:r1')[0], nodes[0]);
  });
});

describe('the dynasty list', () => {
  it('groups members by dynasty with head, heir and what is planned', () => {
    const nodes = [
      sim('Cordelia', { sur: 'Thebe', dynasty: 'Thebe', dynastyId: '3', dynastyRole: 'head' }),
      sim('Queen', { sur: 'Thebe', dynasty: 'Thebe', dynastyId: '3', state: 'Deceased', dynastyRole: 'head' }),
      sim('Abe', { sur: 'Thebe', dynasty: 'Thebe', dynastyId: '3' }),
      sim('Heir', { sur: 'Thebe', first: '', added: true, dynasty: 'Thebe', dynastyId: '3', dynastyRole: 'heir', dynastyPlan: 'member' }),
      sim('Arnessa', { sur: 'Thebe', dynasty: 'Thebe', dynastyId: '3', dynastyPlan: 'none' }),
      sim('Yuki', { sur: 'Behr', dynasty: 'Behr', dynastyRole: 'head', dynastyPlan: 'member' }),
      sim('Rex', { dynasty: 'Behr', species: 'Dog' }),
      sim('Loner'),
    ];
    const [behr, thebe] = dynastyIndex(nodes);
    assert.deepEqual(
      [behr!.name, behr!.inGame, behr!.members.length, behr!.head?.id, behr!.joining],
      ['Behr', false, 1, 'Yuki', 0],
    );
    assert.deepEqual(
      [thebe!.inGame, thebe!.head?.id, thebe!.heir?.id, thebe!.joining, thebe!.leaving, thebe!.deceased],
      [true, 'Cordelia', 'Heir', 1, 1, 1],
    );
    assert.deepEqual(
      thebe!.members.map((m) => m.id),
      ['Cordelia', 'Heir', 'Abe', 'Arnessa', 'Queen'],
    );
  });
});

describe('dynasties at risk', () => {
  const risk = (members: Partial<SimNode>[]) =>
    dynastyIndex(members.map((m, i) => sim(`s${i}`, { dynasty: 'Lum', dynastyId: '7', ...m })))[0]!.risk;

  it('are those with no heir, or 2 sims or fewer to carry them on', () => {
    assert.deepEqual(risk([{ dynastyRole: 'head' }]), { noHeir: true, sims: 1 });
    // A head and an heir alone, or a head and one more, are still at risk.
    assert.deepEqual(risk([{ dynastyRole: 'head' }, { dynastyRole: 'heir' }]), { noHeir: false, sims: 2 });
    assert.deepEqual(risk([{ dynastyRole: 'head' }, {}]), { noHeir: true, sims: 2 });
    assert.deepEqual(risk([{ dynastyRole: 'head' }, {}, {}, {}]), { noHeir: true, sims: 4 });
    assert.equal(risk([{ dynastyRole: 'head' }, { dynastyRole: 'heir' }, {}]), undefined);
  });

  it('count planned members and heirs, but not the deceased, outcasts or sims planned to leave', () => {
    // A planned heir and a planned member make it safe in the plan.
    assert.equal(risk([{ dynastyRole: 'head' }, { dynastyRole: 'heir', dynastyPlan: 'member' }, { dynastyPlan: 'member' }]), undefined);
    assert.deepEqual(
      risk([
        { dynastyRole: 'head' },
        { dynastyRole: 'heir', state: 'Deceased' },
        { dynastyRole: 'outcast' },
        { dynastyPlan: 'none' },
        {},
      ]),
      { noHeir: true, sims: 2 },
    );
  });

  it('say why in a few words', () => {
    assert.deepEqual(
      [
        riskText({ noHeir: true, sims: 1 }),
        riskText({ noHeir: true, sims: 4 }),
        riskText({ noHeir: false, sims: 2 }),
        riskText({ noHeir: true, sims: 0 }),
      ],
      ['no heir, and only 1 sim', 'no heir', 'only 2 sims', 'no sims left'],
    );
  });
});
