import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { linkStep, named, plainStep, redoTip, stepParts, undoTip } from './undoNames.ts';

describe('naming undo steps', () => {
  it('names a link by what it plans', () => {
    assert.equal(linkStep('marriage', 'Ian Moody', 'Derek McMillan'), 'Plan a marriage of Ian Moody and Derek McMillan');
    assert.equal(linkStep('romance', 'Ian', 'Derek', { secret: true }), 'Plan Ian and Derek as secret lovers');
    assert.equal(linkStep('parent', 'Ian', 'Olivia'), 'Make Ian a parent of Olivia');
    assert.equal(linkStep('parent', 'Ian', 'Olivia', { adopted: true }), 'Plan Ian adopting Olivia');
    assert.equal(linkStep('sibling', 'Ian', 'Eric'), 'Make Ian and Eric siblings');
  });

  it('says a step in full, however long', () => {
    const long = `Plan a marriage of ${named('Planned (2) Sigworth')} and ${named('Planned (3) Sigworth')}`;
    assert.equal(
      undoTip(long),
      'Undo: Plan a marriage of Planned (2) Sigworth and Planned (3) Sigworth (Ctrl/⌘ Z)',
    );
  });

  it('sets the names in a step apart from its words', () => {
    const step = `Move ${named('Ignacio Robles')} in with ${named('Eleanor Sullivan')}`;
    assert.deepEqual(stepParts(step), [
      { text: 'Move ', name: false },
      { text: 'Ignacio Robles', name: true },
      { text: ' in with ', name: false },
      { text: 'Eleanor Sullivan', name: true },
    ]);
    assert.equal(plainStep(step), 'Move Ignacio Robles in with Eleanor Sullivan');
    assert.deepEqual(stepParts('Organise the board'), [{ text: 'Organise the board', name: false }]);
    // A mark left open is read as plain words, never lost.
    assert.deepEqual(stepParts(`Add a sim to \u2068Gooseman`), [{ text: 'Add a sim to Gooseman', name: false }]);
  });

  it('says in the Undo button’s tip what it will take back', () => {
    assert.equal(undoTip(`Add a sim to ${named('Gooseman')}`), 'Undo: Add a sim to Gooseman (Ctrl/⌘ Z)');
    assert.equal(undoTip(null), 'Nothing to undo');
  });

  it('says in the Redo button’s tip what it will put back', () => {
    assert.equal(redoTip('Add a sim to Gooseman'), 'Redo: Add a sim to Gooseman (Ctrl/⌘ Shift Z)');
    assert.equal(redoTip(null), 'Nothing to redo');
  });
});
