import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Edge } from '../types/whiteboard.ts';
import { parentLinkMakesCycle } from './utils.ts';

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
