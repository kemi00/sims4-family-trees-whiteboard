import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NON_BINARY } from './constants.ts';
import { currentTitles, gameNobleTitle, nobleTitle, titleSource, topTitle, withGameTitle, withTreeTitle } from './titles.ts';
import type { SimTitle } from '../types/whiteboard.ts';

describe('noble titles', () => {
  it("words each rank as the game does, in the sim's own form", () => {
    assert.equal(nobleTitle(9, 'Male'), 'Grand Duke');
    assert.equal(nobleTitle(9, 'Female'), 'Grand Duchess');
    assert.equal(nobleTitle(9, NON_BINARY), 'Grand Duchum');
    assert.equal(nobleTitle(1, 'Female'), 'Dame');
    assert.equal(nobleTitle(10, 'Female'), 'Queen');
    assert.equal(nobleTitle(9, 'Female', true), 'Lady');
    assert.equal(nobleTitle(10, 'Male', true), 'Prince');
    assert.equal(nobleTitle(11, 'Male'), undefined);
  });

  it('gives the highest of career, marriage and birth, the own career first at a tie', () => {
    // Thiago Abrantes: a Duke by career, married to a Grand Duchess.
    assert.deepEqual(gameNobleTitle({ gender: 'Male', career: 8, spouses: [{ id: 'cordelia', rank: 9 }], parents: [] }), {
      title: 'Grand Duke',
      rank: 9,
      game: 'marriage',
      via: 'cordelia',
    });
    assert.deepEqual(gameNobleTitle({ gender: 'Female', career: 9, spouses: [{ id: 's', rank: 9 }], parents: [] }), {
      title: 'Grand Duchess',
      rank: 9,
      game: 'career',
    });
    // A Grand Duke's daughter is a Lady.
    assert.deepEqual(gameNobleTitle({ gender: 'Female', spouses: [], parents: [{ id: 'tybalt', rank: 9 }] }), {
      title: 'Lady',
      rank: 9,
      game: 'birth',
      via: 'tybalt',
    });
    assert.equal(gameNobleTitle({ gender: 'Female', spouses: [], parents: [] }), undefined);
  });

  it('keeps an unchanged title, ends one the game takes, and dates the next from the second upload on', () => {
    const duke: SimTitle = { title: 'Duke', rank: 8, game: 'career' };
    const grand: SimTitle = { title: 'Grand Duke', rank: 9, game: 'career' };
    assert.deepEqual(withGameTitle([duke], { ...duke }, 5), [duke]);
    assert.deepEqual(withGameTitle([duke], grand, 5), [{ ...duke, to: 5 }, { ...grand, from: 5 }]);
    // First upload: no day to date it by, and nothing kept of a title never seen.
    assert.deepEqual(withGameTitle(undefined, grand, undefined), [grand]);
    // Their own titles stay, whatever the game says.
    const own: SimTitle = { title: 'High Priestess', rank: 3 };
    assert.deepEqual(withGameTitle([own, duke], undefined, 7), [own, { ...duke, to: 7 }]);
    assert.deepEqual(withGameTitle([own], undefined, 7), [own]);
  });

  it('keeps a tree ancestor’s title beside titles of your own', () => {
    const own: SimTitle = { title: 'Founder' };
    assert.deepEqual(withTreeTitle([own], { title: 'Queen', realm: 'Ondarion', rank: 10 }), [
      own,
      { title: 'Queen', realm: 'Ondarion', rank: 10, game: 'tree' },
    ]);
  });

  it('shows the highest title held now, and says where each comes from', () => {
    const titles: SimTitle[] = [
      { title: 'Knight', rank: 1, game: 'career', to: 3 },
      { title: 'Founder' },
      { title: 'Countess', rank: 5, game: 'career' },
    ];
    assert.equal(topTitle({ titles })?.title, 'Countess');
    assert.deepEqual(currentTitles({ titles }).map((t) => t.title), ['Countess', 'Founder']);
    const nameOf = (id: string) => (id === 't' ? 'Tybalt Capp' : undefined);
    assert.equal(titleSource({ title: 'Lady', rank: 9, game: 'birth', via: 't' }, nameOf), 'As the child of Tybalt Capp, rank 9');
    assert.equal(titleSource({ title: 'Grand Duke', rank: 9, game: 'marriage', via: 'x' }, nameOf), 'By marriage, rank 9');
    assert.equal(titleSource({ title: 'Founder' }, nameOf), '');
  });
});
