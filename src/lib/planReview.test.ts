import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Edge, SimNode } from '../types/whiteboard.ts';
import type { SaveMergeResult } from './savegame/mergeSave.ts';
import type { ParsedSave } from './savegame/parseSave.ts';
import {
  effectiveMatches,
  initialPlanChoices,
  overruledBy,
  planReview,
  withConflictChoice,
} from './planReview.ts';

const sim = (id: string, extra: Partial<SimNode> = {}): SimNode =>
  ({
    id,
    gid: 'W||Home',
    first: id,
    sur: 'X',
    age: 'Young Adult',
    state: 'Sim',
    gender: 'Female',
    hh: 'Home',
    world: 'W',
    nb: '',
    color: '#999',
    saveSimId: `s-${id}`,
    ...extra,
  }) as SimNode;
const link = (id: string, a: string, b: string, type: Edge['type'], source: Edge['source'] = 'save'): Edge => ({
  id,
  a,
  b,
  type,
  source,
});
const baby = (id: string, gender: string) => ({
  saveSimId: `s-${id}`,
  householdId: 'h',
  first: id,
  last: 'Capp',
  household: 'Capp',
  age: 'Infant',
  gender,
  bornInPlay: true as const,
});

/**
 * Beatrice was planned with Dirk, with a planned heir; in the game she
 * married Adekoya and had the triplets.
 */
function scene(babies: string[]) {
  const nodes = [
    sim('Beatrice'),
    sim('Dirk', { gender: 'Male' }),
    sim('Adekoya', { gender: 'Male' }),
    sim('Heir', { added: true, saveSimId: undefined, first: '', planLabel: 'Heir', sur: 'Dreamer', gender: '-' }),
  ];
  const edges = [
    link('u1', 'Beatrice', 'Dirk', 'marriage', 'planned'),
    link('u2', 'Beatrice', 'Heir', 'parent', 'planned'),
    link('u3', 'Dirk', 'Heir', 'parent', 'planned'),
  ];
  const kids = babies.map((b, i) => sim(b, { age: 'Infant', gender: i === babies.length - 1 ? 'Male' : 'Female' }));
  const merge = {
    nodes: [...nodes, ...kids],
    edges: [
      ...edges,
      link('v1', 'Beatrice', 'Adekoya', 'marriage'),
      ...babies.flatMap((b) => [link(`vb${b}`, 'Beatrice', b, 'parent'), link(`va${b}`, 'Adekoya', b, 'parent')]),
    ],
  } as unknown as SaveMergeResult;
  const parsed = {
    sims: babies.map((b, i) => baby(b, i === babies.length - 1 ? 'Male' : 'Female')),
    rels: babies.flatMap((b) => [
      { a: 's-Beatrice', b: `s-${b}`, type: 'parent' as const },
      { a: 's-Adekoya', b: `s-${b}`, type: 'parent' as const },
    ]),
  } as unknown as ParsedSave;
  return planReview(merge, parsed, nodes, edges, []);
}

describe('the review step: a planned child under its couple', () => {
  it('asks about the heir inside the marriage the game went against, not on its own', () => {
    const plan = scene(['Helena', 'Titania', 'Lysander']);
    assert.deepEqual(plan.suggestions, []);
    const [k, ...rest] = plan.children['u1']!;
    assert.equal(rest.length, 0);
    assert.deepEqual(
      [k!.slotId, k!.parents, k!.followParents, k!.keep, k!.dropRemoves],
      ['Heir', ['Beatrice', 'Dirk'], ['Beatrice', 'Adekoya'], [], true],
    );
    // If you follow the game, the triplets are Beatrice & Adekoya's: all fit,
    // none sure, by name since the heir's gender is open.
    assert.deepEqual(
      k!.follow.map((c) => [c.name, c.all, c.sure]),
      [
        ['Helena Capp', true, false],
        ['Lysander Capp', true, false],
        ['Titania Capp', true, false],
      ],
    );
    assert.equal(plan.linkTypes['u1'], 'marriage');
  });

  it('says whose planned parent a pick overrules: Dirk, for Helena', () => {
    const plan = scene(['Helena', 'Titania', 'Lysander']);
    const helena = plan.children['u1']![0]!.follow[0]!;
    assert.deepEqual(overruledBy(helena, ['Beatrice', 'Dirk'], plan.saveIds), ['Dirk']);
  });

  it('counts a pick only while the couple’s choice offers it', () => {
    const plan = scene(['Helena', 'Titania', 'Lysander']);
    const start = initialPlanChoices(plan, true);
    assert.deepEqual(start, { matches: {}, resolve: { u1: 'follow' } });
    const picked = { ...start, matches: { Heir: 's-Helena' } };
    assert.deepEqual(effectiveMatches(plan, picked), { Heir: 's-Helena' });
    const kept = withConflictChoice(plan, picked, 'u1', 'keep', true);
    assert.deepEqual(effectiveMatches(plan, kept), {});
    assert.deepEqual(effectiveMatches(plan, withConflictChoice(plan, picked, 'u1', 'later', true)), {});
    // Back to following the game, Helena is still picked.
    assert.deepEqual(effectiveMatches(plan, withConflictChoice(plan, kept, 'u1', 'follow', false)), { Heir: 's-Helena' });
  });

  it('matches the one child of the couple the game chose, when you follow it', () => {
    const plan = scene(['Helena']);
    const start = initialPlanChoices(plan, true);
    assert.deepEqual(start.matches, { Heir: 's-Helena' });
    const kept = withConflictChoice(plan, start, 'u1', 'keep', true);
    assert.deepEqual(effectiveMatches(plan, kept), {});
    assert.deepEqual(effectiveMatches(plan, withConflictChoice(plan, kept, 'u1', 'follow', true)), { Heir: 's-Helena' });
    const none = withConflictChoice(plan, initialPlanChoices(plan, false), 'u1', 'follow', false);
    assert.deepEqual(effectiveMatches(plan, none), {});
  });
});
