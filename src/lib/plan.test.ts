import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Edge, HouseholdMove, SimNode } from '../types/whiteboard.ts';
import {
  cardName,
  linkPlannedSim,
  numberPlannedSims,
  parentsLines,
  overruledParentLinks,
  moveToUndo,
  planConflicts,
  planProgress,
  resolvePlanConflict,
  slotSuggestions,
  unlinkPlannedSim,
} from './plan.ts';

const sim = (id: string, extra: Partial<SimNode> = {}): SimNode =>
  ({
    id,
    gid: `W||${extra.hh ?? 'Home'}`,
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
const planned = (id: string, extra: Partial<SimNode> = {}) =>
  sim(id, { added: true, saveSimId: undefined, age: 'Unknown', gender: '-', ...extra });
const link = (id: string, a: string, b: string, type: Edge['type'], source: Edge['source'] = 'save'): Edge => ({
  id,
  a,
  b,
  type,
  source,
});

describe('telling planned sims apart', () => {
  const kid = (id: string, sur: string, extra: Partial<SimNode> = {}) =>
    planned(id, { first: '', sur, ...extra });

  it('numbers unnamed planned sims per last name, oldest card first, only where two share it', () => {
    const out = numberPlannedSims([kid('new3', 'Le Chien'), kid('new1', 'Le Chien'), kid('new2', 'Romeo'), sim('Bella')]);
    assert.deepEqual(out.map(cardName), ['Planned (2) Le Chien', 'Planned (1) Le Chien', 'Planned Romeo', 'Bella X']);
    assert.equal(numberPlannedSims(out), out);
  });

  it('counts afresh when one is named, filled or deleted, closing the gap', () => {
    const three = numberPlannedSims([kid('new1', 'Le Chien'), kid('new2', 'Le Chien'), kid('new3', 'Le Chien')]);
    const filled = [{ ...three[0]!, saveSimId: '7', first: 'Joaquin' }, three[1]!, three[2]!];
    assert.deepEqual(numberPlannedSims(filled).map(cardName), ['Joaquin Le Chien', 'Planned (1) Le Chien', 'Planned (2) Le Chien']);
    const labelled = [three[0]!, { ...three[1]!, planLabel: 'Firstborn' }];
    assert.deepEqual(numberPlannedSims(labelled).map(cardName), ['Planned Le Chien', 'Firstborn Le Chien']);
  });

  it('follows a new last name: no number left behind on either', () => {
    // Derek's planned McMillan, then Ian and Derek's baby, renamed Moody.
    const both = numberPlannedSims([kid('new1', 'McMillan'), kid('new2', 'McMillan')]);
    assert.deepEqual(both.map(cardName), ['Planned (1) McMillan', 'Planned (2) McMillan']);
    const renamed = numberPlannedSims([both[0]!, { ...both[1]!, sur: 'Moody' }]);
    assert.deepEqual(renamed.map(cardName), ['Planned McMillan', 'Planned Moody']);
    assert.deepEqual(renamed.map((n) => n.planNo), [undefined, undefined]);
  });

  it('says whose child an unnamed planned sim is, in short names', () => {
    const lines = parentsLines([sim('Jules', { first: 'Jules' }), kid('new1', 'Le Chien', { planNo: 1 }), kid('new2', 'Romeo', { planLabel: 'Spouse' })]);
    assert.deepEqual(lines, ['Child of Jules ＋ Le Chien (1) ＋ Spouse', 'Jules ＋ Le Chien (1) ＋ Spouse']);
    assert.deepEqual(parentsLines([]), []);
  });

  it('prefers a plan label to the number', () => {
    assert.equal(cardName(kid('new1', 'Le Chien', { planNo: 2, planLabel: 'Firstborn' })), 'Firstborn Le Chien');
  });
});

describe('plans the game went against', () => {
  // Beatrice was planned with Dirk, with a planned baby; she married Adekoya.
  const nodes = [sim('Beatrice'), sim('Dirk', { gender: 'Male' }), sim('Adekoya', { gender: 'Male' }), planned('Heir')];
  const edges = [
    link('u1', 'Beatrice', 'Dirk', 'marriage', 'planned'),
    link('u2', 'Beatrice', 'Heir', 'parent', 'planned'),
    link('u3', 'Dirk', 'Heir', 'parent', 'planned'),
    link('v1', 'Beatrice', 'Adekoya', 'marriage'),
  ];

  it('flags a planned couple when one of them married someone else, with its planned children', () => {
    const [c, ...rest] = planConflicts(nodes, edges);
    assert.equal(rest.length, 0);
    assert.deepEqual(
      [c!.kind, c!.edgeId, c!.sim, c!.partner, c!.children, c!.strong],
      ['marriedElsewhere', 'u1', 'Beatrice', 'Adekoya', ['Heir'], true],
    );
  });

  it('lets a planned couple be when the other marriage has a planned divorce', () => {
    const divorcing = edges.map((e) => (e.id === 'v1' ? { ...e, ending: { createdAt: 'x' } } : e));
    assert.deepEqual(planConflicts(nodes, divorcing), []);
  });

  it('lets a planned couple be when the other marriage ended in a death: the widowed are single', () => {
    // Adekoya married Imani in the game; she died, so his planned marriage to Beatrice is open.
    const nodes2 = [sim('Adekoya', { gender: 'Male' }), sim('Imani', { state: 'Deceased' }), sim('Beatrice')];
    const edges2 = [link('v1', 'Adekoya', 'Imani', 'marriage'), link('u1', 'Adekoya', 'Beatrice', 'marriage', 'planned')];
    assert.deepEqual(planConflicts(nodes2, edges2), []);
    // While Imani lived, it was off plan.
    assert.equal(planConflicts(nodes2.map((n) => ({ ...n, state: 'Sim' })), edges2)[0]?.kind, 'marriedElsewhere');
  });

  it('calls dating someone else softer, and a death final', () => {
    const dating = edges.map((e) => (e.id === 'v1' ? { ...e, type: 'romance' as const } : e));
    assert.deepEqual(
      planConflicts(nodes, dating).map((c) => [c.kind, c.strong]),
      [['datingElsewhere', false]],
    );
    const gone = nodes.map((n) => (n.id === 'Dirk' ? { ...n, state: 'Deceased' } : n));
    assert.deepEqual(
      planConflicts(gone, edges.slice(0, 3)).map((c) => [c.kind, c.dead]),
      [['deceased', 'Dirk']],
    );
  });

  it('leaves out a plan kept anyway, and a couple the save has not touched', () => {
    const kept = edges.map((e) => (e.id === 'u1' ? { ...e, plan: 'kept' as const } : e));
    assert.deepEqual(planConflicts(nodes, kept), []);
    assert.deepEqual(planConflicts(nodes, edges.slice(0, 3)), []);
  });

  it('flags a planned parent of a sim the save gives two other parents', () => {
    const kid = sim('Kid', { age: 'Infant' });
    const e = [
      link('p1', 'Beatrice', 'Kid', 'parent'),
      link('p2', 'Adekoya', 'Kid', 'parent'),
      link('u9', 'Dirk', 'Kid', 'parent', 'planned'),
    ];
    assert.deepEqual(
      planConflicts([...nodes, kid], e).map((c) => [c.kind, c.edgeId]),
      [['otherParents', 'u9']],
    );
  });

  it('follows the game: the planned children are planned with the partner the game chose', () => {
    const c = planConflicts(nodes, edges)[0]!;
    let n = 0;
    const r = resolvePlanConflict(nodes, edges, c, 'follow', () => `n${n++}`, 'now');
    assert.deepEqual(
      r.edges.map((e) => `${e.a}>${e.b}:${e.type}:${e.source}`).sort(),
      ['Adekoya>Heir:parent:planned', 'Beatrice>Adekoya:marriage:save', 'Beatrice>Heir:parent:planned'],
    );
    assert.equal(planConflicts(r.nodes, r.edges).length, 0);
  });

  it('keeps the plan, flagged no more; or drops it with a planned child left unlinked', () => {
    const c = planConflicts(nodes, edges)[0]!;
    const kept = resolvePlanConflict(nodes, edges, c, 'keep', () => 'x', 'now');
    assert.equal(kept.edges.find((e) => e.id === 'u1')!.plan, 'kept');
    const dropped = resolvePlanConflict(nodes, edges, c, 'drop', () => 'x', 'now');
    assert.deepEqual(dropped.edges.map((e) => e.id), ['v1']);
    assert.ok(!dropped.nodes.some((x) => x.id === 'Heir'));
  });

  it('undoes a move into the planned partner’s household', () => {
    const moved = nodes.map((x) => (x.id === 'Beatrice' || x.id === 'Dirk' ? { ...x, gid: 'W||Dreamer' } : x));
    const moves = [{ id: 'm', simId: 'Beatrice', fromGid: 'W||Capp', toGid: 'W||Dreamer' }] as HouseholdMove[];
    const c = planConflicts(moved, edges)[0]!;
    assert.equal(moveToUndo(c, moved, moves)?.fromGid, 'W||Capp');
    assert.equal(moveToUndo(c, nodes, moves), null);
  });

  it('counts the plan: still planned, done, off plan', () => {
    const c = planConflicts(nodes, edges);
    const done = [...edges, { ...link('v2', 'Dirk', 'Adekoya', 'sibling'), wasPlanned: true as const }];
    assert.deepEqual(planProgress(done, c), { planned: 2, done: 1, offPlan: 1 });
  });
});

describe('planned sims a save can fill', () => {
  const nodes = [sim('Mum'), sim('Dad', { gender: 'Male' }), planned('Heir', { gender: 'Female' })];
  const edges = [link('u1', 'Mum', 'Heir', 'parent', 'planned'), link('u2', 'Dad', 'Heir', 'parent', 'planned')];
  const baby = (id: string, gender: string, extra = {}) => ({
    saveSimId: id,
    householdId: 'h',
    first: id,
    last: 'X',
    household: 'Home',
    age: 'Infant',
    gender,
    bornInPlay: true as const,
    ...extra,
  });

  it('is sure of the one child of both planned parents', () => {
    const parsed = {
      sims: [baby('Ana', 'Female')],
      rels: [
        { a: 's-Mum', b: 'Ana', type: 'parent' as const },
        { a: 's-Dad', b: 'Ana', type: 'parent' as const },
      ],
    };
    const [s] = slotSuggestions({ nodes, edges, parsed });
    assert.deepEqual(
      s!.candidates.map((c) => [c.name, c.why, c.sure]),
      [['Ana X', 'Daughter of Mum & Dad', true]],
    );
  });

  it('asks among triplets of one planned parent, the planned gender first', () => {
    const parsed = {
      sims: [baby('Lysander', 'Male'), baby('Helena', 'Female'), baby('Titania', 'Female')],
      rels: ['Lysander', 'Helena', 'Titania'].flatMap((b) => [
        { a: 's-Mum', b, type: 'parent' as const },
        { a: 's-Other', b, type: 'parent' as const },
      ]),
    };
    const [s] = slotSuggestions({ nodes, edges, parsed });
    assert.deepEqual(
      s!.candidates.map((c) => [c.name, c.sure]),
      [
        ['Helena X', false],
        ['Titania X', false],
        ['Lysander X', false],
      ],
    );
  });

  it('matches a planned spouse through their partner: someone new, married to them', () => {
    const spouseNodes = [sim('Oscar', { gender: 'Male' }), planned('Spare')];
    const spouseEdges = [link('u5', 'Oscar', 'Spare', 'marriage', 'planned')];
    const parsed = {
      sims: [baby('Bella', 'Female', { age: 'Young Adult', bornInPlay: undefined })],
      rels: [{ a: 's-Oscar', b: 'Bella', type: 'marriage' as const }],
    };
    const [s] = slotSuggestions({ nodes: spouseNodes, edges: spouseEdges, parsed });
    assert.deepEqual([s!.kind, s!.candidates[0]!.why, s!.candidates[0]!.sure], ['spouse', 'Married Oscar X', true]);
  });

  it('hands a planned heir role to the real sim the save has in no dynasty', () => {
    const slot = planned('Heir', { dynasty: 'Dreamer', dynastyId: '7', dynastyRole: 'heir', dynastyPlan: 'member' });
    const fill = (real: SimNode) =>
      linkPlannedSim([slot, real], [], 'Heir', real.id, 'now').nodes.find((x) => x.id === real.id)!;
    const none = fill(sim('Ana', { age: 'Infant' }));
    assert.deepEqual([none.dynasty, none.dynastyId, none.dynastyRole, none.dynastyPlan], ['Dreamer', '7', 'heir', 'member']);
    const member = fill(sim('Ana', { age: 'Infant', dynasty: 'Dreamer', dynastyId: '7' }));
    assert.deepEqual([member.dynastyRole, member.dynastyPlan], ['heir', 'role']);
    const done = fill(sim('Ana', { age: 'Infant', dynasty: 'Dreamer', dynastyId: '7', dynastyRole: 'heir' }));
    assert.equal(done.dynastyPlan, undefined);
  });

  it('hands a planned sim’s place in line to the real sim, and so do the heirs planned after it', () => {
    const slot = planned('Heir', { dynasty: 'Dreamer', dynastyId: '7', dynastyPlan: 'member', heirAfter: 'Dirk' });
    const grandchild = planned('Next', { dynasty: 'Dreamer', dynastyId: '7', dynastyPlan: 'member', heirAfter: 'Heir' });
    const real = sim('Ana', { age: 'Infant', dynasty: 'Dreamer', dynastyId: '7' });
    const out = linkPlannedSim([slot, grandchild, real], [], 'Heir', 'Ana', 'now').nodes;
    assert.equal(out.find((x) => x.id === 'Ana')!.heirAfter, 'Dirk');
    assert.equal(out.find((x) => x.id === 'Next')!.heirAfter, 'Ana');
  });

  it('links a planned sim to the real one by hand, and unlinks back', () => {
    const real = sim('Ana', { age: 'Infant', hh: 'Capp', gid: 'W||Capp' });
    const all = [...nodes, real];
    const withSave = [...edges, link('v1', 'Mum', 'Ana', 'parent'), link('v2', 'Other', 'Ana', 'parent')];
    const linked = linkPlannedSim(all, withSave, 'Heir', 'Ana', 'now');
    assert.ok(!linked.nodes.some((x) => x.id === 'Heir'));
    const ana = linked.nodes.find((x) => x.id === 'Ana')!;
    assert.deepEqual([ana.plannedAs?.label, ana.plannedAs?.parents, linked.overruled], ['Heir X', ['Dad'], ['Dad']]);
    // The save gives Ana two parents, so Dad, planned as her father, goes.
    assert.deepEqual(
      linked.edges.map((e) => `${e.a}>${e.b}:${e.source}${e.wasPlanned ? ':done' : ''}`).sort(),
      ['Mum>Ana:save:done', 'Other>Ana:save'],
    );
    let n = 0;
    const back = unlinkPlannedSim(linked.nodes, linked.edges, 'Ana', () => 'P', () => `u${n++}`);
    const p = back.nodes.find((x) => x.id === 'P')!;
    assert.deepEqual([p.added, p.gid, back.nodes.find((x) => x.id === 'Ana')!.plannedAs], [true, 'W||Home', undefined]);
    assert.deepEqual(
      back.edges.map((e) => `${e.a}>${e.b}:${e.source}${e.wasPlanned ? ':done' : ''}`).sort(),
      ['Dad>P:planned', 'Mum>Ana:save', 'Mum>P:planned', 'Other>Ana:save'],
    );
  });

  it('keeps the note when a planned sim is linked to the real one, and unlinked back', () => {
    const real = sim('Ana', { age: 'Infant', hh: 'Capp', gid: 'W||Capp' });
    const noted = edges.map((e) => (e.a === 'Mum' && e.b === 'Heir' ? { ...e, note: 'Twins next' } : e));
    const withSave = [...noted, link('v1', 'Mum', 'Ana', 'parent'), link('v2', 'Other', 'Ana', 'parent')];
    const linked = linkPlannedSim([...nodes, real], withSave, 'Heir', 'Ana', 'now');
    const done = linked.edges.find((e) => e.a === 'Mum' && e.b === 'Ana')!;
    assert.deepEqual([done.wasPlanned, done.note], [true, 'Twins next']);
    let n = 0;
    const back = unlinkPlannedSim(linked.nodes, linked.edges, 'Ana', () => 'P', () => `u${n++}`);
    // The plan comes back with its note; the save's link has none of its own.
    assert.equal(back.edges.find((e) => e.a === 'Mum' && e.b === 'P')!.note, 'Twins next');
    assert.equal(back.edges.find((e) => e.a === 'Mum' && e.b === 'Ana')!.note, undefined);
  });

  it('lets two parents from the save overrule a planned one, not one', () => {
    const two = [link('p1', 'Mum', 'Kid', 'parent'), link('p2', 'Other', 'Kid', 'parent'), link('u1', 'Dad', 'Kid', 'parent', 'planned')];
    assert.deepEqual(overruledParentLinks(two, ['Kid']).map((e) => e.id), ['u1']);
    assert.deepEqual(overruledParentLinks(two.slice(1), ['Kid']), []);
    assert.deepEqual(overruledParentLinks(two, ['Other']), []);
  });

  it('names a planned sim with no first name by its plan label', () => {
    assert.equal(cardName(planned('H', { first: '', sur: 'Flex', planLabel: 'Heir 1' })), 'Heir 1 Flex');
    assert.equal(cardName(planned('H', { first: '', sur: 'Flex' })), 'Planned Flex');
    assert.equal(cardName(sim('Ana')), 'Ana X');
  });
});
