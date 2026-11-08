import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Edge, SimNode } from '../types/whiteboard.ts';
import {
  dynastyIndex,
  dynastyNameTaken,
  familyDynasties,
  isPlannedOnlyDynasty,
  removePlannedDynasty,
  renamePlannedDynasty,
} from './dynastyMenu.ts';

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
    const out = renamePlannedDynasty(nodes, 'Moonwood', ' Moonshade ');
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
    assert.equal(isPlannedOnlyDynasty(nodes, 'Moonwood'), true);
    assert.equal(isPlannedOnlyDynasty(nodes, 'Dreamer'), false);
    assert.equal(isPlannedOnlyDynasty(nodes, 'Goth'), false);
    assert.equal(renamePlannedDynasty(nodes, 'Dreamer', 'Dreamers'), nodes);
    assert.equal(renamePlannedDynasty(nodes, 'Moonwood', '  '), nodes);
  });

  it('can be removed from every member, leaving their cards and other dynasties be', () => {
    const out = removePlannedDynasty(nodes, 'Moonwood');
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
    assert.equal(removePlannedDynasty(nodes, 'Dreamer'), nodes);
    assert.equal(removePlannedDynasty(nodes, 'Nowhere'), nodes);
  });

  it('knows a name another dynasty has, in any case, but not its own', () => {
    assert.equal(dynastyNameTaken(nodes, 'goth', 'Moonwood'), true);
    assert.equal(dynastyNameTaken(nodes, 'MOONWOOD', 'Moonwood'), false);
    assert.equal(dynastyNameTaken(nodes, 'Moonshade', 'Moonwood'), false);
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
