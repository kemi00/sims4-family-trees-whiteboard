import type { Edge, SimNode } from '../types/whiteboard.ts';
import { GENDER_CHIPS, HI_DYNASTY_CHIPS, HI_NO_CHILDREN, SPECIES_H } from './constants.ts';

/** What Load JSON would discard from the current board. */
export type LoadJsonRisk = {
  needsConfirm: boolean;
  fromSaveCards: number;
  saveLinks: number;
  plannedLinks: number;
  editorAdds: number;
  hasUndo: boolean;
  sourceLabel: string;
};

/**
 * What loading a file would put at risk. `needsConfirm`: the board on screen
 * is anything other than the untouched built-in one. Load JSON asks either
 * way; over the untouched board it picks Replace for you (LoadJsonDialog).
 *
 * Counting only edits and save marks was not enough: a board that came from
 * Load JSON has no undo history, no editor adds and no planned links of its
 * own, so loading a second file replaced the first without asking. The board
 * being someone's loaded work is reason enough to stop and ask.
 */
export function loadJsonRisk(
  nodes: SimNode[],
  edges: Edge[],
  opts: {
    canUndo: boolean;
    sourceFileName: string | null;
    fromBrowserDraft: boolean;
  },
): LoadJsonRisk {
  let fromSaveCards = 0;
  let editorAdds = 0;
  for (const n of nodes) {
    if (n.fromSave) fromSaveCards += 1;
    if (n.added) editorAdds += 1;
  }
  let saveLinks = 0;
  let plannedLinks = 0;
  for (const e of edges) {
    if (e.source === 'save') saveLinks += 1;
    else if (e.source === 'planned') plannedLinks += 1;
  }
  const hasSaveMarks = fromSaveCards > 0 || saveLinks > 0;
  const hasSessionEdits =
    opts.canUndo || editorAdds > 0 || plannedLinks > 0;
  /** A loaded file or a restored draft is work the visitor can still lose. */
  const hasBoardOfTheirOwn =
    opts.sourceFileName != null || opts.fromBrowserDraft;
  const needsConfirm = hasSaveMarks || hasSessionEdits || hasBoardOfTheirOwn;
  const sourceLabel = opts.sourceFileName
    ? opts.sourceFileName
    : opts.fromBrowserDraft
      ? 'Browser draft'
      : 'Example board';
  return {
    needsConfirm,
    fromSaveCards,
    saveLinks,
    plannedLinks,
    editorAdds,
    hasUndo: opts.canUndo,
    sourceLabel,
  };
}

/** Game and playability filters plus age/single highlights, as a board file saves them. */
export type BoardFilters = {
  hiddenPacks: string[];
  hiddenPlay: string[];
  hiAges: string[];
  hiSingle: boolean;
  /** Absent means shown, as in files saved before the filter existed. */
  hideSecrets?: boolean;
  /** Absent means shown, as in files saved before the filter existed. */
  hideDeceased?: boolean;
};

/**
 * The filters a board file carries, or null when it has none (older exports).
 * A file with no opinion must not wipe the filters on screen.
 */
export function fileFilters(d: {
  hiddenPacks?: unknown;
  hiddenPlay?: unknown;
  hiAges?: unknown;
  hiSingle?: unknown;
  hideSecrets?: unknown;
  hideDeceased?: unknown;
}): BoardFilters | null {
  if (
    d.hiddenPacks === undefined &&
    d.hiddenPlay === undefined &&
    d.hiAges === undefined &&
    d.hiSingle === undefined &&
    d.hideSecrets === undefined &&
    d.hideDeceased === undefined
  ) {
    return null;
  }
  const list = (v: unknown) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  return {
    hiddenPacks: list(d.hiddenPacks),
    hiddenPlay: list(d.hiddenPlay),
    hiAges: list(d.hiAges),
    hiSingle: d.hiSingle === true,
    hideSecrets: d.hideSecrets === true,
    hideDeceased: d.hideDeceased === true,
  };
}

const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && a.every((x) => b.includes(x));

const count = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

/** "a", "a and b", "a, b and c". */
const listed = (items: unknown[]) =>
  items.length < 2
    ? String(items[0] ?? '')
    : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

/**
 * One plain sentence for the Load JSON dialog on how a merge would change the
 * filters on screen, or null when it would leave them as they are.
 */
export function filterChangeNote(
  board: BoardFilters,
  file: BoardFilters | null,
): string | null {
  if (
    !file ||
    (sameSet(board.hiddenPacks, file.hiddenPacks) &&
      sameSet(board.hiddenPlay, file.hiddenPlay) &&
      sameSet(board.hiAges, file.hiAges) &&
      board.hiSingle === file.hiSingle &&
      !!board.hideSecrets === !!file.hideSecrets &&
      !!board.hideDeceased === !!file.hideDeceased)
  ) {
    return null;
  }
  const hides = [
    file.hiddenPacks.length && count(file.hiddenPacks.length, 'game', 'games'),
    file.hiddenPlay.length &&
      count(file.hiddenPlay.length, 'playability type', 'playability types'),
    file.hideSecrets && 'secrets',
    file.hideDeceased && 'deceased sims',
  ].filter(Boolean);
  // One set holds the age, pet, gender, No children and dynasty role chips.
  const genders = file.hiAges.filter((h) => GENDER_CHIPS.has(h)).length;
  const pets = file.hiAges.filter((h) => (SPECIES_H as readonly string[]).includes(h)).length;
  const roles = file.hiAges.filter((h) => HI_DYNASTY_CHIPS.has(h)).length;
  const noKids = file.hiAges.includes(HI_NO_CHILDREN);
  const ages = file.hiAges.length - genders - pets - roles - (noKids ? 1 : 0);
  const highlights = [
    ages && count(ages, 'age', 'ages'),
    genders && count(genders, 'gender', 'genders'),
    pets && count(pets, 'pet species', 'pet species'),
    file.hiSingle && 'single sims',
    noKids && 'sims with no children',
    roles && count(roles, 'dynasty role', 'dynasty roles'),
  ].filter(Boolean);
  const parts = [
    hides.length ? `hides ${listed(hides)}` : 'shows every game',
    highlights.length ? `highlights ${listed(highlights)}` : null,
    board.hideSecrets && !file.hideSecrets ? 'shows secrets' : null,
    board.hideDeceased && !file.hideDeceased ? 'shows deceased sims' : null,
  ].filter(Boolean);
  return `Your filters will change to the file's: it ${parts.join(', ')}.`;
}
