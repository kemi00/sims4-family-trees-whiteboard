/** A sim card on the whiteboard. */
export interface SimNode {
  id: string;
  gid: string;
  first: string;
  sur: string;
  age: string;
  state: string;
  gender: string;
  hh: string;
  world: string;
  nb: string;
  color: string;
  townie: boolean;
  oworld: string;
  onb: string;
  ohh: string;
  oplay: string;
  pack: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Drag offset from the auto-layout base position. Persisted; x/y are derived. */
  ox?: number;
  oy?: number;
  /** Pet only — Cat, Dog, or Horse. */
  species?: string;
  /** Pet only — breed name shown on the card detail line. */
  breed?: string;
  /** Present on user-added sims (editor). */
  added?: boolean;
  /** Sims 4 sim id from an imported .save, as a decimal string. */
  saveSimId?: string;
  /** In the save and not on the shipped xlsx roster. */
  fromSave?: boolean;
}

export type EdgeType =
  | 'marriage'
  | 'romance'
  | 'divorced'
  | 'parent'
  | 'sibling'
  | 'custom';

export type EdgeSource = 'seed' | 'save' | 'planned';

export interface Edge {
  id: string;
  a: string;
  b: string;
  type: EdgeType;
  /**
   * seed = shipped canon (gray, not in the log).
   * save = confirmed or created by a .save import (gray, in the log).
   * planned = board edit not in the save (violet, in the log).
   * Absent on older json: inferred from id (`u…` → planned, else seed).
   */
  source?: EdgeSource;
  /** ISO time when the user created this link. Absent on canon and older saves. */
  createdAt?: string;
  /** Shared by parent links created together (child of a couple). */
  bundleId?: string;
}

export interface Group {
  gid: string;
  hh: string;
  world: string;
  nb: string;
  color: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface World {
  name: string;
  color: string;
}

export interface HouseholdMove {
  id: string;
  simId: string;
  createdAt: string;
  fromGid: string;
  fromHh: string;
  fromWorld: string;
  fromNb: string;
  toGid: string;
  toHh: string;
  toWorld: string;
  toNb: string;
}

export interface DeceasedMark {
  id: string;
  simId: string;
  createdAt: string;
  /** Set when the sim died on a household age-up. Omitted for editor-set deceased. */
  cause?: 'ageUp';
}

/** Editor changed this sim to a later life stage on AGES_H. */
export interface SimAgeUp {
  id: string;
  simId: string;
  createdAt: string;
  /** Life stage after the edit. */
  age: string;
  hh: string;
  nb: string;
  world: string;
}

export interface HouseholdAgeUp {
  id: string;
  createdAt: string;
  gid: string;
  hh: string;
  nb: string;
  world: string;
  /** Sims whose age actually changed. */
  simIds: string[];
}

export interface WhiteboardData {
  nodes: SimNode[];
  edges: Edge[];
  groups: Group[];
  worlds: World[];
  /**
   * Packing-rules generation used when ox/oy were last meaningful.
   * Absent on older downloads — load may clear offsets and re-pack.
   */
  layoutEpoch?: number;
  /** Last loaded whiteboard JSON filename, if any. */
  sourceFileName?: string | null;
  /** Snapshot of user-made connection sentences, written on save. */
  connectionLog?: string[];
  /** Household moves the user made in the editor. Load trusts this, not the text snapshot. */
  householdMoves?: HouseholdMove[];
  /** Household age-up events. Load trusts this, not the text snapshot. */
  householdAgeUps?: HouseholdAgeUp[];
  /** Sims marked Deceased in the editor or by household age-up. Load trusts this, not the text snapshot. */
  deceasedMarks?: DeceasedMark[];
  /** Editor life-stage increases. Load trusts this, not the text snapshot. */
  simAgeUps?: SimAgeUp[];
  /** Pack names hidden by the Games filter. */
  hiddenPacks?: string[];
  /** Origin-playability values hidden by the Play filter. */
  hiddenPlay?: string[];
  /** Age and pet-species chips highlighted by the Ages filter. */
  hiAges?: string[];
  /** Single-sims chip from the Ages filter. */
  hiSingle?: boolean;
  /** Sim whose ancestors and descendants stay undimmed. */
  bloodlineId?: string | null;
}

export type Selection =
  | { type: 'node'; id: string }
  | { type: 'link'; ids: string[] }
  | null;

/**
 * Marquee / multi-object selection for group drag.
 * One kind at a time: 2+ world frames → worlds; else tags/cards;
 * single world only via its name chip.
 */
export type BoardMultiSel =
  | { kind: 'worlds'; worlds: string[] }
  | { kind: 'households'; gids: string[] }
  | { kind: 'nodes'; ids: string[] };

export interface ShowToggles {
  seed: boolean;
  groups: boolean;
  worlds: boolean;
}

/** Axis-aligned obstacle rectangle for routing. */
export interface Rect {
  l: number;
  t: number;
  r: number;
  b: number;
  id: string;
}

/** 2D point as [x, y] tuple (path vertices). */
export type Point = [number, number];

export interface Viewport {
  tx: number;
  ty: number;
  k: number;
}

/** Connect-mode source: a sim id or a selected couple. */
export type ConnSrc = string | { union: [string, string] } | null;

/** Node-bounds box used by snapHousehold. */
export interface HhBox {
  minx: number;
  miny: number;
  maxx: number;
  maxy: number;
}

/** Drawn household box extent (includes title band). */
export interface HhBoxDraw {
  l: number;
  t: number;
  r: number;
  b: number;
}

export interface UnionGeom {
  sx: number;
  sy: number;
  ex: number;
  ey: number;
  rx: number;
  ry: number;
  pts: string;
}

/** Vertical segment in a blood-line polyline (for hop rendering). */
export interface BloodVert {
  x: number;
  y1: number;
  y2: number;
  pi: number;
}

/** A parent/sibling blood-line polyline. */
export interface BloodPath {
  ids: string[];
  pts: Point[];
}

/** Render data for a spouse union (marriage / romance / divorced). */
export interface UnionRender {
  edgeId: string;
  type: 'marriage' | 'romance' | 'divorced';
  a: string;
  b: string;
  pts: string;
  rx: number;
  ry: number;
  isUser: boolean;
}

/** Render data for a custom link. */
export interface CustomRender {
  edgeId: string;
  a: string;
  b: string;
  pts: Point[];
  isUser: boolean;
}

export interface EdgeRenderData {
  blood: BloodPath[];
  unions: UnionRender[];
  customs: CustomRender[];
  rects: Rect[];
}

export interface BuildRectsResult {
  rects: Rect[];
  rbands: Record<number, Rect[]>;
}

export interface Guides {
  gx: number[];
  gy: number[];
}
