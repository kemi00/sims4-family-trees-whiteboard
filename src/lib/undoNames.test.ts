import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { STEP_NAME_MAX, clipStep, linkStep, redoTip, undoTip } from './undoNames.ts';

describe('naming undo steps', () => {
  it('names a link by what it plans', () => {
    assert.equal(linkStep('marriage', 'Ian Moody', 'Derek McMillan'), 'Plan a marriage of Ian Moody and Derek McMillan');
    assert.equal(linkStep('romance', 'Ian', 'Derek', { secret: true }), 'Plan Ian and Derek as secret lovers');
    assert.equal(linkStep('parent', 'Ian', 'Olivia'), 'Make Ian a parent of Olivia');
    assert.equal(linkStep('parent', 'Ian', 'Olivia', { adopted: true }), 'Plan Ian adopting Olivia');
    assert.equal(linkStep('sibling', 'Ian', 'Eric'), 'Make Ian and Eric siblings');
  });

  it('keeps a name to one tip line', () => {
    const long = `Move ${'Bartholomew A. Bittlebun, Sr. '.repeat(3)}in`;
    const cut = clipStep(long);
    assert.equal(cut.length, STEP_NAME_MAX);
    assert.ok(cut.endsWith('…'));
    assert.equal(clipStep('Add a sim to Gooseman'), 'Add a sim to Gooseman');
  });

  it('says in the Undo button’s tip what it will take back', () => {
    assert.equal(undoTip('Add a sim to Gooseman'), 'Undo: Add a sim to Gooseman (Ctrl/⌘ Z)');
    assert.equal(undoTip(null), 'Nothing to undo');
  });

  it('says in the Redo button’s tip what it will put back', () => {
    assert.equal(redoTip('Add a sim to Gooseman'), 'Redo: Add a sim to Gooseman (Ctrl/⌘ Shift Z)');
    assert.equal(redoTip(null), 'Nothing to redo');
  });
});
