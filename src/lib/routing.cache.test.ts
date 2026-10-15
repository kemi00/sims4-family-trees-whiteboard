import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { computeEdgeRenderData, RouteCache } from './routing.ts';
import type { Edge, SimNode } from '../types/whiteboard.ts';

function card(id: string, x: number, y: number, gid = 'g'): SimNode {
  return {
    id,
    first: id,
    sur: '',
    age: 'Young Adult',
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
    gid,
    x,
    y,
    w: 200,
    h: 100,
    ox: 0,
    oy: 0,
  };
}

/** Families spread across a wide board, each with a few kids and a planned link. */
function board(): { nodes: SimNode[]; edges: Edge[] } {
  const nodes: SimNode[] = [];
  const edges: Edge[] = [];
  for (let f = 0; f < 8; f++) {
    const x0 = f * 1500;
    const gid = `hh${f}`;
    nodes.push(card(`A${f}`, x0, 0, gid), card(`B${f}`, x0 + 300, 0, gid));
    if (f % 2) edges.push({ id: `m${f}`, a: `A${f}`, b: `B${f}`, type: 'marriage', source: 'seed' });
    for (let k = 0; k < 3; k++) {
      const kid = `K${f}_${k}`;
      nodes.push(card(kid, x0 - 300 + k * 300, k === 2 ? 0 : 300, gid));
      edges.push(
        { id: `pa${f}${k}`, a: `A${f}`, b: kid, type: 'parent', source: 'seed' },
        { id: `pb${f}${k}`, a: `B${f}`, b: kid, type: 'parent', source: 'seed' },
      );
    }
    edges.push({ id: `c${f}`, a: `K${f}_0`, b: `A${(f + 1) % 8}`, type: 'custom', source: 'planned' });
  }
  return { nodes, edges };
}

const route = (nodes: SimNode[], edges: Edge[], cache?: RouteCache, fastRoute = false) =>
  computeEdgeRenderData({
    nodes,
    edges,
    groups: [],
    show: { groups: true, worlds: true },
    packVis: () => true,
    fastRoute,
    cache,
  });

describe('RouteCache', () => {
  it('gives exactly the fresh result after every kind of edit', () => {
    const { nodes, edges } = board();
    const cache = new RouteCache();
    let ns = nodes;
    let es = edges;
    let fast = false;
    route(ns, es, cache);
    const edits: (() => void)[] = [
      () => (ns = ns.map((n) => (n.id === 'K3_1' ? { ...n, x: n.x + 100 } : n))),
      () => (ns = ns.map((n) => (n.gid === 'hh5' ? { ...n, y: n.y + 400 } : n))),
      () => (ns = ns.map((n) => (n.id === 'A2' ? { ...n, x: 4600, y: 300 } : n))),
      () => (es = es.filter((e) => e.id !== 'm3')),
      () => (es = [...es, { id: 'x1', a: 'B0', b: 'K7_2', type: 'parent', source: 'planned' }]),
      () => (es = [...es, { id: 'x2', a: 'K1_0', b: 'K1_1', type: 'sibling', source: 'planned' }]),
      () => (fast = !fast),
      () => (ns = ns.filter((n) => n.id !== 'K6_0')),
    ];
    for (const edit of edits) {
      edit();
      assert.deepEqual(route(ns, es, cache, fast), route(ns, es, undefined, fast));
    }
  });

  it('re-routes only the links near a dropped card', () => {
    const { nodes, edges } = board();
    const cache = new RouteCache();
    route(nodes, edges, cache);
    const total = cache.units.size;
    const moved = nodes.map((n) => (n.id === 'K4_1' ? { ...n, x: n.x + 100 } : n));
    const before = new Map(cache.units);
    route(moved, edges, cache);
    assert.ok(cache.lastRouted > 0, 'the moved family must be re-routed');
    // Its own family plus the planned links running past it, not the board.
    assert.ok(
      cache.lastRouted <= 4,
      `expected a handful of the ${total} units, re-routed ${cache.lastRouted}`,
    );
    for (const far of ['f:A0|B0', 'f:A1|B1', 'f:A7|B7']) {
      assert.equal(cache.units.get(far), before.get(far), `${far} should be reused`);
    }
  });

  it('keeps unchanged routes as the same objects, so their links need not re-render', () => {
    const { nodes, edges } = board();
    const cache = new RouteCache();
    const a = route(nodes, edges, cache);
    const b = route(
      nodes.map((n) => (n.id === 'K0_1' ? { ...n, x: n.x + 100 } : n)),
      edges,
      cache,
    );
    const far = (d: typeof a) => d.blood.filter((p) => p.ids.some((id) => id.endsWith('70')));
    assert.ok(far(a).length > 0);
    far(a).forEach((p, i) => assert.equal(far(b)[i], p));
  });
});
