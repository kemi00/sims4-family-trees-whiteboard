/**
 * The story's first chapter: what a save remembers from before its first
 * upload, told against the game's start (the starter roster). A save is a
 * snapshot, not a diary, so only births keep their day; passings, couples,
 * adoptions, growing up, new names and life states, moves, dynasties and
 * sims no longer in the save are told without one.
 *
 * The roster stands in for how the game starts every household, so only
 * what it reliably knows is told: a household the game names differently
 * isn't a move, a dynasty is told as it stands (the game founds some
 * itself), and family-tree ancestors are the premades' backstory.
 */
import { DECEASED_STATE } from './constants.ts';
import { dynastyKey, dynastyLabelText, dynastyNames } from './generations.ts';
import { dayOf, dayText, seasonAt, TICKS_PER_DAY, yearOf } from './lifeClock.ts';
import { cardName, isPlannedSim } from './plan.ts';
import { prestigeLevel } from './prestige.ts';
import { saveRecap, type DynastyNews, type ForebearNews, type GoneNews, type RecapSim, type SaveRecap } from './saveRecap.ts';
import { mergeSaveIntoBoard, seedNameKeysFromNodes } from './savegame/mergeSave.ts';
import type { ParsedSave } from './savegame/parseSave.ts';
import { isUnhousedGid } from './unhoused.ts';
import { isPet } from './utils.ts';
import type { Edge, Group, PairStatus, SaveGameInfo, SimNode, World } from '../types/whiteboard.ts';

/**
 * Roster sims every save starts with, where the roster says: premade
 * households. Townies get a home world on the roster the game doesn't
 * give them, tenants only exist once rentals fill, and NPCs, scenarios and
 * Create a Sim's defaults are never in a save.
 */
const RESIDENT = 'Resident';
/** Roster sims whose passing is told: households and townies, not an unnamed ancestor. */
const NAMED_IN_SAVES = new Set([RESIDENT, 'Townie']);

/** When a tick was, as the story's headings say it: "Spring, day 2 of 7 · Year 1", or "Day 34". */
export function whenAt(game: Pick<SaveGameInfo, 'season' | 'seasonSince' | 'seasonDays'>, tick: number): string {
  const day = dayOf(tick);
  const season = seasonAt(game, tick);
  if (season && game.seasonDays) {
    const len = game.seasonDays * TICKS_PER_DAY;
    const into = (((tick - (game.seasonSince ?? 0)) % len) + len) % len;
    return `${season}, day ${Math.floor(into / TICKS_PER_DAY) + 1} of ${game.seasonDays} · Year ${yearOf(day, game.seasonDays)}`;
  }
  return dayText(day);
}

type After = { nodes: readonly SimNode[]; edges: readonly Edge[]; saveGame: SaveGameInfo | null; pairStatus?: readonly PairStatus[] };

/**
 * The first chapter of a save's story, or null when it remembers nothing
 * the board can tell. `after` is the board the save made; `seed` the
 * starter roster; `hidePacks` the games the save doesn't have.
 */
export function firstChapter(opts: {
  seed: { nodes: readonly SimNode[]; edges: readonly Edge[]; groups: readonly Group[] };
  worlds: World[];
  parsed: ParsedSave;
  after: After;
  hidePacks?: readonly string[];
}): SaveRecap | null {
  const { seed, after } = opts;
  const game = after.saveGame;
  if (!game) return null;

  // Which roster card is which sim of the save: merge the save into the roster.
  let n = 0;
  const intoRoster = mergeSaveIntoBoard({
    nodes: seed.nodes.map((x) => ({ ...x })),
    edges: [...seed.edges],
    groups: [...seed.groups],
    worlds: opts.worlds,
    parsed: opts.parsed,
    seedNameKeys: seedNameKeysFromNodes([...seed.nodes]),
    packReference: [...seed.nodes],
    rosterEdges: [...seed.edges],
    now: game.importedAt,
    nextEdgeId: () => `fc${n++}`,
  });
  const rosterIds = new Set(seed.nodes.map((x) => x.id));
  const afterBySave = new Map(after.nodes.flatMap((x) => (x.saveSimId ? [[x.saveSimId, x.id] as const] : [])));
  const afterByTree = new Map(after.nodes.flatMap((x) => (x.treeId && !x.saveSimId ? [[x.treeId, x.id] as const] : [])));
  /** Roster card id → the board's card for the same sim. */
  const rename = new Map<string, string>();
  for (const x of intoRoster.nodes) {
    if (!rosterIds.has(x.id)) continue;
    const to = x.saveSimId ? afterBySave.get(x.saveSimId) : x.treeId ? afterByTree.get(x.treeId) : undefined;
    if (to) rename.set(x.id, to);
  }
  const ren = (id: string) => rename.get(id) ?? id;
  // The roster, in the board's ids: the game's start, as the save's board names its sims.
  const start: SimNode[] = seed.nodes.map((x) => (rename.has(x.id) ? { ...x, id: rename.get(x.id)! } : x));
  const startEdges: Edge[] = seed.edges.map((e) => ({ ...e, a: ren(e.a), b: ren(e.b) }));

  const told = saveRecap({ nodes: start, edges: startEdges }, { nodes: after.nodes, edges: after.edges, saveGame: game });
  const was = new Map(start.map((x) => [x.id, x]));
  const now = new Map(after.nodes.map((x) => [x.id, x]));
  const sim = (x: SimNode): RecapSim => ({ id: x.id, name: cardName(x) });
  const living = (x: SimNode | undefined) => !!x && x.state !== DECEASED_STATE && !isPlannedSim(x);
  /** A family-tree relative only: the premades' backstory, not someone the save played. */
  const treeOnly = (id: string) => {
    const x = now.get(id);
    return !!x && !!x.treeId && !x.saveSimId;
  };

  // Births: everyone the save says was born in play, at any age now, dated.
  const parentsOf = (id: string) =>
    after.edges.filter((e) => e.type === 'parent' && e.b === id && !e.adopted).map((e) => now.get(e.a)).filter((p): p is SimNode => !!p);
  const born: SaveRecap['born'] = after.nodes
    .filter((x) => x.life?.inPlay && x.life.born !== undefined && !isPlannedSim(x))
    .sort((a, b) => a.life!.born - b.life!.born)
    .map((x) => {
      const ps = parentsOf(x.id);
      return { ...sim(x), parents: ps.map(cardName), parentIds: ps.map((p) => p.id), planned: false, when: whenAt(game, x.life!.born) };
    });
  const bornIds = new Set(born.map((b) => b.id));

  // Passings: a sim the game started alive, not an ancestor whose death the tree leaves to guesswork.
  const died = told.died.filter((d) => {
    const o = was.get(d.id);
    return !!o && NAMED_IN_SAVES.has(o.oplay ?? '') && o.first !== 'Unknown';
  });

  // Couples between sims of the save, as they stand: the save can't say when, or whether the
  // game started them so. A pair of ancestors is backstory, and two who started in one premade
  // household are left out: the roster's couples there come from the wiki, not the game.
  const housemates0 = (a: string, b: string) => {
    const x = was.get(a);
    const y = was.get(b);
    return !!x && !!y && x.gid === y.gid;
  };
  const told2 = (t: { a: RecapSim; b: RecapSim }) => !treeOnly(t.a.id) && !treeOnly(t.b.id) && !housemates0(t.a.id, t.b.id);
  const together = told.together.filter(told2).map((t) => ({ ...t, standing: true as const }));
  // Divorced is the save's own word; a couple the roster had and the save hasn't, only between households.
  const apart = told.apart
    .filter((t) => !treeOnly(t.a.id) && !treeOnly(t.b.id) && (t.type === 'divorced' || !housemates0(t.a.id, t.b.id)))
    .map((t) => ({ ...t, standing: true as const }));

  // Moves: a sim who left everyone they started with, or joined others from the start.
  // The game naming a household differently from the roster isn't a move.
  const housemates = (nodes: Map<string, SimNode>, x: SimNode) =>
    [...nodes.values()].filter((m) => m.id !== x.id && m.gid === x.gid && !isUnhousedGid(m.gid));
  const moved = told.moved.filter((m) => {
    const o = was.get(m.id);
    const x = now.get(m.id);
    if (!o || !x) return false;
    if (isUnhousedGid(x.gid)) return !isUnhousedGid(o.gid);
    const before = housemates(was, o).filter((h) => living(now.get(h.id)));
    const with_ = housemates(now, x).filter((h) => was.has(h.id));
    if (before.length) return !before.some((h) => now.get(h.id)?.gid === x.gid);
    // A pet the roster keeps in a household of its own lives with its family in the game.
    return with_.length > 0 && !isPet(o);
  });

  // Dynasties as they stand: the game founds some itself, so who heads each, not who founded it.
  const names = dynastyNames([...after.nodes]);
  const dynasty: DynastyNews[] = [];
  const heirs = new Map<string, SimNode>();
  for (const x of after.nodes) {
    const key = dynastyKey(x);
    if (key && x.dynastyRole === 'heir' && living(x) && !x.dynastyPlan) heirs.set(key, x);
  }
  for (const x of after.nodes) {
    const key = dynastyKey(x);
    if (!key || !x.dynasty || x.dynastyPlan || !living(x)) continue;
    const known = names.get(key);
    const d = { key, name: known ? known.name : x.dynasty, ...(known?.tag ? { tag: known.tag } : {}) };
    if (x.dynastyRole === 'head') {
      const st = game.dynastyStanding?.[key] ?? game.dynastyStanding?.[key.replace(/^id:/, '')];
      const heir = heirs.get(key);
      dynasty.push({
        kind: 'heads',
        sim: sim(x),
        dynasty: d,
        ...(heir ? { heir: sim(heir) } : {}),
        ...(st?.prestige !== undefined && prestigeLevel(st.prestige) > 0 ? { level: prestigeLevel(st.prestige) } : {}),
      });
    } else if (x.dynastyRole === 'outcast') dynasty.push({ kind: 'outcast', sim: sim(x), dynasty: d });
  }
  // Heads first, the highest Prestige Level first, then outcasts.
  dynasty.sort(
    (a, b) =>
      Number(a.kind !== 'heads') - Number(b.kind !== 'heads') ||
      (b.level ?? -1) - (a.level ?? -1) ||
      dynastyLabelText(a.dynasty).localeCompare(dynastyLabelText(b.dynasty)),
  );

  // Adoptions are the save's; a parent the roster missed is not news.
  const family = (told.family ?? []).filter((f) => f.kind === 'adopted');
  // New life states and married names; the roster spelling a name another way is not news.
  const life = (told.life ?? []).filter((l) => l.kind === 'state' || l.kind === 'name');
  // Households that moved to another world, or out of theirs: the roster knows premade
  // households' worlds, not their lots, so a lot of their own is no move.
  const homes = (told.homes ?? []).flatMap((h) => {
    const o = was.get(h.ids[0]!);
    const x = now.get(h.ids[0]!);
    if (h.renamedFrom || !o || !x || o.oplay !== RESIDENT || o.world === x.world) return [];
    return [{ ...h, from: o.world }];
  });
  const arrivals = (told.arrivals ?? []).filter((a) => !bornIds.has(a.sim.id));
  const metIds = (told.metIds ?? []).filter((id) => !bornIds.has(id) && !arrivals.some((a) => a.sim.id === id));

  // Sims the game started with that the save no longer has: deleted, or cleared away by the game.
  const hidden = new Set(opts.hidePacks ?? []);
  const gone: GoneNews[] = [];
  for (const x of seed.nodes) {
    if (rename.has(x.id) || x.treeId || x.state === DECEASED_STATE || x.oplay !== RESIDENT || x.first === 'Unknown' || hidden.has(x.pack)) continue;
    // Still on the board (a Merge keeps roster cards): not gone from the board, so not told.
    if (now.has(x.id)) continue;
    const home = seed.nodes.filter((m) => m.id !== x.id && m.gid === x.gid && rename.has(m.id)).map((m) => rename.get(m.id)!);
    gone.push({ sim: { id: x.id, name: cardName(x) }, hh: x.hh, ids: home });
  }
  gone.sort((a, b) => a.sim.name.localeCompare(b.sim.name));

  // Relatives the family tree keeps who passed away, not told as a passing above: by household.
  const toldDied = new Set(died.map((d) => d.id));
  const byHome = new Map<string, SimNode[]>();
  for (const x of after.nodes) {
    // An ancestor the game itself calls Unknown, its death often only worked out: not by name in a story.
    if (x.state !== DECEASED_STATE || toldDied.has(x.id) || isPet(x) || isUnhousedGid(x.gid) || x.first === 'Unknown') continue;
    byHome.set(x.gid, [...(byHome.get(x.gid) ?? []), x]);
  }
  const forebears: ForebearNews[] = [...byHome.entries()]
    .map(([gid, dead]) => ({
      hh: dead[0]!.hh,
      sims: dead.map(sim).sort((a, b) => a.name.localeCompare(b.name)),
      ids: [...dead.map((x) => x.id), ...after.nodes.filter((m) => m.gid === gid && living(m)).map((m) => m.id)],
    }))
    .sort((a, b) => a.hh.localeCompare(b.hh));

  const recap: SaveRecap = {
    days: null,
    born,
    together,
    apart,
    moved,
    grew: told.grew.filter((g) => !bornIds.has(g.id)),
    died,
    met: metIds.length,
    metIds,
    plansDone: 0,
    celebrate: [],
    remembered: true,
    ...(dynasty.length ? { dynasty } : {}),
    ...(family.length ? { family } : {}),
    ...(life.length ? { life } : {}),
    ...(homes.length ? { homes } : {}),
    ...(arrivals.length ? { arrivals } : {}),
    ...(gone.length ? { gone } : {}),
    ...(forebears.length ? { forebears } : {}),
    ...(told.played ? { played: told.played } : {}),
  };
  const any =
    born.length + together.length + apart.length + moved.length + recap.grew.length + died.length + dynasty.length +
    family.length + life.length + homes.length + arrivals.length + gone.length + forebears.length;
  return any ? recap : null;
}
