/**
 * POST /api/report: a problem report the player chose to send, filed as an
 * issue in the developer's private reports repo. The answer is the issue's
 * number, the short code the player can quote on Threads.
 *
 * The report is the one the board shows before sending: counts, the game's
 * own ids and world names, settings, the browser and recent errors, never a
 * sim's or household's name (problemReport.ts). The player's note is theirs.
 *
 * Set on Vercel:
 * - REPORTS_GITHUB_TOKEN: a fine-grained token with Issues read and write on
 *   the reports repo, and nothing else.
 * - REPORTS_REPO (optional): owner/name, kemi00/sims4-family-trees-reports.
 *
 * No imports, on purpose: the function stands on its own when Vercel builds it.
 */

const DEFAULT_REPO = 'kemi00/sims4-family-trees-reports';
/** How a report starts; the second is the older name, still sent by tabs opened before the rename. */
const REPORT_STARTS = ['The Sims 4 Family Tree Planner: problem report', 'Sims 4 Dynasty Whiteboard: problem report'];
/** Reports run 3 to 8 thousand characters; a big save's worlds can add more. */
const MAX_REPORT = 30_000;
const MAX_NOTE = 2_000;
const MAX_BODY = 80_000;
/** Per address: a few reports in a few minutes is a person; more is a script. */
const LIMIT = 5;
const LIMIT_WINDOW_MS = 10 * 60 * 1000;

export type ReportEnv = { REPORTS_GITHUB_TOKEN?: string | undefined; REPORTS_REPO?: string | undefined };
export type ReportDeps = { fetch: typeof fetch; now: number; limiter: Map<string, number[]> };

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

/** A fence longer than any run of its own character in the text, so nothing inside can close it. */
function fenced(text: string): string {
  const longest = Math.max(0, ...(text.match(/~+/g) ?? []).map((r) => r.length));
  const fence = '~'.repeat(Math.max(3, longest + 1));
  return `${fence}text\n${text}\n${fence}`;
}

/** The issue for a report and the player's note: a short title, labels to sort by, and both texts fenced. */
export function issueFor(report: string, note: string): { title: string; body: string; labels: string[] } {
  const build = report.match(/· build (\w+)/)?.[1] ?? 'unknown';
  const crash = report.includes('(the page went blank)');
  const translated = /Page translated by the browser to |\(page translated to /.test(report);
  const title = `${crash ? 'Board went blank' : 'Problem report'} (build ${build})`;
  const parts = [
    note ? `**What they were doing, in their words**\n\n${fenced(note)}` : '_No note._',
    `**The report**\n\n${fenced(report)}`,
  ];
  const labels = [crash ? 'crash' : '', translated ? 'translated' : '', note ? 'has a note' : ''].filter(Boolean);
  return { title, body: parts.join('\n\n'), labels };
}

/** True when this address may send another report now; counts this one. */
function allowed(limiter: Map<string, number[]>, who: string, now: number): boolean {
  const recent = (limiter.get(who) ?? []).filter((t) => now - t < LIMIT_WINDOW_MS);
  if (recent.length >= LIMIT) {
    limiter.set(who, recent);
    return false;
  }
  recent.push(now);
  limiter.set(who, recent);
  if (limiter.size > 5_000) limiter.clear();
  return true;
}

/** Same host as the page that sent it: the board's own Send button, not another site. */
function sameSite(request: Request): boolean {
  const origin = request.headers.get('origin');
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function handle(request: Request, env: ReportEnv, deps: ReportDeps): Promise<Response> {
  if (!sameSite(request)) return json(403, { error: 'not-from-the-board' });
  const size = Number(request.headers.get('content-length') ?? 0);
  if (size > MAX_BODY) return json(413, { error: 'too-big' });

  let report = '';
  let note = '';
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY) return json(413, { error: 'too-big' });
    const body = JSON.parse(raw) as { report?: unknown; note?: unknown };
    report = typeof body.report === 'string' ? body.report.trim() : '';
    note = typeof body.note === 'string' ? body.note.trim() : '';
  } catch {
    return json(400, { error: 'not-a-report' });
  }
  if (!REPORT_STARTS.some((s) => report.startsWith(s))) return json(400, { error: 'not-a-report' });
  if (report.length > MAX_REPORT || note.length > MAX_NOTE) return json(413, { error: 'too-big' });

  const token = env.REPORTS_GITHUB_TOKEN;
  if (!token) return json(503, { error: 'not-set-up' });

  const who = (request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? 'someone').split(',')[0]!.trim();
  if (!allowed(deps.limiter, who, deps.now)) return json(429, { error: 'too-many' });

  const repo = env.REPORTS_REPO || DEFAULT_REPO;
  try {
    const res = await deps.fetch(`https://api.github.com/repos/${repo}/issues`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
        'content-type': 'application/json',
        'user-agent': 'sims4-family-trees-board',
      },
      body: JSON.stringify(issueFor(report, note)),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return json(502, { error: 'not-filed', status: res.status });
    const issue = (await res.json()) as { number?: unknown };
    if (typeof issue.number !== 'number') return json(502, { error: 'not-filed' });
    return json(201, { number: issue.number });
  } catch {
    return json(502, { error: 'not-filed' });
  }
}

const limiter = new Map<string, number[]>();

export function POST(request: Request): Promise<Response> {
  return handle(request, process.env, { fetch, now: Date.now(), limiter });
}
