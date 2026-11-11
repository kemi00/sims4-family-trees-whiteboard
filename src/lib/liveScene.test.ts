import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  GLIDE_MIN,
  easeInOut,
  edgeEndsMoveTogether,
  glideAt,
  glideMs,
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

describe('the glide after an edit', () => {
  const from = { k: 1.1, tx: 100, ty: -50 };

  it('starts where the view is and ends the whole shift away, zoom kept', () => {
    assert.deepEqual(glideAt(from, 1300, -200, 0), from);
    assert.deepEqual(glideAt(from, 1300, -200, 1), { k: 1.1, tx: 1400, ty: -250 });
    assert.deepEqual(glideAt(from, 1300, -200, 2), { k: 1.1, tx: 1400, ty: -250 }, 'never past the end');
  });

  it('goes slow, fast, slow: halfway at the middle, less than a quarter in at a quarter', () => {
    assert.equal(easeInOut(0.5), 0.5);
    assert.ok(easeInOut(0.25) < 0.25);
    assert.ok(easeInOut(0.75) > 0.75);
  });

  it('takes a little longer for a longer trip, never more than half a second', () => {
    assert.ok(glideMs(GLIDE_MIN) >= 260);
    assert.ok(glideMs(3000) > glideMs(400));
    assert.ok(glideMs(100000) <= 500);
  });
});
