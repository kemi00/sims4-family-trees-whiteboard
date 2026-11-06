import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Edge, SimNode } from '../types/whiteboard.ts';
import {
  dynastyGenerations,
  dynastyKey,
  dynastyLabel,
  firstHeads,
  generationText,
  rememberFirstHeads,
  setFirstHead,
} from './generations.ts';

const sim = (id: string, extra: Partial<SimNode> = {}): SimNode =>
  ({ id, first: id, sur: 'Goth', age: 'Adult', dynasty: 'Goth', dynastyId: '9', ...extra }) as SimNode;
const parent = (a: string, b: string, extra: Partial<Edge> = {}): Edge => ({ id: `${a}>${b}`, a, b, type: 'parent', ...extra });
const married = (a: string, b: string): Edge => ({ id: `${a}=${b}`, a, b, type: 'marriage' });

describe('dynasty generations', () => {
  const nodes = [
    sim('Gunther', { dynasty: undefined, dynastyId: undefined }),
    sim('Mortimer', { dynastyRole: 'head' }),
    sim('Bella'),
    sim('Cassandra', { dynastyRole: 'heir' }),
    sim('Alexander'),
    sim('Caleb', { sur: 'Vatore' }),
    sim('Baby'),
    sim('Stranger'),
  ];
  const edges = [
    parent('Gunther', 'Mortimer'),
    parent('Mortimer', 'Cassandra'),
    parent('Bella', 'Cassandra'),
    parent('Mortimer', 'Alexander'),
    married('Mortimer', 'Bella'),
    married('Cassandra', 'Caleb'),
    parent('Cassandra', 'Baby', { source: 'planned' }),
  ];

  it('counts from the first head down the parent links, spouses taking their partner’s number', () => {
    const g = dynastyGenerations(nodes, edges);
    const of = (id: string) => g.get(id)!;
    assert.deepEqual([of('Mortimer').gen, of('Cassandra').gen, of('Alexander').gen], [1, 2, 2]);
    assert.deepEqual([of('Bella').gen, of('Bella').byMarriage], [1, true]);
    assert.deepEqual([of('Caleb').gen, of('Caleb').byMarriage], [2, true]);
    assert.deepEqual([of('Baby').gen, of('Baby').planned], [3, true]);
    assert.equal(of('Stranger').gen, undefined);
    assert.equal(g.has('Gunther'), false);
    assert.equal(of('Cassandra').firstHeadId, 'Mortimer');
  });

  it('marks an ancestor of the first head as before the dynasty', () => {
    const g = dynastyGenerations(nodes.map((n) => (n.id === 'Gunther' ? sim('Gunther') : n)), edges);
    assert.equal(g.get('Gunther')!.before, true);
    assert.equal(generationText(g.get('Gunther')!, 'Goth'), 'before the Goth dynasty');
  });

  it('keeps counting from a remembered first head after the heir succeeds', () => {
    const after = nodes.map((n) =>
      n.id === 'Mortimer'
        ? { ...n, dynasty: undefined, dynastyId: undefined, dynastyRole: undefined, firstHeadOf: 'id:9' }
        : n.id === 'Cassandra'
          ? { ...n, dynastyRole: 'head' as const }
          : n,
    );
    const g = dynastyGenerations(after, edges);
    assert.deepEqual([g.get('Cassandra')!.gen, g.get('Baby')!.gen], [2, 3]);
    assert.equal(generationText(g.get('Cassandra')!, 'Goth'), 'Gen 2 of the Goth');
    assert.equal(generationText(g.get('Bella')!, 'Goth'), 'Gen 1 of the Goth by marriage');
  });
});

describe('first heads', () => {
  it('remembers each dynasty’s head once, and moves a name key to the game’s id', () => {
    const nodes = [sim('Mortimer', { dynastyRole: 'head' }), sim('Cassandra', { dynastyRole: 'heir' })];
    const once = rememberFirstHeads(nodes);
    assert.equal(once.find((n) => n.id === 'Mortimer')!.firstHeadOf, 'id:9');
    assert.equal(rememberFirstHeads(once), once);
    const byName = [sim('Old', { dynastyId: undefined, firstHeadOf: 'name:Goth' }), sim('Mortimer', { dynastyRole: 'head' })];
    const moved = rememberFirstHeads(byName);
    assert.deepEqual(moved.map((n) => n.firstHeadOf), ['id:9', undefined]);
  });

  it('falls back to the head now, and a pick replaces the remembered one', () => {
    const nodes = [sim('Mortimer', { dynastyRole: 'head' }), sim('Bella')];
    assert.equal(firstHeads(nodes).get('id:9'), 'Mortimer');
    const picked = setFirstHead(rememberFirstHeads(nodes), 'id:9', 'Bella');
    assert.deepEqual(picked.map((n) => n.firstHeadOf), [undefined, 'id:9']);
    assert.equal(firstHeads(picked).get('id:9'), 'Bella');
  });

  it('keys a dynasty by the game’s id, else its name', () => {
    assert.equal(dynastyKey({ dynasty: 'Goth', dynastyId: '9' }), 'id:9');
    assert.equal(dynastyKey({ dynasty: 'Goth' }), 'name:Goth');
    assert.equal(dynastyKey({}), null);
  });

  it('tells apart two dynasties of one name by the first head', () => {
    const nodes = [
      sim('Oliana', { sur: 'Ngata', dynasty: 'Ngata', dynastyId: '1', dynastyRole: 'head' }),
      sim('Leila', { sur: 'Ngata', dynasty: 'Ngata', dynastyId: '2', dynastyRole: 'head' }),
      sim('Mortimer', { dynastyRole: 'head' }),
    ];
    const g = dynastyGenerations(nodes, []);
    const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
    assert.equal(dynastyLabel(g.get('Oliana')!, g, byId), 'Ngata (Oliana’s line)');
    assert.equal(dynastyLabel(g.get('Mortimer')!, g, byId), 'Goth');
  });
});
