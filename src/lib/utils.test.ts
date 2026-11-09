import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Edge, SimNode } from '../types/whiteboard.ts';
import { HI_NO_CHILDREN, HI_NOT_BORN, hiDynastyChip } from './constants.ts';
import { partneredIdSet, cleanNote, currentGid, currentWorldName, isHighlightMatch, joinNotes, migrateWhiteboardData, NOTE_MAX, parentLinkMakesCycle } from './utils.ts';

function edge(a: string, b: string, type: Edge['type'] = 'parent'): Edge {
  return { id: `${type}:${a}:${b}`, a, b, type, source: 'seed' };
}

describe('parentLinkMakesCycle', () => {
  const goths = [
    edge('Bella', 'Alexander'),
    edge('Mortimer', 'Alexander'),
    edge('Alexander', 'Kid'),
    edge('Bella', 'Mortimer', 'marriage'),
  ];

  it('blocks a sim as their own parent', () => {
    assert.equal(parentLinkMakesCycle('Bella', 'Bella', []), true);
  });

  it('blocks a child or grandchild becoming the parent', () => {
    assert.equal(parentLinkMakesCycle('Alexander', 'Bella', goths), true);
    assert.equal(parentLinkMakesCycle('Kid', 'Mortimer', goths), true);
  });

  it('allows ordinary parent links', () => {
    assert.equal(parentLinkMakesCycle('Bella', 'Kid', goths), false);
    assert.equal(parentLinkMakesCycle('Cassandra', 'Bella', goths), false);
    assert.equal(parentLinkMakesCycle('Mortimer', 'Bella', goths), false);
  });

  it('ignores partner and sibling links', () => {
    const edges = [edge('A', 'B', 'marriage'), edge('B', 'C', 'sibling')];
    assert.equal(parentLinkMakesCycle('C', 'A', edges), false);
  });

  it('terminates when the board already holds a cycle', () => {
    const edges = [edge('X', 'Y'), edge('Y', 'X'), edge('Y', 'Z')];
    assert.equal(parentLinkMakesCycle('Q', 'X', edges), false);
    assert.equal(parentLinkMakesCycle('Z', 'X', edges), true);
  });
});

describe('Not in any world', () => {
  const sim = (world: string, gid: string): SimNode =>
    ({ id: 'a', gid, first: 'A', sur: 'B', hh: 'B', world, oworld: world } as SimNode);

  it('renames the world once called Other (or Other / Townie) on load', () => {
    const d = migrateWhiteboardData({
      nodes: [sim('Other', 'Other||Banks'), sim('Other / Townie', 'Other / Townie||Kunal')],
      edges: [],
      groups: [{ gid: 'Other||Banks', hh: 'Banks', world: 'Other', nb: '-', color: '#9aa0a6', x: 0, y: 0, w: 0, h: 0 }],
      worlds: [{ name: 'Other', color: '#9aa0a6' }],
    });
    assert.deepEqual(
      d.nodes.map((n) => [n.world, n.oworld, n.gid]),
      [
        ['Not in any world', 'Not in any world', 'Not in any world||Banks'],
        ['Not in any world', 'Not in any world', 'Not in any world||Kunal'],
      ],
    );
    assert.equal(d.groups![0]!.gid, 'Not in any world||Banks');
    assert.equal(d.worlds![0]!.name, 'Not in any world');
  });

  it('leaves a household that only starts with "Other" alone', () => {
    assert.equal(currentGid('Otherworld||Ames'), 'Otherworld||Ames');
    assert.equal(currentWorldName('Willow Creek'), 'Willow Creek');
  });
});

describe('isHighlightMatch', () => {
  const sim = (id: string, age: string, gender: string, species?: string) =>
    ({ id, age, gender, ...(species ? { species } : {}) }) as SimNode;
  const bella = sim('bella', 'Adult', 'Female');
  const mortimer = sim('mortimer', 'Adult', 'Male');
  const cassandra = sim('cassandra', 'Young Adult', 'Female');
  const nb = sim('heir', 'Infant', 'Non-Binary');
  const cat = sim('cat', 'Adult', 'Female', 'Cat');
  const partnered = new Set(['bella', 'mortimer']);
  const glowing = (hi: string[], single = false) =>
    [bella, mortimer, cassandra, nb, cat]
      .filter((n) => isHighlightMatch(n, new Set(hi), single, { partnered }))
      .map((n) => n.id);

  it('picks sims by gender, and gender chips add to each other', () => {
    assert.deepEqual(glowing(['Female']), ['bella', 'cassandra']);
    assert.deepEqual(glowing(['Non-Binary']), ['heir']);
    assert.deepEqual(glowing(['Female', 'Male']), ['bella', 'mortimer', 'cassandra']);
  });

  it('narrows the ages picked, and Single narrows it further', () => {
    assert.deepEqual(glowing(['Adult', 'Young Adult', 'Female']), ['bella', 'cassandra']);
    assert.deepEqual(glowing(['Female'], true), ['cassandra']);
  });

  it('narrows pets only once their species is picked', () => {
    assert.deepEqual(glowing(['Cat', 'Female']), ['cat']);
    assert.deepEqual(glowing(['Cat', 'Male']), []);
  });

  it('narrows to sims with no children, and to dynasty roles, which add to each other', () => {
    const parents = new Set(['bella']);
    const head = { ...sim('head', 'Adult', 'Male'), dynasty: 'Goth', dynastyRole: 'head' } as SimNode;
    const member = { ...sim('member', 'Young Adult', 'Female'), dynasty: 'Goth' } as SimNode;
    const leaving = { ...sim('leaving', 'Young Adult', 'Female'), dynasty: 'Goth', dynastyPlan: 'none' } as SimNode;
    const outcast = { ...sim('outcast', 'Teen', 'Male'), dynasty: 'Goth', dynastyRole: 'outcast' } as SimNode;
    const all = [bella, mortimer, cassandra, nb, cat, head, member, leaving, outcast];
    const glow = (hi: string[], single = false) =>
      all.filter((n) => isHighlightMatch(n, new Set(hi), single, { partnered, parents })).map((n) => n.id);
    assert.deepEqual(glow(['Adult', HI_NO_CHILDREN]), ['mortimer', 'head']);
    assert.deepEqual(glow([hiDynastyChip('member')]), ['member']);
    assert.deepEqual(glow([hiDynastyChip('head'), hiDynastyChip('outcast')]), ['head', 'outcast']);
    // Female young adults, single, with no children, members with no role.
    assert.deepEqual(glow(['Young Adult', 'Female', HI_NO_CHILDREN, hiDynastyChip('member')], true), ['member']);
    // Pets are in no dynasty and only glow for their species.
    assert.deepEqual(glow(['Cat', HI_NO_CHILDREN]), ['cat']);
  });

  it('picks babies not born yet as a life stage, adding to the ages picked', () => {
    const baby = { ...sim('baby', 'Unknown', 'Female'), added: true } as SimNode;
    const relative = sim('relative', 'Unknown', 'Male');
    const glow = (hi: string[]) =>
      [bella, cassandra, nb, baby, relative]
        .filter((n) => isHighlightMatch(n, new Set(hi), false, { partnered, unborn: new Set(['baby']) }))
        .map((n) => n.id);
    assert.deepEqual(glow([HI_NOT_BORN]), ['baby']);
    assert.deepEqual(glow([HI_NOT_BORN, 'Infant']), ['heir', 'baby']);
    assert.deepEqual(glow([HI_NOT_BORN, 'Male']), []);
  });
});

describe('partners', () => {
  it('counts married and romance links, not one with a planned divorce or breakup', () => {
    const edges: Edge[] = [
      { id: 'v1', a: 'a', b: 'b', type: 'marriage', source: 'save' },
      { id: 'v2', a: 'c', b: 'd', type: 'romance', source: 'save', ending: { createdAt: 'x' } },
      { id: 'v3', a: 'e', b: 'f', type: 'divorced', source: 'save' },
    ];
    assert.deepEqual([...partneredIdSet(edges)].sort(), ['a', 'b']);
  });
});

describe('notes', () => {
  it('trims and caps a note, and an empty one is none', () => {
    assert.equal(cleanNote('  For an heir \n'), 'For an heir');
    assert.equal(cleanNote('   '), undefined);
    assert.equal(cleanNote(undefined), undefined);
    assert.equal(cleanNote('x'.repeat(NOTE_MAX + 20))!.length, NOTE_MAX);
  });

  it('joins the notes of links that become one, each once', () => {
    assert.equal(joinNotes(undefined, 'For an heir', ' For an heir ', 'Twins'), 'For an heir\nTwins');
    assert.equal(joinNotes(undefined, ''), undefined);
  });
});
