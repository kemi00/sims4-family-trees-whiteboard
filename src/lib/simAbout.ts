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
};

let loading: Promise<GameNames> | null = null;

/** The names, fetched once: the board's main load doesn't carry them. */
export function loadGameNames(): Promise<GameNames> {
  loading ??= import('../data/gameNames.json').then((m) => (m.default ?? m) as unknown as GameNames);
  return loading;
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
};

export type AboutSkill = { name: string; level: number | null; max: number | null };

export type AboutView = {
  jobs: AboutJob[];
  aspiration?: string;
  personality: string[];
  earned: string[];
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
 * What the Life tab shows of a sim: jobs and school (a branch under its
 * career), the aspiration, personality and earned traits, and skills by
 * level, highest first. What the names don't cover (a pack built after
 * them, a hidden trait, the game's bookkeeping) is left out, never shown
 * as a number. A skill under level 1, or with no steps the board knows
 * (a toddler's), shows without a level only when it has a name.
 */
export function aboutView(about: SimAbout | undefined, names: GameNames): AboutView {
  const view: AboutView = { jobs: [], personality: [], earned: [], skills: [] };
  if (!about) return view;

  const seen = new Set<string>();
  for (const job of about.jobs ?? []) {
    const track = names.tracks[job.track];
    if (!track) continue;
    const [own, titles, top, parent] = track;
    const parentName = parent ? names.tracks[parent]?.[0] : undefined;
    const name = parentName ?? own;
    const branch = parentName ? own : undefined;
    const key = `${name}|${branch ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const title = titles[job.at] || undefined;
    const grade = title ? /\b([A-F]) Student$/.exec(title)?.[1] : undefined;
    view.jobs.push({ name, ...(branch ? { branch } : {}), ...(title ? { title } : {}), level: job.level, top, ...(grade ? { grade } : {}) });
  }

  if (about.aspiration) {
    const a = names.aspirations[about.aspiration];
    if (a) view.aspiration = a;
  }

  for (const id of about.traits ?? []) {
    const t = names.traits[id];
    if (!t) continue;
    const list = t[1] === 'p' ? view.personality : view.earned;
    if (!list.includes(t[0])) list.push(t[0]);
  }

  for (const s of about.skills ?? []) {
    const k = names.skills[s.id];
    if (!k) continue;
    const steps = names.skillLevels[String(k[1])];
    if (!steps) {
      view.skills.push({ name: k[0], level: null, max: null });
      continue;
    }
    const level = skillLevel(s.points, steps);
    if (level >= 1) view.skills.push({ name: k[0], level, max: steps.length });
  }
  view.skills.sort((a, b) => (b.level ?? 0) - (a.level ?? 0) || a.name.localeCompare(b.name));
  return view;
}
