import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { LAYOUT_EPOCH } from './constants.ts';
import { prepareLoadedNodes, shouldRepackOffsets } from './loadLayout.ts';
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
  it('keeps offsets when layoutEpoch matches', () => {
    const n = node(100);
    assert.equal(shouldRepackOffsets(LAYOUT_EPOCH), false);
    const { nodes, repacked } = prepareLoadedNodes([n], LAYOUT_EPOCH);
    assert.equal(repacked, false);
    assert.equal(nodes[0]!.ox, n.ox);
  });

  it('keeps large offsets when layoutEpoch matches (big dynasty boards)', () => {
    // Users drag worlds and sims a long way; wiping those on every Load was
    // destroying carefully adjusted placements.
    const n = node(8500, -8000);
    assert.equal(shouldRepackOffsets(LAYOUT_EPOCH), false);
    const { nodes, repacked } = prepareLoadedNodes([n], LAYOUT_EPOCH);
    assert.equal(repacked, false);
    assert.equal(nodes[0]!.ox, n.ox);
    assert.equal(nodes[0]!.oy, n.oy);
  });

  /* Offsets are measured from a packed base, so a file with no stamp cannot
     say which packing produced them. Letting modest ones through loaded the
     board silently with every hand-placed card in the wrong spot. */
  it('repacks a pre-epoch file even when its offsets look modest', () => {
    const n = node(100, -50);
    assert.equal(shouldRepackOffsets(undefined), true);
    const { nodes, repacked } = prepareLoadedNodes([n], undefined);
    assert.equal(repacked, true);
    assert.equal(nodes[0]!.ox, 0);
    assert.equal(nodes[0]!.oy, 0);
  });

  it('repacks when layoutEpoch is null rather than absent', () => {
    assert.equal(shouldRepackOffsets(null), true);
  });

  it('repacks when layoutEpoch is from an older generation', () => {
    assert.equal(shouldRepackOffsets(LAYOUT_EPOCH - 1), true);
  });

  it('repacks when layoutEpoch is from a newer generation', () => {
    assert.equal(shouldRepackOffsets(LAYOUT_EPOCH + 1), true);
  });
});
