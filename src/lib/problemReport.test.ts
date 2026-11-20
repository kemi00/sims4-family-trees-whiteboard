import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NOT_IN_WORLD } from './constants.ts';
import { problemReport, problemReportFromDraft, type ProblemReportInput } from './problemReport.ts';
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

  it('names each world’s own game, not the game its sims came from', () => {
    // The sims here are from the Base Game; the line names the world's game all the same.
    assert.match(text, /Willow Creek: 2 \/ 1 \/ 2 of \d+ · Base Game/);
  });

  it('says whether the browser was translating the page', () => {
    assert.match(text, /Page not translated by the browser/);
    const translated = problemReport(input({ env: { ...input().env, translated: 'uk', translateFixes: 3 } }));
    assert.match(translated, /Page translated by the browser to uk · the board stepped around swapped text 3 times/);
    const withError = problemReport(
      input({ errors: [{ at: '2026-11-20T09:59:00.000Z', message: 'NotFoundError: gone', crash: true, translated: 'uk' }] }),
    );
    assert.match(withError, /\(the page went blank\) \(page translated to uk\) NotFoundError: gone/);
  });

  it('lists recent errors, or says there are none', () => {
    assert.match(text, /Recent errors: none/);
    const withError = problemReport(input({ errors: [{ at: '2026-11-20T09:59:00.000Z', message: 'TypeError: x is undefined', where: 'index-abc.js:1:200' }] }));
    assert.match(withError, /TypeError: x is undefined @ index-abc\.js:1:200/);
  });
});

describe('problemReportFromDraft', () => {
  const base = {
    build: 'abc1234',
    now: new Date('2026-11-20T10:00:00.000Z'),
    env: { userAgent: 'TestBrowser/1', languages: ['uk-UA'], screen: '1x1', viewport: '1x1', dpr: 1, touchPoints: 0, pointer: 'fine' },
    errors: [{ at: '2026-11-20T09:59:00.000Z', message: 'TypeError: x is undefined', where: 'index-abc.js:1:200', components: 'ConnectMenu < App', crash: true as const }],
  };

  it('reports the crash and the board the browser kept, with no names', () => {
    const draft = JSON.stringify(input());
    const text = problemReportFromDraft(draft, base);
    assert.match(text, /\(the page went blank\) TypeError: x is undefined @ index-abc\.js:1:200 in ConnectMenu < App/);
    assert.match(text, /Board: 3 cards/);
    for (const secret of ['Quillon', 'Zephyrine', 'Velvetorium']) assert.ok(!text.includes(secret), secret);
  });

  it('says what the crash screen can’t know, instead of counting it as none', () => {
    const text = problemReportFromDraft(JSON.stringify(input()), base);
    assert.match(text, /Willow Creek: 2 \/ 1 \/ \? of \d+/);
    assert.match(text, /free lots are shown as \?/);
    assert.match(text, /Layers: not known from the crash screen/);
  });

  it('skips what is broken in the board it was given, never throwing', () => {
    const broken = JSON.stringify({ nodes: [{ id: 'a', gid: 'W||X', world: 'W' }, null, 7], edges: [{ id: 'e', a: 'a', b: 'zz', type: 'marriage' }, null], groups: [null] });
    const text = problemReportFromDraft(broken, base);
    assert.match(text, /Board: 1 card /);
    assert.match(text, /links to a missing card 1/);
  });

  it('still reports the browser and the crash with no readable board', () => {
    const text = problemReportFromDraft('not json', base);
    assert.match(text, /Board: 0 cards/);
    assert.match(text, /the page went blank/);
  });
});
