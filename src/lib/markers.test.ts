import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PRESET_MARKERS, boardMarkers, markerColor, markersInUse, markersOf, newMarkerId } from './markers.ts';

describe('markers', () => {
  it('starts a board with Illegitimate and Wealthy, and keeps a list the player emptied', () => {
    assert.deepEqual(boardMarkers({}), PRESET_MARKERS);
    assert.deepEqual(boardMarkers({ markers: [] }), []);
  });

  it("lists a sim's markers in the board's order, leaving out removed ones", () => {
    const defs = [...PRESET_MARKERS, { id: 'm3', label: 'Cursed', mark: '☾' }];
    assert.deepEqual(markersOf({ markers: ['m3', 'gone', 'illegitimate'] }, defs).map((m) => m.label), ['Illegitimate', 'Cursed']);
    assert.deepEqual(markersOf({}, defs), []);
    assert.deepEqual(markersInUse([{ markers: ['wealthy'] }, {}], defs).map((m) => m.id), ['wealthy']);
  });

  it('gives a new marker an unused id, and each symbol its colour', () => {
    assert.equal(newMarkerId([...PRESET_MARKERS, { id: 'm3', label: 'x', mark: '★' }]), 'm4');
    assert.equal(markerColor('§'), '#a16207');
    assert.equal(markerColor('?'), '#475569');
  });
});
