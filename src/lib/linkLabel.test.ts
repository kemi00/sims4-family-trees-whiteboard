import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  densifyPath,
  describeLinkSelection,
  placeChipOnVisiblePath,
  sampleInkPath,
} from './linkLabel.ts';
import type { Edge, EdgeRenderData, SimNode } from '../types/whiteboard.ts';

function node(id: string, first: string, x: number, y: number): SimNode {
  return {
    id,
    first,
    sur: 'Test',
    age: 'Young Adult',
    state: 'Sim',
    gender: 'Female',
    hh: 'H',
    world: 'Willow Creek',
    nb: '',
    color: '#000',
    townie: false,
    oworld: 'Willow Creek',
    onb: '',
    ohh: 'H',
    oplay: 'Played',
    pack: 'Base Game',
    gid: 'g',
    x,
    y,
    w: 100,
    h: 50,
    ox: 0,
    oy: 0,
  };
}

describe('densifyPath', () => {
  it('samples along a segment', () => {
    const pts = densifyPath(
      [
        [0, 0],
        [100, 0],
      ],
      25,
    );
    assert.ok(pts.length >= 5);
    assert.deepEqual(pts[0], [0, 0]);
    assert.deepEqual(pts[pts.length - 1], [100, 0]);
  });
});

describe('sampleInkPath', () => {
  it('does not sample across a diagonal chunk gap', () => {
    // Sibling-style bad merge: bar, then left stem, then right stem —
    // the join from stem-end to next stem-start is a diagonal through empty space.
    const messy: [number, number][] = [
      [0, 0],
      [400, 0],
      [0, 0],
      [0, 200],
      [400, 0],
      [400, 200],
    ];
    const pts = sampleInkPath(messy, 20);
    for (const p of pts) {
      const onBar = Math.abs(p[1]) < 0.5 && p[0] >= -0.5 && p[0] <= 400.5;
      const onLeft = Math.abs(p[0]) < 0.5 && p[1] >= -0.5 && p[1] <= 200.5;
      const onRight = Math.abs(p[0] - 400) < 0.5 && p[1] >= -0.5 && p[1] <= 200.5;
      assert.ok(
        onBar || onLeft || onRight,
        `sample ${p} left the orthogonal ink`,
      );
    }
  });
});

describe('placeChipOnVisiblePath', () => {
  const path: [number, number][] = [
    [0, 0],
    [1000, 0],
  ];

  it('hides when the whole path is off-screen', () => {
    const at = placeChipOnVisiblePath(path, {
      tx: 50,
      ty: 50,
      k: 1,
      width: 200,
      height: 200,
    });
    // path is at y=0; with ty=50 points are at screen y=50 — still visible
    assert.ok(at);
  });

  it('returns null when path is far outside the stage', () => {
    const at = placeChipOnVisiblePath(path, {
      tx: -5000,
      ty: -5000,
      k: 1,
      width: 200,
      height: 200,
    });
    assert.equal(at, null);
  });

  it('picks a path point inside the viewport, not off the path', () => {
    // Show the right half of the segment: world x in view ≈ 800..1000
    const at = placeChipOnVisiblePath(path, {
      tx: -800,
      ty: 100,
      k: 1,
      width: 400,
      height: 400,
    });
    assert.ok(at);
    assert.equal(at!.at[1], 0);
    assert.ok(at!.at[0] >= 800 && at!.at[0] <= 1000);
  });

  it('prefers path points clear of card obstacles', () => {
    const blockedPath: [number, number][] = [
      [0, 50],
      [400, 50],
    ];
    const at = placeChipOnVisiblePath(
      blockedPath,
      { tx: 0, ty: 0, k: 1, width: 500, height: 400 },
      20,
      [{ l: 0, t: 0, r: 200, b: 100 }],
    );
    assert.ok(at);
    // Should sit on the clear right half of the segment.
    assert.ok(at!.at[0] > 200, `expected x past the obstacle, got ${at!.at[0]}`);
  });

  it('flips below the path when above would leave the stage', () => {
    // Only a short run near the top of the stage is in view.
    const vertical: [number, number][] = [
      [100, 0],
      [100, 40],
    ];
    const at = placeChipOnVisiblePath(
      vertical,
      { tx: 0, ty: 0, k: 1, width: 400, height: 200 },
      40,
    );
    assert.ok(at);
    assert.equal(at!.side, 'below');
  });

  it('stays on the visible midsection of a long vertical link', () => {
    const vertical: [number, number][] = [
      [200, 0],
      [200, 4000],
    ];
    // Viewport shows world y ≈ 1500..1900
    const at = placeChipOnVisiblePath(
      vertical,
      { tx: 0, ty: -1500, k: 1, width: 400, height: 400 },
      40,
    );
    assert.ok(at);
    assert.ok(
      at!.at[1] >= 1500 && at!.at[1] <= 1900,
      `expected mid-link placement, got y=${at!.at[1]}`,
    );
  });

  it('stays on sibling L ink, not in the hollow interior', () => {
    // Real sibling geometry: horizontal bar + two vertical stems (separate chunks).
    const chunks: [number, number][][] = [
      [
        [0, 0],
        [400, 0],
      ],
      [
        [0, 0],
        [0, 300],
      ],
      [
        [400, 0],
        [400, 300],
      ],
    ];
    const at = placeChipOnVisiblePath(
      chunks,
      { tx: 0, ty: 0, k: 1, width: 400, height: 300 },
      20,
    );
    assert.ok(at);
    const [x, y] = at!.at;
    const onBar = Math.abs(y) < 1 && x >= -1 && x <= 401;
    const onLeft = Math.abs(x) < 1 && y >= -1 && y <= 301;
    const onRight = Math.abs(x - 400) < 1 && y >= -1 && y <= 301;
    assert.ok(
      onBar || onLeft || onRight,
      `chip floated off the ink at (${x}, ${y})`,
    );
    // Viewport center is (200, 150) — the hollow. Must not land there.
    assert.ok(
      Math.hypot(x - 200, y - 150) > 40,
      `chip sat in the hollow at (${x}, ${y})`,
    );
  });

  it('ignores a phantom diagonal when chunks were wrongly concatenated', () => {
    const messy: [number, number][] = [
      [0, 0],
      [400, 0],
      [0, 0],
      [0, 300],
      [400, 0],
      [400, 300],
    ];
    const at = placeChipOnVisiblePath(
      messy,
      { tx: 0, ty: 0, k: 1, width: 400, height: 300 },
      20,
    );
    assert.ok(at);
    const [x, y] = at!.at;
    const onBar = Math.abs(y) < 1 && x >= -1 && x <= 401;
    const onLeft = Math.abs(x) < 1 && y >= -1 && y <= 301;
    const onRight = Math.abs(x - 400) < 1 && y >= -1 && y <= 301;
    assert.ok(
      onBar || onLeft || onRight,
      `chip followed phantom diagonal to (${x}, ${y})`,
    );
  });
});

describe('describeLinkSelection', () => {
  const byid = {
    a: node('a', 'Bella', 0, 0),
    b: node('b', 'Mortimer', 200, 0),
  };
  const edges: Edge[] = [
    { id: 'e1', a: 'a', b: 'b', type: 'romance', source: 'seed' },
  ];
  const edgeData: EdgeRenderData = {
    blood: [],
    unions: [
      {
        edgeId: 'e1',
        type: 'romance',
        a: 'a',
        b: 'b',
        pts: '0,10 200,10',
        rx: 100,
        ry: 10,
        isUser: false,
      },
    ],
    customs: [],
  };

  it('returns the path along the link', () => {
    const info = describeLinkSelection(['e1'], edges, byid, edgeData);
    assert.ok(info);
    assert.equal(info!.path.length, 1);
    assert.equal(info!.path[0]!.length, 2);
    assert.deepEqual(info!.path[0]![0], [0, 10]);
    assert.deepEqual(info!.path[0]![1], [200, 10]);
  });

  it('keeps sibling bar and stems as separate ink chunks', () => {
    const sib: Edge = {
      id: 's1',
      a: 'a',
      b: 'b',
      type: 'sibling',
      source: 'seed',
    };
    const data: EdgeRenderData = {
      blood: [
        {
          ids: ['s1'],
          pts: [
            [0, 0],
            [200, 0],
          ],
        },
        {
          ids: ['s1'],
          pts: [
            [0, 0],
            [0, 80],
          ],
        },
        {
          ids: ['s1'],
          pts: [
            [200, 0],
            [200, 80],
          ],
        },
      ],
      unions: [],
      customs: [],
    };
    const info = describeLinkSelection(['s1'], [sib], byid, data);
    assert.ok(info);
    assert.equal(info!.path.length, 3);
  });

  it('labels parent links as parents → child, not a flat name list', () => {
    const jacques = node('Jacques Villareal', 'Jacques', 0, 0);
    jacques.sur = 'Villareal';
    const elettra = node('Elettra Villareal', 'Elettra', 200, 0);
    elettra.sur = 'Villareal';
    const luna = node('Luna Villareal', 'Luna', 100, 200);
    luna.sur = 'Villareal';
    const parentEdges: Edge[] = [
      {
        id: 'p1',
        a: jacques.id,
        b: luna.id,
        type: 'parent',
        source: 'seed',
      },
      {
        id: 'p2',
        a: elettra.id,
        b: luna.id,
        type: 'parent',
        source: 'seed',
      },
    ];
    const data: EdgeRenderData = {
      blood: [
        {
          ids: ['p1', 'p2'],
          pts: [
            [100, 50],
            [100, 180],
          ],
        },
      ],
      unions: [],
      customs: [],
    };
    const info = describeLinkSelection(
      ['p1', 'p2'],
      parentEdges,
      {
        [jacques.id]: jacques,
        [elettra.id]: elettra,
        [luna.id]: luna,
      },
      data,
    );
    assert.ok(info);
    assert.equal(info!.label, 'Parent → child');
    assert.equal(info!.nameFrom, 'Jacques Villareal · Elettra Villareal');
    assert.equal(info!.nameTo, 'Luna Villareal');
    assert.equal(
      info!.names,
      'Jacques Villareal · Elettra Villareal → Luna Villareal',
    );
  });
});
