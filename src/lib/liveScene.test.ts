import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  edgeEndsMoveTogether,
  parseEdgeEndsAttr,
  sceneTransformAttr,
} from './liveScene.ts';

describe('sceneTransformAttr', () => {
  it('emits an SVG transform attribute (no CSS px units)', () => {
    assert.equal(
      sceneTransformAttr({ tx: 12.5, ty: -40, k: 0.75 }),
      'translate(12.5,-40) scale(0.75)',
    );
  });
});

describe('edgeEndsMoveTogether', () => {
  it('moves ink only when every endpoint is in the drag set', () => {
    const moving = new Set(['a', 'b']);
    assert.equal(edgeEndsMoveTogether(['a', 'b'], moving), true);
    assert.equal(edgeEndsMoveTogether(['a', 'c'], moving), false);
    assert.equal(edgeEndsMoveTogether([], moving), false);
  });
});

describe('parseEdgeEndsAttr', () => {
  it('round-trips sim ids that contain spaces', () => {
    const raw = JSON.stringify(['Bob Pancakes', 'Eliza Pancakes']);
    assert.deepEqual(parseEdgeEndsAttr(raw), [
      'Bob Pancakes',
      'Eliza Pancakes',
    ]);
  });
});
