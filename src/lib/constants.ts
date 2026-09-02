export const COL = {
  blood: '#3f4756',
  marriage: '#3f4756',
  romance: '#e0365f',
  custom: '#2b7de0',
} as const;

/** Same glyphs as Connect / the legend — used in the connection log too. */
export const LINK_MARK = {
  marriage: '⚭',
  romance: '❤',
  divorced: '\u26AE',
  parent: '┳',
  sibling: '⊓',
  custom: '➖',
} as const;

export const LINK_LABEL = {
  marriage: 'married',
  romance: 'partners',
  divorced: 'divorced',
  parent: 'child',
  sibling: 'sibling',
  custom: 'linked',
} as const;

export const OCC: Record<string, string> = {
  Vampire: '🧛',
  Spellcaster: '✨',
  Werewolf: '🐺',
  Mermaid: '🧜',
  Alien: '👽',
  Ghost: '👻',
  Servo: '🤖',
  PlantSim: '🌱',
  Skeleton: '💀',
  Fairy: '🧚',
  'Imaginary Friend': '🧸',
  Deceased: '🪦',
};

export const LIFE_STATES = [
  'Sim',
  'Deceased',
  'Vampire',
  'Spellcaster',
  'Werewolf',
  'Mermaid',
  'Fairy',
  'Alien',
  'Ghost',
  'Servo',
  'PlantSim',
  'Skeleton',
  'Imaginary Friend',
] as const;

/** Editor / age-up use this life state for a sim who has died. */
export const DECEASED_STATE: (typeof LIFE_STATES)[number] = 'Deceased';

export const AGES_H = [
  'Infant',
  'Toddler',
  'Child',
  'Teen',
  'Young Adult',
  'Adult',
  'Elder',
] as const;

/** Age options for the sim editor. */
export const AGES = [
  'Infant',
  'Toddler',
  'Child',
  'Teen',
  'Young Adult',
  'Adult',
  'Elder',
] as const;

/**
 * Square board tile. Each sim card occupies 1 row × 2 columns
 * (`CARD_H` × `CARD_MIN_W`).
 */
export const TILE = 100;
export const TAG_TILES_X = 2;
export const TAG_TILES_Y = 1;
/** Snap step — same as TILE so cards land on the tile grid. */
export const GRID = TILE;
/**
 * One tile row above the cards for the name pill and Age up stacked
 * under it. Auto-layout reserves the same band (`LAYOUT.hhHeader`).
 */
export const HH_TAG_BAND = TILE;
/** Readable pill height so 12px type fits with padding. */
export const HH_TAG_PILL_H = 32;
/** Padding inside the chrome tile so pills are not drawn on the dashed stroke. */
export const HH_TAG_INSET = 8;
/** Gap between the name pill and Age up stacked under it. */
export const HH_TAG_STACK_GAP = 6;
/** Drawn world-name pill height. The band above households is LAYOUT.worldTitle. */
export const WORLD_TAG_PILL_H = 26;
/** World-name type size at zoom 1 (and when zoomed in). */
export const WORLD_TAG_FONT = 14;
/**
 * Board zoom at/above which world labels use world-space size 1
 * (pill height = {@link WORLD_TAG_PILL_H} screen px at 100% zoom).
 */
export const WORLD_TAG_NORMAL_ZOOM = 1;
/**
 * Cap on world-space growth when zoomed out.
 * With {@link WORLD_TAG_MIN_SCREEN_PX}, ~22px-tall chips down to ~5% zoom.
 */
export const WORLD_TAG_ZOOM_OUT_MAX = 16;
/**
 * Target painted world-chip height on screen while zoomed out.
 * Legible + grabbable, but not so large that labels occlude the trees
 * (cartography: labels serve content; they must not become the map).
 */
export const WORLD_TAG_MIN_SCREEN_PX = 22;
/**
 * Extra hit padding around the painted chip, in screen pixels.
 * Keep small: large pads / full-width strips steal neighboring worlds.
 */
export const WORLD_TAG_HIT_PAD_SCREEN_PX = 10;
/**
 * Bumped when packing rules change under saved ox/oy.
 * Downloads without a matching epoch may be re-packed on load.
 */
export const LAYOUT_EPOCH = 1;
export const ALIGN_TH = 13;
/** Extra stickiness so snap targets do not flip while dragging. */
export const SNAP_HYST = 10;

/** Card geometry — 2 tiles wide, 1 tile tall. */
export const CARD_MIN_W = TILE * TAG_TILES_X;
export const CARD_H = TILE * TAG_TILES_Y;
export const CARD_TEXT_X = 16;
export const CARD_PAD_X = 14;
/** Approximate character width at the 10.5px detail font size. */
export const CARD_DETAIL_CH = 5.35;

export const SPECIES: Record<string, string> = {
  Cat: '🐱',
  Dog: '🐕',
  Horse: '🐴',
};

/** Pet species for the highlight panel — order matches SPECIES. */
export const SPECIES_H = ['Cat', 'Dog', 'Horse'] as const;

/** Gender values from the premade sims spreadsheet. */
export const GENDERS = [
  'Female',
  'Male',
  'Non-Binary',
  'Variable',
] as const;

/** Genders assigned when the user adds a sim. */
export const NEW_SIM_GENDERS = ['Female', 'Male', 'Non-Binary'] as const;

/** Playability values from the premade sims spreadsheet. */
export const PLAYABILITY = [
  'Resident',
  'Townie',
  'NPC',
  'Tenant',
  'CAS Default',
  'Scenario',
  'Legacy',
  'Game Library',
  'Event NPC',
  'Special',
] as const;

/** User-made link colour (id starts with "u"). */
export const UEDIT = '#7c3aed';

export const RGAP = 16;
export const BAND = 170;
export const STUB = 26;
export const MINDROP = 46;

/**
 * Offset from the union pill center (`ry`) down to the exit point where the
 * parent→child trunk begins (pill bottom). The mandatory bottom stem below
 * that exit is {@link STUB}, same length as the child top stem.
 */
export const PILL_DROP = 12;
/** Relationship pill height (rings / heart / divorce capsule). */
export const PILL_H = 24;
/** Half-width of the widest relationship pill (the ⚮ capsule is 38 wide). */
export const PILL_HALF_W = 19;
export const PILL_W = {
  marriage: 36,
  romance: 36,
  divorced: 38,
} as const;
/** Breathing room between a pill edge and the tag edge it sits next to. */
export const PILL_CLEAR = 4;
/**
 * Smallest horizontal gap between two tags that still lets the pill sit
 * between them. Below this the union connector wraps around the outside.
 */
export const UNION_MIN_GAP = (PILL_HALF_W + PILL_CLEAR) * 2;

/** Placeholder household name for a sim created with Add Sim, before they join a house. */
export const ADDED_HOUSEHOLD = '(added)';

/** Phone chrome / bottom sheets. Keep the CSS `@media` in App.css in sync. */
export const CHROME_COMPACT_MAX_PX = 640;

/** Inset from the viewport edge when clamping floating chrome. */
export const CHROME_EDGE_PAD_PX = 6;

/** Width of the connection-log panel (sentences need more room than pack lists). */
export const CONNECTION_LOG_PANEL_W = 440;

/** Gap between a toolbar control and the dropdown that belongs to it. */
export const CHROME_DROPDOWN_GAP_PX = 6;

/** Zoom used when framing a single sim (search, newly added card). */
export const FOCUS_SIM_K = 1.1;

/** Board zoom clamp — used by wheel zoom, buttons, and the minimap. */
export const ZOOM_MIN = 0.06;
export const ZOOM_MAX = 4;

/**
 * Below this zoom, board labels are not drawn at all. The smallest card and
 * household type is 10.5px, so at k = 0.35 it lands under 4 screen pixels —
 * already an unreadable smudge. SVG `<text>` needs per-element font shaping
 * and dominates layout cost (~60% of it on the full board), so dropping the
 * labels at fit-all zoom is both faster and cleaner to look at. Hit targets
 * and dashed boxes stay, so nothing about interaction changes.
 */
export const LABEL_MIN_K = 0.35;

/** Padding inside the minimap so world blobs are not flush to the chrome. */
export const MINIMAP_PAD = 8;
/** Smallest viewport rectangle on the minimap, so a tight zoom stays visible. */
export const MINIMAP_VIEW_MIN = 10;

/** Screen pixels before a pointer counts as a drag instead of a tap. */
export const DRAG_SLOP_PX = 10;

/** Coarse-pointer hold on a card opens the editor. */
export const LONG_PRESS_MS = 450;

/** How long a flash status (layer toggle, etc.) stays on screen. */
export const STATUS_FLASH_MS = 2800;

/** Transparent hit stroke in screen pixels, converted to world space by `/ k`. */
export const EDGE_HIT_SCREEN_PX = 16;
/** Selected-link stroke thickness in screen pixels (`/ k` → world). */
export const EDGE_SEL_SCREEN_PX = 5;
