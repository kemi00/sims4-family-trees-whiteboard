import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { filterCounts } from './filterCount.ts';

const none = {
  hiddenPacks: new Set<string>(),
  packCounts: new Map<string, number>([['Base Game', 20], ['Get Famous', 4]]),
  hiddenPlay: new Set<string>(),
  hiAges: new Set<string>(),
  hiSingle: false,
  bloodlineId: null,
  hideSecrets: false,
  hideDeceased: false,
};

describe('the Filters count', () => {
  it('is zero with nothing on', () => {
    assert.deepEqual(filterCounts(none), { games: 0, play: 0, highlight: 0, total: 0 });
  });

  it('counts a hidden game only when it hides someone', () => {
    assert.equal(filterCounts({ ...none, hiddenPacks: new Set(['Get Famous', 'Horse Ranch']) }).games, 1);
  });

  it('adds every filter that is on', () => {
    const c = filterCounts({
      ...none,
      hiddenPlay: new Set(['NPC']),
      hiAges: new Set(['Teen', 'Elder']),
      hiSingle: true,
      bloodlineId: 'bella',
      hideSecrets: true,
    });
    assert.deepEqual(c, { games: 0, play: 1, highlight: 3, total: 6 });
  });
});
