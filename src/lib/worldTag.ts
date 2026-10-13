import {
  DECEASED_STATE,
  LABEL_MIN_K,
  WORLD_TAG_FONT,
  WORLD_TAG_HIT_PAD_SCREEN_PX,
  WORLD_TAG_MIN_SCREEN_PX,
  WORLD_TAG_NORMAL_ZOOM,
  WORLD_TAG_PILL_H,
  WORLD_TAG_ZOOM_OUT_MAX,
} from './constants.ts';
import { isUnhousedGid } from './unhoused.ts';
import type { SimNode } from '../types/whiteboard.ts';

/**
 * World-name pill scale for the current board zoom. Zoomed out → grow in
 * world space so the painted chip stays ~{@link WORLD_TAG_MIN_SCREEN_PX}
 * tall on screen. Zoomed in (≥ {@link WORLD_TAG_NORMAL_ZOOM}) → scale 1.
 */
export function worldTagZoomScale(k: number): number {
  if (!(k > 0)) return 1;
  if (k >= WORLD_TAG_NORMAL_ZOOM) return 1;
  const forScreen = WORLD_TAG_MIN_SCREEN_PX / (WORLD_TAG_PILL_H * k);
  return Math.min(WORLD_TAG_ZOOM_OUT_MAX, Math.max(1, forScreen));
}

export function worldTagMetrics(k: number): {
  scale: number;
  pillH: number;
  fontSize: number;
  handleSize: number;
  /** World-space hit height = pill + screen pad (not a full-frame strip). */
  hitH: number;
  /** World-space pad added beyond the painted pill on each side. */
  hitPad: number;
} {
  const scale = worldTagZoomScale(k);
  const pillH = WORLD_TAG_PILL_H * scale;
  const hitPad = k > 0 ? WORLD_TAG_HIT_PAD_SCREEN_PX / k : 0;
  return {
    scale,
    pillH,
    fontSize: WORLD_TAG_FONT * scale,
    handleSize: 12 * scale,
    hitH: pillH + 2 * hitPad,
    hitPad,
  };
}

/** What a world's tag counts, over the cards its frame shows. */
export type WorldCounts = {
  /** Living sims: not pets, not marked deceased. Unhoused ones included. */
  sims: number;
  /**
   * Unknown cards for family-tree relatives (see SimNode.treeId) not known
   * to be dead: they are no sims in the game, so `sims` leaves them out.
   */
  relatives: number;
  /** Household boxes with a card shown; the Unhoused sims box is not one. */
  households: number;
  /** Of `sims`, those in the Unhoused sims box: sims the game generated. */
  unhoused: number;
  pets: number;
  deceased: number;
  /** Cards in the world that filters hide. */
  hidden: number;
};

export function worldCounts(
  members: SimNode[],
  vis: (n: SimNode) => boolean,
): WorldCounts {
  const gids = new Set<string>();
  const c: WorldCounts = {
    sims: 0,
    relatives: 0,
    households: 0,
    unhoused: 0,
    pets: 0,
    deceased: 0,
    hidden: 0,
  };
  for (const n of members) {
    if (!vis(n)) {
      c.hidden += 1;
      continue;
    }
    const unhoused = isUnhousedGid(n.gid);
    if (!unhoused) gids.add(n.gid);
    if (n.state === 'Pet') c.pets += 1;
    else if (n.state === DECEASED_STATE) c.deceased += 1;
    else if (n.treeId) c.relatives += 1;
    else {
      c.sims += 1;
      if (unhoused) c.unhoused += 1;
    }
  }
  c.households = gids.size;
  return c;
}

const COUNT_FONT = 12;
const ICON = 12;
const NAME_X = 31;
const PAD_R = 14;
/** Second line under the name, used zoomed out (see {@link worldTagLayout}). */
const LINE2_H = 16;

let measureCtx: CanvasRenderingContext2D | null | undefined;
const widths = new Map<string, number>();

/**
 * Width of `text` in the board's type, from the browser's own font metrics.
 * Without a canvas (tests) it falls back to a per-character estimate.
 */
function textWidth(text: string, size: number, weight: number): number {
  const key = `${weight} ${size} ${text}`;
  const hit = widths.get(key);
  if (hit !== undefined) return hit;
  if (measureCtx === undefined) {
    measureCtx =
      typeof document === 'undefined'
        ? null
        : document.createElement('canvas').getContext('2d');
  }
  let w: number;
  if (measureCtx) {
    measureCtx.font = `${weight} ${size}px -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`;
    w = measureCtx.measureText(text).width;
  } else {
    w = text.length * size * (weight >= 800 ? 0.586 : 0.58);
  }
  widths.set(key, w);
  return w;
}

/**
 * A world tag's parts, in world units from the tag's top-left. The name
 * leads; the counts follow it on the same line. Zoomed out past the point
 * where card text is drawn ({@link LABEL_MIN_K}), tags grow to stay readable
 * and would run into the next column's, so the counts drop to a second line
 * and the tag gets no wider than its name.
 */
export type WorldTagLayout = {
  scale: number;
  w: number;
  h: number;
  /** Baseline-middle y of the name line. */
  nameY: number;
  handleX: number;
  nameX: number;
  fontSize: number;
  counts: {
    y: number;
    /** Hairline between name and counts on one line; null when stacked. */
    dividerX: number | null;
    simIconX: number;
    simTextX: number;
    homeIconX: number;
    homeTextX: number;
    iconSize: number;
    fontSize: number;
  } | null;
};

/**
 * `maxW`: world width the tag may take before it reaches the next world
 * along. A tag grown for a far zoom shrinks to fit it, though never below
 * its normal size, rather than covering its neighbour's.
 */
export function worldTagLayout(
  name: string,
  counts: WorldCounts | null,
  zoom: number,
  maxW = Infinity,
): WorldTagLayout {
  const s = worldTagZoomScale(zoom);
  const full = tagAtScale(name, counts, zoom, s);
  if (full.w <= maxW || s <= 1) return full;
  return tagAtScale(name, counts, zoom, Math.max(1, (s * maxW) / full.w));
}

/** Stacked tag width at this zoom (see worldTagReserve). */
const RESERVE_ZOOM = 0.07;

/**
 * World width a world's tag takes zoomed out to {@link RESERVE_ZOOM}, where
 * a big board is seen whole. Packing keeps a world column at least this
 * wide, so neighbouring tags clear each other there. Measured with a fixed
 * per-character estimate, never the browser's fonts, so a board packs the
 * same on every machine.
 */
export function worldTagReserve(name: string): number {
  const nameW = name.length * WORLD_TAG_FONT * 0.586;
  const countsW = ICON + 3 + 3 * COUNT_FONT * 0.6 + 8 + ICON + 3 + 2 * COUNT_FONT * 0.6;
  return (NAME_X + Math.max(nameW, countsW) + PAD_R) * worldTagZoomScale(RESERVE_ZOOM);
}

function tagAtScale(
  name: string,
  counts: WorldCounts | null,
  zoom: number,
  s: number,
): WorldTagLayout {
  const nameW = textWidth(name, WORLD_TAG_FONT, 800);
  const nameEnd = NAME_X + nameW;
  const base = {
    scale: s,
    nameY: (WORLD_TAG_PILL_H / 2) * s,
    handleX: 14 * s,
    nameX: NAME_X * s,
    fontSize: WORLD_TAG_FONT * s,
  };
  if (!counts) {
    return { ...base, w: (nameEnd + PAD_R) * s, h: WORLD_TAG_PILL_H * s, counts: null };
  }
  const simW = textWidth(String(counts.sims), COUNT_FONT, 600);
  const homeW = textWidth(String(counts.households), COUNT_FONT, 600);
  const stacked = zoom > 0 && zoom < LABEL_MIN_K;
  const start = stacked ? NAME_X : nameEnd + 10;
  const simIconX = stacked ? start : start + 9;
  const simTextX = simIconX + ICON + 3;
  const homeIconX = simTextX + simW + 8;
  const homeTextX = homeIconX + ICON + 3;
  const countsEnd = homeTextX + homeW;
  const w = stacked ? Math.max(nameEnd, countsEnd) + PAD_R : countsEnd + PAD_R - 1;
  const h = stacked ? WORLD_TAG_PILL_H + LINE2_H : WORLD_TAG_PILL_H;
  return {
    ...base,
    w: w * s,
    h: h * s,
    counts: {
      y: (stacked ? WORLD_TAG_PILL_H + LINE2_H / 2 - 4 : WORLD_TAG_PILL_H / 2) * s,
      dividerX: stacked ? null : start * s,
      simIconX: simIconX * s,
      simTextX: simTextX * s,
      homeIconX: homeIconX * s,
      homeTextX: homeTextX * s,
      iconSize: ICON * s,
      fontSize: COUNT_FONT * s,
    },
  };
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** The tag's counts in words, for its tooltip and screen readers. */
export function worldCountsText(name: string, c: WorldCounts): string {
  const homes = plural(c.households, 'household', 'households');
  let text = !c.unhoused
    ? `${name}: ${plural(c.sims, 'sim', 'sims')} in ${homes}`
    : c.unhoused === c.sims
      ? `${name}: ${plural(c.sims, 'sim', 'sims')} in Unhoused sims`
      : `${name}: ${plural(c.sims, 'sim', 'sims')} — ${c.sims - c.unhoused} in ${homes}, ${c.unhoused} in Unhoused sims`;
  const extra = [
    c.pets ? plural(c.pets, 'pet', 'pets') : '',
    c.deceased ? `${c.deceased} deceased` : '',
    c.relatives ? plural(c.relatives, 'unnamed relative', 'unnamed relatives') : '',
  ].filter(Boolean);
  if (extra.length) {
    const last = extra.pop()!;
    text += `, plus ${extra.length ? `${extra.join(', ')} and ${last}` : last}`;
  }
  text += '.';
  if (c.hidden) text += ` Filters hide ${c.hidden} more.`;
  return text;
}
