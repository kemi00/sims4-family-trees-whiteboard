import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CARD_H, CARD_MIN_W, LAYOUT_EPOCH } from './constants.ts';
import { hhBoxDraw, worldFrame } from './geometry.ts';
import { computeLayout } from './layout.ts';
import {
  jsonLoadTargets,
  pinCoreToTargets,
  prepareLoadedNodes,
  saveImportCore,
  separateLoadOverlaps,
  shouldRepackOffsets,
} from './loadLayout.ts';
import { mergeJsonIntoBoard } from './mergeJson.ts';
import { snapNodesToTiles, snapToTile } from './tiles.ts';
import type { Edge, Group, HhBoxDraw, SimNode, World } from '../types/whiteboard.ts';

function node(ox: number, oy = 0): SimNode {
  return {
    id: 'n',
    gid: 'g',
    first: 'A',
    sur: 'B',
    age: 'Adult',
    state: 'Sim',
    gender: 'Female',
    hh: 'H',
    world: 'Willow Creek',
    nb: '-',
    color: '#000',
    townie: false,
    oworld: 'Willow Creek',
    onb: '-',
    ohh: 'H',
    oplay: 'Resident',
    pack: '',
    x: 0,
    y: 0,
    w: 0,
    h: 0,
    ox,
    oy,
  };
}

describe('prepareLoadedNodes', () => {
  it('keeps offsets when layoutEpoch matches', () => {
    const n = node(100);
    assert.equal(shouldRepackOffsets(LAYOUT_EPOCH), false);
    const { nodes, repacked } = prepareLoadedNodes([n], LAYOUT_EPOCH);
    assert.equal(repacked, false);
    assert.equal(nodes[0]!.ox, n.ox);
  });

  it('keeps large offsets when layoutEpoch matches (big dynasty boards)', () => {
    // Users drag worlds and sims a long way; wiping those on every Load was
    // destroying carefully adjusted placements.
    const n = node(8500, -8000);
    assert.equal(shouldRepackOffsets(LAYOUT_EPOCH), false);
    const { nodes, repacked } = prepareLoadedNodes([n], LAYOUT_EPOCH);
    assert.equal(repacked, false);
    assert.equal(nodes[0]!.ox, n.ox);
    assert.equal(nodes[0]!.oy, n.oy);
  });

  /* Offsets are measured from a packed base, so a file with no stamp cannot
     say which packing produced them. Letting modest ones through loaded the
     board silently with every hand-placed card in the wrong spot. */
  it('repacks a pre-epoch file even when its offsets look modest', () => {
    const n = node(100, -50);
    assert.equal(shouldRepackOffsets(undefined), true);
    const { nodes, repacked } = prepareLoadedNodes([n], undefined);
    assert.equal(repacked, true);
    assert.equal(nodes[0]!.ox, 0);
    assert.equal(nodes[0]!.oy, 0);
  });

  it('repacks when layoutEpoch is null rather than absent', () => {
    assert.equal(shouldRepackOffsets(null), true);
  });

  it('repacks when layoutEpoch is from an older generation', () => {
    assert.equal(shouldRepackOffsets(LAYOUT_EPOCH - 1), true);
  });

  it('repacks when layoutEpoch is from a newer generation', () => {
    assert.equal(shouldRepackOffsets(LAYOUT_EPOCH + 1), true);
  });
});

describe('JSON merge pinning', () => {
  const worlds = [{ name: 'Willow Creek', color: '#4e79a7' }];
  const sim = (id: string, hh: string, extra: Partial<SimNode> = {}): SimNode => ({
    ...node(0),
    id,
    first: id.split(' ')[0]!,
    sur: hh,
    hh,
    ohh: hh,
    gid: `Willow Creek||${hh}`,
    ...extra,
  });
  const link = (a: string, b: string, type: Edge['type']): Edge => ({
    id: `${type}:${a}:${b}`,
    a,
    b,
    type,
    source: 'seed',
  });
  const at = (core: SimNode[], edges: Edge[]) =>
    new Map(computeLayout(core, worlds, edges).map((n) => [n.id, { x: n.x, y: n.y }]));

  const board = [
    sim('Bella Goth', 'Goth', { ox: 100 }),
    sim('Mortimer Goth', 'Goth'),
    sim('Cassandra Goth', 'Goth', { age: 'Child' }),
    sim('Bob Pancakes', 'Pancakes', { oy: 200 }),
    sim('Geoffrey Landgraab', 'Landgraab'),
  ];
  const boardEdges = [
    link('Bella Goth', 'Mortimer Goth', 'marriage'),
    link('Bella Goth', 'Cassandra Goth', 'parent'),
    link('Mortimer Goth', 'Cassandra Goth', 'parent'),
  ];
  // The file adds Mortimer's father, which re-packs the whole world.
  const file = [
    ...board.map((n) => ({ ...n, ox: 0, oy: 0 })),
    sim('Gunther Goth', 'Goth Elders', { age: 'Elder', gender: 'Male' }),
  ];
  const fileEdges = [...boardEdges, link('Gunther Goth', 'Mortimer Goth', 'parent')];

  const merge = (keepBoardPositions: boolean) => {
    const merged = mergeJsonIntoBoard({
      boardNodes: board,
      boardEdges,
      boardGroups: [],
      incomingNodes: file,
      incomingEdges: fileEdges,
      incomingGroups: [],
      keepBoardPositions,
    });
    const boardVisualById = Object.fromEntries(at(board, boardEdges));
    const pinned = pinCoreToTargets(
      jsonLoadTargets({ keepBoardPositions, boardVisualById, fileCore: file, fileEdges, worlds }),
      merged.nodes,
      worlds,
      merged.edges,
    );
    return { raw: at(merged.nodes, merged.edges), pinned: at(pinned, merged.edges) };
  };

  it('keeps board cards where they were on screen', () => {
    const before = at(board, boardEdges);
    const { raw, pinned } = merge(true);
    assert.ok(
      [...before].some(([id, p]) => raw.get(id)!.x !== p.x || raw.get(id)!.y !== p.y),
      'raw ox/oy alone should move at least one card in this scenario',
    );
    for (const [id, p] of before) assert.deepEqual(pinned.get(id), p, id);
  });

  it('keeps board sims in place on a replace, and keeps file-only sims off them', () => {
    const before = at(board, boardEdges);
    const replaced = at(
      pinCoreToTargets(
        jsonLoadTargets({
          keepBoardPositions: true,
          boardVisualById: Object.fromEntries(before),
          fileCore: file,
          fileEdges,
          worlds,
        }),
        file,
        worlds,
        fileEdges,
      ),
      fileEdges,
    );
    for (const [id, p] of before) assert.deepEqual(replaced.get(id), p, id);
    const gunther = replaced.get('Gunther Goth')!;
    for (const [id, p] of before) {
      assert.ok(
        Math.abs(gunther.x - p.x) >= CARD_MIN_W || Math.abs(gunther.y - p.y) >= CARD_H,
        `Gunther lands on ${id}`,
      );
    }
  });

  describe('sims new to the board, when the board keeps its positions', () => {
    // The file adds a son for the Goths and a new household in their world.
    const fileNew = [
      ...file.filter((n) => n.id !== 'Gunther Goth'),
      sim('Alexander Goth', 'Goth', { age: 'Child', gender: 'Male' }),
      sim('Gunther Goth', 'Goth Elders', { age: 'Elder', gender: 'Male' }),
    ];
    const fileNewEdges = [
      ...boardEdges,
      link('Bella Goth', 'Alexander Goth', 'parent'),
      link('Mortimer Goth', 'Alexander Goth', 'parent'),
    ];
    const shown = at(fileNew, fileNewEdges);
    const onBoard = fileNew.filter((n) => !['Alexander Goth', 'Gunther Goth'].includes(n.id));
    /** The board shows every shared card `shift(n)` away from the file. */
    const targets = (shift: (n: SimNode) => { x: number; y: number }) => {
      const boardVisualById = Object.fromEntries(
        onBoard.map((n) => {
          const p = shown.get(n.id)!;
          const d = shift(n);
          return [n.id, { x: p.x + d.x, y: p.y + d.y }];
        }),
      );
      return {
        boardVisualById,
        targets: jsonLoadTargets({
          keepBoardPositions: true,
          boardVisualById,
          fileCore: fileNew,
          fileEdges: fileNewEdges,
          worlds,
        }),
      };
    };
    const plus = (p: { x: number; y: number }, x: number, y: number) => ({ x: p.x + x, y: p.y + y });

    it('keeps a sim joining a household where the file has it beside that household', () => {
      const { targets: t } = targets((n) =>
        n.hh === 'Goth' ? { x: 1200, y: 400 } : { x: 0, y: 0 },
      );
      assert.deepEqual(t.get('Alexander Goth'), plus(shown.get('Alexander Goth')!, 1200, 400));
    });

    it('moves a household new to the board as far as the board moved its world', () => {
      const { targets: t } = targets(() => ({ x: 0, y: 800 }));
      assert.deepEqual(t.get('Gunther Goth'), plus(shown.get('Gunther Goth')!, 0, 800));
    });

    it('puts a joiner under its household when the board rearranged it onto the joiner\'s spot', () => {
      const son = shown.get('Alexander Goth')!;
      const sister = shown.get('Cassandra Goth')!;
      // The user dragged Cassandra onto the spot the file gives her brother.
      const { boardVisualById, targets: t } = targets((n) =>
        n.id === 'Cassandra Goth'
          ? { x: son.x - sister.x, y: son.y - sister.y }
          : { x: 0, y: 0 },
      );
      const placed = t.get('Alexander Goth')!;
      const goths = ['Bella Goth', 'Mortimer Goth', 'Cassandra Goth'].map(
        (id) => boardVisualById[id]!,
      );
      assert.ok(placed.y >= Math.max(...goths.map((p) => p.y + CARD_H)), 'below the Goths');
      assert.equal(placed.x, snapToTile(Math.min(...goths.map((p) => p.x))));
    });
  });

  it("puts every file card where the file shows it when the file's positions win", () => {
    const shown = at(file, fileEdges);
    const { pinned } = merge(false);
    for (const [id, p] of shown) assert.deepEqual(pinned.get(id), p, id);
  });
});

describe('save import placement', () => {
  const worlds: World[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'].map((name) => ({
    name,
    color: '#000',
  }));

  function sim(id: string, world: string, hh: string, age = 'Adult'): SimNode {
    return {
      ...node(0),
      id,
      first: id,
      sur: hh,
      age,
      hh,
      ohh: hh,
      world,
      oworld: world,
      gid: `${world}||${hh}`,
    };
  }

  function groupsOf(nodes: SimNode[]): Group[] {
    const seen = new Map<string, Group>();
    for (const n of nodes) {
      if (seen.has(n.gid)) continue;
      seen.set(n.gid, {
        gid: n.gid,
        hh: n.hh,
        world: n.world,
        nb: n.nb,
        color: n.color,
        x: 0,
        y: 0,
        w: 0,
        h: 0,
      });
    }
    return [...seen.values()];
  }

  const laidOut = (core: SimNode[], edges: Edge[] = []) =>
    snapNodesToTiles(computeLayout(core, worlds, edges));

  const byId = (nodes: SimNode[]) =>
    Object.fromEntries(nodes.map((n) => [n.id, n]));

  const at = (nodes: SimNode[], id: string) => nodes.find((n) => n.id === id)!;

  const overlaps = (a: HhBoxDraw, b: HhBoxDraw) =>
    a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;

  function overlappingPairs(
    keys: string[],
    box: (k: string) => HhBoxDraw | null,
  ): string[] {
    const out: string[] = [];
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        const a = box(keys[i]!);
        const b = box(keys[j]!);
        if (a && b && overlaps(a, b)) out.push(`${keys[i]} / ${keys[j]}`);
      }
    }
    return out;
  }

  const householdOverlaps = (nodes: SimNode[], groups: Group[]) =>
    overlappingPairs([...new Set(nodes.map((n) => n.gid))], (gid) =>
      hhBoxDraw(gid, nodes, groups, () => true),
    );

  const worldOverlaps = (nodes: SimNode[], groups: Group[]) =>
    overlappingPairs([...new Set(nodes.map((n) => n.world))], (w) =>
      worldFrame(w, nodes, groups, () => true),
    );

  /** One household per world. With four world columns, E packs under A. */
  function starterBoard(): SimNode[] {
    return [
      sim('a1', 'A', 'Alpha'),
      sim('a2', 'A', 'Alpha'),
      sim('a3', 'A', 'Aster'),
      sim('b1', 'B', 'Beta'),
      sim('c1', 'C', 'Gamma'),
      sim('d1', 'D', 'Delta'),
      sim('e1', 'E', 'Epsilon'),
    ];
  }

  function importInto(board: SimNode[], added: SimNode[], edges: Edge[] = []) {
    const shown = laidOut(board);
    const nodes = [...board, ...added];
    const groups = groupsOf(nodes);
    const core = saveImportCore({
      mode: 'merge',
      boardById: byId(shown),
      nodes,
      edges,
      groups,
      worlds,
      snap: true,
    });
    return { shown, groups, after: laidOut(core, edges) };
  }

  it('keeps a sim who joins a household on the board inside that household', () => {
    const board = starterBoard();
    const kid = { ...sim('a4', 'A', 'Alpha', 'Child'), saveSimId: '4' };
    const edges = [
      { id: 'p1', a: 'a1', b: 'a4', type: 'parent', source: 'save' },
    ] satisfies Edge[];
    const { shown, groups, after } = importInto(board, [kid], edges);

    assert.deepEqual(householdOverlaps(after, groups), []);
    const home = hhBoxDraw('A||Alpha', after, groups, () => true)!;
    const placed = after.find((n) => n.id === 'a4')!;
    const parent = shown.find((n) => n.id === 'a1')!;
    assert.ok(
      placed.y - (parent.y + parent.h) <= 2 * (parent.h + 100),
      `new member sits near its household, not under the world (dy ${placed.y - parent.y})`,
    );
    assert.ok(home.b - home.t < 1000, 'household box stays compact');
    for (const n of shown) {
      const now = after.find((m) => m.id === n.id)!;
      if (n.world === 'E') {
        // E sits under A, so it makes room by moving straight down.
        assert.equal(now.x, n.x);
        assert.ok(now.y >= n.y);
      } else {
        assert.deepEqual([now.x, now.y], [n.x, n.y], n.id);
      }
    }
  });

  it('pushes a world down when the import grows the world above into it', () => {
    const board = starterBoard();
    const added = ['n1', 'n2', 'n3', 'n4', 'n5', 'n6'].map((id) => ({
      ...sim(id, 'A', `New ${id}`),
      saveSimId: id,
    }));
    const { shown, groups, after } = importInto(board, added);
    const before = worldFrame('E', shown, groupsOf(board), () => true)!;
    assert.ok(
      overlappingPairs(['A', 'E'], (w) => worldFrame(w, shown, groupsOf(board), () => true))
        .length === 0 && before.t > worldFrame('A', shown, groupsOf(board), () => true)!.b,
      'fixture: E packs under A without overlap',
    );

    assert.deepEqual(worldOverlaps(after, groups), []);
    assert.deepEqual(householdOverlaps(after, groups), []);
    for (const id of ['a1', 'a2', 'a3', 'b1', 'c1', 'd1']) {
      const was = shown.find((n) => n.id === id)!;
      const now = after.find((n) => n.id === id)!;
      assert.deepEqual([now.x, now.y], [was.x, was.y], id);
    }
  });

  it('moves the worlds under a grown one straight down, keeping their order', () => {
    // Nine worlds in four columns: A, E, I share the first column.
    const board = [
      ...starterBoard(),
      sim('f1', 'F', 'Phi'),
      sim('g1', 'G', 'Gee'),
      sim('h1', 'H', 'Eta'),
      sim('i1', 'I', 'Iota'),
    ];
    const added = Array.from({ length: 12 }, (_, i) => ({
      ...sim(`n${i}`, 'A', `New ${i}`),
      saveSimId: `n${i}`,
    }));
    const { shown, groups, after } = importInto(board, added);
    assert.ok(
      at(shown, 'e1').x === at(shown, 'a1').x && at(shown, 'i1').y > at(shown, 'e1').y,
      'fixture: E and I stack under A',
    );

    assert.deepEqual(worldOverlaps(after, groups), []);
    assert.deepEqual(householdOverlaps(after, groups), []);
    for (const n of shown) {
      const now = at(after, n.id);
      assert.equal(now.x, n.x, `${n.id} keeps its column`);
      if (!['E', 'I'].includes(n.world)) assert.equal(now.y, n.y, n.id);
    }
    assert.ok(at(after, 'e1').y < at(after, 'i1').y, 'E stays above I');
  });

  it('fits a JSON merge that keeps board positions around the board too', () => {
    // The file is this board after a save grew world A, which pushed E down.
    const board = starterBoard();
    const added = Array.from({ length: 6 }, (_, i) => ({
      ...sim(`n${i}`, 'A', `New ${i}`),
      saveSimId: `n${i}`,
    }));
    const { after: fileShown } = importInto(board, added);
    const fileCore = fileShown.map((n) => ({ ...n, x: 0, y: 0, w: 0, h: 0 }));
    const shown = laidOut(board);
    assert.ok(
      at(fileShown, 'e1').y > at(shown, 'e1').y,
      'fixture: the file has E lower than the board does',
    );

    const merged = mergeJsonIntoBoard({
      boardNodes: board,
      boardEdges: [],
      boardGroups: groupsOf(board),
      incomingNodes: fileCore,
      incomingEdges: [],
      incomingGroups: groupsOf(fileCore),
      keepBoardPositions: true,
    });
    const core = separateLoadOverlaps({
      core: pinCoreToTargets(
        jsonLoadTargets({
          keepBoardPositions: true,
          boardVisualById: byId(shown),
          fileCore,
          fileEdges: [],
          worlds,
        }),
        merged.nodes,
        worlds,
        merged.edges,
      ),
      boardById: byId(shown),
      edges: merged.edges,
      groups: merged.groups,
      worlds,
      snap: true,
    });
    const after = laidOut(core);
    assert.deepEqual(worldOverlaps(after, merged.groups), []);
    assert.deepEqual(householdOverlaps(after, merged.groups), []);
    for (const n of shown) {
      if (n.world === 'E') continue;
      assert.deepEqual([at(after, n.id).x, at(after, n.id).y], [n.x, n.y], n.id);
    }
  });

  it('leaves worlds the user stacked on purpose where they are', () => {
    const board = starterBoard();
    const shown0 = laidOut(board);
    const a = shown0.find((n) => n.id === 'a1')!;
    const e = shown0.find((n) => n.id === 'e1')!;
    const dragged = board.map((n) =>
      n.id === 'e1' ? { ...n, ox: a.x - e.x + 100, oy: a.y - e.y + 100 } : n,
    );
    const added = [{ ...sim('c2', 'C', 'Gamma'), saveSimId: 'c2' }];
    const { shown, groups, after } = importInto(dragged, added);
    assert.ok(
      worldOverlaps(shown, groupsOf(dragged)).includes('A / E'),
      'fixture: the user dragged E onto A',
    );

    for (const n of shown) {
      const now = after.find((m) => m.id === n.id)!;
      assert.deepEqual([now.x, now.y], [n.x, n.y], n.id);
    }
    assert.ok(worldOverlaps(after, groups).includes('A / E'));
  });
});
