import { pageview } from '@vercel/analytics';

/** Max path length sent to Web Analytics (API allows 255; keep Top Pages tidy). */
const MAX_PATH = 80;

/**
 * Slugify a label for synthetic `/action/...` paths.
 * Hobby has no custom events — we encode actions as pageviews instead.
 */
export function slug(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

/**
 * Record a product action as a synthetic pageview (Hobby workaround).
 * Does not change `window.location`. Safe if the Analytics script is absent.
 */
export function trackAction(path: string): void {
  const cleaned = path.startsWith('/') ? path : `/${path}`;
  const trimmed =
    cleaned.length > MAX_PATH ? cleaned.slice(0, MAX_PATH) : cleaned;
  try {
    pageview({ path: trimmed, route: trimmed });
  } catch {
    // Script not injected / blocked — ignore.
  }
}
