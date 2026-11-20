import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { prestigeLevel, prestigeLevelText, prestigeProgress, prestigeProgressText, standingText } from './prestige.ts';

describe('Prestige Level', () => {
  it('counts levels as the game does, from where each starts', () => {
    assert.equal(prestigeLevel(0), 0);
    assert.equal(prestigeLevel(99.9), 0);
    assert.equal(prestigeLevel(100), 1);
    assert.equal(prestigeLevel(16100), 7);
    assert.equal(prestigeLevel(22404.6), 8, 'the Thebes, eight stars in the game');
    assert.equal(prestigeLevel(32239.5), 10);
  });

  it('says a dynasty’s standing in the game’s words', () => {
    assert.equal(prestigeLevelText({ prestige: 22404.6, perkPoints: 0, perks: 19 }), 'Prestige Level 8');
    assert.equal(prestigeLevelText({ perkPoints: 375 }), null, 'an older board knows only perk points');
    assert.equal(
      standingText({ prestige: 22404.6, perkPoints: 0, perks: 19 }),
      'Prestige Level 8 (22,404 prestige), 26% of Prestige Level 9 · 0 perk points to spend · 19 perks active',
    );
  });

  it('says how far into a level, rounded down as the game does', () => {
    assert.equal(prestigeProgressText(17383.7), '25% of Prestige Level 8', 'the Capps, as the game showed');
    assert.equal(prestigeProgressText(21100), '0% of Prestige Level 9');
    assert.equal(prestigeProgress(32239.5), null, 'nothing past Level 10');
    assert.equal(prestigeProgressText(32239.5), null);
  });
});
