/**
 * Rebuilds src/data/changelog.json from the git history.
 *
 * The file is committed rather than generated at build time: Vercel clones
 * shallowly, so `git log` there would only see the last few commits.
 *
 * The merge is additive. An entry already in the file keeps its text, so
 * wording edited by hand survives regeneration and only new commits are
 * appended. Entries are keyed by short SHA; an entry you add back manually
 * after the filter skipped it stays put for the same reason.
 *
 * Usage: node scripts/build-changelog.mjs [--check]
 *   --check  report what would be added and exit non-zero if anything would,
 *            without writing the file.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const OUT = join(ROOT, 'src/data/changelog.json');

const CHECK = process.argv.slice(2).includes('--check');

/** Commits that change tooling rather than the board, so users never see them. */
const SKIP_SUBJECT = /^(?:chore|ci|build|docs|test|style|refactor)(?:\([^)]*\))?!?:|^[a-z]+\((?:dev|ci|build|deps|deps-dev)\)!?:/i;

/** Conventional-commit prefix, stripped so entries read as plain sentences. */
const PREFIX = /^[a-z]+(?:\([^)]*\))?!?:\s*/i;

/** One git subject line as a single user-facing sentence. */
function toSentence(subject) {
  const body = subject.replace(PREFIX, '').trim();
  if (!body) return '';
  const opened = body.charAt(0).toUpperCase() + body.slice(1);
  return /[.!?]$/.test(opened) ? opened : `${opened}.`;
}

function readCommits() {
  const raw = execFileSync(
    'git',
    ['log', '--date=short', '--pretty=format:%h%x00%ad%x00%s'],
    { cwd: ROOT, encoding: 'utf8' },
  );
  return raw
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [sha, date, subject] = line.split('\0');
      return { sha, date, subject };
    });
}

function readExisting() {
  if (!existsSync(OUT)) return [];
  try {
    const parsed = JSON.parse(readFileSync(OUT, 'utf8'));
    return Array.isArray(parsed.entries) ? parsed.entries : [];
  } catch {
    return [];
  }
}

const commits = readCommits();
const existing = readExisting();
const kept = new Map(existing.map((e) => [e.sha, e]));

const added = [];
const skipped = [];
const entries = [];

for (const c of commits) {
  const prev = kept.get(c.sha);
  if (prev) {
    entries.push(prev);
    continue;
  }
  if (SKIP_SUBJECT.test(c.subject)) {
    skipped.push(`${c.sha} ${c.subject}`);
    continue;
  }
  const text = toSentence(c.subject);
  if (!text) continue;
  const entry = { sha: c.sha, date: c.date, text };
  entries.push(entry);
  added.push(`${c.sha} ${text}`);
}

/** Newest first, which is the order the panel renders. */
entries.sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1));

const orphans = existing.filter((e) => !commits.some((c) => c.sha === e.sha));
const days = new Set(entries.map((e) => e.date));

console.log(
  [
    `commits scanned    : ${commits.length}`,
    `entries in file    : ${entries.length} across ${days.size} day(s)`,
    `new this run       : ${added.length}`,
    `skipped (internal) : ${skipped.length}`,
    `kept from file     : ${entries.length - added.length}`,
  ].join('\n'),
);
if (added.length) console.log('  added:', added.join(' ; '));
if (skipped.length) console.log('  skipped:', skipped.join(' ; '));
if (orphans.length)
  console.log(
    `  note: ${orphans.length} entr(ies) have no matching commit and were dropped:`,
    orphans.map((e) => e.sha).join(', '),
  );

if (CHECK) {
  if (added.length) {
    console.error(`\n--check: ${added.length} new entr(ies); run without --check to write.`);
    process.exit(1);
  }
  console.log('\n--check: up to date.');
} else {
  writeFileSync(OUT, JSON.stringify({ entries }, null, 1) + '\n');
  console.log(`\nwrote ${OUT}`);
}
