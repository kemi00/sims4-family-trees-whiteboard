import { simName } from '../lib/connectionLog.ts';
import { BLOODLINE_REACHES, REACH_HINT, REACH_LABEL, REACH_NOUN, type BloodlineReach } from '../lib/bloodline.ts';
import type { SimNode } from '../types/whiteboard.ts';

type Props = {
  node: SimNode | undefined;
  reach: BloodlineReach;
  /** Everyone lit in their line, the sim aside, as the filters show them. */
  count: number;
  onReach: (reach: BloodlineReach) => void;
  /** Show who they are, generation by generation, beside the board. */
  onList: () => void;
  onClear: () => void;
};

/**
 * Whose line is lit, how many, and how far it reaches: one line, then
 * the switch, List and Clear. The generations are in the List.
 */
export function BloodlineBanner({ node, reach, count, onReach, onList, onClear }: Props) {
  const name = node ? simName(node) : 'This sim';
  const many = count === 0 ? 'no one on the board' : count === 1 ? '1 sim' : `${count} sims`;
  return (
    <div className="bloodline-banner family-banner" role="status" onPointerDown={(e) => e.stopPropagation()}>
      <p>
        <b>{`${name}’s ${REACH_NOUN[reach]}`}</b>
        <span className="bloodline-banner__count">{` · ${many}`}</span>
      </p>
      <span className="family-banner__scope" role="group" aria-label="How far the bloodline reaches">
        {BLOODLINE_REACHES.map((r) => (
          <button key={r} type="button" aria-pressed={reach === r} title={REACH_HINT[r]} onClick={() => onReach(r)}>
            {REACH_LABEL[r]}
          </button>
        ))}
      </span>
      <button type="button" className="banner__alt" onClick={onList}>
        List
      </button>
      <button type="button" className="banner__end" onClick={onClear}>
        Clear
      </button>
    </div>
  );
}
