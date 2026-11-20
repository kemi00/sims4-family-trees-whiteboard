import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { gamesMissingFromSave, lifeStatesOffered, packIconUrl, worldPack, worldPackIconUrl } from './packs.ts';

const seed = JSON.parse(readFileSync(new URL('../data/whiteboard.json', import.meta.url), 'utf8')) as {
  nodes: { pack: string }[];
  worlds: { name: string }[];
};
const file = (url: string | undefined) => new URL(`../../public${url}`, import.meta.url);

describe('the games’ icons', () => {
  it('has one for every game on the starter board, each file there', () => {
    for (const pack of new Set(seed.nodes.map((n) => n.pack))) {
      const url = packIconUrl(pack);
      assert.ok(url, `${pack} has no icon`);
      assert.ok(existsSync(file(url)), `${pack}: ${url} is missing`);
    }
  });

  it('knows the game of every world but Not in any world', () => {
    for (const { name } of seed.worlds) {
      if (name === 'Not in any world') assert.equal(worldPack(name), undefined);
      else assert.ok(worldPackIconUrl(name), `${name} has no game`);
    }
    assert.equal(worldPack('Newcrest'), 'Base Game');
    assert.equal(worldPack('Tomarang'), 'For Rent');
  });

  it('has none for a game it doesn’t know', () => {
    assert.equal(packIconUrl('A Pack Yet To Come'), undefined);
  });
});

describe('the games a save has', () => {
  it('lacks a game when none of its worlds are in the save, and Seasons with a calendar of days', () => {
    const missing = gamesMissingFromSave(['Willow Creek', 'Ondarion', 'Brindleton Bay'], 'days');
    assert.ok(!missing.includes('Base Game'));
    assert.ok(!missing.includes('Royalty & Legacy'));
    assert.ok(!missing.includes('Cats & Dogs'));
    assert.ok(missing.includes('Horse Ranch'));
    assert.ok(missing.includes('Seasons'));
    // A game with no world of its own can't be told: never listed.
    assert.ok(!missing.includes('Paranormal Stuff'));
    assert.ok(!gamesMissingFromSave(['Oasis Springs'], 'seasons').includes('Seasons'));
  });

  it('offers only the life states of the player’s games, and the sim’s own', () => {
    const states = ['Sim', 'Ghost', 'Vampire', 'Mermaid', 'Werewolf'];
    const has = (p: string) => p === 'Island Living';
    assert.deepEqual(lifeStatesOffered(states, has, 'Sim'), ['Sim', 'Ghost', 'Mermaid']);
    assert.deepEqual(lifeStatesOffered(states, has, 'Vampire'), ['Sim', 'Ghost', 'Vampire', 'Mermaid']);
  });
});
