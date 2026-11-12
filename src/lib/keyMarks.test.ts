import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { keyMarks } from './keyMarks.ts';
import { UNHOUSED_HH } from './constants.ts';
import type { Edge, SimNode } from '../types/whiteboard.ts';

const sim = (id: string, extra: Partial<SimNode> = {}): SimNode =>
  ({ id, first: id, sur: 'Capp', age: 'Adult', state: 'Sim', gender: 'Female', gid: 'W||Capp', world: 'W', ...extra }) as SimNode;
const link = (type: Edge['type'], extra: Partial<Edge> = {}): Edge => ({ id: `${type}-${Math.random()}`, a: 'a', b: 'b', type, ...extra });
const none = { freeLots: false, offPlan: false, closing: false };

describe('the key’s marks', () => {
  it('shows nothing extra for a plain board', () => {
    assert.deepEqual([...keyMarks({ nodes: [sim('a'), sim('b')], edges: [link('marriage'), link('parent')], ...none })], []);
  });

  it('finds each mark the board draws', () => {
    const marks = keyMarks({
      nodes: [
        sim('dead', { state: 'Deceased' }),
        sim('cat', { species: 'Cat' }),
        sim('townie', { gid: `W||${UNHOUSED_HH}` }),
        sim('new', { added: true }),
        sim('saved', { fromSave: true }),
        sim('head', { dynastyRole: 'head' }),
        sim('heir', { dynastyRole: 'heir', dynastyPlan: 'role' }),
      ],
      edges: [link('parent', { secret: true }), link('romance'), link('romance', { secret: true }), link('divorced'), link('custom')],
      freeLots: true,
      offPlan: true,
      closing: true,
    });
    assert.deepEqual(
      [...marks].sort(),
      ['added', 'closing', 'deceased', 'divorced', 'dynastyRoles', 'freeLots', 'fromSave', 'offPlan', 'otherLink', 'pets', 'plannedRole', 'romance', 'secretLovers', 'secretParent', 'unhoused'].sort(),
    );
  });
});
