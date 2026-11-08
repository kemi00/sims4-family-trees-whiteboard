import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Edge, SimNode } from '../types/whiteboard.ts';
import { familyDynasties } from './dynastyMenu.ts';

const sim = (id: string, extra: Partial<SimNode> = {}): SimNode =>
  ({ id, first: id, sur: 'Luna', age: 'Adult', gender: 'Female', state: 'Sim', ...extra }) as SimNode;
const parent = (a: string, b: string): Edge => ({ id: `${a}>${b}`, a, b, type: 'parent' });

describe('family dynasties', () => {
  it("lists the parents' dynasties first, the one their last name carries leading", () => {
    const nodes = [
      sim('Kid', { sur: 'Dreamer' }),
      sim('Mum', { sur: 'Capp', dynasty: 'Capp', dynastyId: '1', dynastyRole: 'heir' }),
      sim('Dad', { sur: 'Dreamer', gender: 'Male', dynasty: 'Dreamer', dynastyId: '2' }),
      sim('Wife', { sur: 'Thebe', dynasty: 'Thebe', dynastyId: '3' }),
    ];
    const edges: Edge[] = [parent('Mum', 'Kid'), parent('Dad', 'Kid'), { id: 'm', a: 'Kid', b: 'Wife', type: 'marriage' }];
    assert.deepEqual(familyDynasties('Kid', nodes, edges), [
      { key: 'id:2', people: [{ id: 'Dad', rel: 'father' }] },
      { key: 'id:1', people: [{ id: 'Mum', rel: 'mother' }] },
      { key: 'id:3', people: [{ id: 'Wife', rel: 'spouse' }] },
    ]);
  });

  it('names both parents once when they share a dynasty, and skips one planned out of it', () => {
    const nodes = [
      sim('Kid'),
      sim('Mum', { dynasty: 'Luna' }),
      sim('Dad', { gender: 'Male', dynasty: 'Luna' }),
      sim('Ex', { dynasty: 'Goth', dynastyPlan: 'none' }),
    ];
    const edges: Edge[] = [parent('Mum', 'Kid'), parent('Dad', 'Kid'), { id: 'r', a: 'Ex', b: 'Kid', type: 'romance' }];
    assert.deepEqual(familyDynasties('Kid', nodes, edges), [
      {
        key: 'name:Luna',
        people: [
          { id: 'Mum', rel: 'mother' },
          { id: 'Dad', rel: 'father' },
        ],
      },
    ]);
  });

  it('has none for a pet or a sim whose family is in no dynasty', () => {
    const nodes = [sim('Kid'), sim('Mum'), sim('Rex', { species: 'Dog' })];
    assert.deepEqual(familyDynasties('Kid', nodes, [parent('Mum', 'Kid')]), []);
    assert.deepEqual(familyDynasties('Rex', nodes, []), []);
  });
});
