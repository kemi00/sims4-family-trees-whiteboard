import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { sceneTransformAttr } from './liveScene.ts';

describe('sceneTransformAttr', () => {
  it('emits an SVG transform attribute (no CSS px units)', () => {
    assert.equal(
      sceneTransformAttr({ tx: 12.5, ty: -40, k: 0.75 }),
      'translate(12.5,-40) scale(0.75)',
    );
  });
});
