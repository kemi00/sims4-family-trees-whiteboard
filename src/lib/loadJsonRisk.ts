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
