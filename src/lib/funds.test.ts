import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fundsByBox, homesSold, money, moveMoney, togetherText } from './funds.ts';
import type { SaveHousehold, SimNode } from '../types/whiteboard.ts';

const sim = (id: string, gid: string, hhId: string, extra: Partial<SimNode> = {}): SimNode =>
  ({
    id,
    gid,
    hh: gid.split('||')[1]!,
    world: gid.split('||')[0]!,
    first: id,
    sur: '',
    age: 'Adult',
    state: 'Sim',
    gender: 'Male',
    nb: '',
    color: '#888',
    townie: false,
    oworld: '',
    onb: '',
    ohh: '',
    oplay: 'Resident',
    pack: '',
    x: 0,
    y: 0,
    w: 0,
    h: 0,
    saveSimId: id,
    hhId,
    ...extra,
  }) as SimNode;

const households: Record<string, SaveHousehold> = {
  g: { name: 'Goth', funds: 45500, lot: 'Ophelia Villa' },
  l: { name: 'Landgraab', funds: 85000, lot: 'Affluista Mansion' },
};

describe('money', () => {
  it('says simoleons in full', () => {
    assert.equal(money(45500), '§45,500');
    assert.equal(money(1250000), '§1,250,000');
    assert.equal(money(0), '§0');
  });
});

describe('a household box’s funds', () => {
  it('is its household’s, as the save has them', () => {
    const f = fundsByBox([sim('m', 'WC||Goth', 'g'), sim('b', 'WC||Goth', 'g')], households);
    assert.deepEqual(f.get('WC||Goth'), { amount: 45500, shares: [{ hhId: 'g', name: 'Goth', amount: 45500, lot: 'Ophelia Villa' }] });
  });

  it('stays with the household when one sim moves out on the board', () => {
    const f = fundsByBox(
      [sim('m', 'WC||Goth', 'g'), sim('b', 'WC||Goth', 'g'), sim('c', 'OS||Landgraab', 'g'), sim('n', 'OS||Landgraab', 'l')],
      households,
    );
    assert.equal(f.get('WC||Goth')?.amount, 45500);
    assert.equal(f.get('OS||Landgraab')?.amount, 85000);
  });

  it('joins another household’s when the whole household moves in', () => {
    const f = fundsByBox([sim('m', 'OS||Landgraab', 'g'), sim('b', 'OS||Landgraab', 'g'), sim('n', 'OS||Landgraab', 'l')], households);
    const box = f.get('OS||Landgraab')!;
    assert.equal(box.amount, 130500);
    assert.equal(
      togetherText(box),
      '§130,500 together: the Goth household’s §45,500 joins the Landgraab household’s §85,000.',
    );
  });

  it('follows a household to a new box, and leaves out the planned, the deceased and the Unhoused', () => {
    const f = fundsByBox(
      [
        sim('m', 'SV||Goth', 'g'),
        sim('x', 'WC||Goth', 'g', { state: 'Deceased' }),
        sim('p', 'WC||Goth', 'g', { added: true, saveSimId: undefined, first: '' }),
        sim('t', 'WC||Unhoused sims', 'l'),
      ],
      households,
    );
    assert.equal(f.get('SV||Goth')?.amount, 45500);
    assert.equal(f.has('WC||Goth'), false);
  });

  it('checks a move against a price, and names the home it sells', () => {
    const box = { amount: 45500, shares: [{ hhId: 'g', name: 'Goth', amount: 45500, lot: 'Ophelia Villa' }] };
    assert.deepEqual(moveMoney(box, 52000), { short: 6500 });
    assert.deepEqual(moveMoney(box, 38000), { left: 7500 });
    assert.deepEqual(homesSold(box, 'Brook Bungalow'), ['Ophelia Villa']);
    assert.deepEqual(homesSold(box, 'Ophelia Villa'), []);
  });
});
