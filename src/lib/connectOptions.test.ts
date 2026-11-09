import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { connectOptions } from './connectOptions.ts';
import type { ConnectChoice, Edge, SimNode } from '../types/whiteboard.ts';

function sim(id: string, age: string): SimNode {
  return {
    id, first: id, sur: 'X', age, state: 'Sim', gender: 'Female', hh: 'X', world: 'W', nb: '-', color: '#000',
    townie: false, oworld: 'W', onb: '-', ohh: 'X', oplay: 'Resident', pack: 'Base Game', gid: 'W||X', x: 0, y: 0, w: 0, h: 0,
  };
}

const star = sim('Star', 'Adult');
const agora = sim('Agora', 'Young Adult');

function options(edges: Edge[], a = star, b = agora) {
  const r = connectOptions({ a, b, edges });
  const all = r.sections.flatMap((s) => s.options);
  const get = (c: ConnectChoice) => all.find((o) => o.choice === c);
  return { now: r.now, all, get };
}

describe('connectOptions', () => {
  it('offers every link to two sims with none', () => {
    const { now, get } = options([]);
    assert.equal(now, null);
    for (const c of ['marriage', 'romance', 'secretromance', 'divorced', 'parent', 'adoptive', 'childof', 'coparents', 'sibling', 'custom'] as const) {
      assert.ok(get(c) && !get(c)!.why, c);
    }
    assert.equal(get('divorce'), undefined);
    assert.equal(get('breakup'), undefined);
  });

  it('plans a married couple’s divorce rather than adding a divorced link', () => {
    const married: Edge = { id: 'm', a: 'Star', b: 'Agora', type: 'marriage', source: 'save' };
    let o = options([married]);
    assert.equal(o.now, 'married');
    assert.equal(o.get('marriage')!.why, 'Married already');
    assert.equal(o.get('divorced'), undefined);
    assert.deepEqual(o.get('divorce'), { choice: 'divorce' });
    o = options([{ ...married, ending: { createdAt: 'x' } }]);
    assert.equal(o.now, 'married · divorce planned');
    assert.deepEqual(o.get('divorce'), { choice: 'divorce', cancel: true });
    // A couple is no parent and child: the board would drop that link.
    for (const c of ['parent', 'secretparent', 'adoptive', 'childof', 'secretchildof', 'adoptedby'] as const) {
      assert.equal(o.get(c)!.why, 'They’re married', c);
    }
  });

  it('plans a breakup for a couple in a romance', () => {
    const o = options([{ id: 'r', a: 'Agora', b: 'Star', type: 'romance', source: 'planned' }]);
    assert.equal(o.now, 'in a romance');
    assert.equal(o.get('romance')!.why, 'In a romance already');
    assert.ok(!o.get('marriage')!.why, 'a wedding can still be planned');
    assert.deepEqual(o.get('breakup'), { choice: 'breakup' });
  });

  it('marks a parent link already there adopted, and keeps adoption to its rule', () => {
    const parent: Edge = { id: 'p', a: 'Star', b: 'Agora', type: 'parent', source: 'save' };
    let o = options([parent]);
    assert.equal(o.get('parent')!.why, 'Already Agora’s parent');
    assert.ok(!o.get('adoptive')!.why, 'marks the link adopted');
    o = options([{ ...parent, adopted: true }]);
    assert.equal(o.get('adoptive')!.why, 'Adopted already');
    // A parent and child are no couple: that would quietly drop the parent link.
    assert.equal(o.now, 'Star is Agora’s adoptive parent');
    for (const c of ['marriage', 'romance', 'secretromance', 'divorced'] as const) {
      assert.equal(o.get(c)!.why, 'Star is Agora’s parent', c);
    }
    // Agora can't adopt Star: Star is older.
    assert.match(options([]).get('adoptedby')!.why ?? '', /Star isn’t younger than Agora/);
  });
});
