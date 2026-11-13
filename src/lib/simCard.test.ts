import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { simCardClass, simCardLines } from './simCard.ts';
import type { PartnerCandidate } from './partners.ts';
import type { SimNode } from '../types/whiteboard.ts';

const sim = (id: string, extra: Partial<SimNode>): SimNode =>
  ({ id, first: id, sur: 'Cuthbert', age: 'Elder', gender: 'Male', state: 'Sim', pack: 'Base Game', hh: 'Green Gables', world: 'Chestnut Ridge', x: 0, y: 0, w: 120, h: 60, ...extra }) as SimNode;
const dynasties = new Map();
const risks = new Map();
/** The amber line as it reads, with "at risk" in [brackets] where it is set apart. */
const amber = (l: ReturnType<typeof simCardLines>) => l.flags.map((f) => (f.risk ? `[${f.text}]` : f.text));
const frozen = { stage: 'Elder', stageDays: 3, frozen: 'inactive' } as SimNode['life'];

describe('a sim card', () => {
  it('reads like a possible partner: how close in life, home, then what to weigh', () => {
    const c: PartnerCandidate = { id: 'Matthew', gap: 0, gapDays: 0, approx: false, frozen: 'inactive', taken: false };
    const lines = simCardLines(sim('Matthew', { dynasty: 'Cuthbert' }), { dynasties, risks, candidate: c });
    assert.deepEqual({ ...lines, flags: amber(lines) }, { mark: '', name: 'Matthew Cuthbert', meta: 'same age · Green Gables', flags: ['not aging now', 'Cuthbert dynasty'] });
  });

  it('in a highlight list: what they are in place of the age gap, and their life clock from the save', () => {
    const lines = simCardLines(sim('Matthew', { dynasty: 'Cuthbert', life: frozen }), { dynasties, risks, what: 'Elder' });
    assert.equal(lines.meta, 'Elder · Green Gables');
    assert.deepEqual(amber(lines), ['not aging now', 'Cuthbert dynasty']);
  });

  it('a dynasty head has their mark; a dynasty’s own list leaves its name off', () => {
    const lines = simCardLines(sim('Marilla', { dynasty: 'Cuthbert', dynastyRole: 'head' }), { dynasties, risks, what: 'Head · Elder', noDynasty: true });
    assert.equal(lines.mark, '👑');
    assert.deepEqual(amber(lines), []);
  });

  it('A to Z adds the world; a sim who passed away says so and fades, and no longer ages', () => {
    const gone = sim('Cordelia', { state: 'Deceased', life: frozen });
    const lines = simCardLines(gone, { dynasties, risks, what: 'Parent · Elder', world: true });
    assert.equal(lines.meta, 'Parent · Elder · passed away · Green Gables · Chestnut Ridge');
    assert.deepEqual(amber(lines), []);
    assert.equal(simCardClass(gone), 'simcard simcard--passed');
    assert.equal(simCardClass(sim('Matthew', {}), true), 'simcard simcard--on');
  });

  it('a life clock for another life stage is not theirs now', () => {
    const lines = simCardLines(sim('Anne', { age: 'Teen', life: frozen }), { dynasties, risks });
    assert.equal(lines.meta, 'Teen · Green Gables');
    assert.deepEqual(amber(lines), []);
  });

  describe('a dynasty at risk', () => {
    const atRisk = new Map([['name:Cuthbert', { noHeir: true, sims: 3 }]]);
    const o = { dynasties, risks: atRisk };

    it('says so after the dynasty, set apart, with why on hover, as the board card does', () => {
      const lines = simCardLines(sim('Matthew', { dynasty: 'Cuthbert', life: frozen }), { ...o, extra: ['likely'] });
      assert.deepEqual(amber(lines), ['not aging now', 'Cuthbert dynasty', '[at risk]', 'likely']);
      assert.equal(lines.riskTitle, 'The Cuthbert dynasty is at risk: no heir');
    });

    it('is said once in the dynasty’s own list, not on its cards', () => {
      const lines = simCardLines(sim('Marilla', { dynasty: 'Cuthbert', dynastyRole: 'head' }), { ...o, noDynasty: true });
      assert.deepEqual(amber(lines), []);
      assert.equal(lines.riskTitle, undefined);
    });

    it('is not weighed for a sim who passed away or one planned to leave it', () => {
      const gone = simCardLines(sim('Cordelia', { dynasty: 'Cuthbert', state: 'Deceased' }), o);
      assert.deepEqual(amber(gone), ['Cuthbert dynasty']);
      const leaving = simCardLines(sim('Anne', { dynasty: 'Cuthbert', dynastyPlan: 'none' }), o);
      assert.deepEqual(amber(leaving), ['Cuthbert dynasty']);
    });

    it('a safe dynasty adds nothing', () => {
      const lines = simCardLines(sim('Gilbert', { sur: 'Blythe', dynasty: 'Blythe' }), o);
      assert.deepEqual(amber(lines), ['Blythe dynasty']);
      assert.equal(lines.riskTitle, undefined);
    });
  });
});
