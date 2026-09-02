/** One shipped change, generated from a commit by scripts/build-changelog.mjs. */
export type ChangelogEntry = {
  /** Short commit SHA — also the identity used to remember what was read. */
  sha: string;
  /** ISO `YYYY-MM-DD`. */
  date: string;
  text: string;
  /**
   * Kept in the file but never shown — for commits with nothing in them for a
   * player. Deleting the entry instead would not stick: the generator matches
   * on SHA, so a missing one looks like a new commit and comes back.
   */
  hidden?: boolean;
  /**
   * Called out beside the entry when an update changed what a saved `.json`
   * means, so someone with an older file knows before they load it.
   */
  compat?: string;
};

export type ChangelogDay = { date: string; entries: ChangelogEntry[] };

/** localStorage key holding the SHA of the newest entry the visitor has seen. */
export const CHANGELOG_SEEN_KEY = 'sims4-family-trees:changelog-seen:v1';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/**
 * `2026-09-01` → `1 September 2026`, formatted from the string parts.
 * Going through `Date` would read the ISO date as UTC midnight and slip to the
 * previous day for anyone west of Greenwich.
 */
export function formatDay(date: string): string {
  const [y, m, d] = date.split('-');
  const month = MONTHS[Number(m) - 1];
  if (!y || !month || !d) return date;
  return `${Number(d)} ${month} ${y}`;
}

/**
 * Drop the entries marked hidden. Apply this once, before anything else reads
 * the log, so the unread marker and the panel agree on which entry is newest —
 * otherwise a hidden entry could become the marker and open the panel over
 * changes nobody can see.
 */
export function visibleEntries(entries: ChangelogEntry[]): ChangelogEntry[] {
  return entries.filter((e) => !e.hidden);
}

/** Newest day first, keeping each day's entries in the order they arrived. */
export function groupByDay(entries: ChangelogEntry[]): ChangelogDay[] {
  const byDate = new Map<string, ChangelogEntry[]>();
  for (const entry of entries) {
    const bucket = byDate.get(entry.date);
    if (bucket) bucket.push(entry);
    else byDate.set(entry.date, [entry]);
  }
  return [...byDate.entries()]
    .sort((a, b) => (a[0] === b[0] ? 0 : a[0] < b[0] ? 1 : -1))
    .map(([date, dayEntries]) => ({ date, entries: dayEntries }));
}

function storage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

/** SHA of the newest entry the visitor has read, or null if they never have. */
export function readSeen(store: Storage | null = storage()): string | null {
  if (!store) return null;
  try {
    return store.getItem(CHANGELOG_SEEN_KEY);
  } catch {
    return null;
  }
}

export function markSeen(
  entries: ChangelogEntry[],
  store: Storage | null = storage(),
): void {
  const newest = entries[0];
  if (!store || !newest) return;
  try {
    store.setItem(CHANGELOG_SEEN_KEY, newest.sha);
  } catch {
    /* Private mode or a full quota — worst case the panel opens again. */
  }
}

/**
 * True when the newest entry is not the one already marked read, which covers
 * a first-time visitor (no marker at all) as well as newly shipped work.
 */
export function hasUnseen(
  entries: ChangelogEntry[],
  seen: string | null,
): boolean {
  const newest = entries[0];
  if (!newest) return false;
  return newest.sha !== seen;
}
