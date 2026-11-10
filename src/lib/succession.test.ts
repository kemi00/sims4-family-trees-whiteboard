import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { SimNode } from '../types/whiteboard.ts';
import type { Edge } from '../types/whiteboard.ts';
import {
  advanceSuccession,
  chainPlannedHeirs,
  heirAfterChoices,
  heirAfterHolder,
  heirAfterReady,
  successionLine,
  withSuccessionChoice,
} from './succession.ts';

const sim = (id: string, extra: Partial<SimNode> = {}): SimNode =>
  ({ id, first: id, sur: 'Lewis', age: 'Adult', gender: 'Female', state: 'Sim', dynasty: 'Lewis', ...extra }) as SimNode;

const KEY = 'name:Lewis';

describe('the line of succession', () => {
  const vivian = sim('vivian', { dynastyRole: 'head' });
  const eric = sim('eric', { dynastyRole: 'heir' });
  const olivia = sim('olivia', { age: 'Child', heirAfter: 'eric' });
  const rose = sim('rose', { age: 'Infant', heirAfter: 'olivia' });
  const max = sim('max', { age: 'Child' });

  it('runs from the head and heir through each heir planned after the one before', () => {
    assert.deepEqual(successionLine([max, rose, olivia, eric, vivian], KEY), [
      { id: 'vivian', place: 'head', planned: false },
      { id: 'eric', place: 'heir', planned: false },
      { id: 'olivia', place: 'later', planned: true },
      { id: 'rose', place: 'later', planned: true },
    ]);
  });

  it('puts a planned heir before the game’s, and leaves out the deceased and those leaving', () => {
    const plannedHeir = sim('max', { dynastyRole: 'heir', dynastyPlan: 'role' });
    assert.deepEqual(
      successionLine([vivian, eric, plannedHeir], KEY).map((p) => p.id),
      ['vivian', 'max'],
    );
    const dead = sim('vivian', { dynastyRole: 'head', state: 'Deceased' });
    const leaving = sim('olivia', { heirAfter: 'eric', dynastyPlan: 'none' });
    assert.deepEqual(successionLine([dead, eric, leaving], KEY).map((p) => p.id), ['eric']);
  });

  it('offers to plan a sim after the heir or anyone after them, never after themself', () => {
    const board = [vivian, eric, olivia, rose, max];
    assert.deepEqual(heirAfterChoices(board, 'max', KEY), ['eric', 'olivia', 'rose']);
    // Olivia's daughter comes after her, so Olivia can't be planned after her.
    assert.deepEqual(heirAfterChoices(board, 'olivia', KEY), ['eric']);
    // The heir has no one ahead of them to come after.
    assert.deepEqual(heirAfterChoices(board, 'eric', KEY), []);
    // Without an heir there is no one to come after.
    assert.deepEqual(heirAfterChoices([vivian, max], 'max', KEY), []);
  });

  it('names who already has a place, and shows the line as the editor would save it', () => {
    const board = [vivian, eric, olivia, max];
    assert.equal(heirAfterHolder(board, 'eric', KEY, 'max')?.id, 'olivia');
    assert.equal(heirAfterHolder(board, 'eric', KEY, 'olivia'), null);
    const maxAfterEric = withSuccessionChoice(board, { ...max, heirAfter: 'eric' });
    assert.deepEqual(successionLine(maxAfterEric, KEY).map((p) => p.id), ['vivian', 'eric', 'max']);
    assert.equal(maxAfterEric.find((n) => n.id === 'olivia')!.heirAfter, undefined);
    // A planned heir takes the role from another plan, not from the game's heir.
    const maxHeir = withSuccessionChoice(board, { ...max, dynastyRole: 'heir', dynastyPlan: 'role' });
    assert.equal(maxHeir.find((n) => n.id === 'eric')!.dynastyRole, 'heir');
  });
});

describe('a save moving the line up', () => {
  it('makes the heir after the new head the planned heir', () => {
    const board = [
      sim('vivian', { state: 'Deceased' }),
      sim('eric', { dynastyRole: 'head' }),
      sim('olivia', { heirAfter: 'eric' }),
      sim('rose', { heirAfter: 'olivia' }),
    ];
    const out = advanceSuccession(board);
    const olivia = out.find((n) => n.id === 'olivia')!;
    assert.equal(olivia.dynastyRole, 'heir');
    assert.equal(olivia.dynastyPlan, 'role');
    assert.equal(olivia.heirAfter, undefined);
    assert.equal(out.find((n) => n.id === 'rose')!.heirAfter, 'olivia');
  });

  it('keeps a planned member a planned member, now as heir', () => {
    const out = advanceSuccession([sim('eric', { dynastyRole: 'head' }), sim('olivia', { heirAfter: 'eric', dynastyPlan: 'member' })]);
    assert.equal(out[1]!.dynastyRole, 'heir');
    assert.equal(out[1]!.dynastyPlan, 'member');
  });

  it('is done once the save has them as heir, and waits while their sim is not head yet', () => {
    const done = advanceSuccession([sim('eric', { dynastyRole: 'head' }), sim('olivia', { dynastyRole: 'heir', heirAfter: 'eric' })]);
    assert.equal(done[1]!.heirAfter, undefined);
    assert.equal(done[1]!.dynastyPlan, undefined);
    const board = [sim('vivian', { dynastyRole: 'head' }), sim('eric', { dynastyRole: 'heir' }), sim('olivia', { heirAfter: 'eric' })];
    assert.equal(advanceSuccession(board), board);
  });

  it('moves one after a sim who died into that sim’s place', () => {
    const out = advanceSuccession([
      sim('vivian', { dynastyRole: 'head' }),
      sim('eric', { dynastyRole: 'heir' }),
      sim('olivia', { heirAfter: 'eric', state: 'Deceased' }),
      sim('rose', { heirAfter: 'olivia' }),
    ]);
    assert.equal(out.find((n) => n.id === 'rose')!.heirAfter, 'eric');
    assert.equal(out.find((n) => n.id === 'olivia')!.heirAfter, undefined);
    // The heir died: the one after them is the planned heir now.
    const heirDied = advanceSuccession([
      sim('vivian', { dynastyRole: 'head' }),
      sim('eric', { dynastyRole: 'heir', state: 'Deceased' }),
      sim('olivia', { heirAfter: 'eric' }),
    ]);
    assert.equal(heirDied[2]!.dynastyRole, 'heir');
  });

  it('leaves the choice to you when another heir is already planned', () => {
    const board = [
      sim('eric', { dynastyRole: 'head' }),
      sim('max', { dynastyRole: 'heir', dynastyPlan: 'role' }),
      sim('olivia', { heirAfter: 'eric' }),
    ];
    assert.equal(advanceSuccession(board), board);
  });

  it('ends a plan whose sim is gone from the board', () => {
    const out = advanceSuccession([sim('olivia', { heirAfter: 'gone' })]);
    assert.equal(out[0]!.heirAfter, undefined);
  });

  it('says when the plan can be done: the sim before them is head in the save', () => {
    const olivia = sim('olivia', { heirAfter: 'eric' });
    assert.equal(heirAfterReady(olivia, sim('eric', { dynastyRole: 'heir' })), false);
    assert.equal(heirAfterReady(olivia, sim('eric', { dynastyRole: 'head', dynastyPlan: 'role' })), false);
    assert.equal(heirAfterReady(olivia, sim('eric', { dynastyRole: 'head' })), true);
  });
});

describe('boards that planned an heir at each generation', () => {
  const parent = (a: string, b: string): Edge => ({ id: `${a}>${b}`, a, b, type: 'parent', source: 'planned' });
  const edges = [parent('vivian', 'eric'), parent('eric', 'olivia'), parent('olivia', 'baby'), parent('eric', 'max')];

  it('keep the eldest as heir and plan each after their forebear', () => {
    const board = [
      sim('vivian', { dynastyRole: 'head', dynastyPlan: 'member' }),
      sim('eric', { dynastyRole: 'heir', dynastyPlan: 'member' }),
      sim('olivia', { dynastyRole: 'heir', dynastyPlan: 'member' }),
      sim('baby', { dynastyRole: 'heir', dynastyPlan: 'role' }),
      sim('max', { dynastyPlan: 'member' }),
    ];
    const out = chainPlannedHeirs(board, edges);
    const pick = (id: string) => {
      const n = out.find((x) => x.id === id)!;
      return [n.dynastyRole, n.dynastyPlan, n.heirAfter];
    };
    assert.deepEqual(pick('eric'), ['heir', 'member', undefined]);
    assert.deepEqual(pick('olivia'), [undefined, 'member', 'eric']);
    assert.deepEqual(pick('baby'), [undefined, undefined, 'olivia']);
    assert.deepEqual(successionLine(out, KEY).map((p) => p.id), ['vivian', 'eric', 'olivia', 'baby']);
  });

  it('leave heirs that are not one line, and a single heir, as they are', () => {
    const siblings = [
      sim('eric', { dynastyRole: 'heir', dynastyPlan: 'member' }),
      sim('olivia', { dynastyRole: 'heir', dynastyPlan: 'member' }),
      sim('max', { dynastyRole: 'heir', dynastyPlan: 'member' }),
    ];
    // Olivia and Max are both Eric's: which comes next is yours to say.
    const out = chainPlannedHeirs(siblings, edges);
    assert.equal(out, siblings);
    const one = [sim('eric', { dynastyRole: 'heir', dynastyPlan: 'member' })];
    assert.equal(chainPlannedHeirs(one, edges), one);
  });

  it('still chain what is clear beside two heirs of the head', () => {
    // Sofia and a planned sister are both planned heirs of Bjorn; Sofia's baby comes after Sofia.
    const kin = [parent('bjorn', 'sofia'), parent('bjorn', 'sister'), parent('sofia', 'baby')];
    const board = [
      sim('bjorn', { dynastyRole: 'head', dynastyPlan: 'member' }),
      sim('sofia', { dynastyRole: 'heir', dynastyPlan: 'member' }),
      sim('sister', { dynastyRole: 'heir', dynastyPlan: 'member' }),
      sim('baby', { dynastyRole: 'heir', dynastyPlan: 'member' }),
    ];
    const out = chainPlannedHeirs(board, kin);
    assert.deepEqual(
      out.map((n) => [n.id, n.dynastyRole ?? '', n.heirAfter ?? '']),
      [
        ['bjorn', 'head', ''],
        ['sofia', 'heir', ''],
        ['sister', 'heir', ''],
        ['baby', '', 'sofia'],
      ],
    );
  });
});
