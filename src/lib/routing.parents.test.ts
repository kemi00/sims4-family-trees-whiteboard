import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PILL_DROP, STUB } from './constants.ts';
import { computeEdgeRenderData } from './routing.ts';
import type { Edge, EdgeRenderData, Point, SimNode } from '../types/whiteboard.ts';

function card(partial: Partial<SimNode> & Pick<SimNode, 'id' | 'x' | 'y'>): SimNode {
  return {
    first: partial.id,
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
    gid: 'g',
    w: 200,
    h: 100,
    ox: 0,
    oy: 0,
    ...partial,
  };
}

const parentEdges = (child: string, ...parents: string[]): Edge[] =>
  parents.map((p) => ({
    id: `p_${p}_${child}`,
    a: p,
    b: child,
    type: 'parent',
    source: 'seed',
  }));

function route(nodes: SimNode[], edges: Edge[], fastRoute = false): EdgeRenderData {
  return computeEdgeRenderData({
    nodes,
    edges,
    groups: [],
    show: { groups: true, worlds: true },
    packVis: () => true,
    fastRoute,
  });
}

const near = (a: number, b: number) => Math.abs(a - b) < 0.5;

function onPolyline(p: Point, pts: Point[]): boolean {
  for (let i = 1; i < pts.length; i++) {
    const [a, b] = [pts[i - 1]!, pts[i]!];
    const inX = p[0] >= Math.min(a[0], b[0]) - 0.5 && p[0] <= Math.max(a[0], b[0]) + 0.5;
    const inY = p[1] >= Math.min(a[1], b[1]) - 0.5 && p[1] <= Math.max(a[1], b[1]) + 0.5;
    if (near(a[0], b[0]) && near(p[0], a[0]) && inY) return true;
    if (near(a[1], b[1]) && near(p[1], a[1]) && inX) return true;
  }
  return false;
}

function touchesCard(pts: Point[], n: SimNode): boolean {
  return pts.some(
    ([x, y]) =>
      ((near(y, n.y) || near(y, n.y + n.h)) && x >= n.x - 0.5 && x <= n.x + n.w + 0.5) ||
      ((near(x, n.x) || near(x, n.x + n.w)) && y >= n.y - 0.5 && y <= n.y + n.h + 0.5),
  );
}

/**
 * Parents a child's drawn line actually reaches: walk from the child's top
 * through every connected path that carries one of its parent links (plus a
 * partner line between its parents) and see which parent cards it touches.
 */
function parentsReached(
  data: EdgeRenderData,
  child: SimNode,
  parentIds: string[],
  linkIds: string[],
  byid: Record<string, SimNode>,
): string[] {
  const polys: Point[][] = data.blood
    .filter((b) => b.ids.some((id) => linkIds.includes(id)))
    .map((b) => b.pts);
  for (const u of data.unions) {
    if (parentIds.includes(u.a) && parentIds.includes(u.b)) {
      polys.push(u.pts.split(' ').map((s) => s.split(',').map(Number) as Point));
      // The kids' trunk leaves from under the relationship pill, which covers
      // the short gap down from the partner line.
      polys.push([
        [u.rx, u.ry],
        [u.rx, u.ry + PILL_DROP],
      ]);
    }
  }
  const top: Point = [child.x + child.w / 2, child.y];
  const seen = new Set<number>();
  const queue = polys.flatMap((p, i) => (p.some((q) => near(q[0], top[0]) && near(q[1], top[1])) ? [i] : []));
  queue.forEach((i) => seen.add(i));
  while (queue.length) {
    const i = queue.pop()!;
    polys.forEach((other, j) => {
      if (seen.has(j)) return;
      const linked =
        polys[i]!.some((q) => onPolyline(q, other)) || other.some((q) => onPolyline(q, polys[i]!));
      if (linked) {
        seen.add(j);
        queue.push(j);
      }
    });
  }
  return parentIds.filter((pid) => [...seen].some((i) => touchesCard(polys[i]!, byid[pid]!)));
}

function assertEveryParentReached(nodes: SimNode[], edges: Edge[], fastRoute = false) {
  const data = route(nodes, edges, fastRoute);
  const byid = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const kids = [...new Set(edges.filter((e) => e.type === 'parent').map((e) => e.b))];
  for (const kid of kids) {
    const links = edges.filter((e) => e.type === 'parent' && e.b === kid);
    const parents = links.map((e) => e.a);
    assert.deepEqual(
      parentsReached(data, byid[kid]!, parents, links.map((e) => e.id), byid).sort(),
      parents.slice().sort(),
      `${kid}'s line must reach every parent card`,
    );
  }
}

describe('parent links reach every parent', () => {
  for (const fastRoute of [false, true]) {
    const mode = fastRoute ? 'fast routing' : 'full routing';

    it(`joins side-by-side co-parents with no partner link (${mode})`, () => {
      const dina = card({ id: 'Dina', x: 0, y: 0 });
      const don = card({ id: 'Don', x: 300, y: 0 });
      const dante = card({ id: 'Dante', x: 150, y: 300 });
      assertEveryParentReached([dina, don, dante], parentEdges('Dante', 'Dina', 'Don'), fastRoute);
    });

    it(`joins co-parents with another sim between them (${mode})`, () => {
      const dina = card({ id: 'Dina', x: 0, y: 0 });
      const other = card({ id: 'Other', x: 300, y: 0 });
      const don = card({ id: 'Don', x: 600, y: 0 });
      const dante = card({ id: 'Dante', x: 300, y: 300 });
      assertEveryParentReached(
        [dina, other, don, dante],
        parentEdges('Dante', 'Dina', 'Don'),
        fastRoute,
      );
    });

    it(`joins co-parents in different rows and households (${mode})`, () => {
      const sergio = card({ id: 'Sergio', x: 0, y: 0, gid: 'bro' });
      const andrea = card({ id: 'Andrea', x: 1500, y: 400, gid: 'vargas' });
      const declan = card({ id: 'Declan', x: 1400, y: 700, gid: 'vargas' });
      const carmelo = card({ id: 'Carmelo', x: 1700, y: 700, gid: 'vargas' });
      assertEveryParentReached(
        [sergio, andrea, declan, carmelo],
        [...parentEdges('Declan', 'Sergio', 'Andrea'), ...parentEdges('Carmelo', 'Sergio', 'Andrea')],
        fastRoute,
      );
    });

    it(`still hangs a couple's child from the partner line (${mode})`, () => {
      const bella = card({ id: 'Bella', x: 0, y: 0 });
      const mortimer = card({ id: 'Mortimer', x: 300, y: 0 });
      const cass = card({ id: 'Cass', x: 150, y: 300 });
      assertEveryParentReached(
        [bella, mortimer, cass],
        [
          { id: 'm', a: 'Bella', b: 'Mortimer', type: 'marriage', source: 'seed' },
          ...parentEdges('Cass', 'Bella', 'Mortimer'),
        ],
        fastRoute,
      );
    });

    it(`reaches a single parent and each of three parents (${mode})`, () => {
      const a = card({ id: 'A', x: 0, y: 0 });
      const b = card({ id: 'B', x: 300, y: 0 });
      const c = card({ id: 'C', x: 600, y: 0 });
      const solo = card({ id: 'Solo', x: 0, y: 300 });
      const trio = card({ id: 'Trio', x: 450, y: 300 });
      assertEveryParentReached(
        [a, b, c, solo, trio],
        [...parentEdges('Solo', 'A'), ...parentEdges('Trio', 'A', 'B', 'C')],
        fastRoute,
      );
    });
  }
});

describe('parent links reach every parent on random family layouts', () => {
  // Small deterministic PRNG so a failure reproduces from its seed.
  const rng = (seed: number) => () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };

  it('kid beside the trunk with a sibling between (Natalia Caliente)', () => {
    const nina = card({ id: 'Nina', x: 300, y: 0 });
    const don = card({ id: 'Don', x: 600, y: 0 });
    const natalia = card({ id: 'Natalia', x: 0, y: 200 });
    const sib = card({ id: 'Sib', x: 300, y: 200 });
    assertEveryParentReached(
      [nina, don, natalia, sib],
      [
        { id: 'm', a: 'Nina', b: 'Don', type: 'marriage', source: 'seed' },
        ...parentEdges('Natalia', 'Nina', 'Don'),
        ...parentEdges('Sib', 'Nina', 'Don'),
      ],
    );
  });

  for (let seed = 1; seed <= 60; seed++) {
    it(`seed ${seed}`, () => {
      const r = rng(seed);
      const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)]!;
      const used = new Set<string>();
      const place = (id: string, row: number, gid: string) => {
        let col = 0;
        do col = Math.floor(r() * 12);
        while (used.has(`${row}:${col}`));
        used.add(`${row}:${col}`);
        return card({ id, x: col * 300, y: row * 300, gid });
      };
      const parentCount = pick([1, 2, 2, 2, 3]);
      const parents = Array.from({ length: parentCount }, (_, i) =>
        place(`P${i}`, pick([0, 0, 1]), pick(['a', 'b'])),
      );
      const kids = Array.from({ length: 1 + Math.floor(r() * 4) }, (_, i) =>
        place(`K${i}`, pick([1, 2, 2, 3]), pick(['a', 'b', 'c'])),
      );
      const edges: Edge[] = kids.flatMap((k) => parentEdges(k.id, ...parents.map((p) => p.id)));
      if (parentCount === 2 && r() < 0.5) {
        edges.push({ id: 'u', a: 'P0', b: 'P1', type: pick(['marriage', 'romance', 'divorced'] as const), source: 'seed' });
      }
      assertEveryParentReached([...parents, ...kids], edges, r() < 0.5);
    });
  }
});

describe('a parent off to one side of the child', () => {
  // Skip sits below and right of Dustin; a card above Skip and one under
  // Dustin block the two straight shapes. The line should climb Dustin's
  // side facing Skip, not wind round the far side past the other cards.
  const nodes = [
    card({ id: 'dustin', x: 0, y: 0 }),
    card({ id: 'skip', x: 500, y: 500, gid: 'g2' }),
    card({ id: 'above', x: 450, y: 200, gid: 'g3' }),
    card({ id: 'under', x: 0, y: 250, gid: 'g4' }),
  ];
  const data = route(nodes, parentEdges('dustin', 'skip'));
  const legs = data.blood.flatMap((p) =>
    p.pts.slice(1).flatMap((b, i) => {
      const a = p.pts[i]!;
      return near(a[0], b[0]) && !near(a[1], b[1]) ? [a[0]] : [];
    }),
  );

  it('climbs the near side of the child', () => {
    assert.ok(legs.some((x) => near(x, 200 + STUB)), `vertical legs at ${legs.join(', ')}`);
    assert.ok(!legs.some((x) => near(x, -STUB)), 'not the far side');
  });
});
