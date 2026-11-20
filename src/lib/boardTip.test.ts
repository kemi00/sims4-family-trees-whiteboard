import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { describe, it } from 'node:test';
import { parseRichTip, placeTip } from './boardTip.ts';

const view = { w: 1000, h: 700 };
const tip = { w: 200, h: 80 };

describe('where a board tip goes', () => {
  it('sits under its element, centred, or lined up with its left edge', () => {
    const a = { left: 400, top: 100, right: 500, bottom: 130 };
    assert.deepEqual(placeTip(a, tip, view), { x: 350, y: 138 });
    assert.deepEqual(placeTip(a, tip, view, { align: 'start' }), { x: 400, y: 138 });
  });

  it('goes over its element near the bottom, and stays on screen at the edges', () => {
    assert.deepEqual(placeTip({ left: 400, top: 640, right: 500, bottom: 670 }, tip, view), { x: 350, y: 552 });
    assert.equal(placeTip({ left: 0, top: 100, right: 40, bottom: 130 }, tip, view).x, 8);
    assert.equal(placeTip({ left: 960, top: 100, right: 1000, bottom: 130 }, tip, view).x, 792);
  });

  it('goes left of a panel row, or right when there is no room', () => {
    assert.deepEqual(placeTip({ left: 800, top: 300, right: 990, bottom: 320 }, tip, view, { side: 'left' }), { x: 592, y: 270 });
    assert.equal(placeTip({ left: 100, top: 300, right: 300, bottom: 320 }, tip, view, { side: 'left' }).x, 308);
  });
});

describe('a rich tip read back', () => {
  it('takes a world tip and ignores anything else', () => {
    assert.deepEqual(parseRichTip('{"head":"Sulani","rows":[]}'), { head: 'Sulani', rows: [] });
    assert.equal(parseRichTip('Sulani'), null);
    assert.equal(parseRichTip('{"rows":[]}'), null);
    assert.equal(parseRichTip(null), null);
  });
});

describe('the board’s tips', () => {
  it('are its own, never the browser’s: no <title> on the board', () => {
    const dir = new URL('../components/', import.meta.url);
    const using = readdirSync(dir)
      .filter((f) => f.endsWith('.tsx'))
      .filter((f) => /<title[\s>]/.test(readFileSync(new URL(f, dir), 'utf8')));
    assert.deepEqual(using, []);
  });
});
