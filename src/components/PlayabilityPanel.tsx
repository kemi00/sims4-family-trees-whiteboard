import type { SimNode } from '../types/whiteboard.ts';

type Props = {
  playabilities: string[];
  hiddenPlay: Set<string>;
  nodes: SimNode[];
  onToggle: (oplay: string, visible: boolean) => void;
  onAll: () => void;
  onNone: () => void;
};

/** Filters › Play: which kinds of sims (by how you play them) the board shows. */
export function PlayabilityPanel({
  playabilities,
  hiddenPlay,
  nodes,
  onToggle,
  onAll,
  onNone,
}: Props) {
  const cnt = (p: string) => nodes.filter((n) => n.oplay === p).length;

  return (
    <>
      <div className="fpanel__bulk">
        <button type="button" onClick={onAll}>
          Show all
        </button>
        <button type="button" onClick={onNone}>
          Hide all
        </button>
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
    </>
  );
}
