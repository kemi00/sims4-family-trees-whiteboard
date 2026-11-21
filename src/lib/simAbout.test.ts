import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { aboutView, skillLevel, type GameNames } from './simAbout.ts';

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
    assert.deepEqual([v.personality, v.earned, v.aspiration], [['Bookworm', 'Creative'], ['Quick Learner'], 'Renaissance Sim']);
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
