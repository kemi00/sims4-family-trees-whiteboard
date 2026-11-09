import { AGES_H, DYNASTY_ROLES, GENDERS, HI_DYNASTY, HI_DYNASTY_CHIPS, HI_NO_CHILDREN, NEW_SIM_GENDERS, SPECIES, SPECIES_H, hiDynastyChip, type HiDynastyRole } from '../lib/constants.ts';
import { panelPosition } from '../lib/chrome.ts';
import { usePanelSheet } from '../hooks/usePanelSheet.ts';
import { highlightActive, highlightSummary } from '../lib/highlight.ts';
import { dynastyStanding, isPet, parentIdSet, partneredIdSet } from '../lib/utils.ts';
import type { Edge, SimNode } from '../types/whiteboard.ts';

const sectionLabel = {
  fontSize: 11,
  fontWeight: 700,
  color: '#6b7280',
  margin: '10px 4px 6px',
  letterSpacing: '0.02em',
} as const;

/** The dynasty chips: the card's mark, then the game's word. */
const ROLE_CHIP: Record<HiDynastyRole, { text: string; title: string }> = {
  head: { text: `${DYNASTY_ROLES.head.mark} Head`, title: 'Heads of a dynasty' },
  heir: { text: `${DYNASTY_ROLES.heir.mark} Heir`, title: 'Heirs of a dynasty' },
  member: { text: 'Member', title: 'In a dynasty, but not its head, heir or outcast' },
  outcast: { text: `${DYNASTY_ROLES.outcast.mark} Outcast`, title: 'Outcasts of a dynasty' },
};

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
  const parents = parentIdSet(edges);
  const cntAge = (a: string) => sims.filter((n) => n.age === a).length;
  const cntSpecies = (s: string) =>
    pets.filter((n) => n.species === s).length;
  const cntSingle = sims.filter((n) => !partnered.has(n.id)).length;
  const cntGender = (g: string) => sims.filter((n) => n.gender === g).length;
  const cntNoKids = sims.filter((n) => !parents.has(n.id)).length;
  const cntRole = (r: HiDynastyRole) => sims.filter((n) => dynastyStanding(n) === r).length;
  // Dynasty chips once a shown sim is in one, or a chip is still on.
  const dynasties =
    sims.some((n) => dynastyStanding(n)) || [...hiAges].some((h) => HI_DYNASTY_CHIPS.has(h));
  // Female, Male and Non-Binary always; Variable, from the roster, only when a sim has it.
  const genders = GENDERS.filter(
    (g) =>
      (NEW_SIM_GENDERS as readonly string[]).includes(g) ||
      cntGender(g) > 0 ||
      hiAges.has(g),
  );
  const active = highlightActive(hiAges, hiSingle);
  const summary = highlightSummary({ nodes, shown: packVis, hi: hiAges, hiSingle, partnered, parents });

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
      <div style={sectionLabel}>Family</div>
      <div className="agechips">
        <button
          type="button"
          className={hiSingle ? 'on' : ''}
          aria-pressed={hiSingle}
          title="No partner: not married or in a romance"
          onClick={onToggleSingle}
        >
          Single{' '}
          <b style={{ opacity: 0.6 }}>{cntSingle}</b>
        </button>
        <button
          type="button"
          className={hiAges.has(HI_NO_CHILDREN) ? 'on' : ''}
          aria-pressed={hiAges.has(HI_NO_CHILDREN)}
          title="No children on the board, planned babies counted, so no descendants either"
          onClick={() => onToggle(HI_NO_CHILDREN)}
        >
          No children{' '}
          <b style={{ opacity: 0.6 }}>{cntNoKids}</b>
        </button>
      </div>
      {dynasties && (
        <>
          <div style={sectionLabel}>Dynasty</div>
          <div className="agechips">
            {HI_DYNASTY.map((r) => {
              const chip = hiDynastyChip(r);
              return (
                <button
                  key={r}
                  type="button"
                  data-role={r}
                  className={hiAges.has(chip) ? 'on' : ''}
                  aria-pressed={hiAges.has(chip)}
                  title={ROLE_CHIP[r].title}
                  onClick={() => onToggle(chip)}
                >
                  {ROLE_CHIP[r].text}{' '}
                  <b style={{ opacity: 0.6 }}>{cntRole(r)}</b>
                </button>
              );
            })}
          </div>
        </>
      )}
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
          color: 'var(--ink-3)',
          margin: '8px 4px 2px',
        }}
      >
        Highlighted sims glow gold; the rest dim. Two picks in one row show
        both, like Teen and Elder; picks in different rows narrow each
        other, and so do Single and No children. Pets add to life stages.
      </div>
    </div>
  );
}
