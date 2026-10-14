import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  HH_TAG_INSET,
  LABEL_MIN_K,
  TILE,
  WORLD_TAG_PILL_H,
  WORLD_TITLE_BAND,
  ZOOM_MIN,
} from './constants.ts';
import {
  worldCounts,
  worldCountsText,
  worldTagBox,
  worldTagLayout,
  worldTagLift,
} from './worldTag.ts';
import type { SimNode } from '../types/whiteboard.ts';

function card(id: string, gid: string, state = 'Sim', pack = 'Base Game'): SimNode {
  return {
    id,
    first: id,
    sur: 'Ames',
    age: 'Adult',
    state,
    gender: 'Female',
    hh: gid,
    world: 'W',
    nb: '-',
    color: '#000',
    townie: false,
    oworld: 'W',
    onb: '-',
    ohh: gid,
    oplay: 'Resident',
    pack,
    gid,
    x: 0,
    y: 0,
    w: 200,
    h: 100,
  };
}

const members = [
  card('u1', 'W||Unhoused sims'),
  { ...card('t9', 'g2'), first: 'Unknown', treeId: '9' },
  card('a', 'g1'),
  card('b', 'g1'),
  card('cat', 'g1', 'Pet'),
  card('gran', 'g2', 'Deceased'),
  card('ghost', 'g2', 'Ghost'),
  card('far', 'g3', 'Sim', 'Hidden Pack'),
];
const shown = (n: SimNode) => n.pack !== 'Hidden Pack';

describe('world tag counts', () => {
  it('counts living sims and the households shown', () => {
    assert.deepEqual(worldCounts(members, shown), {
      sims: 4,
      relatives: 1,
      households: 2,
      unhoused: 1,
      pets: 1,
      deceased: 1,
      hidden: 1,
    });
  });

  it('spells the counts out, with what the numbers leave out', () => {
    assert.equal(
      worldCountsText('Willow Creek', worldCounts(members, shown)),
      'Willow Creek: 4 sims — 3 in 2 households, 1 in Unhoused sims, plus 1 pet, 1 deceased and 1 relative from the family tree. Filters hide 1 more.',
    );
    assert.equal(
      worldCountsText('Not in any world', worldCounts([card('u1', 'Not in any world||Unhoused sims'), card('u2', 'Not in any world||Unhoused sims')], () => true)),
      'Not in any world: 2 sims in Unhoused sims.',
    );
    assert.equal(
      worldCountsText('Tartosa', worldCounts([card('a', 'g1')], () => true)),
      'Tartosa: 1 sim in 1 household.',
    );
  });
});

describe('world tag layout', () => {
  const counts = worldCounts(members, shown);

  it('puts the counts after the name while card text is drawn', () => {
    const plain = worldTagLayout('Willow Creek', null, 1);
    const tag = worldTagLayout('Willow Creek', counts, 1);
    assert.equal(tag.h, WORLD_TAG_PILL_H);
    assert.ok(tag.counts!.dividerX! >= plain.w - 14, 'counts start after the name');
    assert.ok(tag.counts!.homeTextX > tag.counts!.simTextX);
    assert.ok(tag.w > plain.w);
  });

  it('stacks the counts under the name when zoomed out, no wider than the name', () => {
    const k = LABEL_MIN_K / 2;
    const plain = worldTagLayout('Willow Creek', null, k);
    const tag = worldTagLayout('Willow Creek', counts, k);
    assert.equal(tag.counts!.dividerX, null);
    assert.equal(tag.counts!.simIconX, tag.nameX);
    assert.ok(tag.h > plain.h);
    assert.equal(tag.w, plain.w);
  });

  it('scales with the tag when zoomed out', () => {
    const near = worldTagLayout('Sulani', counts, LABEL_MIN_K);
    const at1 = worldTagLayout('Sulani', counts, 1);
    assert.ok(near.scale > 1);
    assert.ok(Math.abs(near.w - at1.w * near.scale) < 1e-6);
  });
});

describe('world tag placement', () => {
  const counts = worldCounts(members, shown);
  const frame = { l: 0, t: 0, r: 20 * TILE, b: 10 * TILE };
  /** Where the top row's household name tags start. */
  const householdTags = frame.t + WORLD_TITLE_BAND + HH_TAG_INSET;

  it('sits in the frame at full size', () => {
    const tag = worldTagLayout('Gibbi Point', counts, 1);
    const box = worldTagBox(frame, tag, 1);
    assert.equal(box.x, frame.l);
    assert.equal(box.y, frame.t);
  });

  it("grows up, never over the top row's household tags while their text is drawn", () => {
    for (const name of ['Sulani', 'Gibbi Point', 'Henford-on-Bagley']) {
      for (const k of [LABEL_MIN_K, 0.375, 0.5, 0.75, 1]) {
        const tag = worldTagLayout(name, counts, k);
        const box = worldTagBox(frame, tag, k);
        assert.ok(box.y + tag.h <= householdTags, `${name} at ${k} is drawn over them`);
        assert.ok(box.hit.b <= householdTags, `${name} at ${k} picks up a press on them`);
        assert.ok(box.hit.t < box.y && box.hit.r > box.x + tag.w, 'the pad still rounds the tag');
      }
    }
  });

  it('rises no more than a tile above the frame', () => {
    for (const k of [ZOOM_MIN, 0.1, LABEL_MIN_K / 2]) {
      const tag = worldTagLayout('Henford-on-Bagley', counts, k);
      assert.ok(worldTagLift(tag) <= TILE);
      assert.equal(worldTagBox(frame, tag, k).y, frame.t - worldTagLift(tag));
    }
    assert.equal(worldTagLift(worldTagLayout('Sulani', counts, 1)), 0);
  });

  it('stops rising at the world above', () => {
    const tag = worldTagLayout('Sulani', counts, 0.1);
    assert.equal(worldTagBox(frame, tag, 0.1, 30).y, frame.t - 30);
    assert.equal(worldTagBox(frame, tag, 0.1, -5).y, frame.t);
  });
});
