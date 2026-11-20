import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { entryAbout, FIRST_CHAPTER, storyDays, type ChronicleEntry } from './chronicle.ts';
import { firstChapter, whenAt } from './firstChapter.ts';
import { TICKS_PER_DAY } from './lifeClock.ts';
import { mergeSaveIntoBoard, seedNameKeysFromNodes } from './savegame/mergeSave.ts';
import type { ParsedSave } from './savegame/parseSave.ts';
import type { Edge, SimNode } from '../types/whiteboard.ts';

const worlds = [
  { name: 'Willow Creek', color: '#4e79a7' },
  { name: 'Not in any world', color: '#9aa0a6' },
];

function card(first: string, sur: string, hh: string, extra: Partial<SimNode> = {}): SimNode {
  return {
    id: `${first} ${sur}`,
    first,
    sur,
    gid: `Willow Creek||${hh}`,
    age: 'Young Adult',
    state: 'Sim',
    gender: 'Female',
    hh,
    world: 'Willow Creek',
    nb: '-',
    color: '#4e79a7',
    townie: false,
    oworld: 'Willow Creek',
    onb: '-',
    ohh: hh,
    oplay: 'Resident',
    pack: 'Base Game',
    x: 0,
    y: 0,
    w: 0,
    h: 0,
    ...extra,
  };
}

/** The game's start: the roster. */
const roster: SimNode[] = [
  card('Bob', 'Pancakes', 'Pancakes', { gender: 'Male' }),
  card('Eliza', 'Pancakes', 'Pancakes'),
  card('Mortimer', 'Goth', 'Goth', { gender: 'Male', age: 'Adult' }),
  card('Bella', 'Goth', 'Goth', { age: 'Adult' }),
  card('Agnes', 'Crumplebottom', 'Crumplebottom', { age: 'Elder' }),
  card('Lonely', 'Wolf', 'Wolf'),
  // Never in a save, or not where the roster puts them: no news when missing.
  card('Grim', 'Reaper', 'Grim Reaper', { oplay: 'NPC', world: 'Not in any world', gid: 'Not in any world||Grim Reaper' }),
  card('Kitty', 'Lu', 'Lu', { oplay: 'Tenant', pack: 'For Rent' }),
];
const rosterEdges: Edge[] = [
  { id: 'e1', a: 'Bob Pancakes', b: 'Eliza Pancakes', type: 'marriage' },
  { id: 'e2', a: 'Mortimer Goth', b: 'Bella Goth', type: 'marriage' },
];
const seed = { nodes: roster, edges: rosterEdges, groups: [] };

const CLOCK = 3 * TICKS_PER_DAY + 1000;
const BORN = 2 * TICKS_PER_DAY + 500;
const parsed: ParsedSave = {
  sims: [
    { saveSimId: '1', householdId: '10', first: 'Bob', last: 'Pancakes', household: 'Pancakes', age: 'Young Adult', gender: 'Male', world: 'Willow Creek' },
    // Eliza grew up.
    { saveSimId: '2', householdId: '10', first: 'Eliza', last: 'Pancakes', household: 'Pancakes', age: 'Adult', gender: 'Female', world: 'Willow Creek' },
    // A baby born in play, with the time alive the save keeps.
    {
      saveSimId: '6',
      householdId: '10',
      first: 'Bebe',
      last: 'Pancakes',
      household: 'Pancakes',
      age: 'Infant',
      gender: 'Female',
      world: 'Willow Creek',
      bornInPlay: true,
      aliveTicks: CLOCK - BORN,
      stageDays: 0.5,
    },
    { saveSimId: '3', householdId: '20', first: 'Mortimer', last: 'Goth', household: 'Goth', age: 'Adult', gender: 'Male', world: 'Willow Creek' },
    // Bella divorced Mortimer and lives on her own.
    { saveSimId: '4', householdId: '30', first: 'Bella', last: 'Goth', household: 'Bella', age: 'Adult', gender: 'Female', world: 'Willow Creek' },
    { saveSimId: '5', householdId: '40', first: 'Agnes', last: 'Crumplebottom', household: 'Crumplebottom', age: 'Elder', gender: 'Female', world: 'Willow Creek' },
    // A townie the game made.
    { saveSimId: '7', householdId: '50', first: 'Tina', last: 'Townie', household: 'Townie', age: 'Adult', gender: 'Female', world: 'Willow Creek', generated: true },
  ],
  rels: [
    { a: '1', b: '2', type: 'marriage' },
    { a: '3', b: '4', type: 'divorced' },
    // A romance across households.
    { a: '3', b: '5', type: 'romance' },
    { a: '1', b: '6', type: 'parent' },
    { a: '2', b: '6', type: 'parent' },
  ],
  game: { clock: CLOCK, lifespan: 'Normal', playedHouseholds: ['10'] },
};

function replaced() {
  let n = 0;
  return mergeSaveIntoBoard({
    nodes: [],
    edges: [],
    groups: [],
    worlds,
    parsed,
    seedNameKeys: seedNameKeysFromNodes(roster),
    packReference: roster,
    rosterEdges,
    now: '2026-11-20T12:00:00.000Z',
    nextEdgeId: () => `v${n++}`,
  });
}

describe('the story’s first chapter', () => {
  const after = replaced();
  const chapter = firstChapter({ seed, worlds, parsed, after: { nodes: after.nodes, edges: after.edges, saveGame: after.saveGame } })!;
  const name = (id: string) => after.nodes.find((n) => n.id === id)?.first;

  it('tells what the save remembers, against the game’s start', () => {
    assert.ok(chapter.remembered);
    assert.deepEqual(
      chapter.born.map((b) => [b.name, b.parents, b.when]),
      [['Bebe Pancakes', ['Bob Pancakes', 'Eliza Pancakes'], 'Day 3']],
    );
    assert.deepEqual(chapter.grew.map((g) => [g.name, g.from, g.to]), [['Eliza Pancakes', 'Young Adult', 'Adult']]);
    assert.deepEqual(chapter.together.map((t) => [name(t.a.id), name(t.b.id), t.type, t.standing]), [['Mortimer', 'Agnes', 'romance', true]]);
    assert.deepEqual(chapter.apart.map((t) => [t.type, t.standing]), [['divorced', true]]);
    assert.deepEqual(chapter.moved.map((m) => m.name), ['Bella Goth']);
    assert.equal(chapter.met, 1);
  });

  it('counts a resident the save no longer has, never an NPC or a tenant', () => {
    assert.deepEqual(chapter.gone?.map((g) => g.sim.name), ['Lonely Wolf']);
  });

  it('opens the story under its own heading, and each story finds its part', () => {
    const entry: ChronicleEntry = {
      at: '2026-11-20T12:00:00.000Z',
      game: { clock: CLOCK },
      start: { sims: 7, households: 5 },
      recap: (({ celebrate: _c, ...r }) => r)(chapter),
    };
    const later: ChronicleEntry = { at: '2026-11-21T12:00:00.000Z', game: { clock: CLOCK }, recap: { ...entry.recap!, remembered: undefined } };
    const days = storyDays([later, entry]);
    assert.deepEqual(days.map((d) => [d.when, !!d.remembered]), [['Day 4', false], [FIRST_CHAPTER, true]]);
    // The Pancakes' story has the birth and Eliza growing up, not the Goths' divorce.
    const pancakes = new Set(after.nodes.filter((n) => n.sur === 'Pancakes').map((n) => n.id));
    const theirs = entryAbout(entry, pancakes)!.recap!;
    assert.deepEqual([theirs.born.length, theirs.grew.length, theirs.apart.length], [1, 1, 0]);
  });
});

describe('when a tick was', () => {
  it('says the day, or the season’s day with Seasons', () => {
    assert.equal(whenAt({}, 2 * TICKS_PER_DAY + 5), 'Day 3');
    const game = { season: 'Summer' as const, seasonSince: 7 * TICKS_PER_DAY, seasonDays: 7 };
    assert.equal(whenAt(game, 8 * TICKS_PER_DAY), 'Summer, day 2 of 7 · Year 1');
    // Before the season the save is in: the one before it.
    assert.equal(whenAt(game, 2 * TICKS_PER_DAY), 'Spring, day 3 of 7 · Year 1');
  });
});
