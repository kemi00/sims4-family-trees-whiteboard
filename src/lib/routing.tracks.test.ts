import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { computeEdgeRenderData } from './routing.ts';
import { householdChrome } from './tiles.ts';
import type { BloodPath, Edge, Group, SimNode } from '../types/whiteboard.ts';

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

describe('siblings in their household’s top row', () => {
  // Laxmi and Raheel Kunal of Gibbi Point: no parents on the board, and
  // their household's name, Age up and + right above them.
  const gid = 'Gibbi Point||Kunal';
  const group: Group = { gid, hh: 'Kunal', world: 'Gibbi Point', nb: 'Gibbi Point', color: '#c77', x: 0, y: 0, w: 0, h: 0 };
  const at = (id: string, x: number, extra: Partial<SimNode> = {}) =>
    card({ id, x, y: 400, gid, hh: 'Kunal', world: 'Gibbi Point', ...extra });
  const sibling = (a: string, b: string): Edge => ({ id: `s_${a}_${b}`, a, b, type: 'sibling', source: 'seed' });
  const bracket = (nodes: SimNode[]) =>
    computeEdgeRenderData({
      nodes,
      edges: [sibling('laxmi', 'raheel')],
      groups: [group],
      show: { groups: true, worlds: false },
      packVis: () => true,
      fastRoute: false,
    }).blood;

  it('keeps the bracket clear of the name, Age up and + pills', () => {
    const nodes = [at('laxmi', 0), at('raheel', 300)];
    const c = householdChrome(nodes, group)!;
    const pills = [
      { l: c.headerX, t: c.headerY, r: c.headerX + c.labelW, b: c.headerY + c.pillH },
      { l: c.ageX, t: c.ageY, r: c.addX + c.addW, b: c.ageY + c.pillH },
    ];
    for (const p of bracket(nodes)) {
      for (let i = 1; i < p.pts.length; i++) {
        const [a, b] = [p.pts[i - 1]!, p.pts[i]!];
        const [l, r, t, bt] = [Math.min(a[0], b[0]), Math.max(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[1], b[1])];
        for (const k of pills) assert.ok(!(l < k.r && r > k.l && t < k.b && bt > k.t), `${JSON.stringify(p.pts)} crosses a pill`);
      }
    }
  });

  it('runs the bar under the buttons, a bracket over both cards', () => {
    const blood = bracket([at('laxmi', 0), at('raheel', 300)]);
    const bar = blood.find((p) => p.pts.length === 2 && p.pts[0]![1] === p.pts[1]![1])!;
    assert.deepEqual(bar.pts, [[100, 389], [400, 389]]);
    const legs = blood.filter((p) => p !== bar).map((p) => p.pts);
    assert.deepEqual(legs, [[[100, 389], [100, 400]], [[400, 389], [400, 400]]]);
  });

  it('never runs it low over a card that stands between them', () => {
    const blood = bracket([at('laxmi', 0), at('luna', 300, { species: 'Horse', state: 'Pet' }), at('raheel', 600)]);
    for (const p of blood) for (const [, y] of p.pts) assert.ok(y === 400 || y < 400 - 11, `${JSON.stringify(p.pts)} runs over Luna`);
  });
});

describe('lines into a household’s top row keep off its name and buttons', () => {
  const groupFor = (gid: string, hh: string): Group => ({ gid, hh, world: 'W', nb: 'Oasis Springs', color: '#7a7', x: 0, y: 0, w: 0, h: 0 });
  const landgraab = 'W||Landgraab';
  const zest = 'W||Zest';
  const groups = [groupFor(landgraab, 'Landgraab'), groupFor(zest, 'Zest')];
  const route = (nodes: SimNode[], edges: Edge[]) =>
    computeEdgeRenderData({ nodes, edges, groups, show: { groups: true, worlds: false }, packVis: () => true, fastRoute: false }).blood;
  const pillsOf = (mem: SimNode[], gid: string) => {
    const c = householdChrome(mem, groups.find((g) => g.gid === gid))!;
    return [
      { l: c.headerX, t: c.headerY, r: c.headerX + c.labelW, b: c.headerY + c.pillH },
      { l: c.ageX, t: c.ageY, r: c.addX + c.addW, b: c.ageY + c.pillH },
    ];
  };
  const crossing = (blood: BloodPath[], pills: { l: number; t: number; r: number; b: number }[]) =>
    blood.flatMap((p) =>
      p.pts.slice(1).flatMap((b, i) => {
        const a = p.pts[i]!;
        const [l, r, t, bt] = [Math.min(a[0], b[0]), Math.max(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[1], b[1])];
        return pills.some((k) => l < k.r && r > k.l && t < k.b && bt > k.t) ? [JSON.stringify(p.pts)] : [];
      }),
    );
  const into = (blood: BloodPath[], kid: SimNode) =>
    blood.find((p) => {
      const end = p.pts[p.pts.length - 1]!;
      return end[0] === kid.x + kid.w / 2 && end[1] === kid.y;
    });

  it('brings a line from beside along the strip under the buttons (Johnny Zest)', () => {
    // Geoffrey and Nancy Landgraab; their son Johnny heads the Zests next door, a row down.
    const geoffrey = card({ id: 'geoffrey', x: 0, y: 0, gid: landgraab, gender: 'Male' });
    const nancy = card({ id: 'nancy', x: 300, y: 0, gid: landgraab });
    const johnny = card({ id: 'johnny', x: 700, y: 200, gid: zest, gender: 'Male' });
    const blood = route(
      [geoffrey, nancy, johnny],
      [
        { id: 'm', a: 'geoffrey', b: 'nancy', type: 'marriage', source: 'save' },
        parent('geoffrey', 'johnny'),
        parent('nancy', 'johnny'),
      ],
    );
    assert.deepEqual(crossing(blood, pillsOf([johnny], zest)), []);
    const line = into(blood, johnny)!;
    assert.ok(line, 'a line into Johnny’s top');
    const [a, b] = line.pts.slice(-2);
    assert.equal(a![0], b![0], 'it drops straight into his card');
    assert.ok(b![1] - a![1] > 0 && b![1] - a![1] < 22, 'from the strip under the buttons');
    assert.ok(line.arrows?.some((x) => x.tip[0] === 800 && x.tip[1] === 200 && x.dir[1] === 1), 'its arrow into his card');
  });

  it('goes round the pills when the line arrives right above them (Cordelia Capp)', () => {
    const consort = card({ id: 'consort', x: 600, y: -400, gid: landgraab, gender: 'Male' });
    const cordelia = card({ id: 'cordelia', x: 700, y: 200, gid: zest });
    const raf = card({ id: 'raf', x: 1000, y: 200, gid: zest, gender: 'Male' });
    const blood = route([consort, cordelia, raf], [parent('consort', 'cordelia')]);
    assert.deepEqual(crossing(blood, pillsOf([cordelia, raf], zest)), []);
    assert.ok(into(blood, cordelia), 'a line into Cordelia’s top');
  });

  it('leaves a household that draws no tag alone', () => {
    const geoffrey = card({ id: 'geoffrey', x: 0, y: 0, gid: 'W||Untagged' });
    const johnny = card({ id: 'johnny', x: 700, y: 200, gid: 'W||Untagged2' });
    const blood = route([geoffrey, johnny], [parent('geoffrey', 'johnny')]);
    const line = into(blood, johnny)!;
    const [a, b] = line.pts.slice(-2);
    assert.ok(b![1] - a![1] >= 26, 'the usual stem');
  });
});
