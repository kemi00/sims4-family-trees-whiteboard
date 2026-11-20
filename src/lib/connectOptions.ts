import { whyNotAdopt } from './adoption.ts';
import { petLinkWhy } from './pets.ts';
import { storiesByPair } from './coupleStory.ts';
import { uKey } from './utils.ts';
import type { ConnectChoice, Edge, SimNode } from '../types/whiteboard.ts';

/** One choice in the Connect menu; `why` it is off, `cancel` when it takes a planned end back. */
export type ConnectOption = { choice: ConnectChoice; why?: string; cancel?: true };
export type ConnectSection = { title: string | null; options: ConnectOption[] };

/**
 * What the Connect menu offers two sims, in order, given the links they
 * have: a link they already have is off ("Married already"); a married
 * couple gets their divorce to plan (or cancel) instead of a divorced link,
 * and a couple in a romance their breakup, as the board plans endings; an
 * adoption follows the ＋ menu's rule (whyNotAdopt), and on a parent link
 * already there it marks that link adopted, as a secret one is marked
 * secret. `cycle`: why a parent link either way would make a sim their own
 * ancestor. `now` says where the two stand, for the menu's head. A pet
 * links only to a pet of its kind, as a parent, child, co-parent or
 * sibling; a pet and a sim keep only the menu's other link.
 */
const SECRET_CHOICES = new Set<string>(['secretromance', 'secretparent', 'secretchildof']);

export function connectOptions(opts: {
  a: SimNode;
  b: SimNode;
  edges: Edge[];
  unborn?: ReadonlySet<string>;
  cycle?: { parent?: string; childof?: string };
  hideSibling?: boolean;
  /** Secret lovers and secret parents come with Royalty & Legacy: false leaves them out. */
  secrets?: boolean;
}): { now: string | null; sections: ConnectSection[] } {
  const { a, b, edges } = opts;
  const pair = uKey(a.id, b.id);
  const between = edges.filter((e) => uKey(e.a, e.b) === pair);
  // Where the couple's story leaves them: its last link. A planned end on
  // it takes them apart, so the next step (back together, marry) is open.
  const story = storiesByPair(between).get(pair) ?? [];
  const last = story[story.length - 1];
  const live = last && !last.ending && last.type !== 'divorced' ? last : undefined;
  const marriage = live?.type === 'marriage' ? live : undefined;
  const romance = live?.type === 'romance' ? live : undefined;
  /** The last link's planned end, which Connect can take back. */
  const ending = last?.ending ? last : undefined;
  const divorced = story.some((e) => e.type === 'divorced');
  const parentLink = (p: SimNode, c: SimNode) =>
    between.find((e) => e.type === 'parent' && e.a === p.id && e.b === c.id);
  const ab = parentLink(a, b);
  const ba = parentLink(b, a);
  // A parent and their child are no couple: the board drops a parent link
  // a couple contradicts, so a couple here would quietly undo it.
  const kin = ab ? `${a.first} is ${b.first}’s parent` : ba ? `${b.first} is ${a.first}’s parent` : null;
  const off = (why: string | null) => (kin ? { why: kin } : why ? { why } : {});
  // And a couple, past or present, is no parent and child, for the same reason.
  const paired = story.some((e) => e.type === 'marriage')
    ? 'They’re married'
    : story.some((e) => e.type === 'romance')
      ? 'They’re in a romance'
      : divorced
        ? 'They were married'
        : null;

  const couple: ConnectOption[] = [
    { choice: 'marriage', ...off(marriage ? 'Married already' : null) },
    {
      choice: 'romance',
      ...off(marriage ? 'Married already' : romance ? 'In a romance already' : null),
    },
    {
      choice: 'secretromance',
      ...off(marriage ? 'Married already' : romance?.secret ? 'Secret lovers already' : null),
    },
    marriage
      ? { choice: 'divorce' }
      : ending?.type === 'marriage'
        ? { choice: 'divorce', cancel: true }
        : { choice: 'divorced', ...off(divorced ? 'Divorced already' : null) },
    ...(romance
      ? [{ choice: 'breakup' as const }]
      : ending?.type === 'romance'
        ? [{ choice: 'breakup' as const, cancel: true as const }]
        : []),
  ];

  // A parent link one way: off when there, or when it would loop.
  const parentOption = (
    choice: ConnectChoice,
    link: Edge | undefined,
    cycle: string | undefined,
    flag: 'plain' | 'secret' | 'adopted',
    p: SimNode,
    c: SimNode,
  ): ConnectOption => {
    if (link) {
      if (flag === 'plain') return { choice, why: `Already ${c.first}’s parent` };
      if (flag === 'secret' && link.secret) return { choice, why: 'Secret already' };
      if (flag === 'adopted' && link.adopted) return { choice, why: 'Adopted already' };
      return { choice };
    }
    if (paired) return { choice, why: paired };
    if (cycle) return { choice, why: cycle };
    if (flag === 'adopted') {
      const why = whyNotAdopt(p, c, edges, opts.unborn);
      if (why) return { choice, why };
    }
    return { choice };
  };
  const family: ConnectOption[] = [
    parentOption('parent', ab, opts.cycle?.parent, 'plain', a, b),
    parentOption('secretparent', ab, opts.cycle?.parent, 'secret', a, b),
    parentOption('adoptive', ab, opts.cycle?.parent, 'adopted', a, b),
    parentOption('childof', ba, opts.cycle?.childof, 'plain', b, a),
    parentOption('secretchildof', ba, opts.cycle?.childof, 'secret', b, a),
    parentOption('adoptedby', ba, opts.cycle?.childof, 'adopted', b, a),
    { choice: 'coparents' },
    ...(opts.hideSibling ? [] : [{ choice: 'sibling' as const }]),
  ];

  // Pets: family only to pets of their kind, without couples, secrets or adoption.
  const notKin = petLinkWhy(a, b);
  const pets = !!a.species && !!b.species;
  const petRule = (o: ConnectOption): ConnectOption => {
    if (o.why || (!notKin && !pets)) return o;
    if (notKin) return { choice: o.choice, why: notKin };
    if (couple.includes(o)) return { choice: o.choice, why: 'Pets don’t marry or date' };
    if (['secretparent', 'secretchildof', 'adoptive', 'adoptedby'].includes(o.choice)) return { choice: o.choice, why: 'Not for pets' };
    return o;
  };

  const parentNow = (link: Edge | undefined, p: SimNode, c: SimNode) =>
    link ? `${p.first} is ${c.first}’s ${link.adopted ? 'adoptive ' : link.secret ? 'secret ' : ''}parent` : null;
  const now = marriage
    ? 'married'
    : romance
      ? romance.secret ? 'secret lovers' : 'in a romance'
      : ending
        ? ending.type === 'marriage' ? 'married · divorce planned' : `${ending.secret ? 'secret lovers' : 'in a romance'} · breakup planned`
        : last?.type === 'divorced'
          ? 'divorced'
          : (parentNow(ab, a, b) ?? parentNow(ba, b, a));
  // Without Royalty & Legacy, no secrets to plan.
  const offered = (o: ConnectOption) => opts.secrets !== false || !SECRET_CHOICES.has(o.choice);
  return {
    now,
    sections: [
      { title: 'Couple', options: couple.filter(offered).map(petRule) },
      { title: 'Family', options: family.filter(offered).map(petRule) },
      { title: null, options: [{ choice: 'custom' }] },
    ],
  };
}
