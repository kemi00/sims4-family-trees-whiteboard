import { AGES_H, GENDERS, NEW_SIM_GENDERS, SPECIES, SPECIES_H } from '../lib/constants.ts';
import { panelPosition } from '../lib/chrome.ts';
import { usePanelSheet } from '../hooks/usePanelSheet.ts';
import { highlightActive, highlightSummary } from '../lib/highlight.ts';
import { isPet, partneredIdSet } from '../lib/utils.ts';
import type { Edge, SimNode } from '../types/whiteboard.ts';

const sectionLabel = {
  fontSize: 11,
  fontWeight: 700,
  color: '#6b7280',
  margin: '10px 4px 6px',
  letterSpacing: '0.02em',
} as const;

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

  // Counts follow what the board shows: hidden games, play types and the
  // deceased (Filters → Hide deceased) are left out, as on the board.
  const visible = nodes.filter(packVis);
  const sims = visible.filter((n) => !isPet(n));
  const pets = visible.filter(isPet);
  const partnered = partneredIdSet(edges);
  const cntAge = (a: string) => sims.filter((n) => n.age === a).length;
  const cntSpecies = (s: string) =>
    pets.filter((n) => n.species === s).length;
  const cntSingle = sims.filter((n) => !partnered.has(n.id)).length;
  const cntGender = (g: string) => sims.filter((n) => n.gender === g).length;
  // Female, Male and Non-Binary always; Variable, from the roster, only when a sim has it.
  const genders = GENDERS.filter(
    (g) =>
      (NEW_SIM_GENDERS as readonly string[]).includes(g) ||
      cntGender(g) > 0 ||
      hiAges.has(g),
  );
  const active = highlightActive(hiAges, hiSingle);
  const summary = highlightSummary({ nodes, shown: packVis, hi: hiAges, hiSingle, partnered });

  return (
    <div
      id="ages"
      className={sheet ? 'gpanel gpanel--sheet' : 'gpanel'}
      style={{ display: 'block', ...pos }}
    >
      <div className="gph">
        <b>Highlight sims</b>
        <span>
          <button onClick={onClear} disabled={!active}>
            Clear
          </button>
        </span>
      </div>
      <div className="hlsum" role="status" aria-live="polite">
        {active ? (
          <>
            <b>{summary.count}</b> {summary.phrase}
            {summary.deceased > 0 && <> · {summary.deceased} deceased</>}
            <span className="hlsum__of"> of {summary.shown} shown</span>
          </>
        ) : (
          <>
            <b>{sims.length}</b> sims
            {pets.length > 0 && (
              <>
                {' '}
                · <b>{pets.length}</b> pets
              </>
            )}{' '}
            shown. Pick what to highlight.
          </>
        )}
      </div>
      <div style={sectionLabel}>Life stage</div>
      <div className="agechips">
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
      <div style={sectionLabel}>Gender</div>
      <div className="agechips">
        {genders.map((g) => (
          <button
            key={g}
            data-gender={g}
            className={hiAges.has(g) ? 'on' : ''}
            onClick={() => onToggle(g)}
          >
            {g}{' '}
            <b style={{ opacity: 0.6 }}>{cntGender(g)}</b>
          </button>
        ))}
      </div>
      <div style={sectionLabel}>Relationship</div>
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
      {pets.length > 0 && (
        <>
          <div style={sectionLabel}>Pets</div>
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
        Highlighted sims glow gold; the rest dim. Life stage and pet chips
        add to each other; gender and Single narrow them down.
      </div>
    </div>
  );
}
