import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dynastyPoster, householdPoster, posterCalendar } from './poster.ts';
import { TICKS_PER_DAY } from './lifeClock.ts';
import type { Edge, Group, SimNode } from '../types/whiteboard.ts';

const sim = (id: string, first: string, age: string, x: number, y: number, extra: Partial<SimNode> = {}): SimNode =>
  ({
    id, first, sur: 'Goth', gid: 'Willow Creek||Goth', hh: 'Goth', world: 'Willow Creek', nb: 'Pendula View', age, state: 'Sim',
    gender: 'Female', color: '#4a8a5c', townie: false, oworld: 'Willow Creek', onb: '-', ohh: 'Goth', oplay: 'Resident', pack: '',
    x, y, w: 170, h: 86, saveSimId: 's' + id, ...extra,
  }) as SimNode;

const group: Group = { gid: 'Willow Creek||Goth', hh: 'Goth', world: 'Willow Creek', nb: 'Pendula View', color: '#4a8a5c', x: 0, y: 0, w: 0, h: 0 };
const mortimer = sim('m', 'Mortimer', 'Adult', 300, 100, { dynasty: 'Goth', dynastyRole: 'head' });
const bella = sim('b', 'Bella', 'Young Adult', 100, 102);
const cassandra = sim('c', 'Cassandra', 'Teen', 300, 240, { dynasty: 'Goth', dynastyRole: 'heir' });
const alexander = sim('a', 'Alexander', 'Child', 100, 240, { dynasty: 'Goth' });
const baby = sim('k', '', 'Unknown', 500, 240, { added: true, saveSimId: undefined, planNo: 1 });
const cat = sim('p', 'Pepper', 'Adult', 100, 380, { species: 'Cat', state: 'Pet' });
const edges: Edge[] = [
  { id: 'e1', a: 'm', b: 'c', type: 'parent' },
  { id: 'e2', a: 'b', b: 'c', type: 'parent' },
  { id: 'e3', a: 'm', b: 'a', type: 'parent' },
  { id: 'e4', a: 'b', b: 'a', type: 'parent' },
];

describe('posters', () => {
  it('a household’s sims sit in their board rows, pets last', () => {
    const p = householdPoster({ group, nodes: [mortimer, bella, cassandra, alexander, baby, cat], lot: 'Ophelia Villa' });
    assert.equal(p.title, 'The Goth household');
    assert.equal(p.subtitle, 'Ophelia Villa · Pendula View · Willow Creek');
    assert.deepEqual(
      p.rows.map((r) => [r.label, r.cards.map((c) => c.name)]),
      [
        [undefined, ['Bella Goth', 'Mortimer Goth']],
        [undefined, ['Alexander Goth', 'Cassandra Goth', 'Planned (1) Goth']],
        ['Pet', ['Pepper Goth']],
      ],
    );
    assert.equal(p.rows[0]!.cards[1]!.role, '👑 Head of the Goth dynasty');
    assert.deepEqual([p.rows[1]!.cards[2]!.stage, p.rows[1]!.cards[2]!.planned], ['Not born yet', true]);
    assert.equal(p.rows[2]!.cards[0]!.stage, 'Cat');
    assert.equal(p.slug, 'goth-household');
    assert.equal(p.calendar, '');
  });

  it('a dynasty’s members go by generation, under its line of succession', () => {
    const p = dynastyPoster({ key: 'name:Goth', label: 'Goth', nodes: [mortimer, bella, cassandra, alexander], edges });
    assert.equal(p.title, 'The Goth dynasty');
    assert.deepEqual(p.line, ['👑 Mortimer Goth', '⚜️ Cassandra Goth']);
    assert.deepEqual(
      p.rows.map((r) => [r.label, r.cards.map((c) => c.name)]),
      [
        ['Generation 1', ['Mortimer Goth']],
        ['Generation 2', ['Cassandra Goth', 'Alexander Goth']],
      ],
    );
    assert.equal(p.rows[0]!.cards[0]!.role, '👑 Head');
    assert.equal(p.subtitle, '3 living members · head in Willow Creek');
  });

  it('draws the household’s family: partners side by side, children under their parents', () => {
    // Board order puts Caleb between the parents and Cassandra away from him.
    const caleb = sim('v', 'Caleb', 'Young Adult', 200, 101, { sur: 'Vatore' });
    const links: Edge[] = [
      ...edges,
      { id: 'w1', a: 'm', b: 'b', type: 'marriage', source: 'save' },
      { id: 'w2', a: 'c', b: 'v', type: 'romance', source: 'planned' },
      { id: 'w3', a: 'b', b: 'x', type: 'divorced' },
      { id: 'p3', a: 'm', b: 'k', type: 'parent', source: 'planned' },
    ];
    const away = sim('x', 'Ex', 'Adult', 0, 0, { gid: 'Willow Creek||Other', hh: 'Other' });
    const p = householdPoster({ group, nodes: [mortimer, bella, caleb, cassandra, alexander, baby, away], links });
    assert.deepEqual(
      p.rows.map((r) => r.cards.map((c) => c.name)),
      [
        ['Bella Goth', 'Mortimer Goth', 'Caleb Vatore'],
        ['Alexander Goth', 'Cassandra Goth', 'Planned (1) Goth'],
      ],
    );
    assert.deepEqual(
      p.couples.map((c) => [c.a, c.b, c.type, c.planned]),
      [['m', 'b', 'marriage', false]],
    );
    // Caleb is in another row: named on both cards instead.
    assert.deepEqual(p.rows[0]!.cards[2]!.notes, ['Partner of Cassandra Goth (planned)']);
    assert.deepEqual(p.rows[1]!.cards[1]!.notes, ['Partner of Caleb Vatore (planned)']);
    // A divorce from someone off the poster isn't said.
    assert.equal(p.rows[0]!.cards[0]!.notes, undefined);
    assert.deepEqual(
      p.families.map((f) => [f.parents, f.children.map((k) => [k.id, k.planned])]),
      [
        [['b', 'm'], [['c', false], ['a', false]]],
        [['m'], [['k', true]]],
      ],
    );
  });

  it('puts partners together and children under their own parents in a dynasty', () => {
    const capp = (id: string, first: string, age: string, x: number, y: number, extra: Partial<SimNode> = {}) =>
      sim(id, first, age, x, y, { sur: 'Capp', dynasty: 'Capp', ...extra });
    // Gen 1 Giacomo; Gen 2 his children Tybalt (married to Juliette, sat far apart on the board) and Odette.
    const giacomo = capp('g', 'Giacomo', 'Elder', 0, 0, { state: 'Deceased' });
    const tybalt = capp('t', 'Tybalt', 'Adult', 0, 200, { dynastyRole: 'head' });
    const odette = capp('o', 'Odette', 'Adult', 450, 200);
    const juliette = capp('j', 'Juliette', 'Adult', 900, 200, { sur: 'Monty' });
    const beatrice = capp('k1', 'Beatrice', 'Young Adult', 600, 400, { dynastyRole: 'heir' });
    const odile = capp('k2', 'Odile', 'Child', 0, 400);
    const links: Edge[] = [
      { id: 'pt', a: 'g', b: 't', type: 'parent' },
      { id: 'po', a: 'g', b: 'o', type: 'parent' },
      { id: 'm', a: 't', b: 'j', type: 'marriage' },
      { id: 'p1', a: 't', b: 'k1', type: 'parent' },
      { id: 'p2', a: 'j', b: 'k1', type: 'parent' },
      { id: 'p3', a: 'o', b: 'k2', type: 'parent' },
    ];
    const p = dynastyPoster({ key: 'name:Capp', label: 'Capp', nodes: [giacomo, tybalt, odette, juliette, beatrice, odile], edges: links });
    assert.deepEqual(p.rows.map((r) => r.label), ['Generation 1', 'Generation 2', 'Generation 3']);
    const gen2 = p.rows[1]!.cards.map((c) => c.id);
    assert.equal(Math.abs(gen2.indexOf('t') - gen2.indexOf('j')), 1, `partners apart: ${gen2}`);
    const gen3 = p.rows[2]!.cards.map((c) => c.id);
    // Beatrice under Tybalt and Juliette, Odile under Odette.
    assert.equal(gen3.indexOf('k1') < gen3.indexOf('k2'), gen2.indexOf('t') < gen2.indexOf('o'));
    assert.deepEqual(
      p.families.map((f) => [f.parents, f.children.map((k) => k.id)]).sort(),
      [[['g'], ['t', 'o']], [['j', 't'], ['k1']], [['o'], ['k2']]].sort(),
    );
  });

  it('says in words the parents it can’t draw a line from', () => {
    const odette = sim('o', 'Odette', 'Adult', 0, 0, { sur: 'Capp', dynasty: 'Capp' });
    const odile = sim('k', 'Odile', 'Child', 200, 0, { sur: 'Capp', dynasty: 'Capp' });
    const p = dynastyPoster({ key: 'name:Capp', label: 'Capp', nodes: [odette, odile], edges: [{ id: 'p', a: 'o', b: 'k', type: 'parent', adopted: true }] });
    assert.deepEqual(p.families, []);
    assert.deepEqual(p.rows.flatMap((r) => r.cards).find((c) => c.id === 'k')!.notes, ['Adopted by Odette Capp']);
  });

  it('dates the poster by the save’s calendar', () => {
    const clock = 5.2 * TICKS_PER_DAY;
    assert.equal(
      posterCalendar({ importedAt: 'x', clock, lifespan: 'Short', season: 'Spring', seasonSince: 0, seasonDays: 7, calendar: 'seasons' }),
      'Spring, day 6 of 7 · Short lifespan',
    );
    assert.equal(posterCalendar({ importedAt: 'x', clock, lifespan: 'Normal', calendar: 'days' }), 'Day 6 · Normal lifespan');
    assert.equal(posterCalendar(null), '');
  });
});
