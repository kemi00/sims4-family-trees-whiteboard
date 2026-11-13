import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { simCardClass, simCardLines } from './simCard.ts';
import type { PartnerCandidate } from './partners.ts';
import type { SimNode } from '../types/whiteboard.ts';

const sim = (id: string, extra: Partial<SimNode>): SimNode =>
  ({ id, first: id, sur: 'Cuthbert', age: 'Elder', gender: 'Male', state: 'Sim', pack: 'Base Game', hh: 'Green Gables', world: 'Chestnut Ridge', x: 0, y: 0, w: 120, h: 60, ...extra }) as SimNode;
const dynasties = new Map();
const frozen = { stage: 'Elder', stageDays: 3, frozen: 'inactive' } as SimNode['life'];

describe('a sim card', () => {
  it('reads like a possible partner: how close in life, home, then what to weigh', () => {
    const c: PartnerCandidate = { id: 'Matthew', gap: 0, gapDays: 0, approx: false, frozen: 'inactive', taken: false };
    const lines = simCardLines(sim('Matthew', { dynasty: 'Cuthbert' }), { dynasties, candidate: c });
    assert.deepEqual(lines, { mark: '', name: 'Matthew Cuthbert', meta: 'same age · Green Gables', flags: ['not aging now', 'Cuthbert dynasty'] });
  });

  it('in a highlight list: what they are in place of the age gap, and their life clock from the save', () => {
    const lines = simCardLines(sim('Matthew', { dynasty: 'Cuthbert', life: frozen }), { dynasties, what: 'Elder' });
    assert.equal(lines.meta, 'Elder · Green Gables');
    assert.deepEqual(lines.flags, ['not aging now', 'Cuthbert dynasty']);
  });

  it('a dynasty head has their mark; a dynasty’s own list leaves its name off', () => {
    const lines = simCardLines(sim('Marilla', { dynasty: 'Cuthbert', dynastyRole: 'head' }), { dynasties, what: 'Head · Elder', noDynasty: true });
    assert.equal(lines.mark, '👑');
    assert.deepEqual(lines.flags, []);
  });

  it('A to Z adds the world; a sim who passed away says so and fades, and no longer ages', () => {
    const gone = sim('Cordelia', { state: 'Deceased', life: frozen });
    const lines = simCardLines(gone, { dynasties, what: 'Parent · Elder', world: true });
    assert.equal(lines.meta, 'Parent · Elder · passed away · Green Gables · Chestnut Ridge');
    assert.deepEqual(lines.flags, []);
    assert.equal(simCardClass(gone), 'simcard simcard--passed');
    assert.equal(simCardClass(sim('Matthew', {}), true), 'simcard simcard--on');
  });

  it('a life clock for another life stage is not theirs now', () => {
    const lines = simCardLines(sim('Anne', { age: 'Teen', life: frozen }), { dynasties });
    assert.equal(lines.meta, 'Teen · Green Gables');
    assert.deepEqual(lines.flags, []);
  });
});
