import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Edge, SimNode } from '../types/whiteboard.ts';
import { dueFromTries, parentsExpecting, parentsOf, triesSummary } from './babyTries.ts';

describe('a baby’s tries', () => {
  it('sums them up and gives a due date from the last one that worked', () => {
    const tries = [{ day: 2, pregnant: false }, { day: 3, pregnant: false }, { day: 4, pregnant: false }, { day: 5, pregnant: true }];
    assert.deepEqual(triesSummary(tries), { count: 4, first: 2, last: 5 });
    assert.equal(dueFromTries(tries), 9);
    assert.equal(dueFromTries(tries.slice(0, 3)), null);
    assert.equal(triesSummary([]), null);
  });

  it('finds the parents, and whether the save has them expecting', () => {
    const anaya = { id: 'anaya', first: 'Anaya', pregnancy: { dueAt: 1, with: 'baako' } } as SimNode;
    const baako = { id: 'baako', first: 'Baako' } as SimNode;
    const other = { id: 'other', first: 'Other', pregnancy: { dueAt: 1, with: 'someone' } } as SimNode;
    const edges = [
      { id: '1', a: 'anaya', b: 'baby', type: 'parent' },
      { id: '2', a: 'baako', b: 'baby', type: 'parent' },
    ] as Edge[];
    const byId = new Map([anaya, baako, other].map((n) => [n.id, n]));
    const parents = parentsOf('baby', edges, byId);
    assert.deepEqual(parents.map((p) => p.id), ['anaya', 'baako']);
    assert.equal(parentsExpecting(parents)?.id, 'anaya');
    // Expecting by someone else: not this baby's.
    assert.equal(parentsExpecting([other, baako]), undefined);
  });
});
