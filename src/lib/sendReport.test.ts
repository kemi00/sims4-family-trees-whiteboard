import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { handle, issueFor, type ReportDeps } from '../../api/report.ts';
import { sendReport } from './sendReport.ts';

const REPORT = [
  'Sims 4 Dynasty Whiteboard: problem report',
  'Made 2026-11-20T17:55:27.935Z · build dc28e8d · layout 11',
  'Page translated by the browser to uk · the board stepped around swapped text 2 times',
  'Recent errors:',
  "  2026-11-20T17:55:27.932Z (the page went blank) NotFoundError: Failed to execute 'removeChild'",
].join('\n');

function request(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('https://board.example/api/report', {
    method: 'POST',
    headers: { origin: 'https://board.example', host: 'board.example', 'x-forwarded-for': '1.2.3.4', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function deps(over: Partial<ReportDeps> = {}): ReportDeps & { calls: { url: string; init: RequestInit }[] } {
  const calls: { url: string; init: RequestInit }[] = [];
  const fake = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ number: 12 }), { status: 201 });
  }) as unknown as typeof fetch;
  return { fetch: fake, now: 1_000_000, limiter: new Map(), calls, ...over };
}

const env = { REPORTS_GITHUB_TOKEN: 'test-token' };

describe('the report function', () => {
  it('files the report as an issue in the reports repo and answers its number', async () => {
    const d = deps();
    const res = await handle(request({ report: REPORT, note: 'Linking two sims @someone' }), env, d);
    assert.equal(res.status, 201);
    assert.deepEqual(await res.json(), { number: 12 });
    assert.equal(d.calls[0]!.url, 'https://api.github.com/repos/kemi00/sims4-family-trees-reports/issues');
    const issue = JSON.parse(String(d.calls[0]!.init.body)) as { title: string; body: string; labels: string[] };
    assert.equal(issue.title, 'Board went blank (build dc28e8d)');
    assert.deepEqual(issue.labels, ['crash', 'translated', 'has a note']);
    // Both texts are fenced, so a name after @ in a note never pings anyone on GitHub.
    assert.match(issue.body, /~~~text\nLinking two sims @someone\n~~~/);
  });

  it('turns away what isn’t the board’s own report', async () => {
    assert.equal((await handle(request({ report: 'hello' }), env, deps())).status, 400);
    assert.equal((await handle(request('{not json'), env, deps())).status, 400);
    assert.equal((await handle(request({ report: REPORT }, { origin: 'https://elsewhere.example' }), env, deps())).status, 403);
    assert.equal((await handle(request({ report: REPORT + 'x'.repeat(40_000) }), env, deps())).status, 413);
  });

  it('says it isn’t set up without a token, and never calls GitHub', async () => {
    const d = deps();
    const res = await handle(request({ report: REPORT }), {}, d);
    assert.equal(res.status, 503);
    assert.equal(d.calls.length, 0);
  });

  it('lets a person send a few, not a script many', async () => {
    const d = deps();
    const codes: number[] = [];
    for (let i = 0; i < 6; i++) codes.push((await handle(request({ report: REPORT }), env, d)).status);
    assert.deepEqual(codes, [201, 201, 201, 201, 201, 429]);
  });

  it('says so when GitHub doesn’t take it', async () => {
    const failing = (async () => new Response('{}', { status: 401 })) as unknown as typeof fetch;
    assert.equal((await handle(request({ report: REPORT }), env, deps({ fetch: failing }))).status, 502);
  });

  it('keeps a fence the text itself can’t close', () => {
    const { body } = issueFor(REPORT, 'a ~~~~ b');
    assert.match(body, /~~~~~text\na ~~~~ b\n~~~~~/);
    assert.equal(issueFor(REPORT.replace(' (the page went blank)', ''), '').title, 'Problem report (build dc28e8d)');
  });
});

describe('sendReport', () => {
  it('answers the number the function gave', async () => {
    const ok = (async () => new Response(JSON.stringify({ number: 7 }), { status: 201 })) as unknown as typeof fetch;
    assert.deepEqual(await sendReport(REPORT, ' note ', ok), { ok: true, number: 7 });
  });

  it('says why it couldn’t send', async () => {
    const busy = (async () => new Response('{}', { status: 429 })) as unknown as typeof fetch;
    const down = (async () => new Response('{}', { status: 503 })) as unknown as typeof fetch;
    const gone = (async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    assert.deepEqual(await sendReport(REPORT, '', busy), { ok: false, why: 'too-many' });
    assert.deepEqual(await sendReport(REPORT, '', down), { ok: false, why: 'failed' });
    assert.equal((await sendReport(REPORT, '', gone)).ok, false);
  });
});
