import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  cullWindow,
  cullWindowStale,
  nodeInCull,
  parsePointList,
  pathInCull,
  tileGridRect,
} from './viewportCull.ts';
import type { SimNode } from '../types/whiteboard.ts';

const card = (x: number, y: number) => ({ x, y, w: 200, h: 100 }) as SimNode;

describe('viewport culling', () => {
  // A 1000×800 stage at zoom 1, looking at world (0,0)–(1000,800).
  const vp = { k: 1, tx: 0, ty: 0 };

  it('overscans one screen on every side', () => {
    assert.deepEqual(cullWindow(vp, 1000, 800), { l: -1000, t: -800, r: 2000, b: 1600 });
  });

  it('scales the overscan with zoom so it stays one screen', () => {
    const w = cullWindow({ k: 0.5, tx: 0, ty: 0 }, 1000, 800);
    assert.deepEqual(w, { l: -2000, t: -1600, r: 4000, b: 3200 });
  });

  it('keeps a pan of under half a screen inside the window', () => {
    const win = cullWindow(vp, 1000, 800);
    assert.equal(cullWindowStale(win, { k: 1, tx: -400, ty: 300 }, 1000, 800), false);
  });

  it('re-centres once the view nears the edge', () => {
    const win = cullWindow(vp, 1000, 800);
    assert.equal(cullWindowStale(win, { k: 1, tx: -600, ty: 0 }, 1000, 800), true);
  });

  it('re-centres after zooming in far enough that the window is mostly waste', () => {
    const win = cullWindow(vp, 1000, 800);
    assert.equal(cullWindowStale(win, { k: 1.5, tx: 0, ty: 0 }, 1000, 800), false);
    assert.equal(cullWindowStale(win, { k: 3, tx: 0, ty: 0 }, 1000, 800), true);
  });

  it('mounts cards that touch the window, not ones beyond it', () => {
    const win = cullWindow(vp, 1000, 800);
    assert.equal(nodeInCull(card(1900, 1500), win), true);
    assert.equal(nodeInCull(card(2100, 0), win), false);
  });

  it('mounts a link whose box crosses the window even when both ends are outside', () => {
    const win = cullWindow(vp, 1000, 800);
    assert.equal(pathInCull([[-5000, 100], [5000, 100]], win), true);
    assert.equal(pathInCull([[3000, 0], [3000, 900]], win), false);
    assert.deepEqual(parsePointList('10,20 30,40'), [[10, 20], [30, 40]]);
  });
});

describe('tileGridRect', () => {
  it('covers the render window in whole tiles, wherever it is', () => {
    assert.deepEqual(tileGridRect({ l: 21950, t: -340, r: 26020, b: 1210 }), {
      x: 21900,
      y: -400,
      width: 4200,
      height: 1700,
    });
  });
});
