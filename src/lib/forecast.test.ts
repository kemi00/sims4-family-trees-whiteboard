import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { agingClock, handoverText, lineClockText, stepClockText, stepWhen, successionForecast } from './forecast.ts';
import { TICKS_PER_DAY, seasonAt, stageAtLifeDays } from './lifeClock.ts';
import type { Edge, SaveGameInfo, SimLife, SimNode } from '../types/whiteboard.ts';

const CLOCK = 20 * TICKS_PER_DAY;
const life = (stage: string, stageDays: number, extra: Partial<SimLife> = {}): SimLife => ({
  born: 0,
  stageDays,
  stage,
  at: CLOCK,
  ...extra,
});
const sim = (id: string, first: string, age: string, extra: Partial<SimNode> = {}): SimNode =>
  ({
    id, first, sur: 'Goth', gid: 'Willow Creek||Goth', hh: 'Goth', world: 'Willow Creek', nb: '-', age, state: 'Sim',
    gender: 'Female', color: '#999', townie: false, oworld: 'Willow Creek', onb: '-', ohh: 'Goth', oplay: 'Resident', pack: '',
    x: 0, y: 0, w: 0, h: 0, saveSimId: 's' + id, dynasty: 'Goth', ...extra,
  }) as SimNode;

/** Short lifespan, only the active household ages, the Goths played last. */
const onlyActive: SaveGameInfo = {
  importedAt: 'x',
  clock: CLOCK,
  lifespan: 'Short',
  playedAging: 'Active',
  unplayedAging: false,
  lastPlayedGid: 'Willow Creek||Goth',
  activeHousehold: 'Goth',
};
const everyone: SaveGameInfo = { ...onlyActive, playedAging: 'Yes', unplayedAging: true };

// Mortimer: an adult 30 Normal days in, an elder in 6 Short days, old age from 13.
const mortimer = sim('m', 'Mortimer', 'Adult', { dynastyRole: 'head', life: life('Adult', 30) });
// Cassandra: a teen 10.9 Normal days in, a young adult in 5.05 Short days.
const cassandra = sim('c', 'Cassandra', 'Teen', { dynastyRole: 'heir', life: life('Teen', 10.9) });
// Olivia: planned after Cassandra, not born yet.
const olivia = sim('o', '', 'Unknown', { added: true, saveSimId: undefined, heirAfter: 'c', dynastyPlan: 'member' });
const KEY = 'name:Goth';

describe('who ages when, under each aging option', () => {
  it('only the active household: its sims age while you play it, the rest wait', () => {
    assert.equal(agingClock(mortimer, onlyActive), 'played');
    assert.equal(agingClock(sim('x', 'X', 'Adult', { gid: 'W||Other', hh: 'Other', life: life('Adult', 1, { frozen: 'inactive' }) }), onlyActive), 'played');
    assert.equal(agingClock(sim('x', 'X', 'Adult', { life: life('Adult', 1, { frozen: 'unplayed' }) }), onlyActive), 'paused');
  });

  it('the active and unplayed households: unplayed ones age every day', () => {
    const game = { ...onlyActive, unplayedAging: true };
    assert.equal(agingClock(mortimer, game), 'played');
    assert.equal(agingClock(sim('x', 'X', 'Adult', { gid: 'W||Pancakes', hh: 'Pancake', life: life('Adult', 1) }), game), 'always');
  });

  it('played households age, unplayed ones don’t; or no one ages', () => {
    const game = { ...onlyActive, playedAging: 'Yes' as const };
    assert.equal(agingClock(mortimer, game), 'always');
    assert.equal(agingClock(sim('x', 'X', 'Adult', { life: life('Adult', 1, { frozen: 'unplayed' }) }), game), 'paused');
    assert.equal(agingClock(sim('x', 'X', 'Adult', { life: life('Adult', 1, { frozen: 'played' }) }), { ...game, playedAging: 'No' }), 'never');
  });

  it('every household ages: every day counts', () => {
    assert.equal(agingClock(mortimer, everyone), 'always');
    assert.equal(agingClock(sim('x', 'X', 'Adult'), everyone), 'unknown');
  });
});

describe('the line of succession, forecast', () => {
  it('counts each one’s days on the save’s lifespan', () => {
    const f = successionForecast([mortimer, cassandra, olivia], [], KEY, onlyActive);
    assert.deepEqual(f.steps.map((s) => s.place), ['head', 'heir', 'later']);
    const [m, c, o] = f.steps;
    assert.equal(m!.elderIn, 6);
    assert.equal(m!.oldAgeIn, 13);
    assert.ok(Math.abs(c!.grownUpIn! - 5.05) < 1e-9);
    assert.equal(o!.unborn, true);
    assert.equal(o!.grownUpIn, 24);
    assert.equal(stepWhen(m!, onlyActive), 'Elder in 6 days · old age in 13+ days');
    assert.equal(stepWhen(c!, onlyActive), 'Young adult in 5 days');
    assert.equal(stepWhen(o!, onlyActive), 'A young adult 24 days after birth');
    assert.equal(stepClockText(m!), 'The Goth household ages only while you play it');
    assert.equal(lineClockText(f.steps), 'The Goth household ages only while you play it');
    // Said once for a household: not again for the heir beside them.
    assert.equal(stepClockText(c!, m!), '');
  });

  it('tells whether each heir grows up in time, in one household', () => {
    const f = successionForecast([mortimer, cassandra, olivia], [], KEY, onlyActive);
    assert.deepEqual(f.handovers[0], { kind: 'first' });
    // Cassandra's old age can come 47.05 days from now; Olivia takes 24 to grow up.
    const h = f.handovers[1]!;
    assert.equal(h.kind, 'bornBy');
    assert.equal(handoverText(h, 'Cassandra', 'Olivia'), 'Born within 23 days, Olivia grows up before old age can come for Cassandra.');
  });

  it('warns when old age can come before the heir grows up', () => {
    const toddler = sim('c', 'Cassandra', 'Toddler', { dynastyRole: 'heir', life: life('Toddler', 1) });
    const f = successionForecast([mortimer, toddler], [], KEY, onlyActive);
    assert.deepEqual(f.handovers[0], { kind: 'late', stage: 'Teen' });
    assert.equal(
      handoverText(f.handovers[0]!, 'Mortimer', 'Cassandra'),
      'Old age can come for Mortimer before Cassandra grows up: Cassandra could take over as a Teen.',
    );
  });

  it('doesn’t line up sims who age on different days', () => {
    const away = { ...cassandra, gid: 'Willow Creek||Lewis', hh: 'Lewis', life: life('Teen', 10.9, { frozen: 'inactive' as const }) };
    const f = successionForecast([mortimer, away], [], KEY, onlyActive);
    assert.deepEqual(f.handovers[0], { kind: 'apart' });
    assert.equal(lineClockText(f.steps), '');
    // When every household ages, they do.
    const all = successionForecast([mortimer, { ...away, life: life('Teen', 10.9) }], [], KEY, everyone);
    assert.deepEqual(all.handovers[0], { kind: 'first' });
    assert.equal(stepWhen(all.steps[1]!, everyone), 'Young adult in 5 days (Day 26)');
  });

  it('says nothing is due while the head isn’t aging', () => {
    const frozen = { ...mortimer, life: life('Adult', 30, { frozen: 'played' as const }) };
    const f = successionForecast([frozen, cassandra], [], KEY, { ...onlyActive, playedAging: 'No' });
    assert.deepEqual(f.handovers[0], { kind: 'still', paused: false });
    assert.equal(stepClockText(f.steps[0]!), 'The Goth household isn’t aging: played households don’t age');
  });

  it('knows an heir’s partner, and a grown heir is ready', () => {
    const grown = sim('c', 'Cassandra', 'Young Adult', { dynastyRole: 'heir', life: life('Young Adult', 2) });
    const edges: Edge[] = [{ id: 'r', a: 'c', b: 'd', type: 'romance', source: 'planned' }];
    const don = sim('d', 'Don', 'Young Adult', { dynasty: undefined });
    const f = successionForecast([mortimer, grown, don], edges, KEY, onlyActive);
    assert.deepEqual(f.steps[1]!.partner, { id: 'd', married: false, planned: true });
    assert.deepEqual(f.handovers[0], { kind: 'ready' });
    assert.equal(stepWhen(f.steps[1]!, onlyActive), '');
  });
});

describe('the calendar ahead', () => {
  it('names the stage a number of days into a life', () => {
    assert.equal(stageAtLifeDays(0), 'Newborn');
    assert.equal(stageAtLifeDays(12), 'Toddler');
    assert.equal(stageAtLifeDays(13), 'Child');
    assert.equal(stageAtLifeDays(48), 'Young Adult');
  });

  it('counts seasons on from the save’s', () => {
    const game = { season: 'Spring' as const, seasonSince: 0, seasonDays: 7 };
    assert.equal(seasonAt(game, 3 * TICKS_PER_DAY), 'Spring');
    assert.equal(seasonAt(game, 8 * TICKS_PER_DAY), 'Summer');
    assert.equal(seasonAt(game, 29 * TICKS_PER_DAY), 'Spring');
    assert.equal(seasonAt({ seasonDays: 7 }, 0), null);
  });
});
