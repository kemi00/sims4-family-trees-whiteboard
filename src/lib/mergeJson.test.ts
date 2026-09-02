import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mergeJsonIntoBoard } from './mergeJson.ts';
import type { Edge, Group, SimNode } from '../types/whiteboard.ts';

function node(
  id: string,
  extra: Partial<SimNode> = {},
): SimNode {
  return {
    id,
    gid: 'Willow Creek||Goth',
    first: id.split(' ')[0]!,
    sur: id.split(' ')[1] ?? 'Goth',
    age: 'Adult',
    state: 'Sim',
    gender: 'Female',
    hh: 'Goth',
    world: 'Willow Creek',
    nb: '-',
    color: '#4e79a7',
    townie: false,
    oworld: 'Willow Creek',
    onb: '-',
    ohh: 'Goth',
    oplay: 'Resident',
    pack: '',
    x: 0,
    y: 0,
    w: 0,
    h: 0,
    ox: 10,
    oy: 20,
    ...extra,
  };
}

const groups: Group[] = [
  {
    gid: 'Willow Creek||Goth',
    hh: 'Goth',
    world: 'Willow Creek',
    nb: '-',
    color: '#4e79a7',
    x: 0,
    y: 0,
    w: 0,
    h: 0,
  },
];

describe('mergeJsonIntoBoard', () => {
  it('overwrites marriage with divorced from the JSON for the same pair', () => {
    const bella = node('Bella Goth', { ox: 100, oy: 50, fromSave: true });
    const mort = node('Mortimer Goth', { gender: 'Male', ox: 200, oy: 50 });
    const boardEdges: Edge[] = [
      {
        id: 'e1',
        a: bella.id,
        b: mort.id,
        type: 'marriage',
        source: 'save',
      },
    ];
    const incomingEdges: Edge[] = [
      {
        id: 'u9',
        a: bella.id,
        b: mort.id,
        type: 'divorced',
        source: 'planned',
      },
    ];
    const result = mergeJsonIntoBoard({
      boardNodes: [bella, mort],
      boardEdges,
      boardGroups: groups,
      incomingNodes: [
        node('Bella Goth', { ox: 0, oy: 0 }),
        node('Mortimer Goth', { gender: 'Male', ox: 0, oy: 0 }),
      ],
      incomingEdges,
      incomingGroups: groups,
    });
    const unions = result.edges.filter(
      (e) =>
        e.type === 'marriage' ||
        e.type === 'romance' ||
        e.type === 'divorced',
    );
    assert.equal(unions.length, 1);
    assert.equal(unions[0]!.type, 'divorced');
    assert.ok(result.summary.relationshipsOverwritten >= 1);
    // Default: board placement + fromSave preserved on match.
    const b = result.nodes.find((n) => n.id === bella.id)!;
    assert.equal(b.ox, 100);
    assert.equal(b.oy, 50);
    assert.equal(b.fromSave, true);

    const filePositions = mergeJsonIntoBoard({
      boardNodes: [bella, mort],
      boardEdges,
      boardGroups: groups,
      incomingNodes: [
        node('Bella Goth', { ox: 7, oy: 9 }),
        node('Mortimer Goth', { gender: 'Male', ox: 0, oy: 0 }),
      ],
      incomingEdges,
      incomingGroups: groups,
      keepBoardPositions: false,
    });
    const bFile = filePositions.nodes.find((n) => n.id === bella.id)!;
    assert.equal(bFile.ox, 7);
    assert.equal(bFile.oy, 9);
    assert.equal(bFile.fromSave, true);
  });

  it('keeps board-only planned links and adds JSON-only sims/links', () => {
    const bob = node('Bob Pancakes', { gid: 'Willow Creek||Pancakes', hh: 'Pancakes' });
    const eliza = node('Eliza Pancakes', {
      gid: 'Willow Creek||Pancakes',
      hh: 'Pancakes',
    });
    const boardEdges: Edge[] = [
      {
        id: 'u1',
        a: bob.id,
        b: eliza.id,
        type: 'marriage',
        source: 'planned',
      },
    ];
    const newbie = node('New Sim', {
      id: 'new1',
      gid: 'Willow Creek||Pancakes',
      hh: 'Pancakes',
      added: true,
    });
    const result = mergeJsonIntoBoard({
      boardNodes: [bob, eliza],
      boardEdges,
      boardGroups: groups,
      incomingNodes: [bob, eliza, newbie],
      incomingEdges: [
        {
          id: 'u2',
          a: bob.id,
          b: newbie.id,
          type: 'parent',
          source: 'planned',
        },
      ],
      incomingGroups: groups,
    });
    assert.equal(result.summary.nodesAdded, 1);
    assert.ok(
      result.edges.some(
        (e) => e.type === 'marriage' && e.a === bob.id && e.b === eliza.id,
      ),
    );
    assert.ok(
      result.edges.some(
        (e) => e.type === 'parent' && e.b === newbie.id,
      ),
    );
  });
});
