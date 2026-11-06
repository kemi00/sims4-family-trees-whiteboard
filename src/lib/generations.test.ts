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
  setGenRoot,
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

  it('counts from the first head’s oldest known ancestor, spouses taking their partner’s number', () => {
    const g = dynastyGenerations(nodes, edges);
    const of = (id: string) => g.get(id)!;
    assert.deepEqual([of('Mortimer').rootId, of('Mortimer').autoRootId], ['Gunther', 'Gunther']);
    assert.deepEqual([of('Mortimer').gen, of('Cassandra').gen, of('Alexander').gen], [2, 3, 3]);
    assert.deepEqual([of('Bella').gen, of('Bella').byMarriage], [2, true]);
    assert.deepEqual([of('Caleb').gen, of('Caleb').byMarriage], [3, true]);
    assert.deepEqual([of('Baby').gen, of('Baby').planned], [4, true]);
    assert.equal(of('Stranger').gen, undefined);
    // Gunther is no member, but the line starts with him.
    assert.deepEqual([of('Gunther').gen, of('Gunther').forebear], [1, true]);
    assert.equal(generationText(of('Gunther'), 'Goth'), 'Gen 1 of the Goth line');
    assert.equal(of('Cassandra').firstHeadId, 'Mortimer');
  });

  it('goes back through dead and family-tree ancestors: Cordelia Thebe V is Gen 5', () => {
    const thebe = (id: string, extra: Partial<SimNode> = {}) =>
      sim(id, { sur: 'Thebe', dynasty: undefined, dynastyId: undefined, state: 'Deceased', ...extra });
    const line = [
      thebe('Queen', { first: 'Queen', treeId: '1' }),
      sim('Beard', { first: 'John Wilson', sur: 'Beard', dynasty: undefined, dynastyId: undefined, treeId: '2' }),
      thebe('II'),
      thebe('III'),
      thebe('IV'),
      thebe('V', { state: 'Sim', dynasty: 'Thebe', dynastyId: '7', dynastyRole: 'head' }),
      thebe('VI', { state: 'Sim', dynasty: 'Thebe', dynastyId: '7', dynastyRole: 'heir' }),
    ];
    const links = [
      parent('Beard', 'II'),
      parent('Queen', 'II'),
      parent('II', 'III'),
      parent('III', 'IV'),
      parent('IV', 'V'),
      parent('V', 'VI'),
    ];
    const g = dynastyGenerations(line, links);
    assert.equal(g.get('V')!.autoRootId, 'Queen');
    assert.deepEqual([g.get('V')!.gen, g.get('VI')!.gen, g.get('III')!.gen], [5, 6, 3]);
    assert.equal(g.get('III')!.forebear, true);
    assert.equal(generationText(g.get('V')!, 'Thebe'), 'Gen 5 of the Thebe');
  });

  it('counts from a picked Gen 1, its ancestors before the count', () => {
    const g = dynastyGenerations(setGenRoot(nodes, 'id:9', 'Mortimer'), edges);
    assert.deepEqual([g.get('Mortimer')!.gen, g.get('Mortimer')!.rootPicked, g.get('Cassandra')!.gen], [1, true, 2]);
    assert.equal(g.get('Mortimer')!.autoRootId, 'Gunther');
    const withGunther = setGenRoot(nodes.map((n) => (n.id === 'Gunther' ? sim('Gunther') : n)), 'id:9', 'Mortimer');
    const h = dynastyGenerations(withGunther, edges);
    assert.equal(h.get('Gunther')!.before, true);
    assert.equal(generationText(h.get('Gunther')!, 'Goth'), 'before the Goth count');
    const back = setGenRoot(setGenRoot(nodes, 'id:9', 'Mortimer'), 'id:9', null);
    assert.ok(back.every((n) => !n.genRootOf));
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
    assert.deepEqual([g.get('Cassandra')!.gen, g.get('Baby')!.gen], [3, 4]);
    assert.equal(generationText(g.get('Cassandra')!, 'Goth'), 'Gen 3 of the Goth');
    assert.equal(generationText(g.get('Bella')!, 'Goth'), 'Gen 2 of the Goth by marriage');
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

  it('falls back to the head now, and prefers the remembered one', () => {
    const nodes = [sim('Mortimer', { dynastyRole: 'head' }), sim('Bella', { firstHeadOf: 'id:9' })];
    assert.equal(firstHeads([nodes[0]!]).get('id:9'), 'Mortimer');
    assert.equal(firstHeads(nodes).get('id:9'), 'Bella');
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
