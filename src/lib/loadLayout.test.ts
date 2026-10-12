import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { LAYOUT_EPOCH } from './constants.ts';
import { computeLayout } from './layout.ts';
import {
  jsonMergeTargets,
  pinCoreToTargets,
  prepareLoadedNodes,
  shouldRepackOffsets,
} from './loadLayout.ts';
import { mergeJsonIntoBoard } from './mergeJson.ts';
import type { Edge, SimNode } from '../types/whiteboard.ts';

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

describe('JSON merge pinning', () => {
  const worlds = [{ name: 'Willow Creek', color: '#4e79a7' }];
  const sim = (id: string, hh: string, extra: Partial<SimNode> = {}): SimNode => ({
    ...node(0),
    id,
    first: id.split(' ')[0]!,
    sur: hh,
    hh,
    ohh: hh,
    gid: `Willow Creek||${hh}`,
    ...extra,
  });
  const link = (a: string, b: string, type: Edge['type']): Edge => ({
    id: `${type}:${a}:${b}`,
    a,
    b,
    type,
    source: 'seed',
  });
  const at = (core: SimNode[], edges: Edge[]) =>
    new Map(computeLayout(core, worlds, edges).map((n) => [n.id, { x: n.x, y: n.y }]));

  const board = [
    sim('Bella Goth', 'Goth', { ox: 100 }),
    sim('Mortimer Goth', 'Goth'),
    sim('Cassandra Goth', 'Goth', { age: 'Child' }),
    sim('Bob Pancakes', 'Pancakes', { oy: 200 }),
    sim('Geoffrey Landgraab', 'Landgraab'),
  ];
  const boardEdges = [
    link('Bella Goth', 'Mortimer Goth', 'marriage'),
    link('Bella Goth', 'Cassandra Goth', 'parent'),
    link('Mortimer Goth', 'Cassandra Goth', 'parent'),
  ];
  // The file adds Mortimer's father, which re-packs the whole world.
  const file = [
    ...board.map((n) => ({ ...n, ox: 0, oy: 0 })),
    sim('Gunther Goth', 'Goth Elders', { age: 'Elder', gender: 'Male' }),
  ];
  const fileEdges = [...boardEdges, link('Gunther Goth', 'Mortimer Goth', 'parent')];

  const merge = (keepBoardPositions: boolean) => {
    const merged = mergeJsonIntoBoard({
      boardNodes: board,
      boardEdges,
      boardGroups: [],
      incomingNodes: file,
      incomingEdges: fileEdges,
      incomingGroups: [],
      keepBoardPositions,
    });
    const boardVisualById = Object.fromEntries(at(board, boardEdges));
    const pinned = pinCoreToTargets(
      jsonMergeTargets({ keepBoardPositions, boardVisualById, fileCore: file, fileEdges, worlds }),
      merged.nodes,
      worlds,
      merged.edges,
    );
    return { raw: at(merged.nodes, merged.edges), pinned: at(pinned, merged.edges) };
  };

  it('keeps board cards where they were on screen', () => {
    const before = at(board, boardEdges);
    const { raw, pinned } = merge(true);
    assert.ok(
      [...before].some(([id, p]) => raw.get(id)!.x !== p.x || raw.get(id)!.y !== p.y),
      'raw ox/oy alone should move at least one card in this scenario',
    );
    for (const [id, p] of before) assert.deepEqual(pinned.get(id), p, id);
  });

  it('leaves sims new to the board at their packed spot', () => {
    const { raw, pinned } = merge(true);
    assert.deepEqual(pinned.get('Gunther Goth'), raw.get('Gunther Goth'));
  });

  it("puts every file card where the file shows it when the file's positions win", () => {
    const shown = at(file, fileEdges);
    const { pinned } = merge(false);
    for (const [id, p] of shown) assert.deepEqual(pinned.get(id), p, id);
  });
});
