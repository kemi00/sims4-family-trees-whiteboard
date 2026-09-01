import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { bucketNodes, nodesForGid, nodesForWorld } from './nodeIndex.ts';
import type { SimNode } from '../types/whiteboard.ts';

function n(id: string, gid: string, world: string): SimNode {
  return {
    id,
    gid,
    first: id,
    sur: '',
    age: 'Adult',
    state: 'Sim',
    gender: 'Female',
    hh: gid,
    world,
    nb: '-',
    color: '#000',
    townie: false,
    oworld: world,
    onb: '-',
    ohh: gid,
    oplay: 'Resident',
    pack: '',
    x: 0,
    y: 0,
    w: 0,
    h: 0,
  };
}

describe('bucketNodes', () => {
  it('indexes by household and world without scanning the full list per lookup', () => {
    const nodes = [
      n('a', 'g1', 'Willow Creek'),
      n('b', 'g1', 'Willow Creek'),
      n('c', 'g2', 'Oasis Springs'),
    ];
    const buckets = bucketNodes(nodes);
    assert.deepEqual(
      nodesForGid('g1', nodes, buckets).map((x) => x.id),
      ['a', 'b'],
    );
    assert.deepEqual(
      nodesForWorld('Oasis Springs', nodes, buckets).map((x) => x.id),
      ['c'],
    );
    assert.deepEqual(nodesForGid('missing', nodes, buckets), []);
  });
});
