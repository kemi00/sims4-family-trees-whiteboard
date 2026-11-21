import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { canParent, childSurnames, householdParents, parentSearch, parentWarning } from './childParents.ts';
import type { SimNode } from '../types/whiteboard.ts';

const sim = (id: string, age: string, extra: Partial<SimNode> = {}): SimNode =>
  ({
    id,
    gid: 'W||Rivera',
    first: id,
    sur: 'Rivera',
    age,
    state: 'Sim',
    gender: 'Female',
    hh: 'Rivera',
    world: 'W',
    nb: '',
    color: '#999',
    ...extra,
  }) as SimNode;

describe('a child’s parents, chosen', () => {
  const jane = sim('Jane', 'Young Adult');
  const star = sim('Star', 'Adult', { sur: 'Okafor' });
  const skip = sim('Skip', 'Adult', { sur: 'Ito' });
  const mia = sim('Mia', 'Teen');
  const tot = sim('Tot', 'Toddler');
  const rex = sim('Rex', 'Adult', { species: 'Dog', sur: '' });
  const gran = sim('Gran', 'Elder', { state: 'Deceased' });
  const bump = sim('Bump', 'Unknown', { added: true, first: '' });
  const newbie = sim('Newbie', 'Unknown', { added: true });
  const away = sim('Agora', 'Adult', { gid: 'W||Pancakes', hh: 'Pancakes', sur: 'Pancakes' });
  const nodes = [jane, star, skip, mia, tot, rex, gran, bump, newbie, away];
  const unborn = new Set(['Bump']);

  it('lets any living sim a teen or older be one, or a planned sim with no stage yet', () => {
    assert.deepEqual(
      nodes.filter((n) => canParent(n, unborn)).map((n) => n.id),
      ['Jane', 'Star', 'Skip', 'Mia', 'Newbie', 'Agora'],
    );
  });

  it('warns about a teen, never blocks', () => {
    assert.match(parentWarning(mia, 'born') ?? '', /needs a mod/);
    assert.match(parentWarning(mia, 'adopted') ?? '', /young adults and older adopt/);
    assert.equal(parentWarning(jane, 'born'), null);
  });

  it('lists the household’s, oldest stage first, then A to Z', () => {
    assert.deepEqual(
      householdParents(nodes, 'W||Rivera', unborn).map((n) => n.id),
      ['Skip', 'Star', 'Jane', 'Mia', 'Newbie'],
    );
  });

  it('finds anyone else by name, not those listed already', () => {
    assert.deepEqual(parentSearch(nodes, 'ago', new Set(), unborn).map((n) => n.id), ['Agora']);
    assert.deepEqual(parentSearch(nodes, 'riv', new Set(['Jane']), unborn).map((n) => n.id), ['Mia', 'Newbie']);
    assert.deepEqual(parentSearch(nodes, 'tot', new Set(), unborn), []);
    assert.deepEqual(parentSearch(nodes, '  ', new Set(), unborn), []);
  });

  it('asks the last name only when there is more than one', () => {
    assert.deepEqual(childSurnames([jane, skip], nodes, 'Rivera'), ['Rivera', 'Ito']);
    assert.deepEqual(childSurnames([jane, mia], nodes, 'Rivera'), ['Rivera']);
    assert.deepEqual(childSurnames([star], nodes, 'Rivera'), ['Okafor']);
    // No parent: the household's own, its name first.
    const home = [jane, star, skip, rex];
    assert.deepEqual(childSurnames([], home, 'Rivera'), ['Rivera', 'Ito', 'Okafor']);
    assert.deepEqual(childSurnames([], [jane], 'Rivera'), ['Rivera']);
    assert.deepEqual(childSurnames([], [rex], 'Rivera'), ['Rivera']);
    // The name in the household's own first, then the most common there.
    const watsons = [sim('T', 'Adult', { sur: 'Watson' }), sim('R', 'Adult', { sur: 'Watson' }), sim('M', 'Unknown', { sur: 'Moody' }), sim('A', 'Adult', { sur: 'Ali' })];
    assert.deepEqual(childSurnames([], watsons, 'Watson Family'), ['Watson', 'Ali', 'Moody']);
    assert.deepEqual(childSurnames([], [...watsons, sim('M2', 'Teen', { sur: 'Moody' })], 'Hilltop'), ['Moody', 'Watson', 'Ali']);
    const pair = [sim('D', 'Elder', { sur: 'McMillan' }), sim('I', 'Elder', { sur: 'Moody' })];
    assert.deepEqual(childSurnames([], pair, 'Moody & McMillan'), ['Moody', 'McMillan']);
  });
});
