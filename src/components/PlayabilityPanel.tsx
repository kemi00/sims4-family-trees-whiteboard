import { panelPosition } from '../lib/chrome.ts';
import { usePanelSheet } from '../hooks/usePanelSheet.ts';
import type { SimNode } from '../types/whiteboard.ts';

type Props = {
  playabilities: string[];
  hiddenPlay: Set<string>;
  nodes: SimNode[];
  anchorRect: DOMRect | null;
  onToggle: (oplay: string, visible: boolean) => void;
  onAll: () => void;
  onNone: () => void;
};

export function PlayabilityPanel({
  playabilities,
  hiddenPlay,
  nodes,
  anchorRect,
  onToggle,
  onAll,
  onNone,
}: Props) {
  const sheet = usePanelSheet();
  const pos = panelPosition(anchorRect, 266);
  if (!pos) return null;

  const cnt = (p: string) => nodes.filter((n) => n.oplay === p).length;

  return (
    <div
      id="playability"
      className={sheet ? 'gpanel gpanel--sheet' : 'gpanel'}
      style={{ display: 'block', ...pos }}
    >
      <div className="gph">
        <b>Playability</b>
        <span>
          <button type="button" onClick={onAll}>
            All
          </button>
          <button type="button" onClick={onNone}>
            None
          </button>
        </span>
      </div>
      {playabilities.map((p) => {
        const on = !hiddenPlay.has(p);
        return (
          <label key={p} className="grow">
            <input
              type="checkbox"
              checked={on}
              onChange={(e) => onToggle(p, e.target.checked)}
            />
            <span>{p}</span>
            <b>{cnt(p)}</b>
          </label>
        );
      })}
    </div>
  );
}
