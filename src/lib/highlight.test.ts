import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { SimNode } from '../types/whiteboard.ts';
import { HI_NO_CHILDREN, HI_NOT_BORN, hiDynastyChip } from './constants.ts';
import { highlightActive, highlightPhrase, highlightSummary } from './highlight.ts';

const sim = (id: string, extra: Partial<SimNode>): SimNode =>
  ({ id, first: id, sur: 'X', age: 'Adult', gender: 'Female', state: 'Sim', pack: 'Base Game', ...extra }) as SimNode;

describe('the highlight in words', () => {
  it('names what the chips pick', () => {
    assert.equal(highlightPhrase(new Set(['Female', 'Infant']), false, 12), 'female infants');
    assert.equal(highlightPhrase(new Set(['Female', 'Infant']), false, 1), 'female infant');
    assert.equal(highlightPhrase(new Set(['Male', 'Elder', 'Teen']), true, 5), 'single male teens and elders');
    assert.equal(highlightPhrase(new Set(['Child', 'Toddler']), false, 1), 'toddler or child');
    assert.equal(highlightPhrase(new Set(['Female']), false, 30), 'female sims');
    assert.equal(highlightPhrase(new Set(), true, 2), 'single sims');
    assert.equal(highlightPhrase(new Set(['Cat', 'Female']), false, 3), 'female cats');
    assert.equal(highlightPhrase(new Set(['Infant', 'Dog']), false, 4), 'infants, plus dogs');
    assert.equal(highlightPhrase(new Set(['Female', 'Male', 'Adult']), false, 9), 'female or male adults');
    assert.equal(
      highlightPhrase(new Set(['Female', 'Young Adult', HI_NO_CHILDREN, hiDynastyChip('member')]), true, 4),
      'single female young adults with no children who are dynasty members with no role',
    );
    assert.equal(
      highlightPhrase(new Set([hiDynastyChip('head'), hiDynastyChip('heir')]), false, 1),
      'sim who is a dynasty head or heir',
    );
    assert.equal(highlightPhrase(new Set([HI_NO_CHILDREN]), false, 7), 'sims with no children');
    assert.equal(highlightPhrase(new Set([HI_NOT_BORN]), false, 3), 'babies not born yet');
    assert.equal(highlightPhrase(new Set([HI_NOT_BORN, 'Infant']), false, 1), 'baby not born yet or infant');
  });

  it('is on when any chip is', () => {
    assert.equal(highlightActive(new Set(), false), false);
    assert.equal(highlightActive(new Set(), true), true);
    assert.equal(highlightActive(new Set(['Teen']), false), true);
  });
});

describe('the highlight count', () => {
  const nodes = [
    sim('a', { age: 'Infant' }),
    sim('b', { age: 'Infant' }),
    sim('c', { age: 'Infant', gender: 'Male' }),
    sim('d', { age: 'Infant', state: 'Deceased' }),
    sim('e', { age: 'Infant', pack: 'Hidden' }),
    sim('f', { age: 'Elder' }),
  ];
  it('counts shown matches and the deceased among them', () => {
    const s = highlightSummary({
      nodes,
      shown: (n) => n.pack !== 'Hidden',
      hi: new Set(['Female', 'Infant']),
      hiSingle: false,
      partnered: new Set(),
    });
    assert.deepEqual(s, { count: 3, deceased: 1, shown: 5, phrase: 'female infants' });
  });
});
