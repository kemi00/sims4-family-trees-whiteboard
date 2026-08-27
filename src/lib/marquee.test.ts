import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TILE } from './constants.ts';
import {
  householdTagHitRect,
  normalizeRect,
  rectsIntersect,
  resolveMarqueeSelection,
  worldChipHitRect,
} from './marquee.ts';
import { worldFrame } from './geometry.ts';
import type { Group, SimNode } from '../types/whiteboard.ts';

function card(
  id: string,
  world: string,
  gid: string,
  x: number,
  y: number,
): SimNode {
  return {
    id,
    fn: id,
    ln: '',
    age: 'Young Adult',
    gender: 'Female',
    play: 'Played',
    pack: 'Base Game',
    world,
    gid,
    x,
    y,
    w: TILE * 2,
    h: TILE,
    ox: 0,
    oy: 0,
  };
}

function group(gid: string, hh: string, world: string, color: string): Group {
  return { gid, hh, world, nb: '', color, x: 0, y: 0, w: 0, h: 0 };
}

describe('normalizeRect / rectsIntersect', () => {
  it('normalizes inverted drag corners', () => {
    assert.deepEqual(normalizeRect(10, 20, 0, 5), {
      l: 0,
      t: 5,
      r: 10,
      b: 20,
    });
  });

  it('detects overlap', () => {
    assert.equal(
      rectsIntersect({ l: 0, t: 0, r: 10, b: 10 }, { l: 5, t: 5, r: 15, b: 15 }),
      true,
    );
    assert.equal(
      rectsIntersect({ l: 0, t: 0, r: 10, b: 10 }, { l: 11, t: 0, r: 20, b: 10 }),
      false,
    );
  });
});

describe('resolveMarqueeSelection', () => {
  const groups: Group[] = [
    group('a', 'House A', 'Willow Creek', '#123'),
    group('b', 'House B', 'Oasis Springs', '#456'),
  ];
  const nodes = [
    card('1', 'Willow Creek', 'a', 100, 200),
    card('2', 'Willow Creek', 'a', 100 + TILE * 2, 200),
    card('3', 'Oasis Springs', 'b', 2000, 200),
  ];
  const packVis = () => true;

  it('selects whole worlds when the box touches 2+ world frames', () => {
    const a = worldFrame('Willow Creek', nodes, groups, packVis)!;
    const b = worldFrame('Oasis Springs', nodes, groups, packVis)!;
    const sel = resolveMarqueeSelection(
      {
        l: Math.min(a.l, b.l) + 10,
        t: Math.min(a.t, b.t) + 10,
        r: Math.max(a.r, b.r) - 10,
        b: Math.max(a.b, b.b) - 10,
      },
      {
        nodes,
        groups,
        worlds: [],
        zoom: 1,
        packVis,
        showWorlds: true,
        showGroups: true,
      },
    );
    assert.equal(sel?.kind, 'worlds');
    if (sel?.kind === 'worlds') {
      assert.ok(sel.worlds.includes('Willow Creek'));
      assert.ok(sel.worlds.includes('Oasis Springs'));
    }
  });

  it('selects a single world only when its name chip is in the box', () => {
    const frame = worldFrame('Willow Creek', nodes, groups, packVis)!;
    const chip = worldChipHitRect('Willow Creek', frame, 1);
    const sel = resolveMarqueeSelection(
      {
        l: chip.l + 1,
        t: chip.t + 1,
        r: chip.r - 1,
        b: chip.b - 1,
      },
      {
        nodes,
        groups,
        worlds: [],
        zoom: 1,
        packVis,
        showWorlds: true,
        showGroups: true,
      },
    );
    assert.deepEqual(sel, { kind: 'worlds', worlds: ['Willow Creek'] });
  });

  it('selects household tags inside one world (frame alone is not enough)', () => {
    const mem = nodes.filter((n) => n.gid === 'b');
    const tag = householdTagHitRect(mem, groups[1])!;
    const sel = resolveMarqueeSelection(
      {
        l: tag.l + 1,
        t: tag.t + 1,
        r: tag.r - 1,
        b: tag.b - 1,
      },
      {
        nodes,
        groups,
        worlds: [],
        zoom: 1,
        packVis,
        showWorlds: true,
        showGroups: true,
      },
    );
    assert.deepEqual(sel, { kind: 'households', gids: ['b'] });
  });

  it('selects sim cards when only cards intersect', () => {
    const n = nodes[0]!;
    const sel = resolveMarqueeSelection(
      { l: n.x + 2, t: n.y + 2, r: n.x + 20, b: n.y + 20 },
      {
        nodes,
        groups,
        worlds: [],
        zoom: 1,
        packVis,
        showWorlds: true,
        showGroups: true,
      },
    );
    assert.deepEqual(sel, { kind: 'nodes', ids: ['1'] });
  });
});
