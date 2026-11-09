import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  childRoute,
  childStemJunctionY,
  computeEdgeRenderData,
  EMPTY_EDGE_DATA,
  ensureChildTopStem,
  unionStemJunctionY,
  type RoutingContext,
} from './routing.ts';
import type { Edge, Point, ShowToggles, SimNode } from '../types/whiteboard.ts';
import { ARROW_LEN, PILL_DROP, STUB } from './constants.ts';
import { segHit } from './geometry.ts';

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
    const pts = childRoute(ax, ay, child, [parent], emptyCtx);
    assert.ok(hasTopStem(pts, child));
  });

  it('does not run vertically through a same-row child before stemming', () => {
    // Parent and child side by side — old route dropped below then climbed
    // through the card. Mandatory stem must approach from above the top.
    const parent = card({ id: 'p', x: 40, y: 100, w: 160, h: 80 });
    const child = card({ id: 'c', x: 280, y: 100, w: 160, h: 80 });
    const ax = parent.x + parent.w / 2;
    const ay = parent.y + parent.h;
    const pts = childRoute(ax, ay, child, [parent], emptyCtx);
    assert.ok(hasTopStem(pts, child));
    assert.equal(piercesCardBody(pts, child), false);
    // The last horizontal, into the stem, is at or above the stem junction.
    // (The line may first run under the parent to get round it.)
    const jy = childStemJunctionY(child.y);
    const flats = pts
      .slice(1)
      .map((b, i) => [pts[i]!, b] as const)
      .filter(([a, b]) => Math.abs(a[1] - b[1]) < 0.5 && Math.abs(a[0] - b[0]) > 1);
    const last = flats[flats.length - 1];
    assert.ok(last, 'expected a horizontal into the stem');
    assert.ok(last[0][1] <= jy + 0.5, `horizontal at y=${last[0][1]} must be at/above junction ${jy}`);
  });

  it('forks horizontally at the stem junction when the parent is far above', () => {
    // From the child: short stem, then immediate horizontal — not a long
    // center-line drop from a parent-side bus.
    const parent = card({ id: 'p', x: 40, y: 40, w: 160, h: 80 });
    const child = card({ id: 'c', x: 400, y: 400, w: 160, h: 80 });
    const ax = parent.x + parent.w / 2;
    const ay = parent.y + parent.h;
    const pts = childRoute(ax, ay, child, [parent], emptyCtx);
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
    const pts = childRoute(ax, ay, child, [], emptyCtx, tagsBottom);
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

describe('skipRoute', () => {
  it('returns empty edge data without routing', () => {
    const data = computeEdgeRenderData({
      nodes: [card({ id: 'A', x: 0, y: 0 })],
      edges: [{ id: 'e1', a: 'A', b: 'A', type: 'custom', source: 'planned' }],
      groups: [],
      show: { groups: true, worlds: true },
      packVis: () => true,
      fastRoute: false,
      skipRoute: true,
    });
    assert.deepEqual(data, EMPTY_EDGE_DATA);
  });
});

/** Orthogonal segments of a polyline. */
function segments(pts: Point[]): [Point, Point][] {
  const out: [Point, Point][] = [];
  for (let i = 1; i < pts.length; i++) out.push([pts[i - 1]!, pts[i]!]);
  return out;
}

/** True if two orthogonal segments share any point (cross, touch or overlap). */
function segmentsMeet([a, b]: [Point, Point], [c, d]: [Point, Point]): boolean {
  return (
    Math.min(a[0], b[0]) <= Math.max(c[0], d[0]) + 0.5 &&
    Math.min(c[0], d[0]) <= Math.max(a[0], b[0]) + 0.5 &&
    Math.min(a[1], b[1]) <= Math.max(c[1], d[1]) + 0.5 &&
    Math.min(c[1], d[1]) <= Math.max(a[1], b[1]) + 0.5
  );
}

function linesMeet(a: Point[], b: Point[]): boolean {
  return segments(a).some((s) => segments(b).some((t) => segmentsMeet(s, t)));
}

/** True if a polyline runs through the inside of a card. */
function crossesInside(pts: Point[], n: SimNode): boolean {
  return segments(pts).some(
    ([a, b]) =>
      Math.min(a[0], b[0]) < n.x + n.w - 1 &&
      Math.max(a[0], b[0]) > n.x + 1 &&
      Math.min(a[1], b[1]) < n.y + n.h - 1 &&
      Math.max(a[1], b[1]) > n.y + 1,
  );
}

describe('a child level with their parent', () => {
  const show: ShowToggles = { groups: true, worlds: true };

  it('goes around the parent card, never up through it', () => {
    const parent = card({ id: 'p', x: 40, y: 100 });
    const child = card({ id: 'c', x: 280, y: 100 });
    const pts = childRoute(parent.x + parent.w / 2, parent.y + parent.h, child, [parent], emptyCtx);
    assert.ok(hasTopStem(pts, child));
    assert.equal(crossesInside(pts, parent), false);
    // Nothing runs over the parent's top, where its own parents' line ends.
    for (const [a, b] of segments(pts)) {
      if (Math.abs(a[1] - b[1]) > 0.5 || a[1] > parent.y) continue;
      assert.ok(
        Math.min(a[0], b[0]) >= parent.x + parent.w,
        `horizontal at y=${a[1]} runs over the parent (x ${a[0]}→${b[0]})`,
      );
    }
  });

  it('does not join the line to the grandparent (Tai → Mei, Mei → Amy)', () => {
    // Mei's daughter Amy dragged up beside her: the line from Mei once
    // climbed through Mei and ran along Tai's line, so Amy read as Tai's.
    const tai = card({ id: 'Tai', x: 100, y: 0 });
    const mei = card({ id: 'Mei', x: 0, y: 200 });
    const amy = card({ id: 'Amy', x: 400, y: 200 });
    const data = computeEdgeRenderData({
      nodes: [tai, mei, amy],
      edges: [
        { id: 'tm', a: tai.id, b: mei.id, type: 'parent', source: 'save' },
        { id: 'ma', a: mei.id, b: amy.id, type: 'parent', source: 'save' },
      ],
      groups: [],
      show,
      packVis: () => true,
      fastRoute: true,
    });
    const toMei = data.blood.filter((p) => p.ids.includes('tm'));
    const toAmy = data.blood.filter((p) => p.ids.includes('ma'));
    assert.ok(toMei.length && toAmy.length);
    for (const a of toAmy) {
      assert.equal(crossesInside(a.pts, mei), false, 'runs through Mei');
      for (const m of toMei) assert.equal(linesMeet(a.pts, m.pts), false, 'meets Tai’s line');
    }
    assert.ok(hasTopStem(toAmy[toAmy.length - 1]!.pts, amy));
  });

  it('keeps clear of the parents’ partner line', () => {
    const mum = card({ id: 'Mum', x: 0, y: 100 });
    const dad = card({ id: 'Dad', x: 200, y: 100, gender: 'Male' });
    const kid = card({ id: 'Kid', x: 500, y: 100 });
    const data = computeEdgeRenderData({
      nodes: [mum, dad, kid],
      edges: [
        { id: 'm1', a: mum.id, b: dad.id, type: 'marriage', source: 'seed' },
        { id: 'p1', a: mum.id, b: kid.id, type: 'parent', source: 'seed' },
        { id: 'p2', a: dad.id, b: kid.id, type: 'parent', source: 'seed' },
      ],
      groups: [],
      show,
      packVis: () => true,
      fastRoute: true,
    });
    const union = data.unions[0]!.pts.split(' ').map((s) => s.split(',').map(Number) as Point);
    const toKid = data.blood.filter((p) => p.ids.includes('p1'));
    assert.ok(toKid.length);
    for (const k of toKid) {
      assert.equal(linesMeet(k.pts, union), false, 'crosses the marriage line');
      assert.equal(crossesInside(k.pts, mum), false);
      assert.equal(crossesInside(k.pts, dad), false);
    }
  });
});

describe('lines keep off other cards', () => {
  const show: ShowToggles = { groups: true, worlds: true };
  const route = (nodes: SimNode[], edges: Edge[]) =>
    computeEdgeRenderData({ nodes, edges, groups: [], show, packVis: () => true, fastRoute: false });

  it('drops past a card right under the parent (Ermelinda, Sofia, Thiago)', () => {
    const ermelinda = card({ id: 'Ermelinda', x: 0, y: 0, gid: 'abrantes' });
    const sofia = card({ id: 'Sofia', x: 0, y: 200, gid: 'abrantes' });
    const thiago = card({ id: 'Thiago', x: 400, y: 400, gid: 'thebe' });
    const data = route(
      [ermelinda, sofia, thiago],
      [
        { id: 'es', a: 'Ermelinda', b: 'Sofia', type: 'parent', source: 'save' },
        { id: 'et', a: 'Ermelinda', b: 'Thiago', type: 'parent', source: 'save' },
      ],
    );
    const toThiago = data.blood.filter((p) => p.ids.includes('et') && !p.ids.includes('es'));
    assert.ok(toThiago.length);
    for (const p of toThiago) assert.equal(crossesInside(p.pts, sofia), false, 'runs through Sofia');
    assert.ok(hasTopStem(toThiago[toThiago.length - 1]!.pts, thiago));
  });

  it('takes a partner line round a card between the pair, pill below', () => {
    const left = card({ id: 'L', x: 0, y: 100 });
    const mid = card({ id: 'M', x: 220, y: 100 });
    const right = card({ id: 'R', x: 440, y: 100, gender: 'Male' });
    const data = route([left, mid, right], [{ id: 'm', a: 'L', b: 'R', type: 'marriage', source: 'save' }]);
    const u = data.unions[0]!;
    const pts = u.pts.split(' ').map((s) => s.split(',').map(Number) as Point);
    assert.equal(crossesInside(pts, mid), false, 'runs through the card between them');
    assert.ok(u.ry > mid.y + mid.h, `pill at y=${u.ry} should sit under the cards`);
    // The pill sits on the line.
    assert.ok(segments(pts).some(([a, b]) => Math.abs(a[1] - u.ry) < 0.5 && Math.abs(b[1] - u.ry) < 0.5 && Math.min(a[0], b[0]) <= u.rx && Math.max(a[0], b[0]) >= u.rx));
  });

  it('keeps the usual partner line when nothing is in the way', () => {
    const left = card({ id: 'L', x: 0, y: 100 });
    const right = card({ id: 'R', x: 220, y: 100, gender: 'Male' });
    const data = route([left, right], [{ id: 'm', a: 'L', b: 'R', type: 'marriage', source: 'save' }]);
    assert.equal(data.unions[0]!.pts, `160,140 220,140`);
  });

  it('lets a line cross a partner line, but not run along it', () => {
    const flat = { l: 0, t: 96, r: 200, b: 104, id: '__m_0_x', line: 'h' as const };
    assert.equal(segHit(100, 0, 100, 200, flat), false, 'crossing at a right angle');
    assert.equal(segHit(50, 100, 150, 100, flat), true, 'running along it');
    const box = { ...flat, line: undefined };
    assert.equal(segHit(100, 0, 100, 200, box), true, 'a box blocks both ways');
  });
});

describe('arrowheads show which way a link runs', () => {
  const show: ShowToggles = { groups: true, worlds: true };
  const route = (nodes: SimNode[], edges: Edge[]) =>
    computeEdgeRenderData({ nodes, edges, groups: [], show, packVis: () => true, fastRoute: false });
  const arrowsOf = (paths: { ids: string[]; arrows?: { tip: Point; dir: Point }[] }[], id: string) =>
    paths.filter((p) => p.ids.includes(id)).flatMap((p) => p.arrows ?? []);
  const has = (arrows: { tip: Point; dir: Point }[], tip: Point, dir: Point) =>
    arrows.some(
      (a) =>
        Math.abs(a.tip[0] - tip[0]) < 0.5 &&
        Math.abs(a.tip[1] - tip[1]) < 0.5 &&
        a.dir[0] === dir[0] &&
        a.dir[1] === dir[1],
    );

  // Mum and Dad married; Ann and Ben at home; Cal in another household.
  const mum = card({ id: 'Mum', x: 0, y: 0, gid: 'hh' });
  const dad = card({ id: 'Dad', x: 220, y: 0, gid: 'hh', gender: 'Male' });
  const ann = card({ id: 'Ann', x: 0, y: 200, gid: 'hh' });
  const ben = card({ id: 'Ben', x: 220, y: 200, gid: 'hh', gender: 'Male' });
  const cal = card({ id: 'Cal', x: 600, y: 150, gid: 'other', gender: 'Male' });
  const family: Edge[] = [
    { id: 'm', a: 'Mum', b: 'Dad', type: 'marriage', source: 'save' },
    ...['Ann', 'Ben', 'Cal'].flatMap((k): Edge[] => [
      { id: `mum-${k}`, a: 'Mum', b: k, type: 'parent', source: 'save' },
      { id: `dad-${k}`, a: 'Dad', b: k, type: 'parent', source: 'save' },
    ]),
  ];

  it('points into every child, out of the pill, and where a line branches off', () => {
    const data = route([mum, dad, ann, ben, cal], family);
    for (const kid of [ann, ben, cal]) {
      assert.ok(
        has(arrowsOf(data.blood, `mum-${kid.id}`), [kid.x + kid.w / 2, kid.y], [0, 1]),
        `an arrow into ${kid.id}'s top`,
      );
    }
    const u = data.unions[0]!;
    const all = data.blood.flatMap((p) => p.arrows ?? []);
    assert.ok(has(all, [u.rx, u.ry + PILL_DROP + ARROW_LEN], [0, 1]), 'an arrow out of the pill');
    // Cal's line leaves the trunk down the pill's column, then turns right.
    const toCal = data.blood.find((p) => p.ids.includes('mum-Cal') && !p.ids.includes('mum-Ann'))!;
    const turn = toCal.pts[1]!;
    assert.equal(turn[0], u.rx);
    assert.ok(has(toCal.arrows ?? [], [turn[0] + ARROW_LEN, turn[1]], [1, 0]), 'an arrow where Cal’s line branches');
  });

  it('points into both partners from the pill', () => {
    const u = route([mum, dad], [family[0]!]).unions[0]!;
    assert.deepEqual(u.arrows, [
      { tip: [mum.x + mum.w, mum.y + mum.h / 2], dir: [-1, 0] },
      { tip: [dad.x, dad.y + dad.h / 2], dir: [1, 0] },
    ]);
  });

  it('gives one parent no arrow out of their card, only into the child', () => {
    const data = route([mum, ann], [{ id: 'p', a: 'Mum', b: 'Ann', type: 'parent', source: 'save' }]);
    const arrows = data.blood.flatMap((p) => p.arrows ?? []);
    assert.deepEqual(arrows, [{ tip: [ann.x + ann.w / 2, ann.y], dir: [0, 1] }]);
  });

  it('leaves sibling lines without arrows: they run both ways', () => {
    const data = route(
      [ann, ben],
      [{ id: 's', a: 'Ann', b: 'Ben', type: 'sibling', source: 'save' }],
    );
    assert.ok(data.blood.length > 0);
    assert.ok(data.blood.every((p) => !p.arrows?.length));
  });

  it('points a custom link into its second sim, at the card edge', () => {
    const data = route(
      [mum, cal],
      [{ id: 'c', a: 'Mum', b: 'Cal', type: 'custom', source: 'user' }],
    );
    const [arrow] = data.customs[0]!.arrows ?? [];
    assert.ok(arrow, 'expected an arrow');
    const [x, y] = arrow.tip;
    const onEdge =
      (Math.abs(x - cal.x) < 0.5 || Math.abs(x - cal.x - cal.w) < 0.5) ||
      (Math.abs(y - cal.y) < 0.5 || Math.abs(y - cal.y - cal.h) < 0.5);
    assert.ok(onEdge, `tip ${x},${y} should sit on Cal's edge`);
  });
});
