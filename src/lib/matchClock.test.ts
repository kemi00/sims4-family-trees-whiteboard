import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Edge, SaveGameInfo, SimLife, SimNode } from '../types/whiteboard.ts';
import { householdPlans, upNext, upNextReason } from './householdPlan.ts';
import { planWindow, windowText } from './matchClock.ts';
import { planConflicts } from './plan.ts';
import { TICKS_PER_DAY } from './lifeClock.ts';

const CLOCK = 20 * TICKS_PER_DAY;
const life = (stage: string, stageDays: number, frozen?: SimLife['frozen']): SimLife => ({
  born: 0,
  stageDays,
  stage,
  at: CLOCK,
  ...(frozen ? { frozen } : {}),
});
const sim = (id: string, hh: string, gender: string, age: string, stageDays: number, frozen?: SimLife['frozen']): SimNode =>
  ({
    id, first: id, sur: hh, gid: `W||${hh}`, hh, world: 'W', nb: '-', age, state: 'Sim', gender, color: '#999',
    saveSimId: `s-${id}`, life: life(age, stageDays, frozen),
  }) as SimNode;
const nameOf = (id: string) => id;
const hhOf = (gid: string) => `the ${gid.split('||')[1]} household`;

/** Short lifespan, only the active household aging, the Capps played last. */
const onlyActive: SaveGameInfo = {
  importedAt: 'x', clock: CLOCK, lifespan: 'Short', playedAging: 'Active', unplayedAging: false, lastPlayedGid: 'W||Capp',
};
const everyone: SaveGameInfo = { ...onlyActive, playedAging: 'Yes', unplayedAging: true };

// Beatrice, a young adult 2 Normal days in: an Elder in 34 Short days.
const beatrice = sim('Beatrice', 'Capp', 'Female', 'Young Adult', 2);
// Dirk, a child 13 Normal days in: a young adult in 11 Short days, in another household.
const dirk = sim('Dirk', 'Dreamer', 'Male', 'Child', 13, 'inactive');
// Beatrice later: an adult 26 Normal days in, an Elder in 8.
const older = sim('Beatrice', 'Capp', 'Female', 'Adult', 26);

describe('the matchmaking clock', () => {
  it('waits while the window stays open: the carrier turns Elder long after the other grows up', () => {
    const w = planWindow([beatrice, dirk], onlyActive)!;
    assert.equal(w.state, 'waiting');
    assert.deepEqual([w.opens!.id, w.opens!.days, w.closes!.id, w.closes!.days], ['Dirk', 11, 'Beatrice', 34]);
    assert.equal(windowText(w, nameOf, hhOf, onlyActive)!.text, 'Beatrice turns Elder after 34 days of playing the Capp household.');
  });

  it('warns when, played alike, the carrier turns Elder before the other grows up', () => {
    const w = planWindow([older, dirk], onlyActive)!;
    assert.equal(w.state, 'closing');
    assert.equal(w.together, false);
    const t = windowText(w, nameOf, hhOf, onlyActive)!;
    assert.equal(t.tone, 'warn');
    assert.equal(
      t.text,
      'Beatrice turns Elder after 8 days of playing the Capp household. Play the Dreamer household more than the Capp household, or Beatrice turns Elder before Dirk grows up.',
    );
  });

  it('knows it for sure when both age on the same days', () => {
    // In one household, they age together while it's played.
    const home = { ...dirk, gid: 'W||Capp', hh: 'Capp', life: life('Child', 13) };
    const w = planWindow([older, home], onlyActive)!;
    assert.deepEqual([w.state, w.together], ['closed', true]);
    assert.match(windowText(w, nameOf, hhOf, onlyActive)!.text, /before Dirk grows up: no babies of theirs together\.$/);
    // When every household ages, the days are calendar days.
    const all = planWindow([older, { ...dirk, life: life('Child', 13) }], everyone)!;
    assert.equal(all.state, 'closed');
    assert.match(windowText(all, nameOf, hhOf, everyone)!.text, /^Beatrice turns Elder in 8 days \(Day 29\)/);
  });

  it('says nothing for a couple both grown with years ahead, but times a baby', () => {
    const man = sim('Adam', 'Capp', 'Male', 'Young Adult', 1);
    const w = planWindow([beatrice, man], onlyActive)!;
    assert.equal(w.state, 'open');
    assert.equal(windowText(w, nameOf, hhOf, onlyActive), null);
    assert.equal(windowText(w, nameOf, hhOf, onlyActive, true)!.text, 'Beatrice turns Elder after 34 days of playing the Capp household.');
  });

  it('names the carriers who are Elders already', () => {
    const elder = sim('Agnes', 'Crumplebottom', 'Female', 'Elder', 3);
    const w = planWindow([elder, sim('Adam', 'Capp', 'Male', 'Adult', 1)], onlyActive)!;
    assert.equal(w.state, 'closed');
    assert.equal(windowText(w, nameOf, hhOf, onlyActive)!.text, 'Agnes is an Elder: in the game, an Elder can’t carry a baby.');
  });

  it('times a partner not born yet against the carrier, where the baby is born', () => {
    const baby = { ...sim('Heir', 'Capp', 'Male', 'Unknown', 0), added: true, saveSimId: undefined, life: undefined } as unknown as SimNode;
    const w = planWindow([beatrice, baby], onlyActive)!;
    // Born to the Capps, the baby ages with Beatrice: 24 days to grow up, 34 before she turns Elder.
    assert.deepEqual([w.state, w.together, w.opens!.days], ['waiting', true, 24]);
    assert.equal(windowText(w, nameOf, hhOf, onlyActive)!.text, 'Born within 10 days, Heir grows up before Beatrice turns Elder.');
  });

  it('can’t time a sim without save facts, or a pet', () => {
    assert.equal(planWindow([beatrice, { ...dirk, life: undefined }], onlyActive), null);
    assert.equal(planWindow([beatrice, { ...dirk, species: 'Cat' }], onlyActive), null);
    assert.equal(planWindow([beatrice, dirk], null), null);
  });
});

describe('the matchmaking clock in the plan and Up next', () => {
  const edges: Edge[] = [{ id: 'm', a: 'Beatrice', b: 'Dirk', type: 'marriage', source: 'planned' }];
  const nodes = [older, dirk];
  const items = householdPlans({ nodes, edges, conflicts: planConflicts(nodes, edges), saveGame: onlyActive });

  it('times the planned couple', () => {
    const couple = items.find((i) => i.id === 'couple:m')!;
    assert.equal(couple.window?.state, 'closing');
  });

  it('puts the household that grows up the one still too young first, and says why', () => {
    const groups = [
      { gid: 'W||Capp', hh: 'Capp', world: 'W', nb: '-', color: '#999', x: 0, y: 0, w: 0, h: 0 },
      { gid: 'W||Dreamer', hh: 'Dreamer', world: 'W', nb: '-', color: '#999', x: 0, y: 0, w: 0, h: 0 },
    ];
    const rows = upNext({ items, nodes, groups, saveGame: onlyActive });
    assert.equal(rows[0]!.gid, 'W||Dreamer');
    assert.equal(
      upNextReason(rows[0]!, nameOf, hhOf),
      'Dirk needs 11 days here to catch up with Beatrice, who turns Elder after 8 days of playing the Capp household',
    );
  });
});
