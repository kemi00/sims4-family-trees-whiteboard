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

describe('extended family', () => {
  // Ann's parents Mum and Dad; Mum's parents Gma and Gpa, whose other child
  // Aunt has Cuz; Dad's brother Unc (a sibling link) has Cuz2. Dad's new wife
  // Step has Sib from before. Ann married Cy, who has Kid from before; Ann's
  // daughter Dee has Gee.
  const fam: Edge[] = [
    link('p1', 'mum', 'ann', 'parent'),
    link('p2', 'dad', 'ann', 'parent'),
    link('g1', 'gma', 'mum', 'parent'),
    link('g2', 'gpa', 'mum', 'parent'),
    link('g3', 'gma', 'aunt', 'parent'),
    link('g4', 'gpa', 'aunt', 'parent'),
    link('a1', 'aunt', 'cuz', 'parent'),
    link('s1', 'dad', 'unc', 'sibling'),
    link('u1', 'unc', 'cuz2', 'parent'),
    link('m1', 'dad', 'step', 'marriage'),
    link('t1', 'step', 'sib', 'parent'),
    link('m2', 'ann', 'cy', 'marriage'),
    link('k1', 'cy', 'kid', 'parent'),
    link('d1', 'ann', 'dee', 'parent'),
    link('d2', 'dee', 'gee', 'parent'),
  ];

  it('keeps to one step out for close family', () => {
    assert.deepEqual([...familyOf('ann', fam).roles.keys()].sort(), ['cy', 'dad', 'dee', 'mum']);
  });

  it('reaches grandparents, grandchildren, aunts, uncles, cousins and step-family', () => {
    const f = familyOf('ann', fam, 'extended');
    assert.deepEqual(Object.fromEntries([...f.roles].sort()), {
      aunt: 'auntuncle',
      cuz: 'cousin',
      cuz2: 'cousin',
      cy: 'partner',
      dad: 'parent',
      dee: 'child',
      gee: 'grandchild',
      gma: 'grandparent',
      gpa: 'grandparent',
      kid: 'stepchild',
      mum: 'parent',
      sib: 'stepsibling',
      step: 'stepparent',
      unc: 'auntuncle',
    });
    // Every link here shows one of them.
    assert.deepEqual([...f.edgeIds].sort(), fam.map((e) => e.id).sort());
  });

  it('counts aunts and uncles apart when the board knows which', () => {
    const sim = (id: string, gender = 'Female') => ({ id, gid: `W||${id}`, pack: '', gender }) as SimNode;
    const byid = Object.fromEntries(
      ['mum', 'dad', 'gma', 'gpa', 'aunt', 'cuz', 'unc', 'cuz2', 'step', 'sib', 'cy', 'kid', 'dee', 'gee'].map((id) => [
        id,
        sim(id, id === 'unc' ? 'Male' : 'Female'),
      ]),
    );
    const s = familySummary(familyOf('ann', fam, 'extended'), byid, () => true);
    assert.equal(
      s.roles,
      '1 partner, 2 parents, 1 child, 2 grandparents, 1 grandchild, 1 aunt, 1 uncle, 2 cousins, 1 step-parent, 1 step-child, 1 step-sibling',
    );
  });

  it('does not call a sibling who shares a parent a step-sibling', () => {
    const half = [...fam, link('t2', 'dad', 'sib', 'parent')];
    assert.equal(familyOf('ann', half, 'extended').roles.get('sib'), 'sibling');
  });
});
