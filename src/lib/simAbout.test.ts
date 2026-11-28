import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { aboutView, gameDeathIconOf, gameDeathOf, sayFor, skillLevel, type GameNames } from './simAbout.ts';

const MAJOR = [100, 1440, 2160, 3600, 5280, 7200, 10140, 13440, 17100, 21120];
const names: GameNames = {
  skillLevels: { '0': MAJOR, '1': MAJOR.slice(0, 5) },
  traits: { '16850': ['Creative', 'p'], '27916': ['Bookworm', 'p'], '27086': ['Quick Learner', 'e'] },
  skills: { '16714': ['Writing', 0], '1': ['Dancing', 1], '2': ['Potty', 6] },
  tracks: {
    '29960': ['Writer', ["Writer's Assistant", 'Blogger', 'Freelance Article Writer', 'Advice Columnist', 'Regular Contributor'], 10],
    '12897': ['Astronaut', ['Space Cadet'], 10],
    '12898': ['Space Ranger', ['Planet Patrol', 'Sheriff of the Stars', 'Space Ranger'], 10, '12897'],
    '9546': ['High School Student', ['High School F Student', 'High School D Student', 'High School C Student'], 5],
    '209993': ['University student', [], 0],
    '209992': ['University student', [], 0],
  },
  aspirations: { '25440': 'Renaissance Sim' },
};

describe('skill levels', () => {
  it('counts the steps reached, as the game does: 100 points is level 1, all ten steps level 10', () => {
    assert.equal(skillLevel(0, MAJOR), 0);
    assert.equal(skillLevel(100, MAJOR), 1);
    assert.equal(skillLevel(1540, MAJOR), 2);
    assert.equal(skillLevel(7300, MAJOR), 4);
    assert.equal(skillLevel(81580, MAJOR), 10);
    assert.equal(skillLevel(81579.995, MAJOR), 10);
  });
});

describe('what the Life tab shows', () => {
  it('names a job with its title and level, a branch under its career, and school by grade', () => {
    const v = aboutView(
      { jobs: [{ track: '29960', at: 2, level: 3 }, { track: '12898', at: 1, level: 8 }, { track: '9546', at: 2, level: 3 }] },
      names,
    );
    assert.deepEqual(v.jobs, [
      { name: 'Writer', title: 'Freelance Article Writer', level: 3, top: 10 },
      { name: 'Astronaut', branch: 'Space Ranger', title: 'Sheriff of the Stars', level: 8, top: 10 },
      { name: 'High School Student', title: 'High School C Student', level: 3, top: 5, grade: 'C' },
    ]);
  });

  it('lists university once, with no level', () => {
    const v = aboutView({ jobs: [{ track: '209993', at: 0, level: 1 }, { track: '209992', at: 0, level: 1 }] }, names);
    assert.deepEqual(v.jobs, [{ name: 'University student', level: 1, top: 0 }]);
  });

  it('splits personality from earned traits, and leaves out what the names don’t cover', () => {
    const v = aboutView({ traits: ['27086', '27916', '16850', '361823'], aspiration: '25440' }, names);
    assert.deepEqual(
      [v.personality, v.earned, v.aspiration],
      [[{ name: 'Bookworm' }, { name: 'Creative' }], [{ name: 'Quick Learner' }], 'Renaissance Sim'],
    );
  });

  it('gives each item the game’s icon where it has one, a branch its career’s when it has none', () => {
    const v = aboutView(
      {
        jobs: [{ track: '12898', at: 1, level: 5 }, { track: '29960', at: 0, level: 1 }],
        traits: ['27086', '16850'],
        skills: [{ id: '16714', points: 7300 }, { id: '1', points: 1540 }],
        aspiration: '25440',
      },
      { ...names, icons: new Set(['12897', '27086', '16714', '25440']) },
    );
    assert.deepEqual(
      v.jobs.map((j) => [j.name, j.icon]),
      [['Astronaut', '12897'], ['Writer', undefined]],
    );
    assert.deepEqual([v.personality, v.earned], [[{ name: 'Creative' }], [{ name: 'Quick Learner', icon: '27086' }]]);
    assert.deepEqual(v.skills.map((s) => [s.name, s.icon]), [['Writing', '16714'], ['Dancing', undefined]]);
    assert.equal(v.aspirationIcon, '25440');
  });

  it('orders skills highest first, with no level where the steps aren’t known, and none under level 1', () => {
    const v = aboutView(
      { skills: [{ id: '1', points: 1540 }, { id: '16714', points: 7300 }, { id: '2', points: 300 }, { id: '999', points: 5000 }] },
      names,
    );
    assert.deepEqual(v.skills, [
      { name: 'Writing', level: 4, max: 10 },
      { name: 'Dancing', level: 2, max: 5 },
      { name: 'Potty', level: null, max: null },
    ]);
    assert.deepEqual(aboutView({ skills: [{ id: '16714', points: 40 }] }, names).skills, []);
  });

  it('is empty with nothing from a save', () => {
    assert.deepEqual(aboutView(undefined, names), { jobs: [], personality: [], earned: [], skills: [] });
  });
});

describe('names with both forms', () => {
  it('gives a male or female sim theirs, and never picks one for anyone else', () => {
    assert.equal(sayFor('{M0.Patriarch}{F0.Matriarch}', 'Male'), 'Patriarch');
    assert.equal(sayFor('{M0.Patriarch}{F0.Matriarch}', 'Female'), 'Matriarch');
    assert.equal(sayFor('World-Renowned {F0.Actress}{M0.Actor}', 'Male'), 'World-Renowned Actor');
    assert.equal(sayFor('{M0.Patriarch}{F0.Matriarch}', 'Non-Binary'), 'Patriarch/Matriarch');
    assert.equal(sayFor('Fisher{M0.man}{F0.woman}', 'Non-Binary'), 'Fisher');
    assert.equal(sayFor('Fisher{M0.man}{F0.woman}', 'Female'), 'Fisherwoman');
    assert.equal(sayFor('Pizza Delivery {M0.Guy}{F0.Girl}'), 'Pizza Delivery Guy/Girl');
    assert.equal(sayFor('Writer'), 'Writer');
  });

  it('names a job, trait and aspiration for the sim', () => {
    const v = aboutView(
      { traits: ['1'], aspiration: '2', jobs: [{ track: '3', at: 0, level: 1 }] },
      {
        ...names,
        traits: { '1': ['{M0.Patriarch}{F0.Matriarch}', 'e'] },
        aspirations: { '2': '{F0.Lady}{M0.Lord} of the Knits' },
        tracks: { '3': ['Fisher{M0.man}{F0.woman}', ['Goldfish Hunter'], 3] },
      },
      'Female',
    );
    assert.deepEqual([v.earned, v.aspiration, v.jobs[0]?.name], [[{ name: 'Matriarch' }], 'Lady of the Knits', 'Fisherwoman']);
  });
});

describe('a death the game names, or a mod made', () => {
  const names: GameNames = {
    skillLevels: {},
    traits: { '16850': ['Creative', 'p'] },
    skills: {},
    tracks: {},
    aspirations: {},
    deaths: { '379066': 'Broken Heart', '101685': 'Old Age' },
    icons: new Set(['379066']),
  };

  it('names a death the game knows, with its icon when there is one', () => {
    const bella = { about: { traits: ['16850', '379066'] } };
    assert.equal(gameDeathOf(bella, names), 'Broken Heart');
    assert.equal(gameDeathIconOf(bella, names), '379066');
    assert.deepEqual(aboutView(bella.about, names).death, { name: 'Broken Heart', icon: '379066' });
    // Old Age has a name but no icon: the name stands alone.
    assert.deepEqual(aboutView({ traits: ['101685'] }, names).death, { name: 'Old Age' });
    assert.equal(gameDeathIconOf({ about: { traits: ['101685'] } }, names), undefined);
  });

  it('says nothing, and breaks nothing, for a death a mod made', () => {
    // A modded ghost trait the names don't know: no cause, no icon, no Death row; the player's words do.
    const modded = { deathTrait: '9876543210', about: { traits: ['16850', '9876543210'] } };
    assert.equal(gameDeathOf(modded, names), null);
    assert.equal(gameDeathIconOf(modded, names), undefined);
    const v = aboutView(modded.about, names);
    assert.equal(v.death, undefined);
    assert.deepEqual(v.personality, [{ name: 'Creative' }]);
    // Names built before deaths were read, or not loaded yet.
    assert.equal(gameDeathIconOf(modded, { ...names, deaths: undefined }), undefined);
    assert.equal(gameDeathOf(modded, null), null);
  });
});
