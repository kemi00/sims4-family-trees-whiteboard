import { useState } from 'react';
import { Warning } from '../icons.ts';
import type { LoadJsonRisk } from '../lib/loadJsonRisk.ts';

type Props = {
  risk: LoadJsonRisk;
  pendingFileName: string;
  /** File predates the current layout, so its card placements cannot be kept. */
  willRepack: boolean;
  /** How loading would change the filters on screen; null when it would not. */
  filtersNote: string | null;
  onDownload: () => void;
  onCancel: () => void;
  onMerge: (keepBoardPositions: boolean) => void;
  onReplace: (keepBoardPositions: boolean) => void;
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "a, b and c" */
function listOf(items: string[]): string {
  return items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

/**
 * Load JSON chooser — same shape as {@link SaveImportDialog}. Two separate
 * questions, each in its own words: which sims and links end up on the
 * board, then where their cards go. Nothing happens until the action button.
 */
export function LoadJsonDialog({
  risk,
  pendingFileName,
  willRepack,
  filtersNote,
  onDownload,
  onCancel,
  onMerge,
  onReplace,
}: Props) {
  /**
   * Nothing of the visitor's is on the board yet: the built-in starter. The
   * file is their board, so Replace is picked; adding it would keep every
   * premade the file leaves out. Where cards go is still theirs to choose.
   */
  const starter = !risk.needsConfirm;
  const [mode, setMode] = useState<'merge' | 'replace'>(starter ? 'replace' : 'merge');
  // Each mode remembers its own placement. Adding keeps this board's by
  // default; replacing means "the file on its own", so it starts with the file's.
  const [keepOnMerge, setKeepOnMerge] = useState(true);
  const [keepOnReplace, setKeepOnReplace] = useState(false);
  const merging = mode === 'merge';
  const keep = merging ? keepOnMerge : keepOnReplace;
  const setKeep = merging ? setKeepOnMerge : setKeepOnReplace;

  const removed = [
    risk.editorAdds && plural(risk.editorAdds, 'sim you added', 'sims you added'),
    risk.fromSaveCards && plural(risk.fromSaveCards, 'sim from a save', 'sims from a save'),
    risk.saveLinks && plural(risk.saveLinks, 'gray save link', 'gray save links'),
    risk.plannedLinks && plural(risk.plannedLinks, 'violet planned link', 'violet planned links'),
  ].filter((s): s is string => !!s);

  return (
    <div
      className="save-import"
      role="dialog"
      aria-modal="true"
      aria-labelledby="load-json-title"
      onClick={onCancel}
    >
      <div className="save-import__card" onClick={(e) => e.stopPropagation()}>
        <h2 id="load-json-title">Load a board file</h2>
        <p>
          You're opening <b>{pendingFileName}</b>. Choose what ends up on the
          board, then where the cards go.
        </p>
        {/* Scrolls on its own, so the title and the buttons stay in view. */}
        <div className="save-import__body">
          {willRepack && (
            <p className="save-import__warn">
              <Warning aria-hidden="true" />
              <span>
                This file comes from an older version of the app, so where its
                cards sat can't be used. All its sims and links still load.
              </span>
            </p>
          )}

          <fieldset className="save-import__choices">
            <legend className="save-import__lead">1 · Which sims and links</legend>
            <label className="save-import__choice">
              <input
                type="radio"
                name="load-json-mode"
                checked={merging}
                onChange={() => setMode('merge')}
              />
              <span className="save-import__choice-body">
                <b>Add the file to this board</b>
                <span className="save-import__choice-note">
                  You get everything from both. Sims in both take the file's
                  details, like age and household. If the two disagree about a
                  couple, say married or divorced, the file wins.
                </span>
                <span className="save-import__choice-note">
                  Nothing on this board is removed, and Undo takes it back.
                </span>
              </span>
            </label>
            <label className="save-import__choice">
              <input
                type="radio"
                name="load-json-mode"
                checked={!merging}
                onChange={() => setMode('replace')}
              />
              <span className="save-import__choice-body">
                <b>Replace this board with the file</b>
                <span className="save-import__choice-note">
                  You get only what's in the file.
                </span>
                {starter ? (
                  <span className="save-import__choice-note save-import__pick">
                    Suggested: this is the starter board, with nothing of yours
                    on it yet. Adding the file instead would keep the premade
                    sims it leaves out.
                  </span>
                ) : (
                  <span className="save-import__choice-note">
                    {removed.length ? (
                      <>
                        Removes this board's {listOf(removed)}. This can't be
                        undone.
                      </>
                    ) : (
                      <>Removes everything on this board. This can't be undone.</>
                    )}
                  </span>
                )}
              </span>
            </label>
          </fieldset>

          <fieldset className="save-import__choices">
            <legend className="save-import__lead">2 · Where the cards go</legend>
            {merging && willRepack ? (
              <p className="save-import__choice-note">
                Cards already on this board stay where they are. The file's sims
                are laid out automatically, since its placement is too old to use.
              </p>
            ) : (
              <>
                <label className="save-import__choice">
                  <input
                    type="radio"
                    name="load-json-positions"
                    checked={keep}
                    onChange={() => setKeep(true)}
                  />
                  <span className="save-import__choice-body">
                    <b>Leave this board's cards where they are</b>
                    <span className="save-import__choice-note">
                      Sims already here stay put.{' '}
                      {merging
                        ? 'Sims new from the file go with their household.'
                        : willRepack
                          ? 'The rest are laid out automatically.'
                          : 'The rest go where the file has them.'}
                    </span>
                  </span>
                </label>
                <label className="save-import__choice">
                  <input
                    type="radio"
                    name="load-json-positions"
                    checked={!keep}
                    onChange={() => setKeep(false)}
                  />
                  <span className="save-import__choice-body">
                    {merging ? (
                      <>
                        <b>Move them to where the file has them</b>
                        <span className="save-import__choice-note">
                          Sims in the file go to the file's spots. Sims only on
                          this board stay put.
                        </span>
                      </>
                    ) : willRepack ? (
                      <>
                        <b>Lay everything out automatically</b>
                        <span className="save-import__choice-note">
                          The file's placement is too old to use.
                        </span>
                      </>
                    ) : (
                      <>
                        <b>Use the file's placement</b>
                        <span className="save-import__choice-note">
                          The board looks exactly like the file.
                        </span>
                      </>
                    )}
                  </span>
                </label>
              </>
            )}
            <p className="save-import__choice-note">
              Want a clean layout instead? After loading, press <b>Organise</b>{' '}
              in the toolbar.
            </p>
          </fieldset>

          {filtersNote && <p className="save-import__choice-note">{filtersNote}</p>}

          {/* The starter board needs no backup: Reset the board brings it back. */}
          {!starter && (
            <p className="save-import__backup">
              <button type="button" className="save-import__text-btn" onClick={onDownload}>
                Download a backup of this board first
              </button>
            </p>
          )}
        </div>
        <div className="save-import__actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="save-import__ok"
            onClick={
              merging
                ? () => onMerge(willRepack ? true : keepOnMerge)
                : () => onReplace(keepOnReplace)
            }
          >
            {merging ? 'Add to board' : 'Replace board'}
          </button>
        </div>
      </div>
    </div>
  );
}
