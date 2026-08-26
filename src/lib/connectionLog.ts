import { ADDED_HOUSEHOLD, DECEASED_STATE, LINK_LABEL, LINK_MARK, OCC } from './constants.ts';
import type {
  DeceasedMark,
  Edge,
  HouseholdAgeUp,
  HouseholdMove,
  SimAgeUp,
  SimNode,
} from '../types/whiteboard.ts';
import { edgeSourceOf } from './utils.ts';

export type LogPart =
  | { kind: 'time'; value: string }
  | { kind: 'sim'; id: string; name: string }
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
  text: string;
  parts: LogPart[];
};

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

export function simName(n: SimNode): string {
  const name = [n.first, n.sur]
    .map((s) => (s ?? '').trim())
    .filter(Boolean)
    .join(' ');
  return name || n.id;
}

/** `{neighbourhood}, {world}` — skip a missing neighbourhood. */
function livingPlace(nb: string, world: string): string {
  return [nb && nb !== '-' ? nb : '', world && world !== '-' ? world : '']
    .map((s) => s.trim())
    .filter(Boolean)
    .join(', ');
}

/** `, from {neighbourhood}, {world}` — skip a missing neighbourhood. */
function simFromSuffix(n: SimNode): string {
  const place = livingPlace(n.nb, n.world);
  return place ? `, from ${place}` : '';
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
  return [
    { kind: 'sim', id: n.id, name: simName(n) },
    { kind: 'text', value: simFromSuffix(n) },
  ];
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
      if (p.kind === 'sim') return p.name;
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

function parentParts(parent: SimNode, child: SimNode): LogPart[] {
  return [
    ...mention(parent),
    { kind: 'text', value: ' had a ' },
    rel('parent'),
    { kind: 'text', value: ', ' },
    { kind: 'sim', id: child.id, name: simName(child) },
    { kind: 'text', value: '.' },
  ];
}

function parentsChildParts(parents: SimNode[], child: SimNode): LogPart[] {
  const [first, ...rest] = parents;
  if (!first) return [];
  if (!rest.length) return parentParts(first, child);
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
  });
  return [
    ...mention(first),
    { kind: 'text', value: ' had a ' },
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
  const from = householdPlace(
    spawned ? '' : move.fromHh,
    move.fromNb,
    move.fromWorld,
  );
  const to = householdPlace(move.toHh, move.toNb, move.toWorld);
  if (spawned) {
    const mid = from
      ? ` came into ✨existence✨ and moved from ${from}, to `
      : ' came into ✨existence✨ and moved to ';
    return [
      { kind: 'sim', id: sim.id, name: simName(sim) },
      { kind: 'text', value: mid },
      { kind: 'text', value: to },
      { kind: 'text', value: '.' },
    ];
  }
  return [
    { kind: 'sim', id: sim.id, name: simName(sim) },
    { kind: 'text', value: ' moved from ' },
    { kind: 'text', value: from },
    { kind: 'text', value: ' to ' },
    { kind: 'text', value: to },
    { kind: 'text', value: '.' },
  ];
}

function sentenceParts(type: Edge['type'], a: SimNode, b: SimNode): LogPart[] {
  if (type === 'parent') return parentParts(a, b);
  return unionParts(type, a, b);
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
    const parentNodes = parents
      .map((e) => byid[e.a])
      .filter((n): n is SimNode => !!n);
    if (!child || parentNodes.length < 2) continue;
    parents.forEach((e) => used.add(e.id));
    entries.push(
      makeEntry(
        `child:${childId}`,
        parents.map((e) => e.id),
        earliestCreatedAt(parents),
        parentsChildParts(parentNodes, child),
        undefined,
        parents.every((e) => edgeSourceOf(e) === 'save') ? 'save' : 'planned',
      ),
    );
  }

  for (const e of tracked) {
    if (used.has(e.id)) continue;
    const a = byid[e.a];
    const b = byid[e.b];
    if (!a || !b) continue;
    entries.push(
      makeEntry(
        e.id,
        [e.id],
        e.createdAt,
        sentenceParts(e.type, a, b),
        undefined,
        edgeSourceOf(e) === 'save' ? 'save' : 'planned',
      ),
    );
  }

  for (const move of moves) {
    const sim = byid[move.simId];
    if (!sim) continue;
    entries.push(
      makeEntry(move.id, [], move.createdAt, moveParts(sim, move), move.simId, 'planned'),
    );
  }

  for (const event of ageUps) {
    entries.push(
      makeEntry(
        event.id,
        [],
        event.createdAt,
        ageUpParts(event),
        event.simIds[0],
        'planned',
      ),
    );
  }

  for (const event of simAgeUps) {
    const sim = byid[event.simId];
    if (!sim) continue;
    entries.push(
      makeEntry(
        event.id,
        [],
        event.createdAt,
        simAgeUpParts(sim, event),
        event.simId,
        'planned',
      ),
    );
  }

  for (const death of deaths) {
    const sim = byid[death.simId];
    if (!sim) continue;
    entries.push(
      makeEntry(
        death.id,
        [],
        death.createdAt,
        deceasedParts(sim, death),
        death.simId,
        'planned',
      ),
    );
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
