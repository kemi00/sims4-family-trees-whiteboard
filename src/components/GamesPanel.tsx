import { panelPosition } from '../lib/chrome.ts';
import { usePanelSheet } from '../hooks/usePanelSheet.ts';
type Props = {
  /** Every game, including those with no sims on the board. */
  packs: string[];
  hiddenPacks: Set<string>;
  /** Cards on the board from each game. */
  counts: ReadonlyMap<string, number>;
  colors: ReadonlyMap<string, string>;
  anchorRect: DOMRect | null;
  onToggle: (pack: string, visible: boolean) => void;
  onAll: () => void;
  onNone: () => void;
  onClose: () => void;
};

export function GamesPanel({
  packs,
  hiddenPacks,
  counts,
  colors,
  anchorRect,
  onToggle,
  onAll,
  onNone,
}: Props) {
  const sheet = usePanelSheet();
  const pos = panelPosition(anchorRect, 266);
  if (!pos) return null;


  return (
    <div
      id="games"
      className={sheet ? 'gpanel gpanel--sheet' : 'gpanel'}
      style={{ display: 'block', ...pos }}
    >
      <div className="gph">
        <b>Games / packs</b>
        <span>
          <button onClick={onAll}>All</button>
          <button onClick={onNone}>None</button>
        </span>
      </div>
      {!packs.length && <p className="gpanel__empty">No games on this board yet.</p>}
      {packs.map((p) => {
        const on = !hiddenPacks.has(p);
        const n = counts.get(p) ?? 0;
        // A game with no sims here stays listed, quieter, so switching
        // it off (one you don't have) or on again is always possible.
        return (
          <label
            key={p}
            className={n ? 'grow' : 'grow grow--none'}
            title={n ? undefined : 'No sims from this game on the board'}
          >
            <input
              type="checkbox"
              checked={on}
              onChange={(e) => onToggle(p, e.target.checked)}
            />
            <i style={{ background: colors.get(p) ?? '#9aa0a6' }} />
            <span>{p}</span>
            <b>{n}</b>
          </label>
        );
      })}
    </div>
  );
}
