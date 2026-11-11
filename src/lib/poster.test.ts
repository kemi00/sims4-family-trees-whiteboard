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
