import { dayOf, dayText, seasonNow, yearOf } from './lifeClock.ts';
import type { RecapSim, SaveRecap } from './saveRecap.ts';
import type { SaveGameInfo } from '../types/whiteboard.ts';

/**
 * The chronicle: the board's story, one entry per save upload, kept with
 * the board (browser draft and board file). The first entry starts the
 * story; each after it holds what the upload said happened since the one
 * before ("Previously on"). Names are kept as they were then, so the
 * story still reads after a card is renamed or deleted.
 */

/** What happened since the upload before, as saveRecap told it, without the celebration. */
export type ChronicleRecap = Omit<SaveRecap, 'celebrate'>;

export type ChronicleEntry = {
  /** When the save was read (ISO): one entry per upload. */
  at: string;
  fileName?: string;
  /** The game's clock and calendar then. */
  game: Pick<SaveGameInfo, 'clock' | 'lifespan' | 'season' | 'seasonSince' | 'seasonDays' | 'calendar'>;
  /** The first upload of a story: how many sims and households it began with. */
  start?: { sims: number; households: number };
  recap?: ChronicleRecap;
};

/** An upload as a chronicle entry: the story's start, or what happened since the last. */
export function chronicleEntry(
  game: SaveGameInfo,
  told: { recap?: SaveRecap | null; start?: { sims: number; households: number } },
): ChronicleEntry {
  const { clock, lifespan, season, seasonSince, seasonDays, calendar } = game;
  const g: ChronicleEntry['game'] = {
    clock,
    ...(lifespan ? { lifespan } : {}),
    ...(season ? { season } : {}),
    ...(seasonSince !== undefined ? { seasonSince } : {}),
    ...(seasonDays ? { seasonDays } : {}),
    ...(calendar ? { calendar } : {}),
  };
  const recap = told.recap ? (({ celebrate: _c, ...rest }) => rest)(told.recap) : undefined;
  return {
    at: game.importedAt,
    ...(game.fileName ? { fileName: game.fileName } : {}),
    game: g,
    ...(told.start ? { start: told.start } : {}),
    ...(recap ? { recap } : {}),
  };
}

/** `list` with `entry` in it, in the order of the game's clock; the same upload once. */
export function withEntry(list: readonly ChronicleEntry[], entry: ChronicleEntry): ChronicleEntry[] {
  return [...list.filter((e) => e.at !== entry.at), entry].sort((a, b) => a.game.clock - b.game.clock || a.at.localeCompare(b.at));
}

/** Two boards' stories as one: every upload once, by the game's clock. */
export function mergeChronicles(a: readonly ChronicleEntry[], b: readonly ChronicleEntry[]): ChronicleEntry[] {
  return b.reduce<ChronicleEntry[]>((out, e) => withEntry(out, e), [...a]);
}

/**
 * When an entry happened in the game: "Spring, day 6 of 7 · Year 1" with
 * Seasons; "Day 34" without, where the calendar is days alone.
 */
export function chronicleWhen(e: ChronicleEntry): string {
  const s = seasonNow({ clock: e.game.clock, season: e.game.season, seasonSince: e.game.seasonSince, seasonDays: e.game.seasonDays });
  const day = dayOf(e.game.clock);
  if (s && e.game.seasonDays) return `${s.season}, day ${s.day} of ${s.of} · Year ${yearOf(day, e.game.seasonDays)}`;
  return dayText(day);
}

/** Does an entry's event involve anyone in `ids`? */
const has = (ids: ReadonlySet<string> | null, ...who: (RecapSim | string | undefined)[]) =>
  !ids || who.some((w) => !!w && ids.has(typeof w === 'string' ? w : w.id));

/** Does an event's text match `q` (folded to lower case)? */
const says = (q: string, ...names: (string | undefined)[]) => !q || names.some((n) => !!n && n.toLowerCase().includes(q));

/**
 * An entry's story about `ids` (a sim, a household's sims, a dynasty's
 * members), or everyone with null, matching the search `query`. Null when
 * nothing in it does. A start entry belongs to the whole story only; a
 * dynasty's prestige to its own story (`dynasties`) or the whole one.
 */
export function entryAbout(
  e: ChronicleEntry,
  ids: ReadonlySet<string> | null,
  query = '',
  /** Dynasties (by key) whose prestige belongs to this story. */
  dynasties?: ReadonlySet<string>,
): ChronicleEntry | null {
  const q = query.trim().toLowerCase();
  if (!e.recap) return ids || q ? null : e;
  const r = e.recap;
  const recap: ChronicleRecap = {
    ...r,
    born: r.born.filter((b) => (has(ids, b, ...(b.parentIds ?? [])) || false) && says(q, b.name, ...b.parents)),
    together: r.together.filter((t) => has(ids, t.a, t.b) && says(q, t.a.name, t.b.name)),
    apart: r.apart.filter((t) => has(ids, t.a, t.b) && says(q, t.a.name, t.b.name)),
    moved: r.moved.filter((m) => has(ids, m) && says(q, m.name, m.from, m.to)),
    grew: r.grew.filter((g) => has(ids, g) && says(q, g.name)),
    died: r.died.filter((d) => has(ids, d) && says(q, d.name)),
    met: ids || q ? 0 : r.met,
    plansDone: ids || q ? 0 : r.plansDone,
    // A dynasty's prestige belongs to its story by its members' names, or the whole story.
    ...(r.prestige
      ? { prestige: r.prestige.filter((p) => (!ids || !!dynasties?.has(p.key)) && says(q, p.name)) }
      : {}),
  };
  const any =
    recap.born.length + recap.together.length + recap.apart.length + recap.moved.length + recap.grew.length + recap.died.length + (recap.prestige?.length ?? 0);
  if (!any && (ids || q || (!recap.met && !recap.seasons))) return null;
  return { ...e, recap };
}

/** One moment of a story, for a poster: when, and what. */
export type StoryLine = { when: string; text: string };

/**
 * The big moments of the story about `ids`, oldest first: births,
 * couples, partings and deaths (moves and birthdays are left to the
 * board).
 */
export function storyLines(entries: readonly ChronicleEntry[], ids: ReadonlySet<string>): StoryLine[] {
  const out: StoryLine[] = [];
  for (const e of entries) {
    const r = entryAbout(e, ids)?.recap;
    if (!r) continue;
    const when = chronicleWhen(e);
    for (const b of r.born) out.push({ when, text: `${b.name} was born${b.parents.length ? ` to ${b.parents.join(' and ')}` : ''}` });
    for (const t of r.together) out.push({ when, text: `${t.a.name} ${t.type === 'marriage' ? 'married' : 'fell for'} ${t.b.name}` });
    for (const t of r.apart) out.push({ when, text: `${t.a.name} and ${t.b.name} ${t.type === 'divorced' ? 'divorced' : 'broke up'}` });
    for (const d of r.died) out.push({ when, text: `${d.name} passed away` });
  }
  return out;
}
