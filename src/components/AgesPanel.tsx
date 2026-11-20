import {
  AGES_H,
  DECEASED_STATE,
  DYNASTY_ROLES,
  GENDERS,
  HI_DESCENDANTS,
  HI_DYNASTY,
  HI_DYNASTY_CHIPS,
  HI_MARRIED,
  HI_NO_CHILDREN,
  HI_NO_SIBLINGS,
  HI_NOT_BORN,
  HI_ROMANCE,
  HI_SIBLINGS,
  NEW_SIM_GENDERS,
  SPECIES,
  SPECIES_H,
  hiDynastyChip,
  hiHouseholdChip,
  householdChipSize,
  type HiDynastyRole,
} from '../lib/constants.ts';
import { highlightActive, highlightSummary } from '../lib/highlight.ts';
import { isUnhousedGid } from '../lib/unhoused.ts';
import { dynastyStanding, isPet, type HighlightSets } from '../lib/utils.ts';
import type { SimNode } from '../types/whiteboard.ts';

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
  heir: { text: `${DYNASTY_ROLES.heir.mark} Heir`, title: 'Current and planned heirs, including heirs after another sim' },
  member: { text: 'Member', title: 'In a dynasty, but not its head, heir or outcast' },
  outcast: { text: `${DYNASTY_ROLES.outcast.mark} Outcast`, title: 'Outcasts of a dynasty' },
};

type Props = {
  nodes: SimNode[];
  /** What the chips ask about each sim: partners, descendants, siblings, not born yet, household sizes. */
  sets: HighlightSets;
  hiAges: Set<string>;
  hiSingle: boolean;
  packVis: (n: SimNode) => boolean;
  onToggle: (age: string) => void;
  onToggleSingle: () => void;
  onClear: () => void;
};

/** Filters › Highlight: light up sims by life stage, gender, family or dynasty role. */
export function AgesPanel({
  nodes,
  sets,
  hiAges,
  hiSingle,
  packVis,
  onToggle,
  onToggleSingle,
  onClear,
}: Props) {
  // Counts follow what the board shows: hidden games and play types are left
  // out, as on the board. So are the deceased, whom the chips never pick.
  const living = nodes.filter((n) => packVis(n) && n.state !== DECEASED_STATE);
  const sims = living.filter((n) => !isPet(n));
  const pets = living.filter(isPet);
  const cntAge = (a: string) => sims.filter((n) => n.age === a).length;
  const cntSpecies = (s: string) =>
    pets.filter((n) => n.species === s).length;
  const { partnered, married = new Set<string>(), descendants = new Set<string>(), siblings = new Set<string>(), unborn = new Set<string>() } = sets;
  const cnt = (ok: (n: SimNode) => boolean) => sims.filter(ok).length;
  const cntGender = (g: string) => cnt((n) => n.gender === g);
  const cntUnborn = cnt((n) => unborn.has(n.id));
  // Household sizes: living sims at home, counted by how many their household has.
  const bySize = new Map<number, number>();
  for (const n of sims) {
    if (unborn.has(n.id) || isUnhousedGid(n.gid)) continue;
    const size = sets.householdSizes?.get(n.gid);
    if (size) bySize.set(size, (bySize.get(size) ?? 0) + 1);
  }
  for (const h of hiAges) {
    const size = householdChipSize(h);
    if (size !== null && !bySize.has(size)) bySize.set(size, 0);
  }
  const sizes = [...bySize.keys()].sort((a, b) => a - b);
  /** One row of family chips: picks in it add up, rows narrow each other. */
  const familyRow = (chips: { key: string; text: string; title: string; count: number; on: boolean; toggle: () => void }[]) => (
    <div className="agechips">
      {chips.map((c) => (
        <button key={c.key} type="button" className={c.on ? 'on' : ''} aria-pressed={c.on} title={c.title} onClick={c.toggle}>
          {c.text} <b style={{ opacity: 0.6 }}>{c.count}</b>
        </button>
      ))}
    </div>
  );
  const chip = (key: string, text: string, title: string, ok: (n: SimNode) => boolean) => ({
    key,
    text,
    title,
    count: cnt(ok),
    on: hiAges.has(key),
    toggle: () => onToggle(key),
  });
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
  const summary = highlightSummary({ nodes, shown: packVis, hi: hiAges, hiSingle, ...sets });

  return (
    <>
      <div className="fpanel__bulk">
        <button type="button" onClick={onClear} disabled={!active}>
          Clear
        </button>
      </div>
      <div className="hlsum" role="status" aria-live="polite">
        {active ? (
          <>
            <b>{summary.count}</b> {summary.phrase}
            <span className="hlsum__of"> of {summary.living} living on the board</span>
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
            living on the board. Pick what to highlight.
          </>
        )}
      </div>
      <div style={sectionLabel}>Life stage</div>
      <div className="agechips">
        <button
          type="button"
          className={hiAges.has(HI_NOT_BORN) ? 'on' : ''}
          aria-pressed={hiAges.has(HI_NOT_BORN)}
          title="Planned babies: on the board, not born in your game yet"
          onClick={() => onToggle(HI_NOT_BORN)}
        >
          Not born yet{' '}
          <b style={{ opacity: 0.6 }}>{cntUnborn}</b>
        </button>
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
      {familyRow([
        {
          key: 'single',
          text: 'Single',
          title: 'No partner: not married or in a romance. The widowed are single.',
          count: cnt((n) => !partnered.has(n.id)),
          on: hiSingle,
          toggle: onToggleSingle,
        },
        chip(HI_ROMANCE, 'In a romance', 'In a romance with a living sim, not married', (n) => partnered.has(n.id) && !married.has(n.id)),
        chip(HI_MARRIED, 'Married', 'Married to a living sim', (n) => married.has(n.id)),
      ])}
      {familyRow([
        chip(
          HI_DESCENDANTS,
          'Descendants',
          'A living child, grandchild or further down on the board, planned babies counted',
          (n) => descendants.has(n.id),
        ),
        chip(HI_NO_CHILDREN, 'No descendants', 'No living child, grandchild or further down on the board, planned babies counted', (n) => !descendants.has(n.id)),
      ])}
      {familyRow([
        chip(HI_SIBLINGS, 'Siblings', 'A living sibling on the board; half-siblings, adoptive siblings and planned babies count', (n) => siblings.has(n.id)),
        chip(HI_NO_SIBLINGS, 'No siblings', 'No living sibling known on the board; half-siblings, adoptive siblings and planned babies count', (n) => !siblings.has(n.id)),
      ])}
      {sizes.length > 0 && (
        <>
          <div style={sectionLabel}>Household size</div>
          <div className="agechips">
            {sizes.map((size) => {
              const key = hiHouseholdChip(size);
              const count = bySize.get(size) ?? 0;
              const homes = Math.round(count / size);
              return (
                <button
                  key={key}
                  type="button"
                  className={hiAges.has(key) ? 'on' : ''}
                  aria-pressed={hiAges.has(key)}
                  title={`${homes === 1 ? '1 household' : `${homes} households`} of ${size === 1 ? '1 living sim' : `${size} living sims`}: ${count === 1 ? '1 sim' : `${count} sims`}. The deceased, pets and babies not born yet don't count.`}
                  onClick={() => onToggle(key)}
                >
                  {size === 1 ? '1 sim' : `${size} sims`} <b style={{ opacity: 0.6 }}>{count}</b>
                </button>
              );
            })}
          </div>
        </>
      )}
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
        both, like Teen and Elder or Single and Married; picks in different
        rows narrow each other. Household size counts the living sims at
        home. Pets add to life stages.
      </div>
    </>
  );
}
