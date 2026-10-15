import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { familyOf, familySummary, linksInView } from './family.ts';
import type { Edge, SimNode } from '../types/whiteboard.ts';

const link = (id: string, a: string, b: string, type: Edge['type']): Edge => ({ id, a, b, type });

// Mum and Dad married with kids Ann (the sim) and Bo; Ann married Cy and had
// Dee, whose other parent is Ann's ex Eve; Ann has another link to Fay.
const edges: Edge[] = [
  link('m1', 'mum', 'dad', 'marriage'),
  link('p1', 'mum', 'ann', 'parent'),
  link('p2', 'dad', 'ann', 'parent'),
  link('p3', 'mum', 'bo', 'parent'),
  link('p4', 'dad', 'bo', 'parent'),
  link('m2', 'ann', 'cy', 'marriage'),
  link('d1', 'ann', 'eve', 'divorced'),
  link('p5', 'ann', 'dee', 'parent'),
  link('p6', 'eve', 'dee', 'parent'),
  link('c1', 'ann', 'fay', 'custom'),
  link('s1', 'cy', 'gus', 'sibling'),
];

describe('familyOf', () => {
  const f = familyOf('ann', edges);

  it('finds everyone the sim is family to, by what they are', () => {
    assert.deepEqual(Object.fromEntries(f.roles), {
      mum: 'parent',
      dad: 'parent',
      bo: 'sibling',
      cy: 'partner',
      eve: 'ex',
      dee: 'child',
      fay: 'other',
    });
  });

  it('highlights the links that show them, not the ones between others', () => {
    assert.deepEqual([...f.edgeIds].sort(), ['c1', 'd1', 'm2', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6']);
  });

  it("calls a child's other parent a co-parent when they are no partner", () => {
    const g = familyOf('ann', edges.filter((e) => e.id !== 'd1'));
    assert.equal(g.roles.get('eve'), 'coparent');
  });
});

describe('linksInView', () => {
  const gid: Record<string, string> = { mum: 'h1', dad: 'h1', ann: 'h2', bo: 'h1', fay: 'h3' };
  const gidOf = (id: string) => gid[id];
  const few = [link('m1', 'mum', 'dad', 'marriage'), link('p1', 'mum', 'ann', 'parent'), link('c1', 'ann', 'fay', 'custom')];
  const ids = (es: Edge[]) => es.map((e) => e.id);

  it('keeps every link for all, and only those inside a household for inside', () => {
    assert.deepEqual(ids(linksInView(few, gidOf, 'all')), ['m1', 'p1', 'c1']);
    assert.deepEqual(ids(linksInView(few, gidOf, 'inside')), ['m1', 'c1']);
  });

  it('hides every family link for none, but never other links', () => {
    assert.deepEqual(ids(linksInView(few, gidOf, 'none')), ['c1']);
  });

  it("keeps a highlighted family's links whatever the view", () => {
    const keep = new Set(['p1']);
    assert.deepEqual(ids(linksInView(few, gidOf, 'none', keep)), ['p1', 'c1']);
    assert.deepEqual(ids(linksInView(few, gidOf, 'inside', keep)), ['m1', 'p1', 'c1']);
  });
});

describe('familySummary', () => {
  const sim = (id: string, gid: string, pack = 'Base Game') => ({ id, gid, pack }) as SimNode;
  const byid: Record<string, SimNode> = {
    mum: sim('mum', 'W||Ames'),
    dad: sim('dad', 'W||Ames'),
    bo: sim('bo', 'W||Ames'),
    cy: sim('cy', 'W||Cole'),
    eve: sim('eve', 'W||Unhoused sims'),
    dee: sim('dee', 'W||Cole'),
    fay: sim('fay', 'W||Fay', 'Hidden Pack'),
  };
  const shown = (n: SimNode) => n.pack !== 'Hidden Pack';

  it('counts sims, their households and roles, leaving filtered ones out', () => {
    const s = familySummary(familyOf('ann', edges), byid, shown);
    assert.deepEqual(s, {
      sims: '6 sims',
      homes: '2 households and 1 unhoused',
      roles: '1 partner, 1 ex, 2 parents, 1 child, 1 sibling',
      hidden: 1,
    });
  });
});
