import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { connectOptions } from './connectOptions.ts';
import { petAddSpot } from './layout.ts';
import { petAgeLabel, petKindsAvailable, petLinkWhy, youngWord } from './pets.ts';
import { slotSuggestions } from './plan.ts';
import { householdPoster } from './poster.ts';
import type { ParsedSave } from './savegame/parseSave.ts';
import type { ConnectChoice, Edge, Group, SimNode } from '../types/whiteboard.ts';

const card = (id: string, extra: Partial<SimNode> = {}): SimNode =>
  ({
    id, first: id, sur: '', age: 'Adult', state: 'Pet', gender: 'Female', hh: 'Lynx', world: 'W', nb: '-', color: '#999',
    townie: false, oworld: 'W', onb: '-', ohh: 'Lynx', oplay: 'Resident', pack: 'Cats & Dogs', gid: 'W||Lynx',
    x: 0, y: 0, w: 200, h: 100, species: 'Cat', saveSimId: `s-${id}`, ...extra,
  }) as SimNode;

const josie = card('Josie');
const doc = card('Doc', { gender: 'Male', age: 'Elder' });
const rex = card('Rex', { species: 'Dog', gender: 'Male' });
const owner = card('Ana', { species: undefined, state: 'Sim', sur: 'Lynx', age: 'Young Adult' });

describe('pets, as the game has them', () => {
  it('come with their packs: cats and dogs with Cats & Dogs, horses with Horse Ranch', () => {
    assert.deepEqual(petKindsAvailable(new Set()).map((k) => k.species), ['Cat', 'Dog', 'Horse']);
    assert.deepEqual(petKindsAvailable(new Set(['Cats & Dogs'])).map((k) => k.species), ['Horse']);
    assert.deepEqual(petKindsAvailable(new Set(['Cats & Dogs', 'Horse Ranch'])), []);
  });

  it('name their young as the game does', () => {
    assert.equal(petAgeLabel('Cat', 'Child'), 'Kitten');
    assert.equal(petAgeLabel('Horse', 'Child'), 'Foal');
    assert.equal(petAgeLabel('Dog', 'Elder'), 'Elder');
    assert.equal(youngWord('Dog'), 'puppy');
  });

  it('are family only to pets of their kind', () => {
    assert.equal(petLinkWhy(josie, doc), null);
    assert.equal(petLinkWhy(josie, rex), 'A cat and a dog aren’t family');
    assert.equal(petLinkWhy(josie, owner), 'Pets are family only to pets of their kind');
    assert.equal(petLinkWhy(owner, owner), null);
  });
});

describe('the Connect menu for pets', () => {
  const opts = (a: SimNode, b: SimNode) => {
    const all = connectOptions({ a, b, edges: [] }).sections.flatMap((s) => s.options);
    return (c: ConnectChoice) => all.find((o) => o.choice === c)!;
  };

  it('offers two cats parents, siblings and co-parents, and no couple or secret', () => {
    const get = opts(josie, doc);
    assert.equal(get('parent').why, undefined);
    assert.equal(get('childof').why, undefined);
    assert.equal(get('sibling').why, undefined);
    assert.equal(get('coparents').why, undefined);
    assert.equal(get('marriage').why, 'Pets don’t marry or date');
    assert.equal(get('secretparent').why, 'Not for pets');
    assert.equal(get('adoptive').why, 'Pets don’t adopt.');
  });

  it('keeps only the other link between a pet and a sim', () => {
    const get = opts(josie, owner);
    assert.equal(get('parent').why, 'Pets are family only to pets of their kind');
    assert.equal(get('romance').why, 'Pets are family only to pets of their kind');
    assert.equal(get('custom').why, undefined);
  });
});

describe('a planned kitten', () => {
  const kitten = card('k1', { first: '', age: 'Unknown', added: true, saveSimId: undefined, gender: '-' });
  const edges: Edge[] = [
    { id: 'p1', a: 'Josie', b: 'k1', type: 'parent', source: 'planned' },
    { id: 'p2', a: 'Doc', b: 'k1', type: 'parent', source: 'planned' },
  ];

  it('is filled by the cat a save brings with those parents, never by a sim', () => {
    const parsed = {
      sims: [
        { saveSimId: 'new-cat', first: 'Cleo', last: '', species: 'Cat', gender: 'Female' },
        { saveSimId: 'new-sim', first: 'Cleo', last: 'Lynx', gender: 'Female' },
      ],
      rels: [
        { a: 's-Josie', b: 'new-cat', type: 'parent' },
        { a: 's-Doc', b: 'new-cat', type: 'parent' },
        { a: 's-Josie', b: 'new-sim', type: 'parent' },
      ],
    } as unknown as Pick<ParsedSave, 'sims' | 'rels'>;
    const [s] = slotSuggestions({ nodes: [josie, doc, kitten], edges, parsed });
    assert.deepEqual(s!.candidates.map((c) => [c.saveSimId, c.sure, c.why]), [['new-cat', true, 'Kitten of Josie & Doc']]);
  });

  it('sits under its parents on a household poster', () => {
    const group: Group = { gid: 'W||Lynx', hh: 'Lynx', world: 'W', nb: '-', color: '#999', x: 0, y: 0, w: 0, h: 0 };
    const p = householdPoster({ group, nodes: [owner, josie, doc, kitten], links: edges });
    assert.deepEqual(
      p.rows.map((r) => [r.label, r.cards.map((c) => c.id)]),
      [
        [undefined, ['Ana']],
        ['Pets', ['Josie', 'Doc']],
        [undefined, ['k1']],
      ],
    );
    assert.deepEqual(p.families.map((f) => f.children.map((k) => k.id)), [['k1']]);
  });
});

describe('a new pet on the board', () => {
  it('starts an animal lane at the household’s right, or joins the one there', () => {
    const sims = [owner].map((n) => ({ ...n, x: 0, y: 0, w: 200, h: 100 }));
    const first = petAddSpot(sims, sims);
    assert.ok(first.x >= 300, `lane at ${first.x}`);
    assert.equal(first.y, 0);
    const lane = [...sims, { ...josie, x: first.x, y: 0, w: 200, h: 100 }];
    const next = petAddSpot(lane, lane);
    assert.equal(next.x, first.x);
    assert.ok(next.y >= 100);
  });
});
