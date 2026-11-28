import type { PlannerData, SimMarker, SimNode } from '../types/whiteboard.ts';

/**
 * The symbols a marker can have, each with its colour on the cards: plain
 * text symbols every system draws, none of them a mark the board already
 * uses (dynasty roles, the ⚠ of a plan the game went against).
 */
export const MARKER_SYMBOLS: readonly { mark: string; color: string; name: string }[] = [
  { mark: '⊘', color: '#9f1239', name: 'circle with a stroke' },
  { mark: '§', color: '#a16207', name: 'simoleon' },
  { mark: '★', color: '#b45309', name: 'star' },
  { mark: '◆', color: '#0f766e', name: 'diamond' },
  { mark: '●', color: '#1d4ed8', name: 'dot' },
  { mark: '▲', color: '#4d7c0f', name: 'triangle' },
  { mark: '♣', color: '#15803d', name: 'club' },
  { mark: '♠', color: '#334155', name: 'spade' },
  { mark: '♥', color: '#be123c', name: 'heart' },
  { mark: '✦', color: '#0369a1', name: 'four-pointed star' },
  { mark: '☾', color: '#4338ca', name: 'moon' },
  { mark: '✿', color: '#a21caf', name: 'flower' },
];

/** The two markers a board starts with. */
export const PRESET_MARKERS: readonly SimMarker[] = [
  { id: 'illegitimate', label: 'Illegitimate', mark: '⊘' },
  { id: 'wealthy', label: 'Wealthy', mark: '§' },
];

/** The board's markers: its own list, or the two it starts with. */
export function boardMarkers(planner: Pick<PlannerData, 'markers'>): readonly SimMarker[] {
  return planner.markers ?? PRESET_MARKERS;
}

/** A symbol's colour on the cards. */
export function markerColor(mark: string): string {
  return MARKER_SYMBOLS.find((s) => s.mark === mark)?.color ?? '#475569';
}

/** The markers a sim carries, in the board's order; ids of markers since removed are left out. */
export function markersOf(n: Pick<SimNode, 'markers'>, defs: readonly SimMarker[]): SimMarker[] {
  if (!n.markers?.length) return [];
  const has = new Set(n.markers);
  return defs.filter((d) => has.has(d.id));
}

/** A new marker's id, not one the board has. */
export function newMarkerId(defs: readonly SimMarker[]): string {
  let i = defs.length + 1;
  while (defs.some((d) => d.id === `m${i}`)) i++;
  return `m${i}`;
}

/** The board's markers carried by at least one of these sims, for the Key. */
export function markersInUse(nodes: readonly Pick<SimNode, 'markers'>[], defs: readonly SimMarker[]): SimMarker[] {
  const used = new Set(nodes.flatMap((n) => n.markers ?? []));
  return defs.filter((d) => used.has(d.id));
}
