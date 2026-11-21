import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { bloodlineOf, generationCounts, generationName, lineageIds } from './bloodline.ts';
import { bloodlineWhat, generationGroups, simList } from './simList.ts';
import type { Edge, SimNode } from '../types/whiteboard.ts';

const parent = (a: string, b: string, extra: Partial<Edge> = {}): Edge => ({ id: `${a}>${b}`, a, b, type: 'parent', ...extra });

/*
 * Queen + Eetion → Andromache; Andromache + Hector → Consort;
 * Consort + Contessa → Cordelia; Cordelia + Caliban → Tybalt, Juliette;
 * Tybalt → Beatrice, Celeste, Virgilio; Juliette + Romeo → Dante.
 * Consort and Caliban married (a spouse is not in the line).
 */
const EDGES: Edge[] = [
  parent('queen', 'andromache'),
  parent('eetion', 'andromache'),
  parent('andromache', 'consort'),
  parent('hector', 'consort'),
  parent('consort', 'cordelia'),
  parent('contessa', 'cordelia'),
  parent('cordelia', 'tybalt'),
  parent('caliban', 'tybalt'),
  parent('cordelia', 'juliette'),
  parent('caliban', 'juliette'),
  parent('tybalt', 'beatrice'),
  parent('tybalt', 'celeste'),
  parent('tybalt', 'virgilio'),
  parent('juliette', 'dante'),
  parent('romeo', 'dante'),
  { id: 'm', a: 'cordelia', b: 'caliban', type: 'marriage' },
];

const sim = (id: string, extra: Partial<SimNode> = {}): SimNode =>
  ({ id, gid: 'W||Capp', first: id[0]!.toUpperCase() + id.slice(1), sur: 'Capp', age: 'Adult', state: 'Sim', gender: 'Female', hh: 'Capp', world: 'W', nb: '', color: '#999', x: 0, y: 0, ...extra }) as SimNode;

describe('bloodlineOf', () => {
  it('children: one generation down', () => {
    const line = bloodlineOf('cordelia', EDGES, 'children');
    assert.deepEqual([...line.ids].sort(), ['cordelia', 'juliette', 'tybalt']);
    assert.equal(line.generation.get('tybalt'), 1);
  });

  it('descendants: every generation down, none up, no spouses', () => {
    const line = bloodlineOf('consort', EDGES, 'descendants');
    assert.deepEqual([...line.ids].sort(), ['beatrice', 'celeste', 'consort', 'cordelia', 'dante', 'juliette', 'tybalt', 'virgilio']);
    assert.equal(line.generation.get('dante'), 3);
    assert.deepEqual(line.via.get('dante'), ['juliette']);
    assert.ok(!line.ids.has('caliban') && !line.ids.has('romeo') && !line.ids.has('andromache'));
  });

  it('ancestors too: up as negative generations, and down', () => {
    const line = bloodlineOf('consort', EDGES, 'both');
    assert.equal(line.generation.get('andromache'), -1);
    assert.equal(line.generation.get('queen'), -2);
    assert.deepEqual(line.via.get('queen'), ['andromache']);
    assert.equal(line.generation.get('beatrice'), 3);
    // What the board lit before: ancestors and descendants.
    assert.deepEqual([...lineageIds('consort', EDGES)].sort(), [...line.ids].sort());
  });

  it('a sim who comes down two ways is in the nearer generation, through both parents there', () => {
    // Cousins marry: Beatrice (gen 3) and Dante (gen 3) have a child; Tybalt (gen 2) adopts nobody.
    const edges = [...EDGES, parent('beatrice', 'baby'), parent('dante', 'baby'), parent('juliette', 'baby')];
    const line = bloodlineOf('consort', edges, 'descendants');
    assert.equal(line.generation.get('baby'), 3);
    assert.deepEqual(line.via.get('baby'), ['juliette']);
    const both = bloodlineOf('consort', [...EDGES, parent('beatrice', 'kid'), parent('dante', 'kid')], 'descendants');
    assert.equal(both.generation.get('kid'), 4);
    assert.deepEqual(both.via.get('kid'), ['beatrice', 'dante']);
  });

  it('adopted children count unless turned off; the switch shows either way', () => {
    const edges = [parent('marilla', 'anne', { adopted: true }), parent('anne', 'gil')];
    const on = bloodlineOf('marilla', edges, 'descendants');
    assert.ok(on.ids.has('anne') && on.ids.has('gil'));
    assert.ok(on.adopted.has('anne') && !on.adopted.has('gil'));
    assert.equal(on.hasAdopted, true);
    const off = bloodlineOf('marilla', edges, 'descendants', { adopted: false });
    assert.deepEqual([...off.ids], ['marilla']);
    assert.equal(off.hasAdopted, true);
    assert.equal(bloodlineOf('tybalt', EDGES, 'descendants').hasAdopted, false);
  });

  it('born to one parent in the line and adopted by another: born wins', () => {
    const edges = [parent('root', 'a'), parent('root', 'b'), parent('a', 'kid'), parent('b', 'kid', { adopted: true })];
    const line = bloodlineOf('root', edges, 'descendants');
    assert.ok(!line.adopted.has('kid'));
  });

  it('survives a loop on the board', () => {
    const line = bloodlineOf('a', [parent('a', 'b'), parent('b', 'a')], 'both');
    assert.deepEqual([...line.ids].sort(), ['a', 'b']);
  });
});

describe('generation words', () => {
  it('names generations up and down', () => {
    assert.equal(generationName(1), 'Children');
    assert.equal(generationName(2), 'Grandchildren');
    assert.equal(generationName(3), 'Great-grandchildren');
    assert.equal(generationName(4), 'Great-great-grandchildren');
    assert.equal(generationName(5), '3× great-grandchildren');
    assert.equal(generationName(-1), 'Parents');
    assert.equal(generationName(-3), 'Great-grandparents');
  });

  it('counts a line nearest first', () => {
    assert.equal(generationCounts(bloodlineOf('consort', EDGES, 'descendants')), '1 child, 2 grandchildren, 4 great-grandchildren');
    assert.equal(generationCounts(bloodlineOf('consort', EDGES, 'both'), -1), '2 parents, 2 grandparents');
    assert.equal(generationCounts(bloodlineOf('dante', EDGES, 'descendants')), '');
  });
});

describe('a bloodline as a list', () => {
  const ids = ['queen', 'eetion', 'andromache', 'hector', 'consort', 'cordelia', 'tybalt', 'juliette', 'beatrice', 'celeste', 'virgilio', 'dante'];
  const nodes = ids.map((id, i) => sim(id, { x: i * 10 }));
  const byid = Object.fromEntries(nodes.map((n) => [n.id, n]));

  it('says whose child or parent each one is', () => {
    const line = bloodlineOf('consort', EDGES, 'both');
    assert.equal(bloodlineWhat(byid.cordelia!, line, byid, false), 'Adult');
    assert.equal(bloodlineWhat(byid.beatrice!, line, byid, false), 'Child of Tybalt · Adult');
    assert.equal(bloodlineWhat(byid.queen!, line, byid, false), 'Parent of Andromache · Adult');
    assert.equal(bloodlineWhat(byid.andromache!, line, byid, false), 'Adult');
    const adopted = bloodlineOf('m', [parent('m', 'anne', { adopted: true }), parent('anne', 'gil')], 'descendants');
    const more = { ...byid, m: sim('m'), anne: sim('anne', { age: 'Teen' }), gil: sim('gil', { age: 'Infant' }) };
    assert.equal(bloodlineWhat(more.anne, adopted, more, false), 'Adopted · Teen');
    assert.equal(bloodlineWhat(more.gil, adopted, more, true), 'Child of Anne · Not born yet');
  });

  it('groups oldest first, the sim between, siblings together', () => {
    const line = bloodlineOf('consort', EDGES, 'both');
    const list = simList({ nodes, pick: (n) => n.id !== 'consort' && line.ids.has(n.id), shown: () => true, worlds: [], what: () => '' });
    const groups = generationGroups(list, line, 'Consort Capp', generationName);
    assert.deepEqual(
      groups.map((g) => g.label),
      ['Grandparents', 'Parents', 'Consort Capp', 'Children', 'Grandchildren', 'Great-grandchildren'],
    );
    assert.equal(groups[2]!.me, true);
    assert.deepEqual(
      groups[5]!.rows.map((r) => r.sim.id),
      ['beatrice', 'celeste', 'virgilio', 'dante'],
    );
    const down = generationGroups(list, bloodlineOf('consort', EDGES, 'descendants'), 'Consort Capp', generationName);
    assert.ok(!down.some((g) => g.me));
  });
});
