import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildConnectionLog } from './connectionLog.ts';
import { STUB } from './constants.ts';
import { describeLinkSelection } from './linkLabel.ts';
import { coParentNote, indexPairStatus, mergePairStatus } from './pairStatus.ts';
import { computeEdgeRenderData } from './routing.ts';
import { withoutSecretLinks, withoutSecretStatus } from './secrets.ts';
import type { Edge, PairStatus, SimNode } from '../types/whiteboard.ts';

function card(id: string, x: number, y: number): SimNode {
  return {
    id,
    first: id,
    sur: 'Ames',
    age: 'Adult',
    state: 'Sim',
    gender: 'Female',
    hh: 'Ames',
    world: 'W',
    nb: '-',
    color: '#000',
    townie: false,
    oworld: 'W',
    onb: '-',
    ohh: 'Ames',
    oplay: 'Resident',
    pack: 'Base Game',
    gid: 'g',
    x,
    y,
    w: 200,
    h: 100,
    ox: 0,
    oy: 0,
  };
}

// Ann and Ben are the known parents of Cal; Dee is Cal's secret parent and
// Ann's secret lover. Eve and Fay have Gus without being a couple.
const nodes = [
  card('Ann', 0, 0),
  card('Ben', 300, 0),
  card('Dee', 600, 0),
  card('Cal', 150, 300),
  card('Eve', 1200, 0),
  card('Fay', 1500, 0),
  card('Gus', 1350, 300),
];
const byid = Object.fromEntries(nodes.map((n) => [n.id, n]));
const edges: Edge[] = [
  { id: 'm', a: 'Ann', b: 'Ben', type: 'marriage', source: 'save' },
  { id: 'pa', a: 'Ann', b: 'Cal', type: 'parent', source: 'save', bundleId: 'b1' },
  { id: 'pd', a: 'Dee', b: 'Cal', type: 'parent', source: 'save', secret: true, bundleId: 'b1' },
  { id: 'sl', a: 'Ann', b: 'Dee', type: 'romance', source: 'save', secret: true },
  { id: 'pe', a: 'Eve', b: 'Gus', type: 'parent', source: 'save' },
  { id: 'pf', a: 'Fay', b: 'Gus', type: 'parent', source: 'save' },
];
const pairs: PairStatus[] = [
  { a: 'Eve', b: 'Fay', tags: ['bestFriends'] },
  { a: 'Ann', b: 'Ben', tags: ['married', 'disliked'] },
];
const data = computeEdgeRenderData({
  nodes,
  edges,
  groups: [],
  show: { groups: true, worlds: true },
  packVis: () => true,
  fastRoute: true,
});
const chip = (ids: string[]) =>
  describeLinkSelection(ids, edges, byid, data, indexPairStatus(pairs));

describe('secrets on the board', () => {
  it('puts a lock on the child\'s top stem for a secret parent', () => {
    assert.deepEqual(data.secrets, [{ child: 'Cal', at: [250, 300 - STUB / 2], ids: ['pd'] }]);
  });

  it('draws secret lovers with the secret pill', () => {
    const u = data.unions.find((x) => x.edgeId === 'sl');
    assert.equal(u?.secret, true);
    assert.equal(data.unions.find((x) => x.edgeId === 'm')?.secret, undefined);
  });

  it('labels the lock and the secret lovers line', () => {
    assert.equal(chip(['pd'])?.label, 'Secret parent → child');
    assert.equal(chip(['sl'])?.label, 'Secret lovers');
  });

  it('names the secret parent when the shared line is picked', () => {
    assert.equal(chip(['pa', 'pd'])?.note, 'Secret parent: Dee Ames');
  });

  it('says what co-parents who are not a couple are to each other', () => {
    assert.equal(chip(['pe', 'pf'])?.note, 'Not a couple · Best friends');
  });

  it('adds no note for a plain couple\'s child', () => {
    const plain = edges.filter((e) => e.id === 'm');
    const kid: Edge[] = [
      ...plain,
      { id: 'k1', a: 'Ann', b: 'Gus', type: 'parent' },
      { id: 'k2', a: 'Ben', b: 'Gus', type: 'parent' },
    ];
    assert.equal(
      describeLinkSelection(['k1', 'k2'], kid, byid, data, indexPairStatus(pairs))?.note,
      undefined,
    );
  });

  it('writes secrets into the connection log', () => {
    const text = buildConnectionLog(edges, byid).map((e) => e.text);
    assert.ok(
      text.some((t) => /^Ann Ames.* had a .* child, Cal Ames, with Dee Ames.* \(secret parent\)\.$/s.test(t)),
      text.join('\n'),
    );
    assert.ok(text.some((t) => /Ann Ames.* and Dee Ames.* are ❤ secret lovers\./s.test(t)));
  });
});

describe('pair status helpers', () => {
  it('lets a loaded file replace the statuses it lists', () => {
    const merged = mergePairStatus(
      [
        { a: 'A', b: 'B', tags: ['friends'] },
        { a: 'A', b: 'C', tags: ['enemies'] },
      ],
      [{ a: 'B', b: 'A', tags: ['bestFriends'] }],
    );
    assert.deepEqual(merged, [
      { a: 'A', b: 'C', tags: ['enemies'] },
      { a: 'B', b: 'A', tags: ['bestFriends'] },
    ]);
  });

  it('words co-parent notes in the game\'s terms', () => {
    assert.equal(coParentNote(undefined), 'Not a couple');
    assert.equal(coParentNote(['exes', 'disliked']), 'Not a couple · Exes · Dislike each other');
    assert.equal(coParentNote(['partners', 'goodFriends']), 'Partners in your save · Good friends');
  });
});

describe('hide secrets', () => {
  const shown = withoutSecretLinks(edges);
  const hiddenPairs = withoutSecretStatus([
    ...pairs,
    { a: 'Ann', b: 'Dee', tags: ['secretLovers', 'goodFriends'] },
  ]);
  const hiddenData = computeEdgeRenderData({
    nodes,
    edges: shown,
    groups: [],
    show: { groups: true, worlds: true },
    packVis: () => true,
    fastRoute: true,
  });

  it('drops the lock and the secret lovers line, and nothing else', () => {
    assert.equal(hiddenData.secrets, undefined);
    assert.deepEqual(
      hiddenData.unions.map((u) => u.edgeId),
      ['m'],
    );
    assert.deepEqual(
      shown.map((e) => e.id),
      ['m', 'pa', 'pe', 'pf'],
    );
  });

  it('leaves the known parent on the child\'s line', () => {
    const chip = describeLinkSelection(['pa'], shown, byid, hiddenData, indexPairStatus(hiddenPairs));
    assert.equal(chip?.nameFrom, 'Ann Ames');
    assert.equal(chip?.note, undefined);
  });

  it('keeps the secret out of a co-parent label', () => {
    assert.deepEqual(
      hiddenPairs.find((p) => p.b === 'Dee')?.tags,
      ['goodFriends'],
    );
    assert.equal(coParentNote(['goodFriends']), 'Not a couple · Good friends');
  });

  it('keeps secrets out of the log', () => {
    const text = buildConnectionLog(shown, byid).map((e) => e.text).join('\n');
    assert.ok(!/secret/i.test(text), text);
  });

  it('returns the same list when there is nothing to hide', () => {
    const plain = edges.filter((e) => !e.secret);
    assert.equal(withoutSecretLinks(plain), plain);
  });
});
