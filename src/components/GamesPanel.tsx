import { panelPosition } from '../lib/chrome.ts';
import { usePanelSheet } from '../hooks/usePanelSheet.ts';
import type { SimNode } from '../types/whiteboard.ts';

type Props = {
  packs: string[];
  hiddenPacks: Set<string>;
  nodes: SimNode[];
  anchorRect: DOMRect | null;
  onToggle: (pack: string, visible: boolean) => void;
  onAll: () => void;
  onNone: () => void;
  onClose: () => void;
};

export function GamesPanel({
  packs,
  hiddenPacks,
  nodes,
  anchorRect,
  onToggle,
  onAll,
  onNone,
}: Props) {
  const sheet = usePanelSheet();
  const pos = panelPosition(anchorRect, 266);
  if (!pos) return null;

  const colorOf = (p: string) =>
    nodes.find((x) => x.pack === p)?.color ?? '#9aa0a6';
  const cnt = (p: string) => nodes.filter((n) => n.pack === p).length;

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
        return (
          <label key={p} className="grow">
            <input
              type="checkbox"
              checked={on}
              onChange={(e) => onToggle(p, e.target.checked)}
            />
            <i style={{ background: colorOf(p) }} />
            <span>{p}</span>
            <b>{cnt(p)}</b>
          </label>
        );
      })}
    </div>
  );
}
