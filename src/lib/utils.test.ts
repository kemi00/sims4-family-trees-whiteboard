import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Edge, SimNode } from '../types/whiteboard.ts';
import { currentGid, currentWorldName, migrateWhiteboardData, parentLinkMakesCycle } from './utils.ts';

function edge(a: string, b: string, type: Edge['type'] = 'parent'): Edge {
  return { id: `${type}:${a}:${b}`, a, b, type, source: 'seed' };
}

describe('parentLinkMakesCycle', () => {
  const goths = [
    edge('Bella', 'Alexander'),
    edge('Mortimer', 'Alexander'),
    edge('Alexander', 'Kid'),
    edge('Bella', 'Mortimer', 'marriage'),
  ];

  it('blocks a sim as their own parent', () => {
    assert.equal(parentLinkMakesCycle('Bella', 'Bella', []), true);
  });

  it('blocks a child or grandchild becoming the parent', () => {
    assert.equal(parentLinkMakesCycle('Alexander', 'Bella', goths), true);
    assert.equal(parentLinkMakesCycle('Kid', 'Mortimer', goths), true);
  });

  it('allows ordinary parent links', () => {
    assert.equal(parentLinkMakesCycle('Bella', 'Kid', goths), false);
    assert.equal(parentLinkMakesCycle('Cassandra', 'Bella', goths), false);
    assert.equal(parentLinkMakesCycle('Mortimer', 'Bella', goths), false);
  });

  it('ignores partner and sibling links', () => {
    const edges = [edge('A', 'B', 'marriage'), edge('B', 'C', 'sibling')];
    assert.equal(parentLinkMakesCycle('C', 'A', edges), false);
  });

  it('terminates when the board already holds a cycle', () => {
    const edges = [edge('X', 'Y'), edge('Y', 'X'), edge('Y', 'Z')];
    assert.equal(parentLinkMakesCycle('Q', 'X', edges), false);
    assert.equal(parentLinkMakesCycle('Z', 'X', edges), true);
  });
});

describe('Not in any world', () => {
  const sim = (world: string, gid: string): SimNode =>
    ({ id: 'a', gid, first: 'A', sur: 'B', hh: 'B', world, oworld: world } as SimNode);

  it('renames the world once called Other (or Other / Townie) on load', () => {
    const d = migrateWhiteboardData({
      nodes: [sim('Other', 'Other||Banks'), sim('Other / Townie', 'Other / Townie||Kunal')],
      edges: [],
      groups: [{ gid: 'Other||Banks', hh: 'Banks', world: 'Other', nb: '-', color: '#9aa0a6', x: 0, y: 0, w: 0, h: 0 }],
      worlds: [{ name: 'Other', color: '#9aa0a6' }],
    });
    assert.deepEqual(
      d.nodes.map((n) => [n.world, n.oworld, n.gid]),
      [
        ['Not in any world', 'Not in any world', 'Not in any world||Banks'],
        ['Not in any world', 'Not in any world', 'Not in any world||Kunal'],
      ],
    );
    assert.equal(d.groups![0]!.gid, 'Not in any world||Banks');
    assert.equal(d.worlds![0]!.name, 'Not in any world');
  });

  it('leaves a household that only starts with "Other" alone', () => {
    assert.equal(currentGid('Otherworld||Ames'), 'Otherworld||Ames');
    assert.equal(currentWorldName('Willow Creek'), 'Willow Creek');
  });
});
