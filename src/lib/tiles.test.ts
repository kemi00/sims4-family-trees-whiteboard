import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CARD_H,
  CARD_MIN_W,
  HH_TAG_BAND,
  HH_TAG_INSET,
  HH_TAG_PILL_H,
  HH_TAG_STACK_GAP,
  TILE,
} from './constants.ts';
import {
  animalLaneDivider,
  householdChrome,
  snapGroupDelta,
  snapNodesToTiles,
  snapToTile,
  tileCardSize,
  tileFloor,
  tileSnapOrigin,
} from './tiles.ts';
import type { SimNode } from '../types/whiteboard.ts';

describe('tile grid', () => {
  it('makes each card 1 row by 2 columns of square tiles', () => {
    const size = tileCardSize();
    assert.equal(size.w, TILE * 2);
    assert.equal(size.h, TILE);
    assert.equal(CARD_MIN_W, size.w);
    assert.equal(CARD_H, size.h);
  });

  it('snaps origins onto the tile grid', () => {
    assert.equal(snapToTile(0), 0);
    assert.equal(snapToTile(49), 0);
    assert.equal(snapToTile(50), TILE);
    const p = tileSnapOrigin(130, 270);
    assert.equal(p.x, TILE);
    assert.equal(p.y, TILE * 3);
  });

  it('snaps every card onto the grid without stretching size', () => {
    const n = {
      id: 'a',
      x: 40,
      y: 260,
      w: CARD_MIN_W,
      h: CARD_H,
    } as SimNode;
    const [snapped] = snapNodesToTiles([n]);
    assert.equal(snapped?.x, 0);
    assert.equal(snapped?.y, TILE * 3);
    assert.equal(snapped?.w, CARD_MIN_W);
    assert.equal(snapped?.h, CARD_H);
  });

  it('moves a group by whole tiles from its start origin', () => {
    const d = snapGroupDelta(200, 100, 40, 60);
    assert.equal(d.dx, 0);
    assert.equal(d.dy, TILE);
    const hopped = snapGroupDelta(200, 100, 160, -30);
    assert.equal(hopped.dx, TILE * 2);
    assert.equal(hopped.dy, 0);
  });

  it('stacks Age up tight under the household name in the chrome tile', () => {
    const mem = [
      { x: 200, y: 200, w: CARD_MIN_W, h: CARD_H },
      { x: 500, y: 200, w: CARD_MIN_W, h: CARD_H },
      { x: 200, y: 400, w: CARD_MIN_W, h: CARD_H },
      { x: 500, y: 400, w: CARD_MIN_W, h: CARD_H },
    ] as SimNode[];
    const chrome = householdChrome(mem, {
      hh: 'Goth',
      nb: 'Pendula View',
      world: 'Willow Creek',
    });
    assert.ok(chrome);
    assert.equal(HH_TAG_BAND, TILE);
    assert.equal(chrome.boxL, 200);
    assert.equal(chrome.boxT, 100);
    assert.equal(chrome.headerX, 200 + HH_TAG_INSET);
    assert.equal(chrome.headerY, 100 + HH_TAG_INSET);
    assert.equal(chrome.ageX, chrome.headerX);
    assert.equal(
      chrome.ageY,
      chrome.headerY + HH_TAG_PILL_H + HH_TAG_STACK_GAP,
    );
    assert.ok(chrome.headerY + chrome.pillH < chrome.ageY);
    assert.ok(chrome.ageY + chrome.pillH <= chrome.y0);
    assert.ok(chrome.headerY > chrome.boxT);
    assert.equal(chrome.boxB, 500);
    assert.ok(chrome.boxR >= 700);
  });

  it('keeps tags in tiles strictly above cards when origins are off-grid', () => {
    const mem = [{ x: 210, y: 190, w: CARD_MIN_W, h: CARD_H }] as SimNode[];
    const chrome = householdChrome(mem, {
      hh: 'Goth',
      nb: '-',
      world: 'Willow Creek',
    });
    assert.ok(chrome);
    assert.equal(chrome.boxL, tileFloor(210));
    assert.equal(chrome.boxT, tileFloor(190) - HH_TAG_BAND);
    assert.ok(chrome.ageY + HH_TAG_PILL_H <= 190);
    assert.ok(chrome.headerY > chrome.boxT);
  });
});

describe('animal lane divider', () => {
  const at = (id: string, x: number, y: number, pet = false): SimNode =>
    ({ id, x, y, w: CARD_MIN_W, h: CARD_H, ...(pet ? { species: 'Horse', state: 'Pet' } : { state: 'Sim' }) }) as SimNode;

  it('runs midway through the empty column, top of the cards to the bottom', () => {
    const lane = animalLaneDivider([at('tallulah', 0, 0), at('umber', 0, 200), at('juniper', 300, 200), at('wren', 0, 400), at('luna', 900, 0, true), at('starbrite', 900, 200, true)]);
    assert.deepEqual(lane, { x: 700, t: 0, b: 400 + CARD_H });
  });

  it('draws none for animals in the sims’ rows, as laid out before lanes', () => {
    assert.equal(animalLaneDivider([at('umber', 0, 0), at('juniper', 300, 0), at('luna', 600, 0, true)]), null);
  });

  it('draws none once a card stands across it, and none without both kinds', () => {
    assert.equal(animalLaneDivider([at('umber', 0, 0), at('luna', 900, 0, true), at('wren', 1200, 200)]), null);
    assert.equal(animalLaneDivider([at('luna', 0, 0, true), at('starbrite', 0, 200, true)]), null);
    assert.equal(animalLaneDivider([at('umber', 0, 0)]), null);
  });
});
