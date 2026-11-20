import { packIconUrl } from '../lib/packs.ts';

type Props = {
  /** Every game, including those with no sims on the board. */
  packs: string[];
  hiddenPacks: Set<string>;
  /** Cards on the board from each game. */
  counts: ReadonlyMap<string, number>;
  colors: ReadonlyMap<string, string>;
  onToggle: (pack: string, visible: boolean) => void;
  onAll: () => void;
  onNone: () => void;
};

/** Filters › Games and packs: which games' sims the board shows. */
export function GamesPanel({
  packs,
  hiddenPacks,
  counts,
  colors,
  onToggle,
  onAll,
  onNone,
}: Props) {
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
      {!packs.length && <p className="barpanel__empty">No games on this board yet.</p>}
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
            {/* The game's icon in a ring of its world's colour, as the worlds list shows pictures. */}
            {packIconUrl(p) ? (
              <span className="lg__world" style={{ borderColor: colors.get(p) ?? '#9aa0a6' }} aria-hidden="true">
                <img src={packIconUrl(p)} alt="" width={16} height={16} />
              </span>
            ) : (
              <span className="lg__world lg__world--blank" style={{ borderColor: colors.get(p) ?? '#9aa0a6' }} aria-hidden="true" />
            )}
            <span>{p}</span>
            <b>{n}</b>
          </label>
        );
      })}
    </>
  );
}
