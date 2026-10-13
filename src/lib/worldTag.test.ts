import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { LABEL_MIN_K, WORLD_TAG_PILL_H } from './constants.ts';
import { worldCounts, worldCountsText, worldTagLayout } from './worldTag.ts';
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
      'Willow Creek: 4 sims — 3 in 2 households, 1 in Unhoused sims, plus 1 pet, 1 deceased and 1 unnamed relative. Filters hide 1 more.',
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
