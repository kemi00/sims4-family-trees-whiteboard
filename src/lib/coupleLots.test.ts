import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { coupleLotChoices, lotOptionLabel, lotsIn, type GameLot } from './places.ts';
import { NOT_IN_WORLD } from './constants.ts';

describe('free lots for a couple who move together', () => {
  const worlds = ['Willow Creek', 'Oasis Springs', 'Newcrest', NOT_IN_WORLD];

  it('lists their own worlds first, then the board’s others, and never Not in any world', () => {
    const out = coupleLotChoices(worlds, new Map(), ['Newcrest', 'Oasis Springs']);
    assert.deepEqual(out.map((c) => c.world), ['Newcrest', 'Oasis Springs', 'Willow Creek']);
  });

  it('leaves out lots a household lives on, and a world with none free', () => {
    const wc = lotsIn('Willow Creek');
    const homes = new Map<string, GameLot>(wc.map((l, i) => [`hh${i}`, l]));
    const out = coupleLotChoices(worlds, homes, ['Willow Creek', 'Willow Creek']);
    assert.ok(!out.some((c) => c.world === 'Willow Creek'));
    const one = new Map<string, GameLot>([['hh', wc[0]!]]);
    const free = coupleLotChoices(worlds, one, ['Willow Creek']).find((c) => c.world === 'Willow Creek')!;
    assert.equal(free.lots.length, wc.length - 1);
    assert.ok(!free.lots.some((l) => l.name === wc[0]!.name));
  });

  it('names an empty lot as one in the picker', () => {
    const empty = [...worlds].flatMap((w) => lotsIn(w)).find((l) => l.kind === 'empty');
    assert.ok(empty);
    assert.equal(lotOptionLabel(empty), `${empty.name} · ${empty.nb} · Empty lot`);
  });
});
