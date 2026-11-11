import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { LAYOUT_EPOCH } from './constants.ts';
import { hhBoxDraw, worldFrame } from './geometry.ts';
import { computeLayout } from './layout.ts';
import { prepareLoadedBoard, worldsWithRealm } from './loadLayout.ts';
import { neighbourhoodIconUrl, worldIconUrl } from './places.ts';
import { MAGIC_REALM, homeWorld, realmGid } from './realm.ts';
import { snapNodesToTiles } from './tiles.ts';
import { migrateWhiteboardData } from './utils.ts';
import type { Group, HhBoxDraw, HouseholdMove, SimNode, WhiteboardData } from '../types/whiteboard.ts';
import seedRoster from '../data/whiteboard.json' with { type: 'json' };

const overlaps = (a: HhBoxDraw, b: HhBoxDraw) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
const all = () => true;
const SAGES = ['Morgyn Ember', 'L. Faba', 'Simeon Silversweater'];

describe('the Magic Realm, a neighbourhood of Glimmerbrook', () => {
  const seed = migrateWhiteboardData(seedRoster as unknown as WhiteboardData);
  const worlds = seed.worlds!;

  it('is no world on the starter board: its sages live in Glimmerbrook', () => {
    assert.ok(!worlds.some((w) => w.name === MAGIC_REALM));
    const sages = seed.nodes.filter((n) => SAGES.includes(n.id));
    assert.deepEqual(
      sages.map((n) => [n.world, n.nb, n.gid.split('||')[0]]),
      SAGES.map(() => ['Glimmerbrook', MAGIC_REALM, 'Glimmerbrook']),
    );
    assert.equal(homeWorld(MAGIC_REALM), 'Glimmerbrook');
    assert.equal(realmGid('The Magic Realm||Ember'), 'Glimmerbrook||Ember');
    assert.equal(realmGid('Willow Creek||Goth'), 'Willow Creek||Goth');
  });

  it('has its icon, and Batuu its picture', () => {
    assert.ok(neighbourhoodIconUrl('Glimmerbrook', MAGIC_REALM)?.endsWith('glimmerbrook--the-magic-realm.webp'));
    assert.ok(worldIconUrl('Batuu')?.endsWith('worlds/batuu.webp'));
    assert.ok(neighbourhoodIconUrl('Ciudad Enamorada', 'Nuevo Corazón')?.endsWith('ciudad-enamorada--nuevo-corazon.webp'));
  });

  it('takes a board’s Magic Realm households into Glimmerbrook, and moves no other card', () => {
    // A board saved when the Realm was a world: its sages there, Willow Creek dragged by hand.
    const old = (n: SimNode): SimNode =>
      SAGES.includes(n.id)
        ? { ...n, world: MAGIC_REALM, oworld: MAGIC_REALM, nb: '-', onb: '-', gid: `${MAGIC_REALM}||${n.gid.split('||')[1]}`, color: '#c94c8c' }
        : n.world === 'Willow Creek'
          ? { ...n, ox: (n.ox ?? 0) + 600, oy: (n.oy ?? 0) + 900 }
          : n;
    const core = seed.nodes.map(old);
    const groups: Group[] = seed.groups!.map((g) =>
      g.nb === MAGIC_REALM ? { ...g, gid: `${MAGIC_REALM}||${g.hh}`, world: MAGIC_REALM, nb: '-', color: '#c94c8c' } : g,
    );
    const shown = snapNodesToTiles(computeLayout(core, worldsWithRealm(worlds), seed.edges));
    const r = prepareLoadedBoard({ nodes: core, layoutEpoch: LAYOUT_EPOCH, worlds, edges: seed.edges, groups });
    assert.equal(r.realmHouseholds, 3);
    const after = snapNodesToTiles(computeLayout(r.nodes, worlds, seed.edges));
    const was = new Map(shown.map((n) => [n.id, n]));
    const moved = after.filter((n) => !SAGES.includes(n.id) && (was.get(n.id)!.x !== n.x || was.get(n.id)!.y !== n.y));
    assert.deepEqual(moved.map((n) => n.id), []);
    const sages = after.filter((n) => SAGES.includes(n.id));
    assert.deepEqual(new Set(sages.map((n) => `${n.world}|${n.nb}`)), new Set([`Glimmerbrook|${MAGIC_REALM}`]));
    assert.ok(r.groups.every((g) => g.world !== MAGIC_REALM));
    assert.deepEqual(
      r.groups.filter((g) => g.nb === MAGIC_REALM).map((g) => g.gid).sort(),
      ['Glimmerbrook||Ember', 'Glimmerbrook||Faba', 'Glimmerbrook||Silversweater'],
    );
    // Clear of every other household, beside Glimmerbrook's, and Glimmerbrook runs into no other world.
    const glim = worldFrame('Glimmerbrook', shown, r.groups, all)!;
    for (const gid of new Set(sages.map((n) => n.gid))) {
      const box = hhBoxDraw(gid, after, r.groups, all)!;
      for (const other of new Set(after.map((n) => n.gid))) {
        if (other === gid) continue;
        const b = hhBoxDraw(other, after, r.groups, all);
        assert.ok(!b || !overlaps(b, box), `${gid} overlaps ${other}`);
      }
      assert.ok(Math.abs(box.l - glim.l) + Math.abs(box.t - glim.t) < 3000, `${gid} far from Glimmerbrook`);
    }
    const frame = worldFrame('Glimmerbrook', after, r.groups, all)!;
    for (const w of new Set(after.map((n) => n.world))) {
      if (w === 'Glimmerbrook') continue;
      const other = worldFrame(w, after, r.groups, all);
      assert.ok(!other || !overlaps(other, frame), `Glimmerbrook runs into ${w}`);
    }
    // Loading it again changes nothing.
    const again = prepareLoadedBoard({ nodes: r.nodes, layoutEpoch: LAYOUT_EPOCH, worlds, edges: seed.edges, groups: r.groups });
    assert.equal(again.realmHouseholds, 0);
    assert.deepEqual(again.nodes, r.nodes);
  });

  it('renames its households in the board’s records', () => {
    const move = {
      id: 'h1', simId: 'Morgyn Ember', createdAt: 'x',
      fromGid: 'The Magic Realm||Ember', fromHh: 'Ember', fromWorld: MAGIC_REALM, fromNb: '-',
      toGid: 'Glimmerbrook||Ember', toHh: 'Ember', toWorld: 'Glimmerbrook', toNb: 'Glimmerbrook',
    } as HouseholdMove;
    const d = migrateWhiteboardData({ nodes: [], edges: [], householdMoves: [move] });
    assert.deepEqual(
      [d.householdMoves![0]!.fromGid, d.householdMoves![0]!.fromWorld, d.householdMoves![0]!.fromNb],
      ['Glimmerbrook||Ember', 'Glimmerbrook', MAGIC_REALM],
    );
  });

  it('puts the Realm back A to Z for laying out a board saved before', () => {
    const names = worldsWithRealm(worlds).map((w) => w.name);
    assert.equal(names.indexOf(MAGIC_REALM), names.indexOf('Tomarang') - 1);
    assert.equal(names.indexOf(MAGIC_REALM), names.indexOf('Tartosa') + 1);
  });
});
