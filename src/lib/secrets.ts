import type { Edge, PairStatus } from '../types/whiteboard.ts';

/**
 * The board as Hide secrets shows it. Secret links (secret lovers, secret
 * parents) drop out of drawing, labels, the log and bloodline; layout keeps
 * them, so the filter never moves a card.
 */
export function withoutSecretLinks(edges: Edge[]): Edge[] {
  return edges.some((e) => e.secret) ? edges.filter((e) => !e.secret) : edges;
}

/** Statuses minus "secret lovers", so a label cannot give the secret away. */
export function withoutSecretStatus(list: PairStatus[]): PairStatus[] {
  return list.map((p) =>
    p.tags.includes('secretLovers')
      ? { ...p, tags: p.tags.filter((t) => t !== 'secretLovers') }
      : p,
  );
}
