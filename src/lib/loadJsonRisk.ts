import type { Edge, SimNode } from '../types/whiteboard.ts';

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
 * Load JSON is a full replace. Confirm whenever the board on screen is
 * anything other than the untouched built-in one.
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
      : 'Built-in board';
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
}): BoardFilters | null {
  if (
    d.hiddenPacks === undefined &&
    d.hiddenPlay === undefined &&
    d.hiAges === undefined &&
    d.hiSingle === undefined &&
    d.hideSecrets === undefined
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
  };
}

const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && a.every((x) => b.includes(x));

const count = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

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
      !!board.hideSecrets === !!file.hideSecrets)
  ) {
    return null;
  }
  const hides = [
    file.hiddenPacks.length && count(file.hiddenPacks.length, 'game', 'games'),
    file.hiddenPlay.length &&
      count(file.hiddenPlay.length, 'playability type', 'playability types'),
    file.hideSecrets && 'secrets',
  ].filter(Boolean);
  const highlights = [
    file.hiAges.length && count(file.hiAges.length, 'age', 'ages'),
    file.hiSingle && 'single sims',
  ].filter(Boolean);
  const parts = [
    hides.length ? `hides ${hides.join(' and ')}` : 'shows every game',
    highlights.length ? `highlights ${highlights.join(' and ')}` : null,
    board.hideSecrets && !file.hideSecrets ? 'shows secrets' : null,
  ].filter(Boolean);
  return `Your filters switch to the file's: it ${parts.join(', ')}.`;
}
