import { AGES_H, SPECIES, SPECIES_H } from '../lib/constants.ts';
import { panelPosition } from '../lib/chrome.ts';
import { usePanelSheet } from '../hooks/usePanelSheet.ts';
import { isPet, partneredIdSet } from '../lib/utils.ts';
import type { Edge, SimNode } from '../types/whiteboard.ts';

type Props = {
  nodes: SimNode[];
  edges: Edge[];
  hiAges: Set<string>;
  hiSingle: boolean;
  packVis: (n: SimNode) => boolean;
  anchorRect: DOMRect | null;
  onToggle: (age: string) => void;
  onToggleSingle: () => void;
  onClear: () => void;
};

export function AgesPanel({
  nodes,
  edges,
  hiAges,
  hiSingle,
  packVis,
  anchorRect,
  onToggle,
  onToggleSingle,
  onClear,
}: Props) {
  const sheet = usePanelSheet();
  const pos = panelPosition(anchorRect, 266);
  if (!pos) return null;

  const sims = nodes.filter((n) => !isPet(n));
  const pets = nodes.filter(isPet);
  const partnered = partneredIdSet(edges);
  const cntAge = (a: string) => sims.filter((n) => n.age === a).length;
  const cntSpecies = (s: string) =>
    pets.filter((n) => n.species === s).length;
  const cntSingle = sims.filter((n) => !partnered.has(n.id)).length;
  const shown = nodes.filter(packVis).length;

  return (
    <div
      id="ages"
      className={sheet ? 'gpanel gpanel--sheet' : 'gpanel'}
      style={{ display: 'block', ...pos }}
    >
      <div className="gph">
        <b>Highlight age, pets, or single sims</b>
        <span>
          <button onClick={onClear}>Clear</button>
        </span>
      </div>
      <div style={{ margin: '0 4px 9px', fontSize: 12, color: '#3b4757' }}>
        <b>{sims.length}</b> sims
        {pets.length > 0 && (
          <>
            {' '}
            · <b>{pets.length}</b> pets
          </>
        )}
        {shown !== nodes.length && (
          <>
            {' '}
            · <b>{shown}</b> shown
          </>
        )}
      </div>
      <div className="agechips">
        <button
          type="button"
          className={hiSingle ? 'on' : ''}
          onClick={onToggleSingle}
        >
          Single{' '}
          <b style={{ opacity: 0.6 }}>{cntSingle}</b>
        </button>
      </div>
      <div className="agechips" style={{ marginTop: 8 }}>
        {AGES_H.map((a) => (
          <button
            key={a}
            data-age={a}
            className={hiAges.has(a) ? 'on' : ''}
            onClick={() => onToggle(a)}
          >
            {a}{' '}
            <b style={{ opacity: 0.6 }}>{cntAge(a)}</b>
          </button>
        ))}
      </div>
      {pets.length > 0 && (
        <>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: '#6b7280',
              margin: '10px 4px 6px',
              letterSpacing: '0.02em',
            }}
          >
            Pets
          </div>
          <div className="agechips">
            {SPECIES_H.map((s) => (
              <button
                key={s}
                data-species={s}
                className={hiAges.has(s) ? 'on' : ''}
                onClick={() => onToggle(s)}
              >
                {SPECIES[s]} {s}{' '}
                <b style={{ opacity: 0.6 }}>{cntSpecies(s)}</b>
              </button>
            ))}
          </div>
        </>
      )}
      <div
        style={{
          fontSize: 10,
          color: '#8a7f63',
          margin: '8px 4px 2px',
        }}
      >
        Highlighted sims glow gold; the rest dim. Age chips combine with
        each other; Single intersects whatever ages are picked.
      </div>
    </div>
  );
}
