import { useId, type ReactNode } from 'react';
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
  const rowId = useId();
  type Chip = { key: string; text: ReactNode; title?: string; count: number; on: boolean; toggle: () => void; data?: Record<string, string> };
  /** One choice: its name and its count, light; an empty one dims but stays where it is. */
  const chipButton = (c: Chip) => (
    <button
      key={c.key}
      type="button"
      className={c.on ? 'on' : c.count === 0 ? 'zero' : ''}
      aria-pressed={c.on}
      title={c.title}
      onClick={c.toggle}
      {...c.data}
    >
      {c.text} <span className="agechips__n">{c.count}</span>
    </button>
  );
  /** One question, its name in the left column and its choices beside it: picks in a row add up, rows narrow each other. */
  const row = (key: string, label: string, chips: Chip[], title?: string) => (
    <div className="hlrow" role="group" aria-labelledby={`${rowId}-${key}`} key={key}>
      <span className="hlrow__label" id={`${rowId}-${key}`} title={title}>
        {label}
      </span>
      <div className="agechips">{chips.map(chipButton)}</div>
    </div>
  );
  const chip = (key: string, text: string, title: string, ok: (n: SimNode) => boolean): Chip => ({
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
  const toggleKey = (key: string) => () => onToggle(key);

  return (
    <>
      <div className="hlsum" role="status" aria-live="polite">
        <span>
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
              living on the board
            </>
          )}
        </span>
        {active && (
          <button type="button" className="hlsum__clear" onClick={onClear}>
            Clear
          </button>
        )}
      </div>
      <p className="hlhint">
        Picks in a row add up. Rows narrow each other{pets.length > 0 ? '; pets add to the sims you pick' : ''}.
      </p>
      <div className="hlrows">
        {row('age', 'Life stage', [
          ...AGES_H.map((a) => ({ key: a, text: a, count: cntAge(a), on: hiAges.has(a), toggle: toggleKey(a), data: { 'data-age': a } })),
          {
            key: HI_NOT_BORN,
            text: 'Not born yet',
            title: 'Planned babies: on the board, not born in your game yet',
            count: cntUnborn,
            on: hiAges.has(HI_NOT_BORN),
            toggle: toggleKey(HI_NOT_BORN),
          },
        ])}
        {row(
          'gender',
          'Gender',
          genders.map((g) => ({ key: g, text: g, count: cntGender(g), on: hiAges.has(g), toggle: toggleKey(g), data: { 'data-gender': g } })),
        )}
        {row('partner', 'Partner', [
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
        {row(
          'descendants',
          'Descendants',
          [
            chip(HI_DESCENDANTS, 'Some', 'A living child, grandchild or further down on the board, planned babies counted', (n) => descendants.has(n.id)),
            chip(HI_NO_CHILDREN, 'None', 'No living child, grandchild or further down on the board, planned babies counted', (n) => !descendants.has(n.id)),
          ],
          'Children, grandchildren and further down, living on the board',
        )}
        {row(
          'siblings',
          'Siblings',
          [
            chip(HI_SIBLINGS, 'Some', 'A living sibling on the board; half-siblings, adoptive siblings and planned babies count', (n) => siblings.has(n.id)),
            chip(HI_NO_SIBLINGS, 'None', 'No living sibling known on the board; half-siblings, adoptive siblings and planned babies count', (n) => !siblings.has(n.id)),
          ],
          'Living siblings on the board, half and adoptive ones too',
        )}
        {sizes.length > 0 &&
          row(
            'home',
            'Sims at home',
            sizes.map((size) => {
              const key = hiHouseholdChip(size);
              const count = bySize.get(size) ?? 0;
              const homes = Math.round(count / size);
              return {
                key,
                text: String(size),
                title: `${homes === 1 ? '1 household' : `${homes} households`} of ${size === 1 ? '1 living sim' : `${size} living sims`}: ${count === 1 ? '1 sim' : `${count} sims`}. The deceased, pets and babies not born yet don't count.`,
                count,
                on: hiAges.has(key),
                toggle: toggleKey(key),
              };
            }),
            'How many living sims their household has. The deceased, pets and babies not born yet don’t count.',
          )}
        {dynasties &&
          row(
            'dynasty',
            'Dynasty',
            HI_DYNASTY.map((r) => {
              const key = hiDynastyChip(r);
              return { key, text: ROLE_CHIP[r].text, title: ROLE_CHIP[r].title, count: cntRole(r), on: hiAges.has(key), toggle: toggleKey(key), data: { 'data-role': r } };
            }),
          )}
        {pets.length > 0 &&
          row(
            'pets',
            'Pets',
            SPECIES_H.map((sp) => ({
              key: sp,
              text: `${SPECIES[sp]} ${sp}`,
              count: cntSpecies(sp),
              on: hiAges.has(sp),
              toggle: toggleKey(sp),
              data: { 'data-species': sp },
            })),
            'Pets add to the sims you pick, as “plus cats”',
          )}
      </div>
    </>
  );
}
