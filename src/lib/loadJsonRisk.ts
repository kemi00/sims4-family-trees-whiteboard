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
 * Load JSON is a full replace. Confirm when the board has save-merge marks
 * or session edits that would be lost.
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
  const needsConfirm = hasSaveMarks || hasSessionEdits;
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
