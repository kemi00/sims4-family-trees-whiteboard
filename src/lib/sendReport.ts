/**
 * Sends a problem report the player chose to send to the developer, with
 * their own words on what they were doing: POST /api/report (api/report.ts)
 * files it in a private repo and answers with its number, the code the
 * player can quote. Nothing is sent without the player pressing Send.
 */

export type SendResult =
  | { ok: true; number: number }
  | { ok: false; why: 'offline' | 'too-many' | 'failed' };

export async function sendReport(report: string, note: string, send: typeof fetch = fetch): Promise<SendResult> {
  let res: Response;
  try {
    res = await send('/api/report', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ report, note: note.trim() }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    return { ok: false, why: typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'failed' };
  }
  if (res.status === 429) return { ok: false, why: 'too-many' };
  if (!res.ok) return { ok: false, why: 'failed' };
  try {
    const body = (await res.json()) as { number?: unknown };
    return typeof body.number === 'number' ? { ok: true, number: body.number } : { ok: false, why: 'failed' };
  } catch {
    return { ok: false, why: 'failed' };
  }
}
