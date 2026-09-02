import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CHANGELOG_SEEN_KEY,
  formatDay,
  groupByDay,
  hasUnseen,
  markSeen,
  readSeen,
  type ChangelogEntry,
} from './changelog.ts';

function memoryStore(initial: Record<string, string> = {}): Storage {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    key(index: number) {
      return [...map.keys()][index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
  };
}

function entry(sha: string, date: string): ChangelogEntry {
  return { sha, date, text: `${sha} shipped.` };
}

describe('formatDay', () => {
  it('reads the ISO parts rather than going through Date', () => {
    assert.equal(formatDay('2026-09-01'), '1 September 2026');
    assert.equal(formatDay('2026-08-17'), '17 August 2026');
    assert.equal(formatDay('2026-12-31'), '31 December 2026');
  });

  it('passes through anything that is not an ISO date', () => {
    assert.equal(formatDay('later'), 'later');
  });
});

describe('groupByDay', () => {
  it('buckets by date, newest day first', () => {
    const days = groupByDay([
      entry('a', '2026-08-17'),
      entry('b', '2026-09-01'),
      entry('c', '2026-08-20'),
    ]);
    assert.deepEqual(
      days.map((d) => d.date),
      ['2026-09-01', '2026-08-20', '2026-08-17'],
    );
  });

  it('keeps the order entries arrived in within a day', () => {
    const days = groupByDay([
      entry('newest', '2026-09-01'),
      entry('middle', '2026-09-01'),
      entry('oldest', '2026-09-01'),
    ]);
    assert.equal(days.length, 1);
    assert.deepEqual(
      days[0]!.entries.map((e) => e.sha),
      ['newest', 'middle', 'oldest'],
    );
  });

  it('returns nothing for an empty log', () => {
    assert.deepEqual(groupByDay([]), []);
  });
});

describe('hasUnseen', () => {
  const entries = [entry('new', '2026-09-01'), entry('old', '2026-08-17')];

  it('is true for a visitor who has never opened the panel', () => {
    assert.equal(hasUnseen(entries, null), true);
  });

  it('is false once the newest entry is the one marked read', () => {
    assert.equal(hasUnseen(entries, 'new'), false);
  });

  it('is true again when something newer ships', () => {
    assert.equal(hasUnseen(entries, 'old'), true);
  });

  it('is false when there is nothing to show', () => {
    assert.equal(hasUnseen([], null), false);
  });
});

describe('readSeen / markSeen', () => {
  it('round-trips the newest SHA', () => {
    const store = memoryStore();
    markSeen([entry('new', '2026-09-01'), entry('old', '2026-08-17')], store);
    assert.equal(store.getItem(CHANGELOG_SEEN_KEY), 'new');
    assert.equal(readSeen(store), 'new');
  });

  it('reports nothing before the panel has been opened', () => {
    assert.equal(readSeen(memoryStore()), null);
  });

  it('leaves the marker alone when there is nothing to mark', () => {
    const store = memoryStore({ [CHANGELOG_SEEN_KEY]: 'old' });
    markSeen([], store);
    assert.equal(readSeen(store), 'old');
  });

  it('treats unavailable storage as unseen rather than throwing', () => {
    assert.equal(readSeen(null), null);
    assert.doesNotThrow(() => markSeen([entry('new', '2026-09-01')], null));
  });

  it('survives a store that throws, as private mode does', () => {
    const throwing = {
      ...memoryStore(),
      getItem() {
        throw new Error('denied');
      },
      setItem() {
        throw new Error('denied');
      },
    } as unknown as Storage;
    assert.equal(readSeen(throwing), null);
    assert.doesNotThrow(() => markSeen([entry('new', '2026-09-01')], throwing));
  });
});
