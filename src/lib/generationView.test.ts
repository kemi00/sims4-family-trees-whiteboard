import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { generationLayout, generations } from './generationView.ts';
import type { Edge, SimNode } from '../types/whiteboard.ts';

const sim = (id: string, extra: Partial<SimNode> = {}): SimNode =>
  ({ id, first: id, sur: 'X', age: 'Adult', gender: 'Female', state: 'Sim', gid: 'W||X', hh: 'X', world: 'W', x: 0, y: 0, w: 200, h: 100, ...extra }) as SimNode;
const parent = (a: string, b: string, extra: Partial<Edge> = {}): Edge => ({ id: `${a}>${b}`, a, b, type: 'parent', ...extra });

describe('generations', () => {
  // GreatGran (passed) → Gran (passed) → Mum → Kid; Mum married In-law (no parents); a Gen 1 elder has a baby with Kid's generation.
  const nodes = [
    sim('GreatGran', { state: 'Deceased', age: 'Elder' }),
    sim('Gran', { state: 'Deceased', age: 'Elder' }),
    sim('GreatUncle', { state: 'Deceased', age: 'Elder' }),
    sim('Mum'),
    sim('InLaw'),
    sim('Kid', { age: 'Young Adult' }),
    sim('Elder', { age: 'Elder' }),
    sim('Baby', { age: 'Infant' }),
    sim('Adopted', { age: 'Child' }),
  ];
  const edges: Edge[] = [
    parent('GreatGran', 'Gran'),
    parent('GreatGran', 'GreatUncle'),
    parent('Gran', 'Mum'),
    parent('Mum', 'Kid'),
    parent('InLaw', 'Kid'),
    parent('Kid', 'Baby'),
    parent('Elder', 'Baby'),
    parent('Mum', 'Adopted', { adopted: true }),
  ];

  it('counts from the oldest known ancestors: one more than the higher parent', () => {
    const g = generations(nodes, edges, 'known');
    assert.deepEqual(
      ['GreatGran', 'Gran', 'GreatUncle', 'Mum', 'InLaw', 'Kid', 'Elder', 'Baby', 'Adopted'].map((id) => g.get(id)),
      [1, 2, 2, 3, 1, 4, 1, 5, 4],
    );
  });

  it('counts from the oldest living, the passed-away ancestors and their branches before Gen 1', () => {
    const g = generations(nodes, edges, 'living');
    assert.deepEqual(
      ['GreatGran', 'Gran', 'GreatUncle', 'Mum', 'InLaw', 'Kid', 'Elder', 'Baby', 'Adopted'].map((id) => g.get(id)),
      [-1, 0, 0, 1, 1, 2, 1, 3, 2],
    );
  });

  it('lays rows top to bottom, a child under its parents and partners side by side', () => {
    const marriage: Edge = { id: 'm', a: 'Mum', b: 'InLaw', type: 'marriage' };
    const { nodes: laid, rows } = generationLayout([...nodes, sim('Rex', { species: 'Dog' })], [...edges, marriage], 'living');
    assert.deepEqual(rows.map((r) => r.label), ['2 generations before Gen 1', 'Before Gen 1', 'Gen 1', 'Gen 2', 'Gen 3', 'Pets']);
    const at = new Map(laid.map((n) => [n.id, n]));
    assert.equal(at.get('Mum')!.y, at.get('InLaw')!.y);
    assert.equal(Math.abs(at.get('Mum')!.x - at.get('InLaw')!.x), 240);
    assert.ok(at.get('Kid')!.y > at.get('Mum')!.y);
    assert.ok(at.get('Baby')!.y > at.get('Kid')!.y);
    assert.equal(at.get('Rex')!.y, rows.at(-1)!.y);
  });

  it('keeps a late parent beside their living partner, not above Gen 1', () => {
    const fam = [sim('Gran'), sim('Mum'), sim('LateDad', { state: 'Deceased' }), sim('Kid', { age: 'Child' })];
    const e: Edge[] = [parent('Gran', 'Mum'), parent('Mum', 'Kid'), parent('LateDad', 'Kid')];
    const g = generations(fam, e, 'living');
    assert.deepEqual(['Gran', 'Mum', 'LateDad', 'Kid'].map((id) => g.get(id)), [1, 2, 2, 3]);
  });

  it('keeps each family together and puts sims with no family in a grid of their own', () => {
    const fam = [sim('A'), sim('B'), sim('C', { age: 'Child' }), sim('Lone', { x: 5 }), sim('D'), sim('E', { age: 'Child' })];
    const e: Edge[] = [parent('A', 'C'), parent('B', 'C'), parent('D', 'E')];
    const { nodes: laid, rows } = generationLayout(fam, e, 'known');
    const at = new Map(laid.map((n) => [n.id, n]));
    // The bigger family first, the smaller beside it on the same shelf, its rows shared.
    assert.ok(at.get('D')!.x > at.get('B')!.x);
    assert.equal(at.get('D')!.y, at.get('A')!.y);
    assert.equal(at.get('E')!.y, at.get('C')!.y);
    assert.deepEqual(rows.map((r) => `${r.label} ${r.count}`), ['Gen 1 3', 'Gen 2 2', 'Gen 1, no family on the board 1']);
    assert.ok(at.get('Lone')!.y > at.get('E')!.y);
  });
});
