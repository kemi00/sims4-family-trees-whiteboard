import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileFilters, filterChangeNote, loadJsonRisk } from './loadJsonRisk.ts';
import type { Edge, SimNode } from '../types/whiteboard.ts';

function node(partial: Partial<SimNode> & { id: string }): SimNode {
  return {
    gid: 'g',
    first: 'A',
    sur: 'B',
    age: 'Adult',
    state: 'Sim',
    gender: 'Female',
    hh: 'H',
    world: 'Willow Creek',
    nb: '-',
    color: '#000',
    townie: false,
    oworld: 'Willow Creek',
    onb: '-',
    ohh: 'H',
    oplay: 'Resident',
    pack: '',
    x: 0,
    y: 0,
    w: 0,
    h: 0,
    ...partial,
  };
}

describe('loadJsonRisk', () => {
  it('skips confirm on a clean built-in board', () => {
    const risk = loadJsonRisk([node({ id: 'a' })], [], {
      canUndo: false,
      sourceFileName: null,
      fromBrowserDraft: false,
    });
    assert.equal(risk.needsConfirm, false);
  });

  it('requires confirm after a save merge', () => {
    const nodes = [node({ id: 'a', fromSave: true })];
    const edges: Edge[] = [
      { id: 's1', a: 'a', b: 'b', type: 'marriage', source: 'save' },
    ];
    const risk = loadJsonRisk(nodes, edges, {
      canUndo: false,
      sourceFileName: 'board.json',
      fromBrowserDraft: false,
    });
    assert.equal(risk.needsConfirm, true);
    assert.equal(risk.fromSaveCards, 1);
    assert.equal(risk.saveLinks, 1);
    assert.equal(risk.sourceLabel, 'board.json');
  });

  /* A board that came from Load JSON carries none of the other signals --
     no undo, no editor adds, no planned links -- so loading a second file
     used to replace the first without asking. */
  it('requires confirm when the board already came from a file', () => {
    const risk = loadJsonRisk([node({ id: 'a' })], [], {
      canUndo: false,
      sourceFileName: 'sims4_family_trees_2026-08-20.json',
      fromBrowserDraft: false,
    });
    assert.equal(risk.needsConfirm, true);
    assert.equal(risk.sourceLabel, 'sims4_family_trees_2026-08-20.json');
  });

  it('requires confirm when the board was restored from a browser draft', () => {
    const risk = loadJsonRisk([node({ id: 'a' })], [], {
      canUndo: false,
      sourceFileName: null,
      fromBrowserDraft: true,
    });
    assert.equal(risk.needsConfirm, true);
    assert.equal(risk.sourceLabel, 'Browser draft');
  });

  it('requires confirm when there are planned links or undo', () => {
    const planned: Edge[] = [
      { id: 'u1', a: 'a', b: 'b', type: 'parent', source: 'planned' },
    ];
    assert.equal(
      loadJsonRisk([node({ id: 'a' })], planned, {
        canUndo: false,
        sourceFileName: null,
        fromBrowserDraft: false,
      }).needsConfirm,
      true,
    );
    assert.equal(
      loadJsonRisk([node({ id: 'a' })], [], {
        canUndo: true,
        sourceFileName: null,
        fromBrowserDraft: true,
      }).needsConfirm,
      true,
    );
  });
});

describe('JSON merge filters', () => {
  const none = { hiddenPacks: [], hiddenPlay: [], hiAges: [], hiSingle: false };

  it('treats a file without filter fields as having no opinion', () => {
    assert.equal(fileFilters({}), null);
    assert.equal(filterChangeNote({ ...none, hiddenPacks: ['Get Famous'] }, null), null);
  });

  it('says nothing when the file matches the board, in any order', () => {
    const board = { ...none, hiddenPacks: ['A', 'B'] };
    assert.equal(filterChangeNote(board, { ...none, hiddenPacks: ['B', 'A'] }), null);
  });

  it('spells out what the file hides and highlights', () => {
    const file = fileFilters({
      hiddenPacks: ['Get Famous', 'Seasons', 'Vampires'],
      hiddenPlay: ['Townie'],
      hiAges: ['Teen', 'Child'],
      hiSingle: true,
    });
    assert.equal(
      filterChangeNote(none, file),
      "Your filters switch to the file's: it hides 3 games and 1 playability type, highlights 2 ages and single sims.",
    );
  });

  it('warns when merging would clear the filters on screen', () => {
    assert.equal(
      filterChangeNote({ ...none, hiddenPacks: ['Seasons'] }, fileFilters({ hiddenPacks: [] })),
      "Your filters switch to the file's: it shows every game.",
    );
  });
});
