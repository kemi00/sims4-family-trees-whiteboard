import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { removalLabel, simLinkRows } from './simLinks.ts';
import type { Edge } from '../types/whiteboard.ts';

const names: Record<string, string> = { t: 'Tybalt Capp', j: 'Juliette Monty', c: 'Cordelia Capp', b: 'Beatrice Capp', k: 'Planned (1) Capp', r: 'Romeo Monty' };
const nameOf = (id: string) => names[id] ?? id;

describe("a sim's links in the editor", () => {
  const edges: Edge[] = [
    { id: 'p1', a: 't', b: 'b', type: 'parent', source: 'save' },
    { id: 'p2', a: 'c', b: 't', type: 'parent', source: 'save' },
    { id: 'm1', a: 't', b: 'j', type: 'marriage', source: 'save' },
    { id: 'p3', a: 't', b: 'k', type: 'parent', source: 'planned' },
    { id: 'x', a: 'r', b: 'j', type: 'romance', source: 'save' },
  ];

  it('lists only their own links, couples first, then parents, then children', () => {
    const rows = simLinkRows('t', edges, nameOf);
    assert.deepEqual(
      rows.map((r) => r.text),
      ['Married to Juliette Monty', 'Child of Cordelia Capp', 'Parent of Beatrice Capp', 'Parent of Planned (1) Capp'],
    );
    assert.deepEqual(rows.map((r) => r.planned), [false, false, false, true]);
  });

  it('keeps a marriage a death ended as history: nothing to divorce, it comes off like any link', () => {
    const dead = (id: string) => id === 'j';
    const mine = simLinkRows('t', edges, nameOf, dead)[0]!;
    assert.deepEqual([mine.text, mine.removal, mine.ended], ['Married to Juliette Monty, who died', 'remove', true]);
    const hers = simLinkRows('j', edges, nameOf, dead).find((r) => r.id === 'm1')!;
    assert.equal(hers.text, 'Married to Tybalt Capp until death');
    // A romance too; with everyone alive, it is a breakup to plan as before.
    assert.equal(simLinkRows('r', edges, nameOf, dead)[0]!.text, 'In a romance with Juliette Monty, who died');
    assert.equal(simLinkRows('r', edges, nameOf)[0]!.removal, 'breakup');
  });

  it('plans the end of a couple the game has, and removes the rest', () => {
    const rows = simLinkRows('t', edges, nameOf);
    assert.equal(rows[0]!.removal, 'divorce');
    assert.equal(removalLabel(rows[0]!.removal), 'Plan divorce');
    assert.ok(rows.slice(1).every((r) => r.removal === 'remove'));
    // Once its end is planned, the next one takes it off.
    const ended = simLinkRows('t', [{ ...edges[2]!, ending: { createdAt: 'x' } }], nameOf);
    assert.equal(ended[0]!.text, 'Married to Juliette Monty, divorce planned');
    assert.equal(ended[0]!.removal, 'remove');
    // A planned romance was never in the game: it simply goes.
    const planned = simLinkRows('r', [{ ...edges[4]!, source: 'planned' }], nameOf);
    assert.equal(planned[0]!.removal, 'remove');
  });

  it('says what an adoption or a secret is', () => {
    const rows = simLinkRows('b', [{ id: 'a', a: 't', b: 'b', type: 'parent', adopted: true, secret: true }], nameOf);
    assert.equal(rows[0]!.text, 'Adopted by Tybalt Capp, secret');
  });
});
