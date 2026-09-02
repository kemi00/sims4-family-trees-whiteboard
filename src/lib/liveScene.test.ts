import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  edgeEndsMoveTogether,
  parseEdgeEndsAttr,
  sceneTransformAttr,
  sharedChromeValue,
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

describe('sharedChromeValue', () => {
  it('returns the shared world or household, else undefined', () => {
    const worlds = new Map([
      ['a', 'Willow Creek'],
      ['b', 'Willow Creek'],
      ['c', 'Oasis Springs'],
    ]);
    assert.equal(sharedChromeValue(['a', 'b'], worlds), 'Willow Creek');
    assert.equal(sharedChromeValue(['a', 'c'], worlds), undefined);
    assert.equal(sharedChromeValue(['a', 'missing'], worlds), undefined);
    assert.equal(sharedChromeValue([], worlds), undefined);
    assert.equal(sharedChromeValue(['a', 'b'], undefined), undefined);
  });

  it('does not treat placeholder worlds as chrome units', () => {
    const worlds = new Map([
      ['a', '—'],
      ['b', '—'],
    ]);
    assert.equal(sharedChromeValue(['a', 'b'], worlds), undefined);
  });
});
