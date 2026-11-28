import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { editionHasNews, gazetteEdition } from './gazette.ts';
import type { ChronicleEntry } from './chronicle.ts';
import type { Edge, SimNode } from '../types/whiteboard.ts';

const sim = (id: string, extra: Partial<SimNode> = {}): SimNode =>
  ({ id, first: id, sur: 'Capp', age: 'Adult', gender: 'Female', state: 'Sim', gid: 'W||Capp', hh: 'Capp', world: 'W', ...extra }) as SimNode;
const r = (id: string) => ({ id, name: `${id} Capp` });
const empty = { days: 1, born: [], together: [], apart: [], moved: [], grew: [], died: [], met: 0, plansDone: 0 };

describe('the gazette', () => {
  const nodes = [
    sim('Tybalt', { gender: 'Male', titles: [{ title: 'Grand Duke', rank: 9, game: 'career' }] }),
    sim('Juliette'),
    sim('Romeo', { gender: 'Male' }),
    sim('Old', { state: 'Deceased', age: 'Elder', deathTrait: '101685' }),
    sim('Burnt', { state: 'Deceased', deathTrait: '101676' }),
    sim('Kid', { age: 'Child' }),
  ];
  const edges: Edge[] = [
    { id: 'm', a: 'Old', b: 'Juliette', type: 'marriage' },
    { id: 'p', a: 'Old', b: 'Kid', type: 'parent' },
  ];
  const deathName = (id: string) => ({ '101685': 'Old Age', '101676': 'Fire' })[id];
  const entry: ChronicleEntry = {
    at: 'x',
    game: { clock: 2_160_000 * 4, season: 'Spring' },
    recap: {
      ...empty,
      together: [{ a: r('Tybalt'), b: r('Juliette'), type: 'marriage', planned: false }],
      died: [r('Old'), r('Burnt')],
      born: [
        { id: 'b1', name: 'b1 Capp', parents: ['Juliette Capp'], parentIds: ['Juliette'], planned: false },
        { id: 'b2', name: 'b2 Capp', parents: ['Juliette Capp'], parentIds: ['Juliette'], planned: false },
      ],
      grew: [{ id: 'Kid', name: 'Kid Capp', from: 'Toddler', to: 'Child' }],
      relationships: [{ kind: 'affair', a: r('Romeo'), b: r('Juliette') }],
    },
  };

  it('leads with the scandal, then the tragedy, a royal wedding and the twins', () => {
    const e = gazetteEdition({ entry, number: 3, nodes, edges, world: 'Ondarion', deathName });
    assert.equal(e.title, 'The Ondarion Gazette');
    assert.equal(e.dateline, 'Day 5 · Spring');
    assert.equal(e.lead?.kind, 'affair');
    assert.deepEqual(
      e.front.map((a) => a.headline),
      ['A royal wedding: Tybalt Capp weds Juliette Capp', 'Tragedy: Burnt Capp is gone', 'Twins! 2 new arrivals for Juliette Capp'],
    );
    assert.match(e.front[0]!.body, /^Grand Duke Tybalt Capp and Juliette Capp are married\./);
  });

  it('gives births, birthdays and obituaries their columns, the dead survived by their family', () => {
    const e = gazetteEdition({ entry, number: 3, nodes, edges, deathName });
    const col = Object.fromEntries(e.columns.map((c) => [c.title, c.articles]));
    assert.equal(e.title, 'The Family Trees Gazette');
    assert.deepEqual(col.Births!.map((a) => a.headline), ['Welcome, b1 Capp', 'Welcome, b2 Capp']);
    assert.deepEqual(col.Birthdays!.map((a) => a.body), ['Kid Capp is now a child.']);
    assert.equal(col.Obituaries![0]!.body, 'Old Capp, an elder, passed away of old age. Survived by Juliette Capp, Kid Capp.');
  });

  it('prints nothing for an upload with no news', () => {
    const quiet = gazetteEdition({ entry: { ...entry, recap: { ...empty } }, number: 1, nodes, edges });
    assert.equal(editionHasNews(quiet), false);
  });
});
