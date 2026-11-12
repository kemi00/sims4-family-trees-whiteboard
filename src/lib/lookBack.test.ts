import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ChronicleEntry } from './chronicle.ts';
import { pastEdges, pastNode, pastView } from './lookBack.ts';
import type { Edge, SimNode } from '../types/whiteboard.ts';

const sim = (id: string, extra: Partial<SimNode> = {}): SimNode =>
  ({ id, first: id, sur: 'Capp', age: 'Adult', state: 'Sim', gender: 'Female', gid: 'W||Capp', saveSimId: `s-${id}`, ...extra }) as SimNode;
const page = (clock: number, recap?: Partial<NonNullable<ChronicleEntry['recap']>>): ChronicleEntry => ({
  at: `t${clock}`,
  game: { clock },
  ...(recap
    ? { recap: { days: 1, born: [], together: [], apart: [], moved: [], grew: [], died: [], met: 0, plansDone: 0, ...recap } }
    : { start: { sims: 3, households: 1 } }),
});

// The board now: Beatrice married Adekoya at upload 2 and had Helena; Tybalt grew old and died at upload 3;
// Romeo and Juliette broke up at upload 3; a townie was met at upload 3.
const nodes = [
  sim('b', { age: 'Young Adult' }),
  sim('a'),
  sim('h', { age: 'Infant' }),
  sim('t', { age: 'Elder', state: 'Deceased' }),
  sim('r'),
  sim('j'),
  sim('w'),
  sim('plan', { added: true, saveSimId: undefined }),
];
const edges: Edge[] = [
  { id: 'm', a: 'b', b: 'a', type: 'marriage', source: 'save' },
  { id: 'p', a: 'b', b: 'h', type: 'parent', source: 'save' },
  { id: 'x', a: 'b', b: 'plan', type: 'parent', source: 'planned' },
];
const entries = [
  page(1),
  page(2, {
    born: [{ id: 'h', name: 'Helena', parents: ['Beatrice'], planned: false }],
    together: [{ a: { id: 'b', name: 'Beatrice' }, b: { id: 'a', name: 'Adekoya' }, type: 'marriage', planned: false }],
  }),
  page(3, {
    grew: [{ id: 't', name: 'Tybalt', from: 'Adult', to: 'Elder' }],
    died: [{ id: 't', name: 'Tybalt' }],
    apart: [{ a: { id: 'r', name: 'Romeo' }, b: { id: 'j', name: 'Juliette' }, type: 'breakup' }],
    met: 1,
    metIds: ['w'],
  }),
];

describe('looking back through the uploads', () => {
  it('is now at the latest upload', () => {
    assert.equal(pastView(entries, 2, nodes), null);
  });

  it('takes back what came later: births, the met, plans, couples, birthdays and deaths', () => {
    const v = pastView(entries, 0, nodes)!;
    assert.deepEqual([...v.hidden].sort(), ['h', 'plan', 'w']);
    assert.equal(v.ageOf.get('t'), 'Adult');
    assert.ok(v.alive.has('t'));
    const shown = pastEdges(edges, v);
    // The marriage came later; Romeo and Juliette were still together.
    assert.deepEqual(shown.map((e) => `${e.type}:${e.a}-${e.b}`), ['romance:r-j']);
    assert.deepEqual(pastNode(nodes[3]!, v), { ...nodes[3]!, age: 'Adult', state: 'Sim' });
  });

  it('shows each upload as it was: after the wedding, before the death', () => {
    const v = pastView(entries, 1, nodes)!;
    assert.deepEqual([...v.hidden].sort(), ['plan', 'w']);
    assert.deepEqual(pastEdges(edges, v).map((e) => e.type).sort(), ['marriage', 'parent', 'romance']);
    assert.equal(pastNode(nodes[0]!, v), nodes[0]);
  });
});
