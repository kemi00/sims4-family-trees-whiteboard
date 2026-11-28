import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { lastBabyOf, openTries, triesFor, triesToBirths } from './babyTries.ts';

describe('tries for a baby, carried to the baby', () => {
  const jangs = { 'anaya|baako': [{ day: 2, pregnant: false }, { day: 3, pregnant: false }, { day: 4, pregnant: false }, { day: 5, pregnant: true }] };

  it('gives a newborn the tries since the couple’s last baby, and starts the count again', () => {
    const next = triesToBirths(jangs, [{ id: 'liam', parentIds: ['baako', 'anaya'] }])!;
    assert.deepEqual(triesFor(next, 'liam'), { count: 4, first: 2, last: 5 });
    assert.deepEqual(openTries(next['anaya|baako']), []);
    assert.deepEqual(lastBabyOf(next['anaya|baako']), { ids: ['liam'], count: 4 });
    // Their next baby's tries count from one, and the last baby keeps its four.
    const more = { 'anaya|baako': [...next['anaya|baako']!, { day: 20, pregnant: true }] };
    const after = triesToBirths(more, [{ id: 'mia', parentIds: ['anaya', 'baako'] }])!;
    assert.deepEqual(triesFor(after, 'mia'), { count: 1, first: 20, last: 20 });
    assert.deepEqual(triesFor(after, 'liam'), { count: 4, first: 2, last: 5 });
  });

  it('shares the tries between twins', () => {
    const next = triesToBirths(jangs, [
      { id: 'ada', parentIds: ['anaya', 'baako'] },
      { id: 'bea', parentIds: ['anaya', 'baako'] },
    ])!;
    assert.deepEqual(triesFor(next, 'ada'), { count: 4, first: 2, last: 5 });
    assert.deepEqual(triesFor(next, 'bea'), { count: 4, first: 2, last: 5 });
    assert.deepEqual(lastBabyOf(next['anaya|baako']), { ids: ['ada', 'bea'], count: 4 });
  });

  it('leaves the tries alone for a baby with one parent known, or a couple with none logged', () => {
    assert.equal(triesToBirths(jangs, [{ id: 'x', parentIds: ['anaya'] }]), jangs);
    assert.equal(triesToBirths(jangs, [{ id: 'x', parentIds: ['eliza', 'bob'] }]), jangs);
    assert.equal(triesFor(jangs, 'nobody'), null);
  });
});
