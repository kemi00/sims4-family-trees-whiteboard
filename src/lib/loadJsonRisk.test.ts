import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { loadJsonRisk } from './loadJsonRisk.ts';
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
