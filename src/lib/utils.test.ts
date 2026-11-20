import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Edge, SimNode } from '../types/whiteboard.ts';
import { DECEASED_STATE, HI_AGE_UNSET, HI_DESCENDANTS, HI_IN_GAME, HI_MARRIED, HI_NO_CHILDREN, HI_NO_DYNASTY, HI_NO_SIBLINGS, HI_NOT_BORN, HI_PLANNED, HI_ROMANCE, HI_SIBLINGS, hiDynastyChip, hiHouseholdChip, hiHouseholdRange, householdChipRange } from './constants.ts';
import { unhousedGid } from './unhoused.ts';
import { descendantIdSet, householdSizes, partneredIdSet, parentIdSet, siblingIdSet, cleanNote, currentGid, currentWorldName, isHighlightMatch, joinNotes, migrateWhiteboardData, NOTE_MAX, parentLinkMakesCycle } from './utils.ts';

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

describe('siblings for highlighting', () => {
  it('counts shared parents, half-siblings, planned and adopted children, and explicit sibling links', () => {
    const links = [
      edge('Late parent', 'Ada'), { ...edge('Late parent', 'Ben'), source: 'planned' as const },
      edge('Other parent', 'Ben'), { ...edge('Other parent', 'Cy'), adopted: true },
      edge('Dan', 'Eve', 'sibling'), edge('Dan', 'Eve', 'marriage'),
      edge('Solo parent', 'Only'), edge('Solo parent', 'Only'), edge('Only', 'Only', 'sibling'),
    ];
    assert.deepEqual([...siblingIdSet(links, (id) => id !== 'Late parent')].sort(), ['Ada', 'Ben', 'Cy', 'Dan', 'Eve']);
  });

  it('does not count deceased siblings or unrelated family links', () => {
    const links = [
      edge('Parent', 'Only'), edge('Parent', 'Late'), edge('Only', 'Late', 'sibling'),
      edge('Spouse', 'Only', 'marriage'), edge('Only', 'Child'),
    ];
    assert.deepEqual([...siblingIdSet(links, (id) => id !== 'Late')], []);
    assert.deepEqual([...siblingIdSet(links)].sort(), ['Late', 'Only']);
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

  it('narrows to no siblings alongside family, age, gender and dynasty picks', () => {
    const member = { ...cassandra, dynasty: 'Goth' };
    const dead = { ...nb, id: 'dead', state: 'Deceased' };
    const glow = (hi: string[], single = false) => [bella, mortimer, member, nb, cat, dead]
      .filter((n) => isHighlightMatch(n, new Set(hi), single, {
        partnered, siblings: new Set(['bella', 'heir']), descendants: new Set(['mortimer']),
      })).map((n) => n.id);
    assert.deepEqual(glow([HI_NO_SIBLINGS]), ['mortimer', 'cassandra']);
    assert.deepEqual(glow([HI_NO_SIBLINGS, HI_NO_CHILDREN]), ['cassandra']);
    assert.deepEqual(glow([HI_NO_SIBLINGS, HI_NO_CHILDREN, 'Young Adult', 'Female', hiDynastyChip('member')], true), ['cassandra']);
    assert.deepEqual(glow([HI_NO_SIBLINGS, 'Adult'], true), []);
    assert.deepEqual(glow([HI_NO_SIBLINGS, 'Cat']), ['cat']);
  });

  it('narrows to sims with no children, and to dynasty roles, which add to each other', () => {
    const descendants = new Set(['bella']);
    const head = { ...sim('head', 'Adult', 'Male'), dynasty: 'Goth', dynastyRole: 'head' } as SimNode;
    const member = { ...sim('member', 'Young Adult', 'Female'), dynasty: 'Goth' } as SimNode;
    const leaving = { ...sim('leaving', 'Young Adult', 'Female'), dynasty: 'Goth', dynastyPlan: 'none' } as SimNode;
    const outcast = { ...sim('outcast', 'Teen', 'Male'), dynasty: 'Goth', dynastyRole: 'outcast' } as SimNode;
    const all = [bella, mortimer, cassandra, nb, cat, head, member, leaving, outcast];
    const glow = (hi: string[], single = false) =>
      all.filter((n) => isHighlightMatch(n, new Set(hi), single, { partnered, descendants })).map((n) => n.id);
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

  it('includes future generations in the heir filter and leaves them out of members with no role', () => {
    const heir = { ...sim('current', 'Adult', 'Male'), dynasty: 'Goth', dynastyRole: 'heir' } as SimNode;
    const next = { ...sim('next', 'Teen', 'Female'), dynasty: 'Goth', heirAfter: heir.id } as SimNode;
    const later = { ...sim('later', 'Unknown', '-'), dynasty: 'Goth', heirAfter: next.id, dynastyPlan: 'member', added: true } as SimNode;
    const member = { ...sim('member', 'Young Adult', 'Female'), dynasty: 'Goth' } as SimNode;
    const leaving = { ...next, id: 'leaving', dynastyPlan: 'none' } as SimNode;
    const dead = { ...next, id: 'dead', state: 'Deceased' } as SimNode;
    const nodes = [heir, next, later, member, leaving, dead];
    const glow = (hi: string[]) => nodes
      .filter((n) => isHighlightMatch(n, new Set(hi), false, { partnered, unborn: new Set([later.id]) }))
      .map((n) => n.id);
    assert.deepEqual(glow([hiDynastyChip('heir')]), ['current', 'next', 'later']);
    assert.deepEqual(glow([hiDynastyChip('member')]), ['member']);
    assert.deepEqual(glow([hiDynastyChip('heir'), 'Teen']), ['next']);
    assert.deepEqual(glow([hiDynastyChip('heir'), HI_NOT_BORN]), ['later']);
  });

  it('never picks the deceased, pets included', () => {
    const dead = { ...sim('dead', 'Elder', 'Female'), state: 'Deceased' } as SimNode;
    const deadCat = { ...sim('deadCat', 'Adult', 'Female', 'Cat'), state: 'Deceased' } as SimNode;
    const glow = (hi: string[], single = false) =>
      [bella, dead, cat, deadCat]
        .filter((n) => isHighlightMatch(n, new Set(hi), single, { partnered }))
        .map((n) => n.id);
    assert.deepEqual(glow(['Female']), ['bella']);
    assert.deepEqual(glow(['Elder']), []);
    assert.deepEqual(glow([], true), []);
    assert.deepEqual(glow(['Cat']), ['cat']);
    // With no chip on, nothing is picked out and every card shows as usual.
    assert.deepEqual(glow([]), ['bella', 'dead', 'cat', 'deadCat']);
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

  it('leaves out the deceased when asked: the widowed are single, and a child who died does not count', () => {
    const edges: Edge[] = [
      { id: 'v1', a: 'widow', b: 'late', type: 'marriage', source: 'save' },
      { id: 'v2', a: 'g', b: 'h', type: 'romance', source: 'save' },
      { id: 'p1', a: 'widow', b: 'lostChild', type: 'parent', source: 'save' },
      { id: 'p2', a: 'g', b: 'kid', type: 'parent', source: 'save' },
      { id: 'p3', a: 'late', b: 'kid', type: 'parent', source: 'save' },
    ];
    const alive = (id: string) => id !== 'late' && id !== 'lostChild';
    assert.deepEqual([...partneredIdSet(edges, alive)].sort(), ['g', 'h']);
    assert.deepEqual([...partneredIdSet(edges)].sort(), ['g', 'h', 'late', 'widow']);
    assert.deepEqual([...parentIdSet(edges, alive)].sort(), ['g', 'late']);
    assert.deepEqual([...parentIdSet(edges)].sort(), ['g', 'late', 'widow']);
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

describe('theHousehold', () => {
  it('names a household in a sentence, never "the The"', async () => {
    const { theHousehold } = await import('./utils.ts');
    assert.equal(theHousehold('Munch'), 'the Munch household');
    assert.equal(theHousehold('The Nectar Making Duo'), 'The Nectar Making Duo household');
  });
});

describe('the family pairs and household sizes in the highlight', () => {
  const sims = ['a', 'b', 'c', 'd', 'e'].map(
    (id) => ({ id, first: id, sur: 'X', age: 'Adult', gender: 'Female', state: 'Sim', gid: id === 'e' ? 'W||Solo' : 'W||Duo' }) as SimNode,
  );
  const sets = {
    partnered: new Set(['a', 'b', 'c']),
    married: new Set(['a', 'b']),
    descendants: new Set(['a']),
    siblings: new Set(['d']),
    householdSizes: new Map([['W||Duo', 4], ['W||Solo', 1]]),
  };
  const pick = (hi: string[], single = false) => sims.filter((n) => isHighlightMatch(n, new Set(hi), single, sets)).map((n) => n.id);

  it('adds up within a pair and narrows across pairs', () => {
    assert.deepEqual(pick([HI_MARRIED]), ['a', 'b']);
    assert.deepEqual(pick([HI_ROMANCE]), ['c']);
    assert.deepEqual(pick([HI_ROMANCE, HI_MARRIED]), ['a', 'b', 'c']);
    assert.deepEqual(pick([], true), ['d', 'e']);
    assert.deepEqual(pick([HI_MARRIED], true), ['a', 'b', 'd', 'e'], 'Single and Married add up');
    assert.deepEqual(pick([HI_DESCENDANTS, HI_MARRIED]), ['a']);
    assert.deepEqual(pick([HI_SIBLINGS, HI_NO_SIBLINGS]), ['a', 'b', 'c', 'd', 'e']);
  });

  it('picks sims by how many their household has, one size or a range', () => {
    assert.deepEqual(pick([hiHouseholdChip(1)]), ['e']);
    assert.deepEqual(pick([hiHouseholdChip(1), hiHouseholdChip(4)]), ['a', 'b', 'c', 'd', 'e']);
    assert.deepEqual(pick([hiHouseholdChip(4)], true), ['d']);
    assert.deepEqual(pick([hiHouseholdRange(2, 4)]), ['a', 'b', 'c', 'd']);
    assert.deepEqual(pick([hiHouseholdRange(1, 3)]), ['e']);
    assert.deepEqual(pick([hiHouseholdRange(4, null)]), ['a', 'b', 'c', 'd']);
    assert.deepEqual(pick([hiHouseholdRange(5, null)]), []);
  });

  it('reads a range either way round, and an old single size', () => {
    assert.deepEqual(householdChipRange(hiHouseholdRange(2, null)), { min: 2, max: null });
    assert.deepEqual(householdChipRange('household:6-2'), { min: 2, max: 6 });
    assert.deepEqual(householdChipRange(hiHouseholdChip(3)), { min: 3, max: 3 });
    assert.equal(householdChipRange('Teen'), null);
  });

  it('counts everyone at home toward the game’s limit, pets and babies to come too, not the deceased or the Unhoused', () => {
    const nodes = [
      { id: 'p', gid: 'W||Home', state: 'Sim' },
      { id: 'q', gid: 'W||Home', state: DECEASED_STATE },
      { id: 'r', gid: 'W||Home', state: 'Sim', species: 'Cat' },
      { id: 's', gid: 'W||Home', state: 'Sim', added: true },
      { id: 't', gid: unhousedGid('W'), state: 'Sim' },
    ] as SimNode[];
    assert.deepEqual([...householdSizes(nodes)], [['W||Home', 3]]);
  });

  it('puts each sim in one life stage: its own, Not born yet, or Age not set', () => {
    const people = [
      { id: 'ya', age: 'Young Adult' },
      { id: 'baby', age: 'Unknown' },
      { id: 'newcomer', age: 'Unknown' },
      { id: 'adoptee', age: 'Child' },
    ].map((x) => ({ ...x, first: x.id, sur: 'X', gender: 'Female', state: 'Sim', gid: 'W||Duo' }) as SimNode);
    const s = { partnered: new Set<string>(), unborn: new Set(['baby', 'adoptee']), planned: new Set(['baby', 'newcomer', 'adoptee']) };
    const who = (hi: string[]) => people.filter((n) => isHighlightMatch(n, new Set(hi), false, s)).map((n) => n.id);
    assert.deepEqual(who([HI_NOT_BORN]), ['baby']);
    assert.deepEqual(who([HI_AGE_UNSET]), ['newcomer']);
    assert.deepEqual(who(['Child']), ['adoptee']);
    // In your game: planned or not, narrowing the life stage.
    assert.deepEqual(who([HI_PLANNED]), ['baby', 'newcomer', 'adoptee']);
    assert.deepEqual(who([HI_IN_GAME]), ['ya']);
    assert.deepEqual(who([HI_PLANNED, 'Child']), ['adoptee']);
    assert.deepEqual(who([HI_PLANNED, HI_IN_GAME]), ['ya', 'baby', 'newcomer', 'adoptee']);
  });

  it('picks sims in no dynasty with None, beside the roles', () => {
    const people = [
      { id: 'head', dynasty: 'Goth', dynastyRole: 'head' },
      { id: 'member', dynasty: 'Goth' },
      { id: 'none' },
    ].map((x) => ({ ...x, first: x.id, sur: 'X', age: 'Adult', gender: 'Female', state: 'Sim', gid: 'W||Duo' }) as SimNode);
    const who = (hi: string[]) => people.filter((n) => isHighlightMatch(n, new Set(hi), false, { partnered: new Set() })).map((n) => n.id);
    assert.deepEqual(who([HI_NO_DYNASTY]), ['none']);
    assert.deepEqual(who([HI_NO_DYNASTY, hiDynastyChip('head')]), ['head', 'none']);
  });

  it('knows descendants past a child who passed away', () => {
    const edges = [
      { id: '1', a: 'gran', b: 'mum', type: 'parent' },
      { id: '2', a: 'mum', b: 'kid', type: 'parent' },
    ] as Edge[];
    const ids = descendantIdSet(edges, (id) => id !== 'mum');
    assert.deepEqual([...ids].sort(), ['gran', 'mum']);
  });
});
