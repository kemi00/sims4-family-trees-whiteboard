import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { recapHasNews, recapTimeText, saveRecap } from './saveRecap.ts';
import type { Edge, SimNode } from '../types/whiteboard.ts';

const sim = (id: string, first: string, extra: Partial<SimNode> = {}): SimNode =>
  ({
    id, first, sur: 'Capp', gid: 'Ondarion||Capp', hh: 'Capp', world: 'Ondarion', nb: '-', age: 'Adult', state: 'Sim',
    gender: 'Female', color: '#999', townie: false, oworld: 'Ondarion', onb: '-', ohh: 'Capp', oplay: 'Resident', pack: '',
    x: 0, y: 0, w: 0, h: 0, saveSimId: 's' + id, ...extra,
  }) as SimNode;
const day = 2_160_000;

describe('previously on', () => {
  const tybalt = sim('t', 'Tybalt');
  const beatrice = sim('b', 'Beatrice', { age: 'Young Adult' });
  const planned = sim('k', '', { added: true, saveSimId: undefined, age: 'Unknown' });
  const juliette = sim('j', 'Juliette', { gid: 'Ondarion||Monty', hh: 'Monty' });
  const before = {
    nodes: [tybalt, beatrice, planned, juliette],
    edges: [
      { id: 'p', a: 't', b: 'k', type: 'parent', source: 'planned' },
      { id: 'w', a: 'b', b: 'j', type: 'marriage', source: 'planned' },
    ] as Edge[],
    saveGame: { importedAt: 'x', clock: 10 * day, season: 'Spring' as const },
  };
  const after = {
    nodes: [
      { ...tybalt, age: 'Elder' },
      { ...beatrice, gid: 'Ondarion||Monty', hh: 'Monty' },
      { ...planned, first: 'Hero', saveSimId: 's99', age: 'Newborn' },
      juliette,
      sim('n', 'Townie', { gid: 'Ondarion||Town', hh: 'Town' }),
    ],
    edges: [
      { id: 'p', a: 't', b: 'k', type: 'parent', source: 'save' },
      { id: 'w', a: 'b', b: 'j', type: 'marriage', source: 'save', wasPlanned: true },
    ] as Edge[],
    saveGame: { importedAt: 'y', clock: 13 * day, season: 'Summer' as const },
  };

  it('tells what happened in the game, as a story', () => {
    const r = saveRecap(before, after);
    assert.equal(recapTimeText(r.days), '3 days of play');
    assert.deepEqual(r.seasons, { from: 'Spring', to: 'Summer' });
    assert.deepEqual(r.born.map((b) => [b.name, b.parents, b.planned]), [['Hero Capp', ['Tybalt Capp'], true]]);
    assert.deepEqual(r.together.map((t) => [t.a.name, t.b.name, t.type, t.planned]), [['Beatrice Capp', 'Juliette Capp', 'marriage', true]]);
    assert.deepEqual(r.moved.map((m) => [m.name, m.from, m.to]), [['Beatrice Capp', 'the Capp household', 'the Monty household']]);
    assert.deepEqual(r.grew.map((g) => [g.name, g.from, g.to]), [['Tybalt Capp', 'Adult', 'Elder']]);
    assert.equal(r.met, 1);
    assert.equal(r.plansDone, 2);
    assert.ok(recapHasNews(r));
  });

  it('celebrates the planned birth and wedding the save confirmed, and no one else', () => {
    assert.deepEqual(saveRecap(before, after).celebrate.sort(), ['b', 'j', 'k']);
  });

  it('has no news when nothing changed', () => {
    const r = saveRecap(after, after);
    assert.equal(recapHasNews(r), false);
    assert.equal(recapTimeText(r.days), null);
  });
});
