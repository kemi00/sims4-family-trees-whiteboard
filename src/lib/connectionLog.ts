import { ADDED_HOUSEHOLD, DECEASED_STATE, LINK_LABEL, LINK_MARK, OCC } from './constants.ts';
import type {
  DeceasedMark,
  Edge,
  HouseholdAgeUp,
  HouseholdMove,
  SimAgeUp,
  SimNode,
} from '../types/whiteboard.ts';
import { edgeSourceOf, joinNotes } from './utils.ts';
import { changesWorld, householdMoveKey, movesHousehold } from './householdMove.ts';
import { cardName } from './plan.ts';

export type LogPart =
  | { kind: 'time'; value: string }
  /** `place`: where the sim lives, written after the name in the text. */
  | { kind: 'sim'; id: string; name: string; place?: string }
  /**
   * A household in a move, with where it is. `world` is written after the
   * name when the move changes worlds: Dreamer (Ondarion).
   */
  | { kind: 'hh'; name: string; place: string; world?: string }
  | { kind: 'rel'; mark: string; label: string }
  | { kind: 'text'; value: string }
  | { kind: 'break' };

export type ConnectionLogOrigin = 'planned' | 'save';

export type ConnectionLogEntry = {
  id: string;
  edgeIds: string[];
  simId?: string;
  createdAt?: string;
  origin?: ConnectionLogOrigin;
  /**
   * link: a link or a child. move: a household move. event: an age-up or a
   * death set on the board.
   */
  kind?: 'link' | 'move' | 'event';
  /** A plan a save has since shown done (a move, or links it confirmed). */
  done?: true;
  /** The move this line is, to write its note. */
  moveId?: string;
  /** Every move a household's world move is made of; the note goes on the first. */
  moveIds?: string[];
  /** Your note on the link or move. */
  note?: string;
  text: string;
  parts: LogPart[];
};

/**
 * Where a line goes in the log: off (a plan the game went against), plan
 * (still to do in your game) or game (what your saves show, plans they
 * showed done, and age-ups and deaths set on the board).
 */
export type LogSection = 'off' | 'plan' | 'game';

export function logSection(
  entry: ConnectionLogEntry,
  offPlanEdgeIds: ReadonlySet<string> = new Set(),
): LogSection {
  if (entry.kind === 'event') return 'game';
  if (entry.edgeIds.some((id) => offPlanEdgeIds.has(id))) return 'off';
  if (entry.done) return 'game';
  return (entry.origin ?? 'planned') === 'planned' ? 'plan' : 'game';
}

/** A note can go on links and moves, not on age-ups and deaths. */
export function canNote(entry: ConnectionLogEntry): boolean {
  return entry.edgeIds.length > 0 || !!entry.moveId;
}

/**
 * Local wall-clock stamp as `yyyy-mm-dd hh:mm`. Returns null when the ISO
 * string is missing or not a real date — never substitutes "now".
 */
export function formatLogTime(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const p = (n: number): string => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
    ` ${p(d.getHours())}:${p(d.getMinutes())}`
  );
}

/**
 * Local calendar day as `yyyy-mm-dd`, same timezone as formatLogTime.
 * Returns null when the stamp cannot be built — never substitutes "now".
 */
export function logDayKey(iso: string | undefined): string | null {
  const stamped = formatLogTime(iso);
  if (!stamped) return null;
  const space = stamped.indexOf(' ');
  return space === -1 ? stamped : stamped.slice(0, space);
}

export type ConnectionLogRow =
  | { kind: 'day'; key: string; day: string }
  | { kind: 'entry'; key: string; entry: ConnectionLogEntry };

/**
 * Day dividers for already-sorted display order. A divider is inserted when
 * the local day changes onto a parseable date. Missing/invalid createdAt
 * values do not mint a day and do not get a divider against a known day.
 */
export function connectionLogRows(
  entries: ConnectionLogEntry[],
): ConnectionLogRow[] {
  const rows: ConnectionLogRow[] = [];
  let prevDay: string | null | undefined;
  for (const entry of entries) {
    const day = logDayKey(entry.createdAt);
    if (day && day !== prevDay) {
      rows.push({ kind: 'day', key: `day:${rows.length}:${day}`, day });
    }
    rows.push({ kind: 'entry', key: entry.id, entry });
    prevDay = day;
  }
  return rows;
}

/** A sim's name in the log: a planned sim with no name by its plan label or number ("Planned (2) Le Chien"). */
export function simName(n: SimNode): string {
  return cardName(n) || n.id;
}

/** `{neighbourhood}, {world}` — skip a missing neighbourhood. */
export function livingPlace(nb: string, world: string): string {
  return [nb && nb !== '-' ? nb : '', world && world !== '-' ? world : '']
    .map((s) => s.trim())
    .filter(Boolean)
    .join(', ');
}

/** `{neighbourhood}, {world}` where a sim lives — skip a missing neighbourhood. */
function simPlace(n: SimNode): string {
  return livingPlace(n.nb, n.world);
}

/** `Hekekia, Sulani` or `Kahananui, Lani St. Taz, Sulani`. */
export function householdPlace(hh: string, nb: string, world: string): string {
  return [hh.trim(), livingPlace(nb, world)].filter(Boolean).join(', ');
}

/**
 * `The {hh} household, from {nb}, {world} aged up.`
 * Neighbourhood is omitted the same way as simFromSuffix when it is missing or "-".
 */
export function householdAgeUpLine(hh: string, nb: string, world: string): string {
  const name = hh.trim();
  const place = livingPlace(nb, world);
  const from = place ? `, from ${place}` : '';
  if (name) return `The ${name} household${from} aged up.`;
  if (place) return `${place} aged up.`;
  return 'aged up.';
}

function rel(type: keyof typeof LINK_MARK): LogPart {
  return { kind: 'rel', mark: LINK_MARK[type], label: LINK_LABEL[type] };
}

/** `⚭ married` — if the mark is already the word, do not print it twice. */
export function relDisplay(mark: string, label: string): string {
  if (mark === label) return label;
  return `${mark} ${label}`;
}

function mention(n: SimNode): LogPart[] {
  const place = simPlace(n);
  return [{ kind: 'sim', id: n.id, name: simName(n), ...(place ? { place } : {}) }];
}

function timed(
  createdAt: string | undefined,
  body: LogPart[],
): LogPart[] {
  const t = formatLogTime(createdAt);
  return t
    ? [{ kind: 'time', value: t }, { kind: 'break' }, ...body]
    : body;
}

export function partsToText(parts: LogPart[]): string {
  return parts
    .map((p) => {
      if (p.kind === 'sim') return p.place ? `${p.name}, from ${p.place}` : p.name;
      if (p.kind === 'hh') return [p.name, p.place].filter(Boolean).join(', ');
      if (p.kind === 'rel') return relDisplay(p.mark, p.label);
      if (p.kind === 'break') return '\n';
      return p.value;
    })
    .join('');
}

function unionParts(
  type: Exclude<Edge['type'], 'parent'>,
  a: SimNode,
  b: SimNode,
): LogPart[] {
  const mid =
    type === 'romance'
      ? ' with '
      : type === 'divorced'
        ? ' from '
        : type === 'sibling'
          ? ' of '
          : ' to ';
  return [
    ...mention(a),
    { kind: 'text', value: ' is ' },
    rel(type),
    { kind: 'text', value: mid },
    ...mention(b),
    { kind: 'text', value: '.' },
  ];
}

/** `{a} and {b} are ❤ secret lovers.` */
function secretLoversParts(a: SimNode, b: SimNode): LogPart[] {
  return [
    ...mention(a),
    { kind: 'text', value: ' and ' },
    ...mention(b),
    { kind: 'text', value: ' are ' },
    { kind: 'rel', mark: LINK_MARK.romance, label: 'secret lovers' },
    { kind: 'text', value: '.' },
  ];
}

/** Plans read as plans ("has a child"), what happened as done ("had"). */
function hadOrHas(planned: boolean): string {
  return planned ? 'has' : 'had';
}

function parentParts(parent: SimNode, child: SimNode, secret = false, planned = false): LogPart[] {
  return [
    ...mention(parent),
    { kind: 'text', value: ` ${hadOrHas(planned)} a ${secret ? 'secret ' : ''}` },
    rel('parent'),
    { kind: 'text', value: ', ' },
    { kind: 'sim', id: child.id, name: simName(child) },
    { kind: 'text', value: '.' },
  ];
}

function parentsChildParts(
  parents: SimNode[],
  child: SimNode,
  secretIds: ReadonlySet<string> = new Set(),
  planned = false,
): LogPart[] {
  const [first, ...rest] = parents;
  if (!first) return [];
  if (!rest.length) return parentParts(first, child, secretIds.has(first.id), planned);
  const withClause: LogPart[] = [];
  rest.forEach((p, i) => {
    if (i === 0) {
      withClause.push({ kind: 'text', value: ', with ' });
    } else if (i === rest.length - 1) {
      withClause.push({ kind: 'text', value: ' and ' });
    } else {
      withClause.push({ kind: 'text', value: ', ' });
    }
    withClause.push(...mention(p));
    if (secretIds.has(p.id)) withClause.push({ kind: 'text', value: ' (secret parent)' });
  });
  return [
    ...mention(first),
    { kind: 'text', value: ` ${hadOrHas(planned)} a ` },
    rel('parent'),
    { kind: 'text', value: ', ' },
    { kind: 'sim', id: child.id, name: simName(child) },
    ...withClause,
    { kind: 'text', value: '.' },
  ];
}

function deceasedEmoji(): string {
  return OCC[DECEASED_STATE] ?? '';
}

function deceasedParts(sim: SimNode, death: DeceasedMark): LogPart[] {
  const mark = deceasedEmoji();
  if (death.cause === 'ageUp') {
    return [
      { kind: 'sim', id: sim.id, name: simName(sim) },
      { kind: 'text', value: mark ? ` passed away ${mark}.` : ' passed away.' },
    ];
  }
  const label = mark ? `${mark} ${DECEASED_STATE}` : DECEASED_STATE;
  return [
    { kind: 'sim', id: sim.id, name: simName(sim) },
    { kind: 'text', value: ' became ' },
    { kind: 'text', value: label },
    { kind: 'text', value: '.' },
  ];
}

function ageUpParts(event: HouseholdAgeUp): LogPart[] {
  return [{ kind: 'text', value: householdAgeUpLine(event.hh, event.nb, event.world) }];
}

function simAgeUpParts(sim: SimNode, event: SimAgeUp): LogPart[] {
  const hh = event.hh.trim();
  const ofHouse = hh ? ` of the ${hh} household` : '';
  const place = livingPlace(event.nb, event.world);
  const from = place ? `, from ${place}` : '';
  return [
    { kind: 'sim', id: sim.id, name: simName(sim) },
    {
      kind: 'text',
      value: `${ofHouse}${from} aged up to ${event.age}.`,
    },
  ];
}

function moveParts(sim: SimNode, move: HouseholdMove): LogPart[] {
  const spawned = move.fromHh === ADDED_HOUSEHOLD;
  // A move still planned reads as a plan; one a save showed done, as done.
  const moved = move.done ? 'moved' : 'moves';
  // Across worlds, the worlds tell two households of one name apart.
  const worlds = changesWorld(move);
  const to: LogPart = {
    kind: 'hh',
    name: move.toHh.trim(),
    place: livingPlace(move.toNb, move.toWorld),
    ...(worlds ? { world: move.toWorld } : {}),
  };
  if (spawned) {
    const from = livingPlace(move.fromNb, move.fromWorld);
    const came = move.done ? 'came' : 'comes';
    const mid = from
      ? ` ${came} into ✨existence✨ and ${moved} from ${from}, to `
      : ` ${came} into ✨existence✨ and ${moved} to `;
    return [
      { kind: 'sim', id: sim.id, name: simName(sim) },
      { kind: 'text', value: mid },
      to,
      { kind: 'text', value: '.' },
    ];
  }
  return [
    { kind: 'sim', id: sim.id, name: simName(sim) },
    { kind: 'text', value: ` ${moved} from ` },
    {
      kind: 'hh',
      name: move.fromHh.trim(),
      place: livingPlace(move.fromNb, move.fromWorld),
      ...(worlds ? { world: move.fromWorld } : {}),
    },
    { kind: 'text', value: ' to ' },
    to,
    { kind: 'text', value: '.' },
  ];
}

/** Sims named in a household's move before "and N more". */
const MOVERS_SHOWN = 3;

/**
 * `The Dreamer household moves from Not in any world to Ondarion, with Dirk
 * Dreamer and Amarachi Darong.` One line for a household that changes
 * worlds, as it is one move in the game.
 */
function householdMoveParts(sims: SimNode[], move: HouseholdMove, done: boolean): LogPart[] {
  const shown = sims.slice(0, sims.length > MOVERS_SHOWN ? MOVERS_SHOWN - 1 : MOVERS_SHOWN);
  const more = sims.length - shown.length;
  const names: LogPart[] = [];
  shown.forEach((n, i) => {
    if (i > 0) names.push({ kind: 'text', value: i === shown.length - 1 && !more ? ' and ' : ', ' });
    names.push({ kind: 'sim', id: n.id, name: simName(n) });
  });
  if (more) names.push({ kind: 'text', value: ` and ${more} more` });
  return [
    { kind: 'text', value: 'The ' },
    // The worlds follow in the sentence, so the name stands alone.
    { kind: 'hh', name: move.toHh.trim(), place: '' },
    { kind: 'text', value: ` household ${done ? 'moved' : 'moves'} from ${move.fromWorld} to ${move.toWorld}, with ` },
    ...names,
    { kind: 'text', value: '.' },
  ];
}

function sentenceParts(e: Edge, a: SimNode, b: SimNode): LogPart[] {
  if (e.type === 'parent') return parentParts(a, b, !!e.secret, edgeSourceOf(e) === 'planned');
  if (e.type === 'romance' && e.secret) return secretLoversParts(a, b);
  return unionParts(e.type, a, b);
}

function makeEntry(
  id: string,
  edgeIds: string[],
  createdAt: string | undefined,
  body: LogPart[],
  simId?: string,
  origin?: ConnectionLogOrigin,
): ConnectionLogEntry {
  const parts = timed(createdAt, body);
  return { id, edgeIds, simId, createdAt, origin, parts, text: partsToText(parts) };
}

/** A line for links: done once none is still planned and one was; their note. */
function linkEntry(entry: ConnectionLogEntry, edges: Edge[]): ConnectionLogEntry {
  const done = edges.every((e) => edgeSourceOf(e) !== 'planned') && edges.some((e) => e.wasPlanned);
  const note = edges.find((e) => e.note?.trim())?.note;
  return { ...entry, kind: 'link', ...(done ? { done: true as const } : {}), ...(note ? { note } : {}) };
}

function earliestCreatedAt(edges: Edge[]): string | undefined {
  let best: string | undefined;
  let bestMs = Number.POSITIVE_INFINITY;
  for (const e of edges) {
    if (!e.createdAt) continue;
    const ms = Date.parse(e.createdAt);
    if (Number.isNaN(ms) || ms >= bestMs) continue;
    bestMs = ms;
    best = e.createdAt;
  }
  return best;
}

/**
 * User-made and save-imported links plus household moves, age-ups, and editor
 * life-stage increases. Parent edges that share a bundleId and the same child
 * collapse into a single "had a child … with" sentence.
 */
export function buildConnectionLog(
  edges: Edge[],
  byid: Record<string, SimNode>,
  moves: HouseholdMove[] = [],
  ageUps: HouseholdAgeUp[] = [],
  deaths: DeceasedMark[] = [],
  simAgeUps: SimAgeUp[] = [],
): ConnectionLogEntry[] {
  const tracked = edges.filter(
    (e) => edgeSourceOf(e) === 'planned' || edgeSourceOf(e) === 'save',
  );
  const used = new Set<string>();
  const entries: ConnectionLogEntry[] = [];

  const parentsByChild = new Map<string, Edge[]>();
  for (const e of tracked) {
    if (e.type !== 'parent') continue;
    const list = parentsByChild.get(e.b) ?? [];
    list.push(e);
    parentsByChild.set(e.b, list);
  }

  for (const [childId, parents] of parentsByChild) {
    if (parents.length < 2) continue;
    const child = byid[childId];
    // Secret parents last, so the sentence names the known parent first.
    const ordered = [...parents].sort((x, y) => Number(!!x.secret) - Number(!!y.secret));
    const parentNodes = ordered
      .map((e) => byid[e.a])
      .filter((n): n is SimNode => !!n);
    if (!child || parentNodes.length < 2) continue;
    const secretIds = new Set(parents.filter((e) => e.secret).map((e) => e.a));
    parents.forEach((e) => used.add(e.id));
    const saved = parents.every((e) => edgeSourceOf(e) === 'save');
    entries.push(
      linkEntry(
        makeEntry(
          `child:${childId}`,
          parents.map((e) => e.id),
          earliestCreatedAt(parents),
          parentsChildParts(parentNodes, child, secretIds, !saved),
          undefined,
          saved ? 'save' : 'planned',
        ),
        parents,
      ),
    );
  }

  for (const e of tracked) {
    if (used.has(e.id)) continue;
    const a = byid[e.a];
    const b = byid[e.b];
    if (!a || !b) continue;
    entries.push(
      linkEntry(
        makeEntry(
          e.id,
          [e.id],
          e.createdAt,
          sentenceParts(e, a, b),
          undefined,
          edgeSourceOf(e) === 'save' ? 'save' : 'planned',
        ),
        [e],
      ),
    );
  }

  // A household's world move: its sims' moves, recorded together, as one line.
  const together = new Map<string, HouseholdMove[]>();
  for (const move of moves) {
    if (!movesHousehold(move) || !byid[move.simId]) continue;
    const key = householdMoveKey(move);
    together.set(key, [...(together.get(key) ?? []), move]);
  }
  for (const list of together.values()) {
    const first = list[0]!;
    const sims = list.map((m) => byid[m.simId]!);
    const done = list.every((m) => m.done);
    const note = joinNotes(...list.map((m) => m.note));
    const entry = makeEntry(first.id, [], first.createdAt, householdMoveParts(sims, first, done), first.simId, 'planned');
    entries.push({
      ...entry,
      kind: 'move',
      moveId: first.id,
      moveIds: list.map((m) => m.id),
      ...(done ? { done: true as const } : {}),
      ...(note ? { note } : {}),
    });
  }

  for (const move of moves) {
    const sim = byid[move.simId];
    if (!sim || movesHousehold(move)) continue;
    const entry = makeEntry(move.id, [], move.createdAt, moveParts(sim, move), move.simId, 'planned');
    entries.push({
      ...entry,
      kind: 'move',
      moveId: move.id,
      ...(move.done ? { done: true as const } : {}),
      ...(move.note?.trim() ? { note: move.note } : {}),
    });
  }

  for (const event of ageUps) {
    entries.push({
      ...makeEntry(event.id, [], event.createdAt, ageUpParts(event), event.simIds[0], 'planned'),
      kind: 'event',
    });
  }

  for (const event of simAgeUps) {
    const sim = byid[event.simId];
    if (!sim) continue;
    entries.push({
      ...makeEntry(event.id, [], event.createdAt, simAgeUpParts(sim, event), event.simId, 'planned'),
      kind: 'event',
    });
  }

  for (const death of deaths) {
    const sim = byid[death.simId];
    if (!sim) continue;
    entries.push({
      ...makeEntry(death.id, [], death.createdAt, deceasedParts(sim, death), death.simId, 'planned'),
      kind: 'event',
    });
  }

  entries.sort((x, y) => compareLogTime(x, y, false));

  return entries;
}

function logTimeMs(entry: ConnectionLogEntry): number | null {
  if (!entry.createdAt) return null;
  const ms = Date.parse(entry.createdAt);
  return Number.isNaN(ms) ? null : ms;
}

function compareLogTime(
  x: ConnectionLogEntry,
  y: ConnectionLogEntry,
  newestFirst: boolean,
): number {
  const tx = logTimeMs(x);
  const ty = logTimeMs(y);
  if (tx == null && ty == null) return x.id.localeCompare(y.id);
  if (tx == null) return 1;
  if (ty == null) return -1;
  if (tx !== ty) return newestFirst ? ty - tx : tx - ty;
  return x.id.localeCompare(y.id);
}

/** View order for the log panel. Undated lines stay last in both directions. */
export function sortConnectionLog(
  entries: ConnectionLogEntry[],
  newestFirst: boolean,
): ConnectionLogEntry[] {
  return [...entries].sort((x, y) => compareLogTime(x, y, newestFirst));
}
