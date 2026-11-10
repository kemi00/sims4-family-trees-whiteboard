import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cardTouched, holdUntouchedCards } from './holdLayout.ts';
import { computeLayout } from './layout.ts';
import { snapNodesToTiles } from './tiles.ts';
import { migrateWhiteboardData } from './utils.ts';
import type { Edge, SimNode, WhiteboardData } from '../types/whiteboard.ts';
import seedRoster from '../data/whiteboard.json' with { type: 'json' };

describe('a change keeps the cards it is not about in place', () => {
  const seed = migrateWhiteboardData(seedRoster as unknown as WhiteboardData);
  const worlds = seed.worlds!;
  const lay = (core: SimNode[], edges: Edge[]) => snapNodesToTiles(computeLayout(core, worlds, edges));
  const at = (laid: SimNode[]) => {
    const m = new Map(laid.map((n) => [n.id, { x: n.x, y: n.y }]));
    return (id: string) => m.get(id);
  };
  const moved = (a: SimNode[], b: SimNode[]) => {
    const was = at(a);
    return b.filter((n) => {
      const p = was(n.id);
      return p && (p.x !== n.x || p.y !== n.y);
    });
  };
  const core = seed.nodes;
  const laid = lay(core, seed.edges);

  // Two sims in different households of one world whose marriage repacks it.
  const marriage = (() => {
    const adults = core.filter((n) => n.world && n.age !== 'Child' && n.age !== 'Toddler' && n.age !== 'Infant' && n.age !== 'Baby');
    for (const a of adults) {
      for (const b of adults) {
        if (a.id >= b.id || a.world !== b.world || a.gid === b.gid) continue;
        const edges: Edge[] = [...seed.edges, { id: 'u-test', a: a.id, b: b.id, type: 'marriage', source: 'planned' } as Edge];
        const after = lay(core, edges);
        if (moved(laid, after).length) return { a, b, edges, after };
      }
    }
    throw new Error('no marriage on the seed board repacks a world');
  })();

  it('holds every card a new marriage would repack, the married sims included', () => {
    const shifted = moved(laid, marriage.after);
    assert.ok(shifted.length > 0);
    const r = holdUntouchedCards(core, at(laid), core, at(marriage.after));
    assert.equal(r.held, shifted.length);
    assert.deepEqual(moved(laid, lay(r.core, marriage.edges)), []);
  });

  it('leaves the cards a change is about where the change put them', () => {
    const others = core.filter((n) => n.world === marriage.a.world && n.id !== marriage.a.id && n.id !== marriage.b.id);
    const dragged = others[0];
    const mover = core.find((n) => n.world === marriage.a.world && n.gid !== dragged.gid && n.id !== marriage.a.id && n.id !== marriage.b.id)!;
    const baby = { ...marriage.a, id: 'new-baby', first: 'Baby', age: 'Infant', ox: 0, oy: 0 };
    const next = [
      ...core.map((n) =>
        n.id === dragged.id
          ? { ...n, ox: (n.ox ?? 0) + 300 }
          : n.id === mover.id
            ? { ...n, gid: marriage.a.gid }
            : n,
      ),
      baby,
    ];
    const after = lay(next, marriage.edges);
    const r = holdUntouchedCards(core, at(laid), next, at(after));
    const byId = new Map(r.core.map((n) => [n.id, n]));
    assert.equal(byId.get(dragged.id), next.find((n) => n.id === dragged.id));
    assert.equal(byId.get(mover.id), next.find((n) => n.id === mover.id));
    assert.equal(byId.get('new-baby'), baby);
    const free = new Set([dragged.id, mover.id, 'new-baby']);
    assert.deepEqual(
      moved(laid, lay(r.core, marriage.edges)).filter((n) => !free.has(n.id)),
      [],
    );
  });

  it('keeps a renamed sim and their household where they are', () => {
    // A household whose order changes when its first sim (by name) is renamed.
    for (const n of core) {
      const next = core.map((x) => (x.id === n.id ? { ...x, first: 'Zz' + x.first } : x));
      const after = lay(next, seed.edges);
      if (!moved(laid, after).length) continue;
      assert.equal(cardTouched(n, next.find((x) => x.id === n.id)!), false);
      const r = holdUntouchedCards(core, at(laid), next, at(after));
      assert.ok(r.held > 0);
      assert.deepEqual(moved(laid, lay(r.core, seed.edges)), []);
      return;
    }
    assert.fail('no rename on the seed board reorders a household');
  });

  it('returns the board itself when nothing moved', () => {
    const r = holdUntouchedCards(core, at(laid), core, at(laid));
    assert.equal(r.core, core);
    assert.equal(r.held, 0);
  });

  it('counts a new card, an offset, a household or a world as what a change is about', () => {
    const n = core[0];
    assert.equal(cardTouched(undefined, n), true);
    assert.equal(cardTouched(n, { ...n, ox: (n.ox ?? 0) + 100 }), true);
    assert.equal(cardTouched(n, { ...n, oy: (n.oy ?? 0) - 100 }), true);
    assert.equal(cardTouched(n, { ...n, gid: n.gid + '-other' }), true);
    assert.equal(cardTouched(n, { ...n, world: 'Elsewhere' }), true);
    assert.equal(cardTouched(n, { ...n, first: 'Renamed', age: 'Elder' }), false);
  });
});
