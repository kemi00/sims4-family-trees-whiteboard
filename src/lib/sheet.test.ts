import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { detentHeights, releaseDetent } from './sheet.ts';

const heights = detentHeights(800, 70, 52);

describe('drawer heights', () => {
  it('half the screen, full under the top bar, the bar as measured', () => {
    assert.deepEqual(heights, { bar: 70, half: 416, full: 740 });
  });

  it('never makes half taller than full on a short screen', () => {
    const h = detentHeights(300, 70, 52);
    assert.ok(h.half <= h.full);
  });
});

describe('where a drag lets go', () => {
  it('settles on the nearest height when slow', () => {
    assert.equal(releaseDetent({ visible: 120, velocity: 0, heights }), 'bar');
    assert.equal(releaseDetent({ visible: 380, velocity: 0.1, heights }), 'half');
    assert.equal(releaseDetent({ visible: 700, velocity: -0.1, heights }), 'full');
  });

  it('a flick down goes one height lower', () => {
    assert.equal(releaseDetent({ visible: 700, velocity: 1, heights }), 'half');
    assert.equal(releaseDetent({ visible: 400, velocity: 1, heights }), 'bar');
    assert.equal(releaseDetent({ visible: 60, velocity: 1, heights }), 'bar');
  });

  it('a flick up goes one height higher', () => {
    assert.equal(releaseDetent({ visible: 90, velocity: -1, heights }), 'half');
    assert.equal(releaseDetent({ visible: 430, velocity: -1, heights }), 'full');
    assert.equal(releaseDetent({ visible: 760, velocity: -1, heights }), 'full');
  });
});
