import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildConnectionLog, canNote, logSection } from './connectionLog.ts';
import type { DeceasedMark, Edge, HouseholdMove, SimNode } from '../types/whiteboard.ts';

function node(id: string, first: string, sur: string): SimNode {
  return {
    id,
    gid: 'Willow Creek||Pancakes',
    first,
    sur,
    age: 'Adult',
    state: 'Sim',
    gender: 'Female',
    hh: 'Pancakes',
    world: 'Willow Creek',
    nb: '-',
    color: '#4e79a7',
    townie: false,
    oworld: 'Willow Creek',
    onb: '-',
    ohh: 'Pancakes',
    oplay: 'Resident',
    pack: '',
    x: 0,
    y: 0,
    w: 0,
    h: 0,
  };
}

describe('buildConnectionLog', () => {
  it('omits seed edges and tags planned vs save', () => {
    const bob = node('Bob Pancakes', 'Bob', 'Pancakes');
    const eliza = node('Eliza Pancakes', 'Eliza', 'Pancakes');
    const byid = { [bob.id]: bob, [eliza.id]: eliza };
    const edges: Edge[] = [
      { id: 'e1', a: bob.id, b: eliza.id, type: 'marriage', source: 'seed' },
      {
        id: 'u1',
        a: bob.id,
        b: eliza.id,
        type: 'romance',
        source: 'planned',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'v1',
        a: bob.id,
        b: eliza.id,
        type: 'custom',
        source: 'save',
        createdAt: '2026-01-02T00:00:00.000Z',
      },
    ];
    const log = buildConnectionLog(edges, byid);
    assert.equal(log.length, 2);
    assert.ok(!log.some((e) => e.edgeIds.includes('e1')));
    assert.equal(log.find((e) => e.id === 'u1')?.origin, 'planned');
    assert.equal(log.find((e) => e.id === 'v1')?.origin, 'save');
  });

  it('names both parents on one line, and keeps a single-parent line', () => {
    const eden = node('Eden Flores', 'Eden', 'Flores');
    const geoff = node('Geoffrey Landgraab', 'Geoffrey', 'Landgraab');
    const lily = node('Lily Flores', 'Lily', 'Flores');
    const hyacinth = node('Hyacinth Flores', 'Hyacinth', 'Flores');
    const byid = {
      [eden.id]: eden,
      [geoff.id]: geoff,
      [lily.id]: lily,
      [hyacinth.id]: hyacinth,
    };
    const edges: Edge[] = [
      {
        id: 'v1',
        a: eden.id,
        b: lily.id,
        type: 'parent',
        source: 'save',
        createdAt: '2026-08-24T20:32:00.000Z',
      },
      {
        id: 'v2',
        a: geoff.id,
        b: lily.id,
        type: 'parent',
        source: 'save',
        createdAt: '2026-08-24T20:32:00.000Z',
      },
      {
        id: 'v3',
        a: eden.id,
        b: hyacinth.id,
        type: 'parent',
        source: 'save',
        createdAt: '2026-08-24T20:32:00.000Z',
      },
    ];
    const log = buildConnectionLog(edges, byid);
    const together = log.find((e) => e.edgeIds.includes('v1'));
    assert.ok(together);
    assert.equal(together.origin, 'save');
    assert.match(together.text, /Eden Flores/);
    assert.match(together.text, /Geoffrey Landgraab/);
    assert.match(together.text, /Lily Flores/);
    assert.equal(log.filter((e) => e.edgeIds.includes('v1')).length, 1);
    const solo = log.find((e) => e.edgeIds.includes('v3'));
    assert.ok(solo);
    assert.match(solo.text, /Eden Flores/);
    assert.match(solo.text, /Hyacinth Flores/);
    assert.doesNotMatch(solo.text, /with /);
  });

  it('splits the log into your plan and your game', () => {
    const bob = node('Bob', 'Bob', 'Pancakes');
    const eliza = node('Eliza', 'Eliza', 'Pancakes');
    const kid = node('Kid', 'Kid', 'Pancakes');
    const byid = { Bob: bob, Eliza: eliza, Kid: kid };
    const edges: Edge[] = [
      { id: 'u1', a: 'Bob', b: 'Eliza', type: 'marriage', source: 'planned' },
      { id: 'u2', a: 'Bob', b: 'Kid', type: 'parent', source: 'planned' },
      { id: 'v1', a: 'Eliza', b: 'Kid', type: 'parent', source: 'save', wasPlanned: true },
      { id: 'v2', a: 'Eliza', b: 'Bob', type: 'custom', source: 'save' },
    ];
    const move = (id: string, done?: true): HouseholdMove => ({
      id, simId: 'Kid', createdAt: '2026-01-01T00:00:00.000Z', fromGid: 'W||A', fromHh: 'A', fromWorld: 'W', fromNb: '-',
      toGid: 'W||B', toHh: 'B', toWorld: 'W', toNb: '-', ...(done ? { done } : {}),
    });
    const death: DeceasedMark = { id: 'd1', simId: 'Bob', createdAt: '2026-01-01T00:00:00.000Z' };
    const log = buildConnectionLog(edges, byid, [move('h1'), move('h2', true)], [], [death]);
    const section = (id: string, off: Set<string> = new Set()) => logSection(log.find((e) => e.id === id)!, off);
    assert.equal(section('u1'), 'plan');
    assert.equal(section('u1', new Set(['u1'])), 'off');
    // A child with one parent still planned is still a plan.
    assert.equal(section('child:Kid'), 'plan');
    assert.equal(section('v2'), 'game');
    assert.equal(section('h1'), 'plan');
    assert.equal(section('h2'), 'game');
    assert.equal(section('d1'), 'game');
    assert.ok(log.find((e) => e.id === 'h2')!.done);
    assert.ok(!canNote(log.find((e) => e.id === 'd1')!));
    assert.ok(canNote(log.find((e) => e.id === 'h1')!));
  });

  it('shows a plan done once the save confirmed every link of it', () => {
    const byid = { A: node('A', 'Ann', 'X'), B: node('B', 'Ben', 'X'), K: node('K', 'Kit', 'X') };
    const log = buildConnectionLog(
      [
        { id: 'v1', a: 'A', b: 'K', type: 'parent', source: 'save', wasPlanned: true },
        { id: 'v2', a: 'B', b: 'K', type: 'parent', source: 'save' },
      ],
      byid,
    );
    assert.deepEqual([log[0]!.origin, log[0]!.done, logSection(log[0]!)], ['save', true, 'game']);
  });

  it('reads plans as plans and what happened as done', () => {
    const byid = { A: node('A', 'Ann', 'X'), K: node('K', 'Kit', 'X'), L: node('L', 'Lou', 'X') };
    const log = buildConnectionLog(
      [
        { id: 'u1', a: 'A', b: 'K', type: 'parent', source: 'planned' },
        { id: 'v1', a: 'A', b: 'L', type: 'parent', source: 'save' },
      ],
      byid,
      [
        { id: 'h1', simId: 'K', createdAt: '', fromGid: 'W||A', fromHh: 'A', fromWorld: 'Willow Creek', fromNb: 'Oakenstead', toGid: 'W||B', toHh: 'B', toWorld: 'Willow Creek', toNb: '-' },
        { id: 'h2', simId: 'L', createdAt: '', fromGid: 'W||A', fromHh: 'A', fromWorld: 'Willow Creek', fromNb: '-', toGid: 'W||B', toHh: 'B', toWorld: 'Willow Creek', toNb: '-', done: true },
      ],
    );
    const text = (id: string) => log.find((e) => e.id === id)!.text;
    // Where each sim lives stays in the text, for the file's copy of the log.
    assert.equal(text('u1'), 'Ann X, from Willow Creek has a ┳ child, Kit X.');
    assert.equal(text('v1'), 'Ann X, from Willow Creek had a ┳ child, Lou X.');
    assert.equal(text('h1'), 'Kit X moves from A, Oakenstead, Willow Creek to B, Willow Creek.');
    assert.equal(text('h2'), 'Lou X moved from A, Willow Creek to B, Willow Creek.');
  });

  it('writes a household changing worlds as one line, and the worlds of a sim who changes them', () => {
    const dirk = { ...node('D', 'Dirk', 'Dreamer'), gid: 'Ondarion||Dreamer', hh: 'Dreamer', world: 'Ondarion' };
    const ama = { ...node('A', 'Amarachi', 'Darong'), gid: 'Ondarion||Dreamer', hh: 'Dreamer', world: 'Ondarion' };
    const lucas = node('L', 'Lucas', 'Munch');
    const at = '2026-11-09T10:42:34.559Z';
    const world = (id: string, simId: string, note?: string): HouseholdMove => ({
      id, simId, createdAt: at, fromGid: 'Not in any world||Dreamer', fromHh: 'Dreamer', fromWorld: 'Not in any world', fromNb: '-',
      toGid: 'Ondarion||Dreamer', toHh: 'Dreamer', toWorld: 'Ondarion', toNb: '-', ...(note ? { note } : {}),
    });
    const log = buildConnectionLog([], { D: dirk, A: ama, L: lucas }, [
      world('h1', 'D'),
      world('h2', 'A', 'A home of their own'),
      {
        id: 'h3', simId: 'L', createdAt: at, fromGid: 'Windenburg||Munch', fromHh: 'Munch', fromWorld: 'Windenburg', fromNb: 'Windslar',
        toGid: 'Innisgreen||Summerdream', toHh: 'Summerdream', toWorld: 'Innisgreen', toNb: 'Everdew',
      },
    ]);
    const line = (id: string) => log.find((e) => e.id === id)!;
    assert.equal(log.filter((e) => e.kind === 'move').length, 2);
    assert.match(line('h1').text, /The Dreamer household moves from Not in any world to Ondarion, with Dirk Dreamer and Amarachi Darong\.$/);
    assert.deepEqual([line('h1').moveIds, line('h1').note], [['h1', 'h2'], 'A home of their own']);
    // Two households of one name: the worlds tell them apart.
    const hh = line('h3').parts.filter((p) => p.kind === 'hh');
    assert.deepEqual(hh.map((p) => (p.kind === 'hh' ? `${p.name} (${p.world})` : '')), ['Munch (Windenburg)', 'Summerdream (Innisgreen)']);
  });

  it('puts the note of a link, a child or a move on its line', () => {
    const byid = { A: node('A', 'Ann', 'X'), B: node('B', 'Ben', 'X'), K: node('K', 'Kit', 'X') };
    const log = buildConnectionLog(
      [
        { id: 'u1', a: 'A', b: 'B', type: 'marriage', source: 'planned', note: 'Merge the lines' },
        { id: 'u2', a: 'A', b: 'K', type: 'parent', source: 'planned' },
        { id: 'u3', a: 'B', b: 'K', type: 'parent', source: 'planned', note: 'The heir' },
      ],
      byid,
      [{ id: 'h1', simId: 'K', createdAt: '', fromGid: 'W||A', fromHh: 'A', fromWorld: 'W', fromNb: '-', toGid: 'W||B', toHh: 'B', toWorld: 'W', toNb: '-', note: 'Closer to school' }],
    );
    const line = (id: string) => log.find((e) => e.id === id)!;
    assert.equal(line('u1').note, 'Merge the lines');
    assert.equal(line('child:K').note, 'The heir');
    assert.deepEqual([line('h1').note, line('h1').moveId], ['Closer to school', 'h1']);
  });
});
