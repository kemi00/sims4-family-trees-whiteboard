import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildConnectionLog } from './connectionLog.ts';
import type { Edge, SimNode } from '../types/whiteboard.ts';

function node(id: string, first: string, sur: string): SimNode {
  return {
    id,
    gid: 'Willow Creek||Pancakes',
    first,
    sur,
    age: 'Adult',
    state: 'Sim',
    gender: 'Female',
    hh: 'Pancakes',
    world: 'Willow Creek',
    nb: '-',
    color: '#4e79a7',
    townie: false,
    oworld: 'Willow Creek',
    onb: '-',
    ohh: 'Pancakes',
    oplay: 'Resident',
    pack: '',
    x: 0,
    y: 0,
    w: 0,
    h: 0,
  };
}

describe('buildConnectionLog', () => {
  it('omits seed edges and tags planned vs save', () => {
    const bob = node('Bob Pancakes', 'Bob', 'Pancakes');
    const eliza = node('Eliza Pancakes', 'Eliza', 'Pancakes');
    const byid = { [bob.id]: bob, [eliza.id]: eliza };
    const edges: Edge[] = [
      { id: 'e1', a: bob.id, b: eliza.id, type: 'marriage', source: 'seed' },
      {
        id: 'u1',
        a: bob.id,
        b: eliza.id,
        type: 'romance',
        source: 'planned',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'v1',
        a: bob.id,
        b: eliza.id,
        type: 'custom',
        source: 'save',
        createdAt: '2026-01-02T00:00:00.000Z',
      },
    ];
    const log = buildConnectionLog(edges, byid);
    assert.equal(log.length, 2);
    assert.ok(!log.some((e) => e.edgeIds.includes('e1')));
    assert.equal(log.find((e) => e.id === 'u1')?.origin, 'planned');
    assert.equal(log.find((e) => e.id === 'v1')?.origin, 'save');
  });

  it('names both parents on one line, and keeps a single-parent line', () => {
    const eden = node('Eden Flores', 'Eden', 'Flores');
    const geoff = node('Geoffrey Landgraab', 'Geoffrey', 'Landgraab');
    const lily = node('Lily Flores', 'Lily', 'Flores');
    const hyacinth = node('Hyacinth Flores', 'Hyacinth', 'Flores');
    const byid = {
      [eden.id]: eden,
      [geoff.id]: geoff,
      [lily.id]: lily,
      [hyacinth.id]: hyacinth,
    };
    const edges: Edge[] = [
      {
        id: 'v1',
        a: eden.id,
        b: lily.id,
        type: 'parent',
        source: 'save',
        createdAt: '2026-08-24T20:32:00.000Z',
      },
      {
        id: 'v2',
        a: geoff.id,
        b: lily.id,
        type: 'parent',
        source: 'save',
        createdAt: '2026-08-24T20:32:00.000Z',
      },
      {
        id: 'v3',
        a: eden.id,
        b: hyacinth.id,
        type: 'parent',
        source: 'save',
        createdAt: '2026-08-24T20:32:00.000Z',
      },
    ];
    const log = buildConnectionLog(edges, byid);
    const together = log.find((e) => e.edgeIds.includes('v1'));
    assert.ok(together);
    assert.equal(together.origin, 'save');
    assert.match(together.text, /Eden Flores/);
    assert.match(together.text, /Geoffrey Landgraab/);
    assert.match(together.text, /Lily Flores/);
    assert.equal(log.filter((e) => e.edgeIds.includes('v1')).length, 1);
    const solo = log.find((e) => e.edgeIds.includes('v3'));
    assert.ok(solo);
    assert.match(solo.text, /Eden Flores/);
    assert.match(solo.text, /Hyacinth Flores/);
    assert.doesNotMatch(solo.text, /with /);
  });
});
