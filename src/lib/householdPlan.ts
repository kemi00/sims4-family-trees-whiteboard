import { GROWN_UP, daysFromBirth, daysUntilStage, everyoneAges, lifeView, wholeDaysText } from './lifeClock.ts';
import { cardName, conflictText, isPlannedSim, type PlanConflict } from './plan.ts';
import { changesWorld, movesHousehold } from './householdMove.ts';
import { isUnhousedGid } from './unhoused.ts';
import { edgeSourceOf, joinNotes, uKey } from './utils.ts';
import { ADDED_HOUSEHOLD, DECEASED_STATE } from './constants.ts';
import { dynastyKey, dynastyNames, dynastyPhrase } from './generations.ts';
import type { Edge, Group, HouseholdMove, PairStatus, SaveGameInfo, SimNode } from '../types/whiteboard.ts';

/**
 * Your plan, household by household: what you can do today, what waits
 * and on whom, and what the game did instead. It reads only what the board
 * keeps (violet links, planned sims, ages from the last save import), so
 * the household brief, the badges on household tags and Up next always
 * agree. With only the active household aging, a household you aren't
 * playing can't change, so "waiting on the Dreamers" stays true until you
 * play them or import a newer save.
 */

const STAGES = ['Infant', 'Toddler', 'Child', 'Teen', 'Young Adult', 'Adult', 'Elder'];
const stageAt = (age: string) => STAGES.indexOf(age);

export type PlanState = 'ready' | 'waiting' | 'offPlan';

/**
 * What moves a wait along: playing the household (only the active one
 * ages), time (their household ages anyway), an age-up by hand (their
 * household never ages), or finding a sim the game doesn't have yet.
 */
export type WaitMove = 'play' | 'time' | 'ageUp' | 'find';

export type PlanWait = {
  /** The sim it waits on. */
  sim: string;
  why: 'notBorn' | 'tooYoung' | 'notInGame';
  /** Their life stage now, for one too young. */
  now?: string;
  /** The stage the plan needs them at. */
  stage: string;
  /**
   * The household to play: where they live in the game (gameHomes), or for
   * a baby not born yet, where its parents live in the plan.
   */
  gid: string;
  move: WaitMove;
  /** Days to `stage` on the save's lifespan, from birth for a baby not born yet; null when unknown. */
  days: number | null;
};

export type PlanItem = {
  /** Stable key: `couple:<edge>`, `baby:<parents>`, `find:<sim>`, `role:<sim>`, `move:<move>`, `off:<edge>`. */
  id: string;
  kind: 'couple' | 'baby' | 'find' | 'role' | 'move' | 'offPlan';
  state: PlanState;
  /** "Marry Lysander Capp and Spare Munch". */
  text: string;
  /** Who it is about, for highlighting. */
  sims: string[];
  /** Every household with a sim in it. */
  gids: string[];
  /** Why it is waiting; empty when ready. */
  waits: PlanWait[];
  /** A caution that doesn't block it. */
  note?: string;
  /** Your note on the link or move behind it: why you planned it. */
  yourNote?: string;
};

/** `{ yourNote }` to spread into an item, or nothing. */
const noted = (note: string | undefined): { yourNote?: string } => (note ? { yourNote: note } : {});

const uniq = <T,>(xs: T[]): T[] => [...new Set(xs)];

/** "Elsa", "Elsa and Joaquin", "Elsa, Joaquin and 2 more". */
function listText(names: string[]): string {
  if (names.length <= 2) return names.join(' and ');
  return `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`;
}

/** Each sim's moves no save has shown done yet, oldest first. */
function pendingMoves(moves: HouseholdMove[] | undefined): Map<string, HouseholdMove[]> {
  const out = new Map<string, HouseholdMove[]>();
  for (const m of moves ?? []) if (!m.done) out.set(m.simId, [...(out.get(m.simId) ?? []), m]);
  for (const list of out.values()) list.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
  return out;
}

/**
 * Where sims live in the game when the board has them somewhere else: the
 * household they were in before the moves planned since. A save marks a
 * sim's moves done together, so the pending ones are one chain: Elsa
 * Bjergsen, moved on the board from Bjergsen to Bro and then to Le Chien,
 * is still in Bjergsen. Planned sims aren't in the game, so they have none.
 */
export function gameHomes(nodes: SimNode[], moves: HouseholdMove[] | undefined): Map<string, string> {
  const out = new Map<string, string>();
  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const [id, list] of pendingMoves(moves)) {
    const n = byId.get(id);
    const first = list[0]!;
    const last = list[list.length - 1]!;
    if (!n || isPlannedSim(n) || n.gid !== last.toGid || first.fromHh === ADDED_HOUSEHOLD || first.fromGid === n.gid) continue;
    out.set(id, first.fromGid);
  }
  return out;
}

/**
 * Households on the board the game doesn't have yet: no sim lives in them
 * there, because everyone the board puts in them still has to move in (Le
 * Chien, until Elsa and Joaquin do). Each maps to those sims. A household
 * of planned sims alone isn't one: finding or creating them makes it.
 */
export function householdsNotInGame(nodes: SimNode[], moves: HouseholdMove[] | undefined): Map<string, string[]> {
  const home = gameHomes(nodes, moves);
  const real = nodes.filter((n) => !isPlannedSim(n) && n.state !== DECEASED_STATE && !isUnhousedGid(n.gid));
  const inGame = new Set(real.map((n) => home.get(n.id) ?? n.gid));
  const out = new Map<string, string[]>();
  for (const n of real) if (!inGame.has(n.gid)) out.set(n.gid, [...(out.get(n.gid) ?? []), n.id]);
  return out;
}

/** "Heir Romeo", "Heir Romeo and Spare Romeo", "3 babies". */
function babiesText(kids: SimNode[]): string {
  if (kids.length > 2) return `${kids.length} babies`;
  return kids.map(cardName).join(' and ');
}

/**
 * Every plan item on the board. `conflicts` are planConflicts(nodes,
 * edges), which the board works out anyway; their links and planned
 * children show only as off plan.
 */
export function householdPlans(opts: {
  nodes: SimNode[];
  edges: Edge[];
  conflicts: PlanConflict[];
  pairStatus?: PairStatus[];
  saveGame?: SaveGameInfo | null;
  /** Household moves made on the board; those no save has shown done are plans. */
  moves?: HouseholdMove[];
}): PlanItem[] {
  const { nodes, edges, conflicts, saveGame } = opts;
  const lifespan = saveGame?.lifespan;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const name = (id: string) => {
    const n = byId.get(id);
    return n ? cardName(n) : id;
  };
  const tags = new Map((opts.pairStatus ?? []).map((p) => [uKey(p.a, p.b), p.tags]));
  const parentsOf = new Map<string, string[]>();
  for (const e of edges) if (e.type === 'parent') parentsOf.set(e.b, [...(parentsOf.get(e.b) ?? []), e.a]);
  const offLinks = new Set(conflicts.map((c) => c.edgeId));
  const edgeById = new Map(edges.map((e) => [e.id, e]));
  const offKids = new Set(conflicts.flatMap((c) => c.children));
  const living = (n: SimNode) => n.state !== DECEASED_STATE;
  const plannedChild = (n: SimNode) => isPlannedSim(n) && (parentsOf.get(n.id)?.length ?? 0) > 0;

  // A sim ages in the household the game has them in, which a move
  // planned on the board hasn't changed yet.
  const home = gameHomes(nodes, opts.moves);
  const gameGid = (n: SimNode) => home.get(n.id) ?? n.gid;
  /**
   * Where a planned baby is born: where its parents live in the plan, not
   * the household it is planned to live in later (Planned (2) Romeo, born
   * to the Romeos in Bro to marry into Le Chien). Parents apart on the
   * board: where most of them are, else where the baby is planned.
   */
  const birthGid = (kid: SimNode): string => {
    const gids = (parentsOf.get(kid.id) ?? []).map((id) => byId.get(id)?.gid).filter((g): g is string => !!g);
    if (!gids.length) return kid.gid;
    const count = (g: string) => gids.filter((x) => x === g).length;
    const most = Math.max(...gids.map(count));
    const top = gids.filter((g) => count(g) === most);
    return top.includes(kid.gid) ? kid.gid : top[0]!;
  };

  const moveOf = (gid: string, life: SimNode['life']): WaitMove => {
    if (life && !life.frozen) return 'time';
    if (!life && saveGame && everyoneAges(saveGame)) return 'time';
    if (life?.frozen === 'played' || isUnhousedGid(gid)) return 'ageUp';
    return 'play';
  };

  /** What `n` still needs before reaching `stage`; null when nothing. */
  const waitOn = (n: SimNode, stage: string): PlanWait | null => {
    if (isPlannedSim(n)) {
      return plannedChild(n)
        ? { sim: n.id, why: 'notBorn', stage, gid: birthGid(n), move: 'play', days: daysFromBirth(stage, lifespan) }
        : { sim: n.id, why: 'notInGame', stage, gid: n.gid, move: 'find', days: null };
    }
    const at = stageAt(n.age);
    if (at < 0 || at >= stageAt(stage)) return null;
    const life = n.life && n.life.stage === n.age ? n.life : undefined;
    const days = life ? daysUntilStage(life.stage, life.stageDays, stage, lifespan, life.newborn) : null;
    const gid = gameGid(n);
    return { sim: n.id, why: 'tooYoung', now: n.age, stage, gid, move: moveOf(gid, life), days };
  };

  const items: PlanItem[] = [];
  const inCouple = new Set<string>();

  for (const e of edges) {
    if ((e.type !== 'marriage' && e.type !== 'romance') || edgeSourceOf(e) !== 'planned' || offLinks.has(e.id)) continue;
    const a = byId.get(e.a);
    const b = byId.get(e.b);
    if (!a || !b || a.species || b.species || !living(a) || !living(b)) continue;
    // Two teens can date; anyone else waits to be a young adult.
    const young = (n: SimNode) => !isPlannedSim(n) && stageAt(n.age) >= 0 && stageAt(n.age) < stageAt(GROWN_UP);
    const stage = e.type === 'romance' && young(a) && young(b) ? 'Teen' : GROWN_UP;
    const waits = [waitOn(a, stage), waitOn(b, stage)].filter((w): w is PlanWait => !!w);
    const find = waits.filter((w) => w.move === 'find');
    const [A, B] = [cardName(a), cardName(b)];
    let text: string;
    if (find.length === 2) text = `Find or create ${A} and ${B}`;
    else if (find.length === 1) {
      const other = find[0]!.sim === a.id ? B : A;
      text = `Find or create ${name(find[0]!.sim)} ${e.type === 'marriage' ? 'to marry' : 'for'} ${other}`;
    } else if (e.type === 'marriage') {
      text = tags.get(uKey(a.id, b.id))?.includes('engaged') ? `${A} and ${B} are engaged: the wedding is next` : `Marry ${A} and ${B}`;
    } else text = `Get ${A} and ${B} together`;
    inCouple.add(a.id).add(b.id);
    items.push({
      id: `couple:${e.id}`,
      kind: 'couple',
      state: waits.some((w) => w.move !== 'find') ? 'waiting' : 'ready',
      text,
      sims: [a.id, b.id],
      gids: uniq([a.gid, b.gid]),
      waits,
      ...noted(e.note),
    });
  }

  const litters = new Map<string, { parents: string[]; kids: SimNode[] }>();
  for (const n of nodes) {
    if (!plannedChild(n) || offKids.has(n.id)) continue;
    const parents = uniq(parentsOf.get(n.id) ?? []).sort();
    const key = parents.join('|');
    litters.set(key, { parents, kids: [...(litters.get(key)?.kids ?? []), n] });
  }
  for (const [key, { parents: ids, kids }] of litters) {
    const parents = ids.map((id) => byId.get(id)).filter((p): p is SimNode => !!p);
    if (!parents.length) continue;
    const who = parents.map(cardName).join(' ＋ ');
    const kidIds = new Set(kids.map((k) => k.id));
    // The notes on the links to the babies: on a child, both parents' links share one.
    const babyNotes = edges.filter((e) => e.type === 'parent' && kidIds.has(e.b) && ids.includes(e.a)).map((e) => e.note);
    const base = {
      id: `baby:${key}`,
      kind: 'baby' as const,
      sims: [...parents.map((p) => p.id), ...kids.map((k) => k.id)],
      gids: uniq([...kids.map((k) => k.gid), ...parents.map((p) => p.gid)]),
      ...noted(joinNotes(...babyNotes)),
    };
    const dead = parents.find((p) => !living(p));
    if (dead) {
      items.push({ ...base, state: 'offPlan', text: `${cardName(dead)} has died, so ${babiesText(kids)} can’t come`, waits: [] });
      continue;
    }
    const waits = parents.map((p) => waitOn(p, GROWN_UP)).filter((w): w is PlanWait => !!w);
    const elder = parents.find((p) => !isPlannedSim(p) && p.age === 'Elder');
    items.push({
      ...base,
      state: waits.length ? 'waiting' : 'ready',
      text: `${who}: ${babiesText(kids)}`,
      waits,
      ...(elder ? { note: `${cardName(elder)} is an elder: in the game, elders can’t carry a baby.` } : {}),
    });
  }

  for (const n of nodes) {
    if (!isPlannedSim(n) || plannedChild(n) || inCouple.has(n.id) || !living(n)) continue;
    items.push({
      id: `find:${n.id}`,
      kind: 'find',
      state: 'ready',
      text: `Find or create ${cardName(n)}`,
      sims: [n.id],
      gids: [n.gid],
      waits: [],
    });
  }

  // A dynasty or role planned on the board: done in the game's dynasty
  // panel once the sim is in the game.
  const gameMember = new Set(
    nodes.filter((x) => x.dynasty && x.dynastyPlan !== 'member').map((x) => dynastyKey(x)!),
  );
  // Two of one name are told apart by their founder: "the Scott dynasty (Travis’s line)".
  const dynastyName = dynastyNames(nodes);
  for (const n of nodes) {
    if (!n.dynastyPlan || n.species || !living(n)) continue;
    const name = cardName(n);
    const key = dynastyKey(n) ?? '';
    const known = dynastyName.get(key);
    const the = known ? `the ${dynastyPhrase(known)}` : n.dynasty ? `the ${n.dynasty} dynasty` : 'a dynasty';
    // A head of a dynasty the game doesn't have yet: they start it.
    const starts = n.dynastyPlan === 'member' && n.dynastyRole === 'head' && !gameMember.has(key);
    let text: string;
    if (n.dynastyPlan === 'none') text = `Take ${name} out of ${the}`;
    else if (starts) {
      text = `Start ${the} with ${name} as its head`;
    } else if (n.dynastyRole === 'outcast') text = `Declare ${name} an outcast of ${the}`;
    else if (n.dynastyRole) text = `Make ${name} ${n.dynastyRole} of ${the}`;
    else if (n.dynastyPlan === 'member') text = `Bring ${name} into ${the}`;
    else text = `Leave ${name} without a role in ${the}`;
    const waits: PlanWait[] = [];
    // In the game only a young adult or older can start a dynasty: a teen
    // waits to grow up, and a planned baby to be born and then grow up.
    const tooYoung = starts ? waitOn(n, GROWN_UP) : null;
    if (tooYoung) waits.push(tooYoung);
    else if (isPlannedSim(n)) {
      waits.push(
        plannedChild(n)
          ? { sim: n.id, why: 'notBorn', stage: '', gid: birthGid(n), move: 'play', days: null }
          : { sim: n.id, why: 'notInGame', stage: '', gid: n.gid, move: 'find', days: null },
      );
    }
    items.push({
      id: `role:${n.id}`,
      kind: 'role',
      state: waits.length ? 'waiting' : 'ready',
      text,
      sims: [n.id],
      gids: [n.gid],
      waits,
      ...(tooYoung
        ? { note: 'In the game, only a young adult or older can start a dynasty.' }
        : n.dynastyPlan === 'member' && n.dynastyRole && !isPlannedSim(n) && gameMember.has(key)
          ? { note: `Not in ${the} in your save yet.` }
          : {}),
    });
  }

  // A sim moved to another household on the board, which no save shows yet:
  // in the game they move from where they are there, past any household
  // they were moved through on the board. A planned sim only lives there
  // in the plan: born or found, it will. A household that changed worlds,
  // its sims together, is one move in the game, and one line.
  const households = new Map<string, { first: HouseholdMove; last: HouseholdMove; sims: string[]; notes: (string | undefined)[] }>();
  for (const [id, list] of pendingMoves(opts.moves)) {
    const n = byId.get(id);
    const first = list[0]!;
    const last = list[list.length - 1]!;
    if (!n || isPlannedSim(n) || !living(n) || n.gid !== last.toGid) continue;
    // Moved back where the game has them: nothing to do there.
    if (first.fromGid === last.toGid) continue;
    const notes = list.map((m) => m.note);
    if (list.every(movesHousehold)) {
      const key = `${first.fromGid}|${last.toGid}`;
      const h = households.get(key);
      if (h) {
        h.sims.push(n.id);
        h.notes.push(...notes);
      } else households.set(key, { first, last, sims: [n.id], notes });
      continue;
    }
    const worlds = changesWorld({ fromWorld: first.fromWorld, toWorld: last.toWorld });
    const from =
      first.fromHh && first.fromHh !== ADDED_HOUSEHOLD
        ? ` from ${first.fromHh}${worlds ? ` (${first.fromWorld})` : ''}`
        : '';
    items.push({
      id: `move:${last.id}`,
      kind: 'move',
      state: 'ready',
      text: `Move ${cardName(n)}${from} to the ${last.toHh} household${worlds ? ` (${last.toWorld})` : ''}`,
      sims: [n.id],
      gids: uniq([last.toGid, ...(from ? [first.fromGid] : [])]),
      waits: [],
      ...noted(joinNotes(...notes)),
    });
  }
  for (const { first, last, sims, notes } of households.values()) {
    items.push({
      id: `move:${last.id}`,
      kind: 'move',
      state: 'ready',
      text: `Move the ${last.toHh} household from ${first.fromWorld} to ${last.toWorld}`,
      sims,
      gids: uniq([last.toGid, first.fromGid]),
      waits: [],
      ...noted(joinNotes(...notes)),
    });
  }

  for (const c of conflicts) {
    const sims = uniq([c.a, c.b, ...c.children]).filter((id) => byId.has(id));
    items.push({
      id: `off:${c.edgeId}`,
      kind: 'offPlan',
      state: 'offPlan',
      text: conflictText(c, name),
      sims,
      gids: uniq(sims.map((id) => byId.get(id)!.gid)),
      waits: [],
      // Why you planned it helps decide whether to keep it.
      ...noted(edgeById.get(c.edgeId)?.note),
    });
  }
  return items;
}

/** The items a household's sims are in. */
export function itemsFor(items: PlanItem[], gid: string): PlanItem[] {
  return items.filter((i) => i.gids.includes(gid));
}

export type PlanTally = { ready: number; waiting: number; offPlan: number };

/** How many items of each state every household has, for the badges on their tags. */
export function planTallies(items: PlanItem[]): Map<string, PlanTally> {
  const out = new Map<string, PlanTally>();
  for (const i of items) {
    for (const gid of i.gids) {
      const t = out.get(gid) ?? { ready: 0, waiting: 0, offPlan: 0 };
      t[i.state] += 1;
      out.set(gid, t);
    }
  }
  return out;
}

/**
 * The badge on a household's tag: how many things are ready, else how
 * many went off plan, else that something waits; none when nothing is
 * pending, so a big board stays quiet. `title` has the whole count.
 */
export function planBadge(
  t: PlanTally | undefined,
): { text: string; tone: 'ready' | 'offPlan' | 'waiting'; title: string } | null {
  if (!t || !(t.ready + t.waiting + t.offPlan)) return null;
  const title = [
    t.ready && `${t.ready} ready`,
    t.waiting && `${t.waiting} waiting`,
    t.offPlan && `${t.offPlan} off plan`,
  ]
    .filter(Boolean)
    .join(', ');
  if (t.ready) return { text: `${t.ready} ready`, tone: 'ready', title };
  if (t.offPlan) return { text: `${t.offPlan} off plan`, tone: 'offPlan', title };
  return { text: 'waiting', tone: 'waiting', title };
}

/**
 * Items of other households that playing `gid` helps along: a sim living
 * there in the game grows up, or a baby planned to its parents there is
 * born (Heir Dreamer, to marry Spare Munch).
 */
export function unblockedBy(items: PlanItem[], gid: string): PlanItem[] {
  return items.filter(
    (i) =>
      i.state === 'waiting' &&
      i.gids.some((g) => g !== gid) &&
      i.waits.some((w) => w.gid === gid && w.move === 'play'),
  );
}

/** "the Munch household". A household everyone moved out of on the board is named from its key. */
export function householdName(gid: string, groups: Group[], nodes: SimNode[]): string {
  const hh = groups.find((g) => g.gid === gid)?.hh ?? nodes.find((n) => n.gid === gid)?.hh ?? gid.split('||')[1] ?? '';
  if (isUnhousedGid(gid)) return 'the unhoused sims';
  return hh ? `the ${hh} household` : 'their household';
}

/**
 * A wait in words: "Lucas Munch is a Child: Young Adult in 17 days of
 * playing the Munch household"; "Heir Dreamer isn’t born yet: play the
 * Dreamer household for the birth, then about 24 days to Young Adult".
 */
export function waitText(w: PlanWait, nameOf: (id: string) => string, hhOf: (gid: string) => string): string {
  const who = nameOf(w.sim);
  const hh = hhOf(w.gid);
  if (w.why === 'notInGame') return `${who} isn’t in your game yet: find or create them`;
  if (w.why === 'notBorn') {
    const then = w.days === null ? '' : `, then about ${wholeDaysText(w.days)} to ${w.stage}`;
    return `${who} isn’t born yet: play ${hh} for the birth${then}`;
  }
  const is = `${who} is ${/^[AEIOU]/.test(w.now ?? '') ? 'an' : 'a'} ${w.now}`;
  if (w.move === 'ageUp') return `${is}: ${hh} isn’t aging, so age them up in the game`;
  const when = w.days === null ? `until ${w.stage}` : `${w.stage} in ${wholeDaysText(w.days)}`;
  if (w.move === 'time') return `${is}: ${when}`;
  return w.days === null ? `${is}: play ${hh} ${when}` : `${is}: ${when} of playing ${hh}`;
}

export type ElderTime = { id: string; elderDays: number; oldAgeIn: number; frozen?: boolean };

/** A household's living elders with ages from the save, nearest to old age first. */
export function eldersOf(nodes: SimNode[], gid: string, saveGame?: SaveGameInfo | null): ElderTime[] {
  const out: ElderTime[] = [];
  for (const n of nodes) {
    if (n.gid !== gid || n.age !== 'Elder' || n.state === DECEASED_STATE) continue;
    const v = lifeView(n, saveGame);
    if (!v || v.elderDays === undefined) continue;
    out.push({ id: n.id, elderDays: v.elderDays, oldAgeIn: v.oldAgeIn ?? 0, ...(v.frozen ? { frozen: true } : {}) });
  }
  return out.sort((a, b) => a.oldAgeIn - b.oldAgeIn);
}

/** Days before old age can come under which an elder with a plan left moves a household up. */
export const ELDER_RUSH_DAYS = 3;

export type UpNextRow = {
  gid: string;
  /** Its ready items; waiting ones it moves along by being played. */
  ready: PlanItem[];
  ownWaits: PlanItem[];
  /** Other households' items that playing it helps along. */
  unblocks: PlanItem[];
  /** An elder in one of its plans running low on days. */
  elder?: { id: string; oldAgeIn: number };
  /** The oldest dynasty generation among its sims in a plan. */
  gen?: number;
  /** Imports since it was the active household: 0 for the last one; undefined when the board never saw it played. */
  playedAgo?: number;
  /** The sims to move in before it is in the game (householdsNotInGame); it can't be played until then. */
  notInGame?: string[];
  /** Skipped for now: kept at the end. */
  skipped: boolean;
};

/**
 * Households worth playing next, in a suggested order, for when you'd
 * rather be handed a plan: only those where playing does something
 * (something ready, or a wait that playing them moves along). The order,
 * rule by rule:
 *
 * 1. plays that help other households' plans along, the most first;
 * 2. an elder with a plan left and few days before old age can come;
 * 3. the most ready;
 * 4. the oldest generation;
 * 5. the household played longest ago (never seen played counts as longest);
 *
 * then by name. A household the game doesn't have yet can't be played, so
 * it follows the others; skipped households go to the end. It only suggests.
 */
export function upNext(opts: {
  items: PlanItem[];
  nodes: SimNode[];
  groups: Group[];
  saveGame?: SaveGameInfo | null;
  /** Each sim's dynasty generation (dynastyGenerations). */
  generations?: ReadonlyMap<string, { gen?: number }>;
  skipped?: ReadonlySet<string>;
  /** householdsNotInGame. */
  notInGame?: ReadonlyMap<string, string[]>;
}): UpNextRow[] {
  const { items, nodes, groups, saveGame, generations, skipped, notInGame } = opts;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const fold = (s: string) => s.trim().toLowerCase();
  const played = [saveGame?.activeHousehold, ...(saveGame?.playedBefore ?? [])].map((h) => fold(h ?? ''));
  const hhOf = (gid: string) => groups.find((g) => g.gid === gid)?.hh ?? nodes.find((n) => n.gid === gid)?.hh ?? '';
  const gids = uniq(items.flatMap((i) => i.gids)).filter((gid) => !isUnhousedGid(gid));
  const rows: UpNextRow[] = [];
  for (const gid of gids) {
    const mine = itemsFor(items, gid);
    const ready = mine.filter((i) => i.state === 'ready');
    const ownWaits = mine.filter(
      (i) => i.state === 'waiting' && i.waits.some((w) => w.gid === gid && (w.move === 'play' || w.move === 'time')),
    );
    const unblocks = unblockedBy(items, gid);
    if (!ready.length && !ownWaits.length && !unblocks.length) continue;
    const planSims = uniq([...ready, ...ownWaits].flatMap((i) => i.sims)).filter((id) => byId.get(id)?.gid === gid);
    const elder = eldersOf(nodes, gid, saveGame).find((e) => planSims.includes(e.id) && e.oldAgeIn <= ELDER_RUSH_DAYS);
    const gens = planSims.map((id) => generations?.get(id)?.gen).filter((g): g is number => g !== undefined);
    const at = played.indexOf(fold(hhOf(gid)));
    const away = notInGame?.get(gid);
    rows.push({
      gid,
      ready,
      ownWaits,
      unblocks,
      ...(elder ? { elder: { id: elder.id, oldAgeIn: elder.oldAgeIn } } : {}),
      ...(gens.length ? { gen: Math.min(...gens) } : {}),
      ...(at >= 0 ? { playedAgo: at } : {}),
      ...(away ? { notInGame: away } : {}),
      skipped: !!skipped?.has(gid),
    });
  }
  const key = (r: UpNextRow): (number | string)[] => [
    r.skipped ? 1 : 0,
    r.notInGame ? 1 : 0,
    -r.unblocks.length,
    r.elder ? r.elder.oldAgeIn : Infinity,
    -r.ready.length,
    r.gen ?? Infinity,
    -(r.playedAgo ?? Infinity),
    hhOf(r.gid).toLowerCase(),
  ];
  return rows.sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    for (let i = 0; i < ka.length; i++) {
      if (ka[i] === kb[i]) continue;
      return ka[i]! < kb[i]! ? -1 : 1;
    }
    return 0;
  });
}

/**
 * Why a household is where it is in Up next, in a line, saying what
 * playing it does: "Helps the Munch household: Heir Dreamer is born here",
 * "Matthew Cuthbert is an elder with a plan left: old age in 2+ days",
 * "Ready: Marry Beatrice Capp and Dirk Dreamer", "Not in your game yet:
 * move Elsa Bjergsen and Joaquin Le Chien in first".
 */
export function upNextReason(
  r: UpNextRow,
  nameOf: (id: string) => string,
  hhOf: (gid: string) => string,
): string {
  if (r.notInGame) return `Not in your game yet: move ${listText(r.notInGame.map(nameOf))} in first`;
  if (r.unblocks.length) {
    const others = uniq(r.unblocks.flatMap((i) => i.gids)).filter((g) => g !== r.gid);
    const whom = others.length > 2 ? `${others.length} other households` : others.map(hhOf).join(' and ');
    // What happens here: the first plan's sims born or growing up in it.
    const here = r.unblocks[0]!.waits.filter((w) => w.gid === r.gid && w.move === 'play');
    const born = here.filter((w) => w.why === 'notBorn').map((w) => nameOf(w.sim));
    const grow = here.filter((w) => w.why === 'tooYoung').map((w) => nameOf(w.sim));
    const what = [
      born.length ? `${listText(born)} ${born.length > 1 ? 'are' : 'is'} born here` : '',
      grow.length ? `${listText(grow)} grow${grow.length > 1 ? '' : 's'} up here` : '',
    ]
      .filter(Boolean)
      .join(' and ');
    const more = r.unblocks.length - 1;
    return `Helps ${whom}: ${what}${more ? ` (and ${more} more ${more === 1 ? 'plan' : 'plans'})` : ''}`;
  }
  if (r.elder) {
    const soon = r.elder.oldAgeIn ? `old age in ${Math.max(1, Math.floor(r.elder.oldAgeIn))}+ days at the earliest` : 'old age could come any day';
    return `${nameOf(r.elder.id)} is an elder with a plan left: ${soon}`;
  }
  if (r.ready.length) {
    const more = r.ready.length > 1 ? ` (and ${r.ready.length - 1} more)` : '';
    return `Ready: ${r.ready[0]!.text}${more}`;
  }
  const own = r.ownWaits[0]!;
  const w = own.waits.find((x) => x.gid === r.gid) ?? own.waits[0]!;
  return `Helps its own plan along: ${waitText(w, nameOf, hhOf)}`;
}
