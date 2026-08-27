import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { LAYOUT_EPOCH } from './constants.ts';
import {
  LAYOUT_OFFSET_REPACK_ABS,
  prepareLoadedNodes,
  shouldRepackOffsets,
} from './loadLayout.ts';
import type { SimNode } from '../types/whiteboard.ts';

function node(ox: number, oy = 0): SimNode {
  return {
    id: 'n',
    gid: 'g',
    first: 'A',
    sur: 'B',
    age: 'Adult',
    state: 'Sim',
    gender: 'Female',
    hh: 'H',
    world: 'Willow Creek',
    nb: '-',
    color: '#000',
    townie: false,
    oworld: 'Willow Creek',
    onb: '-',
    ohh: 'H',
    oplay: 'Resident',
    pack: '',
    x: 0,
    y: 0,
    w: 0,
    h: 0,
    ox,
    oy,
  };
}

describe('prepareLoadedNodes', () => {
  it('keeps offsets when layoutEpoch matches and offsets are modest', () => {
    const n = node(100);
    assert.equal(shouldRepackOffsets([n], LAYOUT_EPOCH), false);
    const { nodes, repacked } = prepareLoadedNodes([n], LAYOUT_EPOCH);
    assert.equal(repacked, false);
    assert.equal(nodes[0]!.ox, n.ox);
  });

  it('keeps large offsets when layoutEpoch matches (big dynasty boards)', () => {
    // Users drag worlds/sims far past LAYOUT_OFFSET_REPACK_ABS; wiping those
    // on every Load was destroying carefully adjusted placements.
    const n = node(LAYOUT_OFFSET_REPACK_ABS + 5000, -8000);
    assert.equal(shouldRepackOffsets([n], LAYOUT_EPOCH), false);
    const { nodes, repacked } = prepareLoadedNodes([n], LAYOUT_EPOCH);
    assert.equal(repacked, false);
    assert.equal(nodes[0]!.ox, n.ox);
    assert.equal(nodes[0]!.oy, n.oy);
  });

  it('keeps modest pre-epoch offsets', () => {
    const n = node(100, -50);
    assert.equal(shouldRepackOffsets([n], undefined), false);
    const { repacked } = prepareLoadedNodes([n], undefined);
    assert.equal(repacked, false);
  });

  it('repacks extreme offsets when layoutEpoch is missing (legacy)', () => {
    const n = node(LAYOUT_OFFSET_REPACK_ABS + 100);
    assert.equal(shouldRepackOffsets([n], undefined), true);
    const { nodes, repacked } = prepareLoadedNodes([n], undefined);
    assert.equal(repacked, true);
    assert.equal(nodes[0]!.ox, 0);
    assert.equal(nodes[0]!.oy, 0);
  });

  it('repacks when layoutEpoch is from an older generation', () => {
    const n = node(0, 0);
    assert.equal(shouldRepackOffsets([n], LAYOUT_EPOCH - 1), true);
  });
});
