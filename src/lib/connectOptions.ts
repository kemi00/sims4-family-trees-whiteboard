import { whyNotAdopt } from './adoption.ts';
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
 * ancestor. `now` says where the two stand, for the menu's head.
 */
export function connectOptions(opts: {
  a: SimNode;
  b: SimNode;
  edges: Edge[];
  unborn?: ReadonlySet<string>;
  cycle?: { parent?: string; childof?: string };
  hideSibling?: boolean;
}): { now: string | null; sections: ConnectSection[] } {
  const { a, b, edges } = opts;
  const pair = uKey(a.id, b.id);
  const between = edges.filter((e) => uKey(e.a, e.b) === pair);
  const marriage = between.find((e) => e.type === 'marriage');
  const romance = between.find((e) => e.type === 'romance');
  const divorced = between.some((e) => e.type === 'divorced');
  const parentLink = (p: SimNode, c: SimNode) =>
    between.find((e) => e.type === 'parent' && e.a === p.id && e.b === c.id);
  const ab = parentLink(a, b);
  const ba = parentLink(b, a);
  // A parent and their child are no couple: the board drops a parent link
  // a couple contradicts, so a couple here would quietly undo it.
  const kin = ab ? `${a.first} is ${b.first}’s parent` : ba ? `${b.first} is ${a.first}’s parent` : null;
  const off = (why: string | null) => (kin ? { why: kin } : why ? { why } : {});
  // And a couple, past or present, is no parent and child, for the same reason.
  const paired = marriage ? 'They’re married' : romance ? 'They’re in a romance' : divorced ? 'They were married' : null;

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
      ? { choice: 'divorce', ...(marriage.ending ? { cancel: true as const } : {}) }
      : { choice: 'divorced', ...off(divorced ? 'Divorced already' : null) },
    ...(romance && !marriage
      ? [{ choice: 'breakup' as const, ...(romance.ending ? { cancel: true as const } : {}) }]
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

  const parentNow = (link: Edge | undefined, p: SimNode, c: SimNode) =>
    link ? `${p.first} is ${c.first}’s ${link.adopted ? 'adoptive ' : link.secret ? 'secret ' : ''}parent` : null;
  const now = marriage
    ? `married${marriage.ending ? ' · divorce planned' : ''}`
    : romance
      ? `${romance.secret ? 'secret lovers' : 'in a romance'}${romance.ending ? ' · breakup planned' : ''}`
      : divorced
        ? 'divorced'
        : (parentNow(ab, a, b) ?? parentNow(ba, b, a));
  return {
    now,
    sections: [
      { title: 'Couple', options: couple },
      { title: 'Family', options: family },
      { title: null, options: [{ choice: 'custom' }] },
    ],
  };
}
