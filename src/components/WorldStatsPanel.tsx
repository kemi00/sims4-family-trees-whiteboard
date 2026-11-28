import { useMemo } from 'react';
import { worldIconUrl } from '../lib/places.ts';
import { STAT_STAGES, boardStats, worldStats, type WorldStats } from '../lib/worldStats.ts';
import { NOT_IN_WORLD } from '../lib/constants.ts';
import type { SimNode } from '../types/whiteboard.ts';
import { BarPanel } from './BarPanel.tsx';

/**
 * Life stages, youngest lightest: one blue, light to dark, each step a
 * visible change (validated as an ordinal ramp on the panel's white).
 */
const STAGE_COLORS: Record<string, string> = {
  Infant: '#86b6ef',
  Toddler: '#719fd8',
  Child: '#5c89c1',
  Teen: '#4874ab',
  'Young Adult': '#345f95',
  Adult: '#214a80',
  Elder: '#0d366b',
};

const STAGE_PLURAL: Record<string, string> = {
  Infant: 'Infants',
  Toddler: 'Toddlers',
  Child: 'Children',
  Teen: 'Teens',
  'Young Adult': 'Young adults',
  Adult: 'Adults',
  Elder: 'Elders',
};

const GENDER_WORDS: Record<string, string> = {
  Female: 'female',
  Male: 'male',
  'Non-Binary': 'non-binary',
  '': 'gender not set',
};

const plural = (n: number, one: string, many: string) => `${n.toLocaleString()} ${n === 1 ? one : many}`;
const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);

/** A world's population by life stage: a thin bar, one part a stage, and the stages named with their counts below. */
function StageBar({ s, label }: { s: WorldStats; label: string }) {
  const parts = STAT_STAGES.filter((st) => (s.byStage[st] ?? 0) > 0);
  // Stages the board doesn't count by (a stage left unset) go under Other.
  const other = s.sims - parts.reduce((sum, st) => sum + s.byStage[st]!, 0);
  if (!s.sims) return null;
  const said = [...parts.map((st) => `${STAGE_PLURAL[st]} ${s.byStage[st]}`), ...(other ? [`Other ${other}`] : [])].join(', ');
  return (
    <>
      <span className="wstats__bar" role="img" aria-label={`${label} by life stage: ${said}`}>
        {parts.map((st) => (
          <span
            key={st}
            className="wstats__part"
            style={{ flexGrow: s.byStage[st], background: STAGE_COLORS[st] }}
            title={`${STAGE_PLURAL[st]}: ${s.byStage[st]} (${pct(s.byStage[st]!, s.sims)}%)`}
          />
        ))}
        {other > 0 && <span className="wstats__part" style={{ flexGrow: other, background: '#b8c2ce' }} title={`Other: ${other}`} />}
      </span>
      <ul className="wstats__legend" aria-hidden="true">
        {parts.map((st) => (
          <li key={st}>
            <span className="wstats__swatch" style={{ background: STAGE_COLORS[st] }} />
            <span>{`${STAGE_PLURAL[st]} ${s.byStage[st]}`}</span>
          </li>
        ))}
        {other > 0 && (
          <li>
            <span className="wstats__swatch" style={{ background: '#b8c2ce' }} />
            <span>{`Other ${other}`}</span>
          </li>
        )}
      </ul>
    </>
  );
}

function StatsCard({ s, title, onFind }: { s: WorldStats; title: string; onFind?: () => void }) {
  const icon = s.world && s.world !== NOT_IN_WORLD ? worldIconUrl(s.world) : undefined;
  const genders = Object.entries(s.byGender)
    .sort((a, b) => b[1] - a[1])
    .map(([g, n]) => `${n.toLocaleString()} ${GENDER_WORDS[g] ?? g.toLowerCase()}`);
  const more = [
    plural(s.households, 'household', 'households'),
    s.world === NOT_IN_WORLD ? '' : plural(s.freeLots, 'free lot', 'free lots'),
    s.pets ? plural(s.pets, 'pet', 'pets') : '',
    s.remembered ? `${s.remembered.toLocaleString()} passed away` : '',
    s.planned ? `${s.planned.toLocaleString()} planned` : '',
  ].filter(Boolean);
  return (
    <li className="wstats__card">
      <div className="wstats__head">
        {icon && <img className="wstats__icon" src={icon} alt="" width={24} height={24} />}
        {onFind ? (
          <button type="button" className="wstats__name" title="Show this world on the board" onClick={onFind}>
            {title}
          </button>
        ) : (
          <span className="wstats__name">{title}</span>
        )}
        <span className="wstats__count">{plural(s.sims, 'sim', 'sims')}</span>
      </div>
      <StageBar s={s} label={title} />
      {genders.length > 0 && <p className="wstats__line">{genders.join(' · ')}</p>}
      <p className="wstats__line wstats__line--quiet">{more.join(' · ')}</p>
    </li>
  );
}

/**
 * The board's worlds in numbers: each world's living sims by life stage and
 * gender, its households and free lots, its pets, the dead it remembers and
 * its plans, with the whole board first. It counts what the board shows, so
 * the Filters apply.
 */
export function WorldStatsPanel({
  nodes,
  freeLots,
  order,
  onClose,
  onFindWorld,
}: {
  /** The cards the board shows. */
  nodes: readonly SimNode[];
  freeLots: ReadonlyMap<string, readonly unknown[]>;
  /** The Legend's order of worlds. */
  order: readonly string[];
  onClose: () => void;
  onFindWorld: (world: string) => void;
}) {
  const list = useMemo(() => worldStats(nodes, freeLots, order), [nodes, freeLots, order]);
  const all = useMemo(() => boardStats(list), [list]);
  const worlds = list.filter((s) => s.world !== NOT_IN_WORLD).length;
  return (
    <BarPanel
      id="world-stats"
      className="gpanel wstats"
      title="Worlds in numbers"
      description={`${plural(all.sims, 'sim', 'sims')} in ${plural(worlds, 'world', 'worlds')}, as the board shows them`}
      onClose={onClose}
    >
      <ul className="wstats__list">
        <StatsCard s={all} title="The whole board" />
        {list.map((s) => (
          <StatsCard key={s.world} s={s} title={s.world} onFind={() => onFindWorld(s.world)} />
        ))}
      </ul>
      <p className="wstats__foot">Counts follow the Filters. Free lots are those no household on the board lives on.</p>
    </BarPanel>
  );
}
