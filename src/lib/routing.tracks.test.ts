import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { computeEdgeRenderData } from './routing.ts';
import type { BloodPath, Edge, SimNode } from '../types/whiteboard.ts';

function card(partial: Partial<SimNode> & Pick<SimNode, 'id' | 'x' | 'y'>): SimNode {
  return {
    first: partial.id,
    sur: '',
    age: 'Adult',
    state: 'Sim',
    gender: 'Female',
    hh: 'H',
    world: 'W',
    nb: '',
    color: '#000',
    townie: false,
    oworld: 'W',
    onb: '',
    ohh: 'H',
    oplay: 'Played',
    pack: 'Base Game',
    gid: 'g',
    w: 200,
    h: 100,
    ox: 0,
    oy: 0,
    ...partial,
  };
}

const parent = (a: string, b: string): Edge => ({ id: `p_${a}_${b}`, a, b, type: 'parent', source: 'seed' });

function route(nodes: SimNode[], edges: Edge[]): BloodPath[] {
  return computeEdgeRenderData({
    nodes,
    edges,
    groups: [],
    show: { groups: false, worlds: false },
    packVis: () => true,
    fastRoute: false,
  }).blood;
}

/** Flat runs and upright stretches of the lines drawn for `edgeIds`. */
function shape(blood: BloodPath[], edgeIds: string[]) {
  const runs: { y: number; l: number; r: number }[] = [];
  const ups: { x: number; t: number; b: number }[] = [];
  for (const p of blood) {
    if (!p.ids.some((id) => edgeIds.includes(id))) continue;
    for (let i = 1; i < p.pts.length; i++) {
      const [a, b] = [p.pts[i - 1]!, p.pts[i]!];
      if (a[1] === b[1] && a[0] !== b[0]) runs.push({ y: a[1], l: Math.min(a[0], b[0]), r: Math.max(a[0], b[0]) });
      if (a[0] === b[0] && a[1] !== b[1]) ups.push({ x: a[0], t: Math.min(a[1], b[1]), b: Math.max(a[1], b[1]) });
    }
  }
  return { runs, ups };
}

describe('two families never share a track', () => {
  // The Groves as a board laid out before animal lanes keeps them: Luna the
  // mare right above Umber, Tallulah (Umber's mother) beside her, and
  // Luna's foal Starbrite at the end of Umber's row.
  const nodes = [
    card({ id: 'luna', x: 0, y: 0, species: 'Horse', state: 'Pet' }),
    card({ id: 'tallulah', x: 300, y: 0 }),
    card({ id: 'umber', x: 0, y: 200 }),
    card({ id: 'starbrite', x: 600, y: 200, species: 'Horse', state: 'Pet' }),
  ];
  const edges = [parent('luna', 'starbrite'), parent('tallulah', 'umber')];

  it('keeps the mare’s line off the track of Tallulah’s line to Umber', () => {
    const blood = route(nodes, edges);
    const luna = shape(blood, ['p_luna_starbrite']);
    const tallulah = shape(blood, ['p_tallulah_umber']);
    assert.ok(luna.runs.length && tallulah.runs.length);
    for (const a of luna.runs) {
      for (const b of tallulah.runs) {
        const overlap = Math.min(a.r, b.r) - Math.max(a.l, b.l);
        assert.ok(Math.abs(a.y - b.y) >= 10 || overlap <= -10, `runs at ${a.y} and ${b.y} share a track`);
      }
    }
  });

  it('stops the mare’s line short of the stem into Umber, not running on into it', () => {
    const blood = route(nodes, edges);
    const luna = shape(blood, ['p_luna_starbrite']);
    const tallulah = shape(blood, ['p_tallulah_umber']);
    for (const a of luna.ups) {
      for (const b of tallulah.ups) {
        if (a.x !== b.x) continue;
        assert.ok(Math.max(a.t, b.t) - Math.min(a.b, b.b) >= 20, `column ${a.x}: ${a.t}–${a.b} runs on into ${b.t}–${b.b}`);
      }
    }
  });

  it('keeps every line ending in the child’s top, and moves no fixed end', () => {
    const blood = route(nodes, edges);
    const ends = blood.map((p) => p.pts[p.pts.length - 1]!.join(','));
    assert.ok(ends.includes('100,200'), 'into Umber');
    assert.ok(ends.includes('700,200'), 'into Starbrite');
    const starts = blood.map((p) => p.pts[0]!.join(','));
    assert.ok(starts.includes('100,100'), 'out of Luna');
    assert.ok(starts.includes('400,100'), 'out of Tallulah');
  });

  it('leaves two families apart where they already are', () => {
    const apart = [
      card({ id: 'a', x: 0, y: 0 }),
      card({ id: 'b', x: 1200, y: 0 }),
      card({ id: 'ak', x: 0, y: 200 }),
      card({ id: 'bk', x: 1200, y: 200 }),
    ];
    const blood = route(apart, [parent('a', 'ak'), parent('b', 'bk')]);
    for (const p of blood) for (const [x] of p.pts) assert.ok(x === 100 || x === 1300);
    assert.deepEqual(
      blood.flatMap((p) => p.pts.map(([, y]) => y)).sort((m, n) => m - n).filter((y, i, all) => all.indexOf(y) === i),
      [100, 174, 200],
    );
  });
});
