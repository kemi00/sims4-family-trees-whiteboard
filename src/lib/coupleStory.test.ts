import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  coupleLinkBlock,
  isOngoingCouple,
  nextStepLabel,
  nextSteps,
  pastUnionIds,
  storiesByPair,
  storySteps,
  withoutPastUnions,
} from './coupleStory.ts';
import { connectOptions } from './connectOptions.ts';
import { partneredIdSet, uKey } from './utils.ts';
import type { Edge, SimNode } from '../types/whiteboard.ts';

const at = (min: number) => new Date(Date.UTC(2026, 10, 20, 10, min)).toISOString();
const link = (id: string, type: Edge['type'], source: Edge['source'], min?: number, end?: number): Edge => ({
  id,
  a: 'ana',
  b: 'ben',
  type,
  source,
  ...(min !== undefined ? { createdAt: at(min) } : {}),
  ...(end !== undefined ? { ending: { createdAt: at(end) } } : {}),
});

/** Romance from the save, a breakup, back together, married, divorced, back together again. */
const whole: Edge[] = [
  link('r1', 'romance', 'save', 0, 1),
  link('r2', 'romance', 'planned', 2),
  link('m1', 'marriage', 'planned', 3, 4),
  link('r3', 'romance', 'planned', 5),
];
const planned = (e: Edge) => e.source === 'planned';
const words = (edges: Edge[]) => storySteps(storiesByPair(edges).get(uKey('ana', 'ben'))!, planned).map((s) => s.label);

describe('a couple’s story', () => {
  it('tells every step, in the order they were planned', () => {
    assert.deepEqual(words([...whole].reverse()), ['Romance', 'Break up', 'Get back together', 'Marry', 'Divorce', 'Get back together']);
  });

  it('puts the board’s own links first: a past divorce, then a romance, then a marriage', () => {
    const same = [link('m', 'marriage', 'save', 0), link('r', 'romance', 'save', 0), link('d', 'divorced', 'save', 0)];
    assert.deepEqual(words(same), ['Divorced', 'Get back together', 'Married']);
  });

  it('keeps only the last step on the board, the rest are history', () => {
    assert.deepEqual([...pastUnionIds(whole)].sort(), ['m1', 'r1', 'r2']);
    assert.deepEqual(withoutPastUnions(whole).map((e) => e.id), ['r3']);
  });

  it('counts a couple together only where their story ends together', () => {
    assert.ok(isOngoingCouple(whole[3]!, whole));
    assert.ok(!isOngoingCouple(whole[1]!, whole), 'a romance before the wedding is history');
    const divorcedAtLast = whole.slice(0, 3);
    assert.equal(partneredIdSet(divorcedAtLast).size, 0, 'the last step is a divorce: both are single');
    assert.equal(partneredIdSet(whole).size, 2);
  });

  it('offers what can come next from the last step', () => {
    assert.deepEqual(nextSteps(whole[3]), ['marriage', 'breakup']);
    assert.deepEqual(nextSteps(whole[2]), ['romance', 'marriage']);
    assert.deepEqual(nextSteps(link('m', 'marriage', 'save', 0)), ['divorce']);
    assert.deepEqual(nextSteps(link('d', 'divorced', 'save', 0)), ['romance', 'marriage']);
    assert.deepEqual(nextSteps(whole[3], true), [], 'nothing once a passing ended it');
    const steps = storySteps(whole.slice(0, 3), planned);
    assert.equal(nextStepLabel('marriage', steps), 'Remarry');
    assert.equal(nextStepLabel('romance', steps), 'Get back together');
  });

  it('refuses only the step they are at already', () => {
    assert.equal(coupleLinkBlock(whole, 'ana', 'ben', 'romance'), 'In a romance already');
    assert.equal(coupleLinkBlock(whole.slice(0, 1), 'ana', 'ben', 'romance'), null, 'after a planned breakup');
    assert.equal(coupleLinkBlock(whole.slice(0, 3), 'ana', 'ben', 'marriage'), null, 'after a planned divorce');
    assert.equal(coupleLinkBlock([link('m', 'marriage', 'save', 0)], 'ana', 'ben', 'romance'), 'Married already');
  });
});

describe('Connect on a couple with a story', () => {
  const sim = (id: string): SimNode =>
    ({
      id, first: id, sur: 'X', age: 'Adult', state: 'Sim', gender: 'Female', hh: 'X', world: 'W', nb: '-', color: '#000',
      townie: false, oworld: 'W', onb: '-', ohh: 'X', oplay: 'Resident', pack: 'Base Game', gid: 'W||X', x: 0, y: 0, w: 0, h: 0,
    }) as SimNode;
  const get = (edges: Edge[]) => {
    const r = connectOptions({ a: sim('ana'), b: sim('ben'), edges });
    const all = r.sections.flatMap((s) => s.options);
    return { now: r.now, of: (c: string) => all.find((o) => o.choice === c) };
  };

  it('lets them get back together after a planned breakup, and cancel it', () => {
    const { now, of } = get(whole.slice(0, 1));
    assert.equal(now, 'in a romance · breakup planned');
    assert.equal(of('romance')?.why, undefined);
    assert.equal(of('marriage')?.why, undefined);
    assert.deepEqual(of('breakup'), { choice: 'breakup', cancel: true });
  });

  it('lets them remarry or get back together after a planned divorce', () => {
    const { of } = get(whole.slice(0, 3));
    assert.equal(of('romance')?.why, undefined);
    assert.equal(of('marriage')?.why, undefined);
    assert.deepEqual(of('divorce'), { choice: 'divorce', cancel: true });
  });

  it('plans the breakup of the romance they are in now', () => {
    const { of } = get(whole);
    assert.equal(of('romance')?.why, 'In a romance already');
    assert.deepEqual(of('breakup'), { choice: 'breakup' });
  });
});
