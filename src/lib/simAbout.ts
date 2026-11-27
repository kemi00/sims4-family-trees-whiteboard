import type { SimAbout } from '../types/whiteboard.ts';

/**
 * The game's own names for what a save stores as numbers on a sim:
 * src/data/gameNames.json, built from the installed game by
 * scripts/build-game-names.ts. Loaded only when the Life tab needs it.
 */
export type GameNames = {
  /** Points per level, by skill level type: each step is the points from one level to the next. */
  skillLevels: Record<string, number[]>;
  /** Trait id → name, and p (personality, chosen in Create a Sim) or e (earned in play). */
  traits: Record<string, [string, 'p' | 'e']>;
  /** Skill id → name and level type. */
  skills: Record<string, [string, number]>;
  /** Career track id → name, its level titles in order, the top level it leads to, and the track it branches from. */
  tracks: Record<string, [string, string[], number, string?]>;
  /** Aspiration track id → name. */
  aspirations: Record<string, string>;
  /**
   * The ghost traits the game gives a sim for how they died: trait id →
   * the death ("Old Age", "Drowning"). Absent from files built before
   * scripts/build-game-names.ts read them.
   */
  deaths?: Record<string, string>;
  /**
   * The ids above with the game's icon in public/game-icons/<id>.webp:
   * src/data/gameIcons.json, built by scripts/build-game-icons.ts.
   */
  icons?: ReadonlySet<string>;
};

let loading: Promise<GameNames> | null = null;
let loaded: GameNames | null = null;

/** The names, fetched once with the list of icons: the board's main load doesn't carry them. */
export function loadGameNames(): Promise<GameNames> {
  loading ??= Promise.all([
    import('../data/gameNames.json'),
    // The icons are a nicety: without their list, the names still show.
    import('../data/gameIcons.json').catch(() => null),
  ]).then(([m, i]) => {
    const names = (m.default ?? m) as unknown as GameNames;
    const ids = i ? ((i.default ?? i) as { ids?: string[] }).ids : undefined;
    return (loaded = { ...names, icons: new Set(ids ?? []) });
  });
  return loading;
}

/** Where an item's icon is served, by the id gameIcons.json lists it under: the app's base in the browser, `/` in tests. */
export function gameIconUrl(id: string): string {
  const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
  return `${base}game-icons/${id}.webp`;
}

/** The names, once fetched; null before. */
export function gameNamesNow(): GameNames | null {
  return loaded;
}

/** One job, school or club, as the Life tab shows it. */
export type AboutJob = {
  /** "Astronaut"; "High School Student". */
  name: string;
  /** The branch picked, once there is one: "Space Ranger". */
  branch?: string;
  /** The level's title in the game: "Freelance Article Writer". */
  title?: string;
  level: number;
  /** The top level of the career, branches counted; 0 when it has no levels (university). */
  top: number;
  /** School's grade, from its title: "C" for "High School C Student". */
  grade?: string;
  /** The track whose icon it shows (the branch's, else its career's), when the game has one. */
  icon?: string;
};

/** `icon`: the id of the game's icon for it, when there is one (see gameIconUrl). */
export type AboutSkill = { name: string; level: number | null; max: number | null; icon?: string };

export type AboutTrait = { name: string; icon?: string };

export type AboutView = {
  jobs: AboutJob[];
  aspiration?: string;
  aspirationIcon?: string;
  personality: AboutTrait[];
  earned: AboutTrait[];
  skills: AboutSkill[];
};

/**
 * A skill's level from its points: each step reached is a level, as the
 * game counts it (100 points is level 1; a major skill's ten steps add up
 * to 81,580, level 10, where many sims in a real save sit exactly).
 */
export function skillLevel(points: number, steps: readonly number[]): number {
  let sum = 0;
  let level = 0;
  for (const step of steps) {
    sum += step;
    // Points are stored as floats: a hair under a step is still that step.
    if (points + 0.01 >= sum) level++;
    else break;
  }
  return level;
}

/**
 * A name as the game says it for this sim: some carry both forms,
 * "{M0.Patriarch}{F0.Matriarch}", "Fisher{M0.man}{F0.woman}". A male sim
 * gets the first kind, a female sim the second. Anyone else (non-binary,
 * not known) is never given one: an ending is left off ("Fisher") and a
 * whole word says both ("Patriarch/Matriarch").
 */
export function sayFor(text: string, gender?: string): string {
  if (!text.includes('{')) return text;
  const pick = gender === 'Male' ? 'M' : gender === 'Female' ? 'F' : '';
  const out = text.replace(
    /(\p{L}?)\{([MF])0\.([^}]*)\}\{([MF])0\.([^}]*)\}/gu,
    (_, before: string, k1: string, w1: string, k2: string, w2: string) => {
      const forms: Record<string, string> = { [k1]: w1, [k2]: w2 };
      if (pick) return before + (forms[pick] ?? '');
      if (before) return before;
      return `${forms.M ?? w1}/${forms.F ?? w2}`;
    },
  );
  // Any other token (a name the game fills in) says nothing here.
  return out.replace(/\{[^}]*\}/g, '').replace(/\s{2,}/g, ' ').trim();
}

/**
 * What the Life tab shows of a sim: jobs and school (a branch under its
 * career), the aspiration, personality and earned traits, and skills by
 * level, highest first. What the names don't cover (a pack built after
 * them, a hidden trait, the game's bookkeeping) is left out, never shown
 * as a number. A skill under level 1, or with no steps the board knows
 * (a toddler's), shows without a level only when it has a name.
 */
export function aboutView(about: SimAbout | undefined, names: GameNames, gender?: string): AboutView {
  const view: AboutView = { jobs: [], personality: [], earned: [], skills: [] };
  if (!about) return view;
  const say = (t: string) => sayFor(t, gender);
  const iconOf = (id: string | undefined) => (id && names.icons?.has(id) ? id : undefined);

  const seen = new Set<string>();
  for (const job of about.jobs ?? []) {
    const track = names.tracks[job.track];
    if (!track) continue;
    const [ownRaw, titles, top, parent] = track;
    const own = say(ownRaw);
    const parentRaw = parent ? names.tracks[parent]?.[0] : undefined;
    const parentName = parentRaw ? say(parentRaw) : undefined;
    const name = parentName ?? own;
    const branch = parentName ? own : undefined;
    const key = `${name}|${branch ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const title = titles[job.at] ? say(titles[job.at]!) : undefined;
    const grade = title ? /\b([A-F]) Student$/.exec(title)?.[1] : undefined;
    const icon = iconOf(job.track) ?? iconOf(parent);
    view.jobs.push({
      name,
      ...(branch ? { branch } : {}),
      ...(title ? { title } : {}),
      level: job.level,
      top,
      ...(grade ? { grade } : {}),
      ...(icon ? { icon } : {}),
    });
  }

  if (about.aspiration) {
    const a = names.aspirations[about.aspiration];
    if (a) view.aspiration = say(a);
    const icon = a ? iconOf(about.aspiration) : undefined;
    if (icon) view.aspirationIcon = icon;
  }

  for (const id of about.traits ?? []) {
    const t = names.traits[id];
    if (!t) continue;
    const list = t[1] === 'p' ? view.personality : view.earned;
    const name = say(t[0]);
    const icon = iconOf(id);
    if (!list.some((x) => x.name === name)) list.push(icon ? { name, icon } : { name });
  }

  for (const s of about.skills ?? []) {
    const k = names.skills[s.id];
    if (!k) continue;
    const steps = names.skillLevels[String(k[1])];
    const icon = iconOf(s.id);
    const withIcon = icon ? { icon } : {};
    if (!steps) {
      view.skills.push({ name: say(k[0]), level: null, max: null, ...withIcon });
      continue;
    }
    const level = skillLevel(s.points, steps);
    if (level >= 1) view.skills.push({ name: say(k[0]), level, max: steps.length, ...withIcon });
  }
  view.skills.sort((a, b) => (b.level ?? 0) - (a.level ?? 0) || a.name.localeCompare(b.name));
  return view;
}

/**
 * How the game says a sim died, in its words: the death the family tree
 * records for a relative (SimNode.deathTrait), else a ghost trait among
 * their traits. Null when the game says nothing, or the names don't know it.
 */
export function gameDeathOf(n: { deathTrait?: string; about?: SimAbout }, names: GameNames | null): string | null {
  const deaths = names?.deaths;
  if (!deaths) return null;
  if (n.deathTrait && deaths[n.deathTrait]) return deaths[n.deathTrait]!;
  for (const id of n.about?.traits ?? []) if (deaths[id]) return deaths[id]!;
  return null;
}
