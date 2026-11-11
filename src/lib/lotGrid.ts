import { TILE } from './constants.ts';

/**
 * A world's Free lots box: the lots no household on the board lives on, as
 * small faded tiles in a grid under the world's households. Sizes only, so
 * packing (layout.ts) can leave room for it without importing the board.
 */

/** One lot's tile, inside a cell of two tiles by one. */
export const LOT_TILE_W = 2 * TILE - 16;
export const LOT_TILE_H = TILE - 16;
export const LOT_PITCH_X = 2 * TILE;
export const LOT_PITCH_Y = TILE;
/** The box's tag band, over its first row of tiles. */
export const LOT_HEAD = 50;
/** From a tile to the box's left edge. */
export const LOT_PAD = 8;
/** At most this many lots side by side. */
export const LOT_MAX_COLS = 6;

/** Lots side by side in a world with no household on the board to set a width. */
export const LOT_COLS_ALONE = 4;

/**
 * How many lots side by side for `count` lots under households `contentW`
 * wide; with no households (`contentW` 0), {@link LOT_COLS_ALONE}.
 */
export function lotCols(count: number, contentW: number): number {
  if (count <= 1) return Math.max(0, count);
  const fit = contentW > 0 ? Math.floor((contentW + LOT_PITCH_X - LOT_TILE_W) / LOT_PITCH_X) : LOT_COLS_ALONE;
  return Math.min(count, LOT_MAX_COLS, Math.max(2, fit));
}

/** The box's size for `count` lots in `cols` columns. */
export function lotBoxSize(count: number, cols: number): { w: number; h: number } {
  const rows = Math.ceil(count / Math.max(1, cols));
  return { w: cols * LOT_PITCH_X, h: LOT_HEAD + rows * LOT_PITCH_Y };
}
