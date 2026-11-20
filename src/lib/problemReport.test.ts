import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NOT_IN_WORLD } from './constants.ts';
import { problemReport, type ProblemReportInput } from './problemReport.ts';
import type { Edge, Group, SaveGameInfo, SimNode } from '../types/whiteboard.ts';

const card = (over: Partial<SimNode>): SimNode =>
  ({
    id: 'a', gid: 'Willow Creek||Zephyrine', first: 'Quillon', sur: 'Zephyrine', age: 'Adult', state: 'Normal',
    gender: 'Female', hh: 'Zephyrine', world: 'Willow Creek', nb: 'Garden District', lot: 'Brook Bungalow',
    color: '#fff', townie: false, oworld: 'Willow Creek', onb: '-', ohh: 'Zephyrine', oplay: '', pack: 'Base Game',
    x: 0, y: 0, w: 10, h: 10, saveSimId: '1', dynasty: 'Marigoldia', ...over,
  }) as SimNode;

/** A board whose every name, note and file name is one the report must never show. */
function input(over: Partial<ProblemReportInput> = {}): ProblemReportInput {
  const nodes = [
    card({}),
    card({ id: 'b', first: 'Thessaly', saveSimId: '2' }),
    card({ id: 'c', first: 'Quillon', gid: `${NOT_IN_WORLD}||Ombrette`, hh: 'Ombrette', world: NOT_IN_WORLD, lot: 'Pique Hearth', saveSimId: '3' }),
  ];
  const edges: Edge[] = [
    { id: 'e1', a: 'a', b: 'b', type: 'marriage', source: 'save', note: 'Velvetorium secret' } as Edge,
    { id: 'e2', a: 'a', b: 'gone', type: 'parent', source: 'planned' } as Edge,
  ];
  const groups = [{ gid: 'Willow Creek||Zephyrine', hh: 'Zephyrine', world: 'Willow Creek', nb: 'Garden District' }] as Group[];
  const saveGame: SaveGameInfo = {
    fileName: 'Grandmother Opaline Slot.save',
    importedAt: '2026-11-20T09:00:00.000Z',
    clock: 720_000 + 2_160_000 * 11,
    lifespan: 'Normal',
    seasonDays: 14,
    calendar: 'seasons',
    season: 'Winter',
    playedAging: 'Active',
    unplayedAging: false,
    activeHousehold: '42',
    read: {
      sims: 3,
      households: 2,
      unhoused: 0,
      worlds: [
        { id: 8086, stored: 'Віллоу-Крік', world: 'Willow Creek', by: 'id', lots: 21, homes: 1 },
        { id: 15740, stored: 'Oasis Springs', world: 'Oasis Springs', by: 'id', lots: 21, homes: 0 },
      ],
    },
    lastUpload: {
      mode: 'replace', updated: 0, added: 3, toNotInWorld: 1, unhoused: 0, relatives: 0, skipped: 0,
      extraWorlds: ['Office Site'], hidePacks: [],
    },
  };
  return {
    build: 'abc1234',
    now: new Date('2026-11-20T10:00:00.000Z'),
    env: { userAgent: 'TestBrowser/1', languages: ['uk-UA', 'en'], screen: '1440x900', viewport: '1280x720', dpr: 2, touchPoints: 0, pointer: 'fine' },
    nodes,
    edges,
    groups,
    worlds: [{ name: 'Willow Creek', color: '#fff' }, { name: NOT_IN_WORLD, color: '#fff' }],
    saveGame,
    shownWorlds: new Set(['Willow Creek', NOT_IN_WORLD]),
    freeLots: new Map([['Willow Creek', [{}, {}]]]),
    filters: { hiddenPacks: [], hiddenPlay: 0, highlightAges: [], single: false, bloodline: false, hideSecrets: false, hideDeceased: false },
    layers: { groups: true, worlds: true },
    plans: { plannedBabies: 0, offPlanSims: 0, offPlanLinks: 0, issues: 0, logEntries: 0, storyPages: 1 },
    storage: { draftKB: 12, staleTab: false, fromDraft: true },
    errors: [],
    ...over,
  };
}

describe('problemReport', () => {
  const text = problemReport(input());

  it('never shows a name, a note or the file name', () => {
    for (const secret of ['Quillon', 'Thessaly', 'Zephyrine', 'Ombrette', 'Marigoldia', 'Garden District', 'Brook Bungalow', 'Pique Hearth', 'Velvetorium', 'Opaline', '42']) {
      assert.ok(!text.includes(secret), `${secret} is in the report`);
    }
  });

  it('lists a save world stored under another name, with its id and how it was found', () => {
    assert.match(text, /8086 · "Віллоу-Крік" · Willow Creek · id · 21 · 1/);
    assert.match(text, /Save worlds: 2 \(1 found by id under their English name, 0 homes\)/);
    assert.ok(!text.includes('15740'), 'a plain record is only counted');
  });

  it('counts each board world, with its free lots of the game’s', () => {
    assert.match(text, /Willow Creek: 2 \/ 1 \/ 2 of \d+/);
    assert.match(text, new RegExp(`${NOT_IN_WORLD}: 1 / 1`));
  });

  it('says what the browser, game and last upload were', () => {
    assert.match(text, /build abc1234/);
    assert.match(text, /Language uk-UA, en/);
    assert.match(text, /day 12 \(clock \d+\) · "Normal · Winter, day \d+ of 14" · 14-day seasons/);
    assert.match(text, /Last upload \(replace\): 0 cards updated, 3 new, 1 to Not in any world/);
    assert.match(text, /worlds not on the board: Office Site/);
  });

  it('flags what should never happen', () => {
    assert.match(text, /links to a missing card 1/);
    assert.match(text, /cards with a home lot in Not in any world 1/);
    assert.match(text, /full names on more than one card 1 \(2 cards\)/);
  });

  it('lists recent errors, or says there are none', () => {
    assert.match(text, /Recent errors: none/);
    const withError = problemReport(input({ errors: [{ at: '2026-11-20T09:59:00.000Z', message: 'TypeError: x is undefined', where: 'index-abc.js:1:200' }] }));
    assert.match(withError, /TypeError: x is undefined @ index-abc\.js:1:200/);
  });
});
