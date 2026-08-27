import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  childRoute,
  childStemJunctionY,
  computeEdgeRenderData,
  ensureChildTopStem,
  unionStemJunctionY,
  type RoutingContext,
} from './routing.ts';
import type { Edge, Point, ShowToggles, SimNode } from '../types/whiteboard.ts';
import { PILL_DROP, STUB } from './constants.ts';

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
    w: 160,
    h: 80,
    ox: 0,
    oy: 0,
    ...partial,
  };
}

const emptyCtx: RoutingContext = {
  rects: [],
  rbands: {},
  fastRoute: true,
};

function hasTopStem(pts: Point[], child: SimNode): boolean {
  if (pts.length < 2) return false;
  const cx = child.x + child.w / 2;
  const top = child.y;
  const jy = childStemJunctionY(top);
  const a = pts[pts.length - 2]!;
  const b = pts[pts.length - 1]!;
  return (
    Math.abs(b[0] - cx) < 0.5 &&
    Math.abs(b[1] - top) < 0.5 &&
    Math.abs(a[0] - cx) < 0.5 &&
    Math.abs(a[1] - jy) < 0.5
  );
}

/** True if a vertical segment runs through the interior of the card. */
function piercesCardBody(pts: Point[], child: SimNode): boolean {
  const cx = child.x + child.w / 2;
  const top = child.y;
  const bottom = child.y + child.h;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    if (Math.abs(a[0] - b[0]) > 0.5) continue;
    if (Math.abs(a[0] - cx) > 0.5) continue;
    const y1 = Math.min(a[1], b[1]);
    const y2 = Math.max(a[1], b[1]);
    // Segment covers interior below the top edge.
    if (y1 < top - 0.5 && y2 > top + 1) return true;
    if (y1 < bottom - 1 && y2 > top + 1 && y1 > top + 0.5) return true;
  }
  return false;
}

describe('ensureChildTopStem', () => {
  it('appends a STUB-tall vertical into the top center', () => {
    const child = card({ id: 'c', x: 100, y: 200 });
    const pts = ensureChildTopStem([[180, 200 - STUB]], child);
    assert.ok(hasTopStem(pts, child));
    const jy = childStemJunctionY(child.y);
    assert.ok(Math.abs(pts[pts.length - 2]![1] - jy) < 0.5);
  });
});

describe('childRoute', () => {
  it('keeps a top stem when the parent is directly above', () => {
    const parent = card({ id: 'p', x: 100, y: 40 });
    const child = card({ id: 'c', x: 100, y: 200 });
    const ax = parent.x + parent.w / 2;
    const ay = parent.y + parent.h;
    const pts = childRoute(ax, ay, child, [parent.id, child.id], emptyCtx);
    assert.ok(hasTopStem(pts, child));
  });

  it('does not run vertically through a same-row child before stemming', () => {
    // Parent and child side by side — old route dropped below then climbed
    // through the card. Mandatory stem must approach from above the top.
    const parent = card({ id: 'p', x: 40, y: 100, w: 160, h: 80 });
    const child = card({ id: 'c', x: 280, y: 100, w: 160, h: 80 });
    const ax = parent.x + parent.w / 2;
    const ay = parent.y + parent.h;
    const pts = childRoute(ax, ay, child, [parent.id, child.id], emptyCtx);
    assert.ok(hasTopStem(pts, child));
    assert.equal(piercesCardBody(pts, child), false);
    // Last horizontal (if any) must be at or above the stem junction.
    const jy = childStemJunctionY(child.y);
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]!;
      const b = pts[i]!;
      if (Math.abs(a[1] - b[1]) < 0.5 && Math.abs(a[0] - b[0]) > 1) {
        assert.ok(
          a[1] <= jy + 0.5,
          `horizontal at y=${a[1]} must be at/above junction ${jy}`,
        );
      }
    }
  });

  it('forks horizontally at the stem junction when the parent is far above', () => {
    // From the child: short stem, then immediate horizontal — not a long
    // center-line drop from a parent-side bus.
    const parent = card({ id: 'p', x: 40, y: 40, w: 160, h: 80 });
    const child = card({ id: 'c', x: 400, y: 400, w: 160, h: 80 });
    const ax = parent.x + parent.w / 2;
    const ay = parent.y + parent.h;
    const pts = childRoute(ax, ay, child, [parent.id, child.id], emptyCtx);
    assert.ok(hasTopStem(pts, child));
    const jy = childStemJunctionY(child.y);
    const pre = pts[pts.length - 3];
    assert.ok(pre, 'expected a fork point before the stem');
    assert.ok(
      Math.abs(pre[1] - jy) < 0.5,
      `fork before stem should be at junction y=${jy}, got ${pre[1]}`,
    );
  });

  it('keeps a STUB bottom stem below a union exit before any horizontal', () => {
    // Max-style: child close enough that the child-side bus sits near the
    // pill — must still clear parent tag bottoms before forking sideways.
    const ay = 152; // union pill exit (ry + PILL_DROP)
    const tagsBottom = 180;
    const ax = 100;
    const child = card({
      id: 'max',
      x: 220,
      y: tagsBottom + 2 * STUB + 40,
      w: 160,
      h: 80,
    });
    const pts = childRoute(ax, ay, child, ['max'], emptyCtx, tagsBottom);
    assert.ok(hasTopStem(pts, child));
    const stemEnd = unionStemJunctionY(ay, tagsBottom);
    assert.ok(stemEnd > tagsBottom, 'stem floor must sit below tag bottoms');
    assert.equal(pts[0]![0], ax);
    assert.equal(pts[0]![1], ay);
    let sawHorizontal = false;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]!;
      const b = pts[i]!;
      if (Math.abs(a[1] - b[1]) < 0.5 && Math.abs(a[0] - b[0]) > 1) {
        sawHorizontal = true;
        assert.ok(
          a[1] >= stemEnd - 0.5,
          `horizontal at y=${a[1]} must be at/below union stem end ${stemEnd}`,
        );
        assert.ok(
          a[1] > tagsBottom,
          `horizontal at y=${a[1]} must be lower than tags bottom ${tagsBottom}`,
        );
      }
    }
    assert.ok(sawHorizontal, 'expected a horizontal fork after the bottom stem');
    const onCol = pts.filter((p) => Math.abs(p[0] - ax) < 0.5);
    const maxYOnCol = Math.max(...onCol.map((p) => p[1]));
    assert.ok(
      maxYOnCol >= stemEnd - 0.5,
      `anchor column must reach stem end ${stemEnd}, got max y=${maxYOnCol}`,
    );
  });
});

describe('union pedigree fork bottom stem', () => {
  const show: ShowToggles = {
    seed: true,
    groups: true,
    worlds: true,
  };

  it('forks below parent tag bottoms, not flush with them', () => {
    // Reproduce Max under Jacques+Elettra: exit+STUB lands near tag bottoms
    // (NO). Fork must clear tagsBottom + STUB (YES).
    const left = card({ id: 'Jacques', x: 0, y: 100, w: 160, h: 80, gid: 'hh' });
    const right = card({
      id: 'Elettra',
      x: 200,
      y: 100,
      w: 160,
      h: 80,
      gid: 'hh',
    });
    const tagsBottom = Math.max(left.y + left.h, right.y + right.h);
    const midY = (left.y + left.h / 2 + right.y + right.h / 2) / 2;
    const exitY = midY + PILL_DROP;
    const child = card({
      id: 'Max',
      x: 260,
      // Room for tags clearance + child top stem.
      y: tagsBottom + 2 * STUB + 40,
      w: 160,
      h: 80,
      gid: 'hh',
    });
    const edges: Edge[] = [
      { id: 'm1', a: left.id, b: right.id, type: 'marriage', source: 'seed' },
      { id: 'p1', a: left.id, b: child.id, type: 'parent', source: 'seed' },
      { id: 'p2', a: right.id, b: child.id, type: 'parent', source: 'seed' },
    ];
    const data = computeEdgeRenderData({
      nodes: [left, right, child],
      edges,
      groups: [],
      show,
      packVis: () => true,
      fastRoute: true,
    });
    const stemEnd = unionStemJunctionY(exitY, tagsBottom);
    assert.ok(stemEnd > tagsBottom);
    assert.ok(data.blood.length > 0, 'expected blood paths');
    for (const path of data.blood) {
      for (let i = 1; i < path.pts.length; i++) {
        const a = path.pts[i - 1]!;
        const b = path.pts[i]!;
        if (Math.abs(a[1] - b[1]) < 0.5 && Math.abs(a[0] - b[0]) > 1) {
          assert.ok(
            a[1] > tagsBottom,
            `blood horizontal at y=${a[1]} must be lower than tags bottom ${tagsBottom}`,
          );
          assert.ok(
            a[1] >= stemEnd - 0.5,
            `blood horizontal at y=${a[1]} must be at/below stem end ${stemEnd}`,
          );
        }
      }
    }
    const trunk = data.blood.find(
      (p) =>
        p.pts.length >= 2 &&
        Math.abs(p.pts[0]![1] - exitY) < 1 &&
        Math.abs(p.pts[0]![0] - p.pts[1]![0]) < 0.5,
    );
    assert.ok(trunk, 'expected a vertical trunk from the union exit');
    assert.ok(
      trunk!.pts[1]![1] >= stemEnd - 0.5,
      `trunk must reach stem end ${stemEnd}, got ${trunk!.pts[1]![1]}`,
    );
  });

  it('keeps trunk and bus clickable when there are multiple kids', () => {
    const left = card({ id: 'Bella', x: 0, y: 0, w: 160, h: 80, gid: 'hh' });
    const right = card({
      id: 'Mortimer',
      x: 200,
      y: 0,
      w: 160,
      h: 80,
      gid: 'hh',
      gender: 'Male',
    });
    const tagsBottom = Math.max(left.y + left.h, right.y + right.h);
    const alex = card({
      id: 'Alexander',
      x: 40,
      y: tagsBottom + 2 * STUB + 40,
      w: 160,
      h: 80,
      gid: 'hh',
      gender: 'Male',
    });
    const cass = card({
      id: 'Cassandra',
      x: 360,
      y: tagsBottom + 2 * STUB + 40,
      w: 160,
      h: 80,
      gid: 'hh',
    });
    const data = computeEdgeRenderData({
      nodes: [left, right, alex, cass],
      edges: [
        { id: 'm1', a: left.id, b: right.id, type: 'marriage', source: 'seed' },
        { id: 'p1', a: left.id, b: alex.id, type: 'parent', source: 'seed' },
        { id: 'p2', a: right.id, b: alex.id, type: 'parent', source: 'seed' },
        { id: 'p3', a: left.id, b: cass.id, type: 'parent', source: 'seed' },
        { id: 'p4', a: right.id, b: cass.id, type: 'parent', source: 'seed' },
      ],
      groups: [],
      show,
      packVis: () => true,
      fastRoute: true,
    });
    assert.ok(data.blood.length >= 3, 'expected trunk, bus, and stems');
    for (const path of data.blood) {
      assert.ok(
        path.ids.length > 0,
        `blood segment must carry edge ids for hit-testing, pts=${JSON.stringify(path.pts)}`,
      );
    }
    const trunk = data.blood.find(
      (p) =>
        p.pts.length === 2 &&
        Math.abs(p.pts[0]![0] - p.pts[1]![0]) < 0.5 &&
        p.pts[1]![1] > p.pts[0]![1] + 10,
    );
    assert.ok(trunk, 'expected vertical trunk');
    for (const id of ['p1', 'p2', 'p3', 'p4']) {
      assert.ok(trunk!.ids.includes(id), `trunk should include ${id}`);
    }
  });
});

describe('sibling top stems', () => {
  const show: ShowToggles = {
    seed: true,
    groups: true,
    worlds: true,
  };

  it('drops into each sibling through a mandatory top stem', () => {
    const a = card({ id: 'Camille', x: 300, y: 100, w: 160, h: 80, gid: 'g1' });
    const b = card({ id: 'Elettra', x: 40, y: 100, w: 160, h: 80, gid: 'g2' });
    const data = computeEdgeRenderData({
      nodes: [a, b],
      edges: [
        {
          id: 's1',
          a: a.id,
          b: b.id,
          type: 'sibling',
          source: 'seed',
        },
      ],
      groups: [],
      show,
      packVis: () => true,
      fastRoute: true,
    });
    assert.ok(data.blood.length > 0, 'expected sibling blood paths');
    for (const n of [a, b]) {
      const drop = data.blood.find(
        (p) =>
          p.pts.length >= 2 &&
          Math.abs(p.pts[p.pts.length - 1]![0] - (n.x + n.w / 2)) < 0.5 &&
          Math.abs(p.pts[p.pts.length - 1]![1] - n.y) < 0.5,
      );
      assert.ok(drop, `expected a drop into ${n.id}`);
      assert.ok(hasTopStem(drop!.pts, n), `${n.id} must have a top stem`);
    }
    const jy = Math.min(childStemJunctionY(a.y), childStemJunctionY(b.y));
    for (const path of data.blood) {
      for (let i = 1; i < path.pts.length; i++) {
        const p0 = path.pts[i - 1]!;
        const p1 = path.pts[i]!;
        if (Math.abs(p0[1] - p1[1]) < 0.5 && Math.abs(p0[0] - p1[0]) > 1) {
          assert.ok(
            p0[1] <= jy + 0.5,
            `sibling bus at y=${p0[1]} must be at/above stem junctions ${jy}`,
          );
        }
      }
    }
  });

  it('never enters the higher sibling from below when rows are staggered', () => {
    // Camille above-right, Elettra below-left — old fallback orthPath climbed
    // through Camille and looked like a bottom exit.
    const camille = card({
      id: 'Camille',
      x: 300,
      y: 80,
      w: 160,
      h: 80,
      gid: 'g1',
    });
    const elettra = card({
      id: 'Elettra',
      x: 40,
      y: 280,
      w: 160,
      h: 80,
      gid: 'g2',
    });
    const data = computeEdgeRenderData({
      nodes: [camille, elettra],
      edges: [
        {
          id: 's1',
          a: camille.id,
          b: elettra.id,
          type: 'sibling',
          source: 'seed',
        },
      ],
      groups: [],
      show,
      packVis: () => true,
      fastRoute: true,
    });
    assert.ok(data.blood.length > 0, 'expected sibling blood paths');

    for (const n of [camille, elettra]) {
      const drop = data.blood.find(
        (p) =>
          p.pts.length >= 2 &&
          Math.abs(p.pts[p.pts.length - 1]![0] - (n.x + n.w / 2)) < 0.5 &&
          Math.abs(p.pts[p.pts.length - 1]![1] - n.y) < 0.5,
      );
      assert.ok(drop, `expected a top drop into ${n.id}`);
      assert.ok(hasTopStem(drop!.pts, n), `${n.id} must have a top stem`);
      assert.equal(
        piercesCardBody(drop!.pts, n),
        false,
        `${n.id} drop must not pierce the card`,
      );
      // Approach the top from above only (previous point has smaller y).
      const pre = drop!.pts[drop!.pts.length - 2]!;
      assert.ok(
        pre[1] < n.y - 0.5,
        `${n.id} stem must approach from above the top (pre y=${pre[1]}, top=${n.y})`,
      );
    }

    // No blood geometry may touch either card's bottom center.
    for (const n of [camille, elettra]) {
      const cx = n.x + n.w / 2;
      const bottom = n.y + n.h;
      for (const path of data.blood) {
        for (const p of path.pts) {
          assert.ok(
            !(Math.abs(p[0] - cx) < 0.5 && Math.abs(p[1] - bottom) < 0.5),
            `${n.id} must not attach at the bottom center`,
          );
        }
      }
    }

    // Shared bus must sit above the higher card's top.
    const highestTop = Math.min(camille.y, elettra.y);
    for (const path of data.blood) {
      for (let i = 1; i < path.pts.length; i++) {
        const p0 = path.pts[i - 1]!;
        const p1 = path.pts[i]!;
        if (Math.abs(p0[1] - p1[1]) < 0.5 && Math.abs(p0[0] - p1[0]) > 1) {
          assert.ok(
            p0[1] < highestTop - 0.5,
            `sibling bus at y=${p0[1]} must be above highest card top ${highestTop}`,
          );
        }
      }
    }
  });
});
