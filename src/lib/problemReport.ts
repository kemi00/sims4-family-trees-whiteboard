import { DECEASED_STATE, LAYOUT_EPOCH, NOT_IN_WORLD } from './constants.ts';
import type { LoggedError } from './errorLog.ts';
import { dayOf, saveChipText } from './lifeClock.ts';
import { worldPack } from './packs.ts';
import { pageTranslation, translateGuardHits } from './translateGuard.ts';
import { lotsIn } from './places.ts';
import { isUnhousedGid } from './unhoused.ts';
import { edgeSourceOf } from './utils.ts';
import type { Edge, Group, SaveGameInfo, SimNode, World } from '../types/whiteboard.ts';

/**
 * The problem report: what the developer needs to see what went wrong on a
 * board, as plain text the player pastes into a message. Counts, the game's
 * own ids and world names, settings, the browser and recent errors. Never a
 * sim's, household's, lot's or dynasty's name, a note, or the file's name:
 * those are the player's.
 */
export type ProblemReportInput = {
  /** The commit the app was built from. */
  build: string;
  /** The newest entry in the app's changelog: its commit and date. */
  latestUpdate?: { sha: string; date: string };
  now: Date;
  env: {
    userAgent: string;
    languages: readonly string[];
    screen: string;
    viewport: string;
    dpr: number;
    touchPoints: number;
    pointer: string;
    /** The language the browser is translating the page to, or null when it isn't. */
    translated?: string | null;
    /** How often the board stepped around text the translation swapped. */
    translateFixes?: number;
  };
  nodes: readonly SimNode[];
  edges: readonly Edge[];
  groups: readonly Group[];
  worlds: readonly World[];
  saveGame: SaveGameInfo | null;
  /** Worlds with something on show (liveWorlds). */
  shownWorlds: ReadonlySet<string>;
  /** Each world's free lots, as its Free lots box lists them; null when not known (the crash screen). */
  freeLots: ReadonlyMap<string, readonly unknown[]> | null;
  filters: {
    hiddenPacks: readonly string[];
    hiddenPlay: number;
    highlightAges: readonly string[];
    single: boolean;
    bloodline: boolean;
    hideSecrets: boolean;
    hideDeceased: boolean;
  };
  /** Null when not known (the crash screen). */
  layers: Readonly<Record<string, boolean>> | null;
  plans: { plannedBabies: number; offPlanSims: number; offPlanLinks: number; issues: number; logEntries: number; storyPages: number };
  storage: { draftKB: number | null; staleTab: boolean; fromDraft: boolean };
  errors: readonly LoggedError[];
};

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "a 3, b 2", largest first, from a tally. */
function tally(map: ReadonlyMap<string, number>): string {
  return [...map]
    .sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))
    .map(([k, v]) => `${k} ${v}`)
    .join(', ');
}

function bump(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function gameLine(g: SaveGameInfo): string {
  const parts = [
    `day ${dayOf(g.clock)} (clock ${g.clock})`,
    `"${saveChipText(g)}"`,
    g.calendar === 'days' ? 'no Seasons' : g.seasonDays ? `${g.seasonDays}-day seasons` : 'seasons unknown',
    `played age: ${g.playedAging ?? 'unknown'}`,
    `unplayed age: ${g.unplayedAging === undefined ? 'unknown' : g.unplayedAging ? 'on' : 'off'}`,
    g.activeHousehold ? 'active household known' : 'no active household',
    g.dynastyStanding ? count(Object.keys(g.dynastyStanding).length, 'dynasty standing', 'dynasty standings') : '',
    g.lotZones ? count(g.lotZones.length, 'saved lot') : '',
  ];
  return parts.filter(Boolean).join(' · ');
}

export function problemReport(input: ProblemReportInput): string {
  const { nodes, edges, groups, worlds, saveGame: g } = input;
  const out: string[] = [];
  const line = (s = '') => out.push(s);

  line('Sims 4 Dynasty Whiteboard: problem report');
  line(
    `Made ${input.now.toISOString()} · build ${input.build} · layout ${LAYOUT_EPOCH}` +
      (input.latestUpdate ? ` · newest update ${input.latestUpdate.sha} (${input.latestUpdate.date})` : ''),
  );
  const e = input.env;
  line(`Browser: ${e.userAgent}`);
  line(
    `Language ${e.languages.join(', ') || 'unknown'} · screen ${e.screen} at ${e.dpr}x · window ${e.viewport} · ` +
      `pointer ${e.pointer} · touch points ${e.touchPoints}`,
  );
  line(
    e.translated
      ? `Page translated by the browser to ${e.translated} · the board stepped around swapped text ${count(e.translateFixes ?? 0, 'time')}`
      : 'Page not translated by the browser',
  );
  line(
    `Storage: draft ${input.storage.draftKB === null ? 'none' : `${input.storage.draftKB} KB`}` +
      ` · opened from the draft: ${input.storage.fromDraft ? 'yes' : 'no'}` +
      ` · another tab has it: ${input.storage.staleTab ? 'yes' : 'no'}`,
  );

  // The board, in counts.
  line();
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const pets = nodes.filter((n) => n.species).length;
  const fromSave = nodes.filter((n) => n.saveSimId).length;
  const relatives = nodes.filter((n) => !n.saveSimId && n.treeId).length;
  const planned = nodes.filter((n) => n.plannedAs).length;
  const added = nodes.filter((n) => n.added && !n.saveSimId && !n.plannedAs).length;
  const deceased = nodes.filter((n) => n.state === DECEASED_STATE).length;
  const inDynasty = nodes.filter((n) => n.dynasty || n.dynastyId).length;
  const dynasties = new Set(nodes.map((n) => n.dynastyId || n.dynasty).filter(Boolean)).size;
  line(
    `Board: ${count(nodes.length, 'card')} (${fromSave} from the save, ${relatives} family-tree relatives, ` +
      `${added} added by hand, ${planned} planned, ${pets} pets, ${deceased} deceased) · ` +
      `${count(dynasties, 'dynasty', 'dynasties')}, ${inDynasty} sims in one`,
  );
  const homes = new Set(nodes.filter((n) => !isUnhousedGid(n.gid)).map((n) => n.gid));
  const outside = new Set(nodes.filter((n) => !isUnhousedGid(n.gid) && n.world === NOT_IN_WORLD).map((n) => n.gid));
  const unhousedBoxes = new Set(nodes.filter((n) => isUnhousedGid(n.gid)).map((n) => n.gid));
  line(
    `Households: ${homes.size} (${outside.size} in ${NOT_IN_WORLD}) · ${count(unhousedBoxes.size, 'Unhoused sims box', 'Unhoused sims boxes')} · ` +
      `${count(groups.length, 'household box', 'household boxes')}`,
  );
  const types = new Map<string, number>();
  const sources = new Map<string, number>();
  for (const x of edges) {
    bump(types, x.type);
    bump(sources, edgeSourceOf(x));
  }
  line(`Links: ${edges.length} (${tally(types)}) · from ${tally(sources)}`);
  const p = input.plans;
  line(
    `Plans: ${p.plannedBabies} planned babies · off plan ${p.offPlanSims} sims, ${p.offPlanLinks} links · ` +
      `${p.issues} plan issues · ${count(p.logEntries, 'log entry', 'log entries')} · ${count(p.storyPages, 'story page')}`,
  );

  // Each board world: sims, households, free lots of the game's lots.
  line();
  const sims = new Map<string, number>();
  const hh = new Map<string, Set<string>>();
  for (const n of nodes) {
    bump(sims, n.world);
    if (!isUnhousedGid(n.gid)) hh.set(n.world, (hh.get(n.world) ?? new Set()).add(n.gid));
  }
  line('Worlds on the board (sims / households / free lots of the game’s lots · its game):');
  if (!input.freeLots) line('  (Made from the crash screen: free lots are shown as ?, as the board wasn’t running to count them.)');
  const known = new Set(worlds.map((w) => w.name));
  for (const w of worlds) {
    const shown = input.shownWorlds.has(w.name) || !sims.get(w.name);
    const outside = w.name === NOT_IN_WORLD;
    const free = input.freeLots ? String(input.freeLots.get(w.name)?.length ?? 0) : '?';
    const game = outside ? '' : ` / ${free} of ${lotsIn(w.name).length}`;
    const pack = outside ? undefined : worldPack(w.name);
    line(
      `  ${w.name}: ${sims.get(w.name) ?? 0} / ${hh.get(w.name)?.size ?? 0}${game}` +
        `${pack ? ` · ${pack}` : ''}${shown ? '' : ' · hidden'}`,
    );
  }
  const strays = [...sims.keys()].filter((w) => !known.has(w));
  if (strays.length) line(`  Cards in worlds the board doesn't list: ${strays.map((w) => `${w} ${sims.get(w)}`).join(', ')}`);

  // The last upload, and the save's own world records.
  line();
  if (!g) {
    line('Save: none uploaded yet');
  } else {
    line(`Save: uploaded ${g.importedAt} · ${gameLine(g)}`);
    if (g.gamesMissing) line(`Games the save doesn’t have: ${g.gamesMissing.length ? g.gamesMissing.join(', ') : 'none'}`);
    const u = g.lastUpload;
    if (u) {
      line(
        `Last upload (${u.mode}): ${u.updated} cards updated, ${u.added} new, ${u.toNotInWorld} to ${NOT_IN_WORLD}, ` +
          `${u.unhoused} to Unhoused sims, ${u.relatives} relatives, ${u.skipped} skipped` +
          (u.extraWorlds.length ? ` · worlds not on the board: ${u.extraWorlds.join(', ')}` : '') +
          (u.hidePacks.length ? ` · games hidden: ${u.hidePacks.join(', ')}` : ''),
      );
    }
    const r = g.read;
    if (!r) {
      line('Read from the file: not recorded (uploaded before the board kept it)');
    } else {
      line(`Read from the file: ${r.sims} sims, ${r.households} households, ${r.unhoused} with no home lot`);
      // Only records worth a look in full: the rest found by id, under their English name.
      const plain = r.worlds.filter((w) => w.by === 'id' && w.stored === w.world);
      const notable = r.worlds.filter((w) => !plain.includes(w));
      line(
        `Save worlds: ${r.worlds.length} (${plain.length} found by id under their English name, ` +
          `${plain.reduce((s, w) => s + w.homes, 0)} homes)`,
      );
      if (notable.length) {
        line('  game id · name as stored · board world · found by · lots · homes:');
        for (const w of notable) {
          const by = w.world ? w.by : 'not found';
          line(`  ${w.id} · ${w.stored ? `"${w.stored}"` : '(no name)'} · ${w.world || '(none)'} · ${by} · ${w.lots} · ${w.homes}`);
        }
      }
    }
  }

  // Checks: things that should never happen.
  line();
  const missingEnds = edges.filter((x) => !byId.has(x.a) || !byId.has(x.b)).length;
  const gids = new Set(groups.map((x) => x.gid));
  const noBox = nodes.filter((n) => !isUnhousedGid(n.gid) && !gids.has(n.gid)).length;
  const lotNoWorld = nodes.filter((n) => n.lot && n.world === NOT_IN_WORLD).length;
  const names = new Map<string, number>();
  for (const n of nodes) {
    if (n.species || !n.first.trim()) continue;
    bump(names, `${n.first.trim().toLowerCase()} ${n.sur.trim().toLowerCase()}`);
  }
  const twins = [...names.values()].filter((v) => v > 1);
  line(
    `Checks: links to a missing card ${missingEnds} · cards with no household box ${noBox} · ` +
      `cards with a home lot in ${NOT_IN_WORLD} ${lotNoWorld} · ` +
      `full names on more than one card ${twins.length} (${twins.reduce((s, v) => s + v, 0)} cards)`,
  );

  const f = input.filters;
  const on = [
    f.hiddenPacks.length ? `games off: ${f.hiddenPacks.join(', ')}` : '',
    f.hiddenPlay ? `${f.hiddenPlay} play states hidden` : '',
    f.highlightAges.length ? `ages highlighted: ${f.highlightAges.join(', ')}` : '',
    f.single ? 'singles highlighted' : '',
    f.bloodline ? 'a bloodline' : '',
    f.hideSecrets ? 'secrets hidden' : '',
    f.hideDeceased ? 'deceased hidden' : '',
  ].filter(Boolean);
  line(`Filters: ${on.length ? on.join(' · ') : 'none'}`);
  line(
    input.layers
      ? `Layers: ${Object.entries(input.layers).map(([k, v]) => `${k} ${v ? 'on' : 'off'}`).join(', ')}`
      : 'Layers: not known from the crash screen',
  );

  line();
  if (!input.errors.length) line('Recent errors: none');
  else {
    line('Recent errors:');
    for (const x of input.errors) {
      line(
        `  ${x.at}${x.crash ? ' (the page went blank)' : ''}${x.translated ? ` (page translated to ${x.translated})` : ''} ${x.message}${x.where ? ` @ ${x.where}` : ''}` +
          `${x.components ? ` in ${x.components}` : ''}${x.build && x.build !== input.build ? ` (build ${x.build})` : ''}`,
      );
    }
  }
  return out.join('\n');
}

/** The browser as the report describes it: its own words, the screen and the pointer. */
export function reportEnv(): ProblemReportInput['env'] {
  const pointer = (q: string) => typeof matchMedia === 'function' && matchMedia(q).matches;
  return {
    userAgent: navigator.userAgent,
    languages: navigator.languages?.length ? [...navigator.languages] : [navigator.language],
    screen: `${screen.width}x${screen.height}`,
    viewport: `${innerWidth}x${innerHeight}`,
    dpr: Math.round(devicePixelRatio * 100) / 100,
    touchPoints: navigator.maxTouchPoints ?? 0,
    pointer: pointer('(pointer: fine)') ? 'fine' : pointer('(pointer: coarse)') ? 'coarse' : 'none',
    translated: pageTranslation(),
    translateFixes: translateGuardHits(),
  };
}

/** The browser draft's size in KB, or null when there is none or it can't be read. */
export function draftKB(key: string): number | null {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? null : Math.round(raw.length / 1024);
  } catch {
    return null;
  }
}

/**
 * The problem report when the app itself has crashed: made from the board
 * the browser kept (the draft), as the report from the menu would be, with
 * what can't be known without the running board (free lots, filters shown,
 * layers) left empty. With no readable draft, the browser and errors alone.
 */
export function problemReportFromDraft(
  raw: string | null,
  base: Pick<ProblemReportInput, 'build' | 'latestUpdate' | 'now' | 'env' | 'errors'>,
): string {
  type Draft = Partial<{
    nodes: SimNode[];
    edges: Edge[];
    groups: Group[];
    saveGame: SaveGameInfo | null;
    chronicle: unknown[];
    connectionLog: unknown[];
    hiddenPacks: string[];
    hiddenPlay: string[];
    hiAges: string[];
    hiSingle: boolean;
    bloodlineId: string | null;
    hideSecrets: boolean;
    hideDeceased: boolean;
  }>;
  let d: Draft = {};
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    d = parsed && typeof parsed === 'object' ? (parsed as Draft) : {};
  } catch {
    d = {};
  }
  // The board that crashed may be what's broken: only well-formed records count.
  const records = <T extends { id: string }>(list: unknown): T[] =>
    Array.isArray(list) ? list.filter((x): x is T => !!x && typeof x === 'object' && typeof (x as { id?: unknown }).id === 'string') : [];
  const nodes = records<SimNode>(d.nodes).map((n) => ({
    ...n,
    first: typeof n.first === 'string' ? n.first : '',
    sur: typeof n.sur === 'string' ? n.sur : '',
    world: typeof n.world === 'string' ? n.world : '',
    gid: typeof n.gid === 'string' ? n.gid : '',
  }));
  const edges = records<Edge>(d.edges);
  const groups = (Array.isArray(d.groups) ? d.groups : []).filter((g): g is Group => !!g && typeof g === 'object' && typeof (g as Group).gid === 'string');
  const worlds = [...new Set(nodes.map((n) => n.world).filter(Boolean))].map((name) => ({ name, color: '' }));
  const noBoard = {
    nodes: [] as SimNode[],
    edges: [] as Edge[],
    groups: [] as Group[],
    worlds: [],
    saveGame: null,
    shownWorlds: new Set<string>(),
    freeLots: null,
    filters: { hiddenPacks: [], hiddenPlay: 0, highlightAges: [], single: false, bloodline: false, hideSecrets: false, hideDeceased: false },
    layers: null,
    plans: { plannedBabies: 0, offPlanSims: 0, offPlanLinks: 0, issues: 0, logEntries: 0, storyPages: 0 },
    storage: { draftKB: raw === null ? null : Math.round(raw.length / 1024), staleTab: false, fromDraft: true },
  };
  try {
    return reportFromBoard();
  } catch {
    // Too broken to count: the browser and the errors still say a lot.
    return `${problemReport({ ...base, ...noBoard })}\n\nThe board kept in this browser couldn't be read for this report.`;
  }
  function reportFromBoard(): string {
  return problemReport({
    ...base,
    nodes,
    edges,
    groups,
    worlds,
    saveGame: d.saveGame && typeof d.saveGame === 'object' ? d.saveGame : null,
    shownWorlds: new Set(worlds.map((w) => w.name)),
    freeLots: null,
    filters: {
      hiddenPacks: Array.isArray(d.hiddenPacks) ? d.hiddenPacks.filter((x) => typeof x === 'string') : [],
      hiddenPlay: Array.isArray(d.hiddenPlay) ? d.hiddenPlay.length : 0,
      highlightAges: Array.isArray(d.hiAges) ? d.hiAges.filter((x) => typeof x === 'string') : [],
      single: !!d.hiSingle,
      bloodline: !!d.bloodlineId,
      hideSecrets: !!d.hideSecrets,
      hideDeceased: !!d.hideDeceased,
    },
    layers: null,
    plans: {
      plannedBabies: nodes.filter((n) => n.plannedAs).length,
      offPlanSims: 0,
      offPlanLinks: 0,
      issues: 0,
      logEntries: Array.isArray(d.connectionLog) ? d.connectionLog.length : 0,
      storyPages: Array.isArray(d.chronicle) ? d.chronicle.length : 0,
    },
    storage: { draftKB: raw === null ? null : Math.round(raw.length / 1024), staleTab: false, fromDraft: true },
  });
  }
}
