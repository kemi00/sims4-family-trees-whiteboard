import {
  CARD_H,
  CARD_MIN_W,
  HH_TAG_BAND,
  HH_TAG_INSET,
  HH_TAG_PILL_H,
  HH_TAG_STACK_GAP,
  NOT_IN_WORLD,
  TILE,
  UNHOUSED_HH,
} from './constants.ts';
import { measureText } from './textWidth.ts';
import type { Group, SimNode } from '../types/whiteboard.ts';

export function snapToTile(v: number): number {
  return Math.round(v / TILE) * TILE;
}

/** Greatest tile origin at or below `v` — tags sit in rows strictly above cards. */
export function tileFloor(v: number): number {
  return Math.floor(v / TILE) * TILE;
}

/** Top-left of a 1×2 card on the tile grid. */
export function tileSnapOrigin(x: number, y: number): { x: number; y: number } {
  return { x: snapToTile(x), y: snapToTile(y) };
}

export function tileCardSize(): { w: number; h: number } {
  return { w: CARD_MIN_W, h: CARD_H };
}

/** Snap every card origin onto the tile grid without changing stored offsets. */
export function snapNodesToTiles(nodes: SimNode[]): SimNode[] {
  return nodes.map((n) => {
    const t = tileSnapOrigin(n.x, n.y);
    if (t.x === n.x && t.y === n.y) return n;
    return { ...n, x: t.x, y: t.y };
  });
}

/**
 * Rigid group move: snap the group's start origin + pointer delta onto tiles.
 * `originX`/`originY` must be the top-left at drag start (not the live position).
 */
export function snapGroupDelta(
  originX: number,
  originY: number,
  dx: number,
  dy: number,
): { dx: number; dy: number } {
  const t = tileSnapOrigin(originX + dx, originY + dy);
  return { dx: t.x - originX, dy: t.y - originY };
}

export type HouseholdLabel = Pick<Group, 'hh' | 'nb' | 'world'>;

export function householdLabel(g: HouseholdLabel | undefined | null): string {
  if (!g) return '';
  // Not in any world names no world: the world's own tag says so, and the
  // long name would run every tag there past its cards.
  const world = g.world === NOT_IN_WORLD ? null : g.world;
  return [g.hh, g.nb && g.nb !== '-' && g.nb !== g.world ? g.nb : null, world]
    .filter(Boolean)
    .join('  ·  ');
}

/** Approximate SVG pill width from label length (12px type). */
export function tagPillWidth(label: string, extra: number): number {
  return label.length * 6.6 + extra;
}

/** Room the Unhoused sims mark takes in a household tag, after the grip. */
export const UNHOUSED_MARK_W = 16;

/**
 * A household's name tag width as packing reserves it, from a per-character
 * estimate so a board packs the same everywhere; an Unhoused sims tag also
 * fits its mark.
 */
export function householdTagWidth(g: HouseholdLabel | undefined | null): number {
  return tagPillWidth(householdLabel(g), 30) + (g?.hh === UNHOUSED_HH ? UNHOUSED_MARK_W : 0);
}

/** Room left of a tag's label (grip, and the Unhoused mark), and right of it. */
const TAG_TEXT_X = 24;
const TAG_PAD_R = 12;

/**
 * A household's name tag width as drawn: the label measured in the board's
 * type, so the pill fits it whatever its letters. The estimate came up short
 * for a short bold name (Crumplebottom's ran past its pill) and long for one
 * with separators. Within a few pixels of {@link householdTagWidth}, which
 * the tile of air between households absorbs.
 */
export function householdTagDrawWidth(g: HouseholdLabel | undefined | null): number {
  // SVG text collapses the label's double spaces round "·", so measure it so.
  const text = measureText(householdLabel(g).replace(/\s+/g, ' '), 12, 700);
  if (text === null) return householdTagWidth(g);
  return TAG_TEXT_X + (g?.hh === UNHOUSED_HH ? UNHOUSED_MARK_W : 0) + text + TAG_PAD_R;
}

export type HouseholdChrome = {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  boxL: number;
  boxT: number;
  boxR: number;
  boxB: number;
  headerX: number;
  headerY: number;
  ageX: number;
  ageY: number;
  pillH: number;
  label: string;
  labelW: number;
  ageLabel: string;
  ageW: number;
};

/**
 * Household box + tag origins from card positions.
 * Name and Age up stack in the tile above the cards, Age up tight under
 * the title. Packing must reserve `HH_TAG_BAND`.
 */
export function householdChrome(
  mem: SimNode[],
  g: HouseholdLabel | undefined | null,
): HouseholdChrome | null {
  if (!mem.length) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const n of mem) {
    x0 = Math.min(x0, n.x);
    y0 = Math.min(y0, n.y);
    x1 = Math.max(x1, n.x + n.w);
    y1 = Math.max(y1, n.y + n.h);
  }
  const label = householdLabel(g);
  const labelW = householdTagDrawWidth(g);
  const ageLabel = 'Age up';
  const ageW = tagPillWidth(ageLabel, 16);
  const originX = tileFloor(x0);
  const originY = tileFloor(y0);
  const boxL = originX;
  const boxT = originY - HH_TAG_BAND;
  const boxR = Math.max(x1, boxL + HH_TAG_INSET + labelW + HH_TAG_INSET);
  const boxB = y1;
  const headerX = boxL + HH_TAG_INSET;
  const headerY = boxT + HH_TAG_INSET;
  const ageX = headerX;
  const ageY = headerY + HH_TAG_PILL_H + HH_TAG_STACK_GAP;
  return {
    x0,
    y0,
    x1,
    y1,
    boxL,
    boxT,
    boxR,
    boxB,
    headerX,
    headerY,
    ageX,
    ageY,
    pillH: HH_TAG_PILL_H,
    label,
    labelW,
    ageLabel,
    ageW,
  };
}
