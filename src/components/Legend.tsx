import { useEffect, useLayoutEffect, useState } from 'react';
import type { ReactNode, Ref } from 'react';
import type { DynastyRole, World } from '../types/whiteboard.ts';
import { useCompactChrome } from '../hooks/useCompactChrome.ts';
import { Crown, House, Key, User, X } from '../icons.ts';
import {
  COL,
  DYNASTY_ROLES,
  LINK_STROKE,
  LINK_STROKE_ACROSS,
  NOT_IN_WORLD,
  OTHER_LINK_WIDTH,
  UEDIT,
  linkDash,
  otherLinkDots,
} from '../lib/constants.ts';
import { ALL_KEY_MARKS, type KeyMark } from '../lib/keyMarks.ts';
import type { WorldTotals } from '../lib/worldTag.ts';
import { worldIconUrl } from '../lib/places.ts';
import { DivorcePill, HeartPill, OffPlanMark, RingPill, SecretLoversPill } from './EdgeLayer.tsx';
import { LockGlyph } from './LockGlyph.tsx';
import { UnhousedGlyph } from './UnhousedGlyph.tsx';

/** Width and height of every sample, so the meanings line up in one column. */
const SW = 26;
const SH = 15;

/** A drawn sample of a board mark; its label is read out before the meaning. */
function Sample({
  label,
  viewBox = `0 0 ${SW} ${SH}`,
  children,
}: {
  label: string;
  viewBox?: string;
  children: ReactNode;
}) {
  return (
    <svg className="lgk__svg" viewBox={viewBox} width={SW} height={SH} role="img" aria-label={label}>
      {children}
    </svg>
  );
}

/** A short stretch of family link, as the board draws it (EdgeLayer). */
function LineSample({
  label,
  color = COL.blood,
  across = false,
  dotted = false,
}: {
  label: string;
  color?: string;
  across?: boolean;
  /** Round dots, as the board draws an other link (OTHER_LINK_DOTS). */
  dotted?: boolean;
}) {
  const width = dotted ? OTHER_LINK_WIDTH : across ? LINK_STROKE_ACROSS : LINK_STROKE;
  return (
    <Sample label={label}>
      <line
        x1={dotted ? 4 : 3}
        y1={SH / 2}
        x2={SW - (dotted ? 4 : 3)}
        y2={SH / 2}
        stroke={color}
        strokeWidth={width}
        strokeDasharray={dotted ? otherLinkDots(width) : across ? linkDash(width) : undefined}
        strokeLinecap={across ? 'butt' : 'round'}
      />
    </Sample>
  );
}

/**
 * A family shape in board lines: ┳ parents to children, ⊔, ⊓. `into`: the
 * x of each child's line, which ends in an arrowhead at the bottom, as on
 * the board.
 */
function ShapeSample({ label, d, into = [] }: { label: string; d: string; into?: number[] }) {
  return (
    <Sample label={label}>
      <path d={d} fill="none" stroke={COL.blood} strokeWidth={1.7} strokeLinejoin="round" strokeLinecap="round" />
      {into.map((x) => (
        <polygon key={x} points={`${x},${SH} ${x - 2.6},${SH - 4} ${x + 2.6},${SH - 4}`} fill={COL.blood} />
      ))}
    </Sample>
  );
}

/** A couple's badge on the line between them, drawn by the board's own pills. */
function PillSample({
  label,
  line = COL.marriage,
  children,
}: {
  label: string;
  line?: string;
  children: ReactNode;
}) {
  return (
    <Sample label={label} viewBox="-22 -13 44 26">
      <line x1={-22} y1={0} x2={22} y2={0} stroke={line} strokeWidth={LINK_STROKE} />
      {children}
    </Sample>
  );
}

/** A household colour for the card samples. */
const SAMPLE_HH = '#5b8bd6';

/** A small card: faded for the deceased, violet and dashed for one you added. */
function CardSample({ label, kind }: { label: string; kind: 'dead' | 'added' }) {
  const added = kind === 'added';
  const edge = added ? UEDIT : '#8a94a0';
  return (
    <Sample label={label}>
      <g opacity={added ? 1 : 0.48}>
        <rect
          x={2}
          y={1.5}
          width={20}
          height={12}
          rx={3}
          fill={added ? '#f4efff' : '#fff'}
          stroke={edge}
          strokeWidth={1.3}
          strokeDasharray={added ? '2.6 1.6' : undefined}
        />
        <rect x={2.65} y={2.2} width={2.4} height={10.6} rx={1} fill={edge} />
      </g>
      {added && (
        <>
          <circle cx={21} cy={4} r={4.3} fill={UEDIT} stroke="#fff" strokeWidth={1} />
          <path d="M21 2.2 V5.8 M19.2 4 H22.8" stroke="#fff" strokeWidth={1.2} />
        </>
      )}
    </Sample>
  );
}

/** One row: the sample, then what it means, with a quieter line under it that says more. */
function KeyRow({ sample, label, note }: { sample: ReactNode; label: ReactNode; note?: string }) {
  return (
    <li className="lgk">
      <span className="lgk__sample">{sample}</span>
      <span className="lgk__text">
        {label}
        {note && <span className="lgk__note">{note}</span>}
      </span>
    </li>
  );
}

/** A household or world tag as the board draws it, for the tag counts. */
function TagSample() {
  return (
    <Sample label="Tag">
      <rect x={1.5} y={3} width={23} height={9} rx={4.5} fill="#e9eef4" stroke="#b9c3cf" strokeWidth={1} />
      <circle cx={6.5} cy={7.5} r={1.6} fill="#8a94a0" />
      <rect x={10} y={6.5} width={11} height={2} rx={1} fill="#8a94a0" />
    </Sample>
  );
}

/** Whether the key is open, kept for this browser. */
const KEY_OPEN = 'legend-key-open';

function readKeyOpen(): boolean {
  try {
    const v = localStorage.getItem(KEY_OPEN);
    if (v !== null) return v !== '0';
  } catch {
    // Private mode: decide as on a first visit.
  }
  // A first visit: open while the marks are new, where the window has room for it beside the board.
  return typeof window === 'undefined' || window.innerWidth >= 1100;
}

function keepKeyOpen(open: boolean) {
  try {
    localStorage.setItem(KEY_OPEN, open ? '1' : '0');
  } catch {
    // Private mode: it opens again next time.
  }
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * The board's totals, as two figures above the world list: worlds with
 * sims shown, and households, those in no world included, so they add up
 * to the tags. Under each, what the figure leaves out or takes in.
 */
function WorldTotalsRow({ totals, hidden }: { totals: WorldTotals; hidden: World[] }) {
  const inWorlds = totals.households - totals.outside;
  const worldsNote = hidden.length ? `${hidden.length} hidden` : '';
  const homesNote = totals.outside ? `${totals.outside} in no world` : '';
  return (
    <dl className="lg-totals">
      <div
        title={
          hidden.length
            ? `${plural(totals.worlds, 'world has', 'worlds have')} sims on the board. Filters hide ${hidden.map((w) => w.name).join(' and ')}.`
            : `${plural(totals.worlds, 'world has', 'worlds have')} sims on the board.`
        }
      >
        <dt>{totals.worlds === 1 ? 'world' : 'worlds'}</dt>
        <dd>{totals.worlds}</dd>
        {worldsNote && <dd className="lg-totals__note">{worldsNote}</dd>}
      </div>
      <div
        title={
          totals.outside
            ? `${plural(inWorlds, 'household', 'households')} in worlds and ${totals.outside} not in any world.`
            : `${plural(totals.households, 'household', 'households')} in worlds.`
        }
      >
        <dt>{totals.households === 1 ? 'household' : 'households'}</dt>
        <dd>{totals.households}</dd>
        {homesNote && <dd className="lg-totals__note">{homesNote}</dd>}
      </div>
    </dl>
  );
}

type Props = {
  worlds: World[];
  /** Worlds with at least one sim currently on the board. */
  liveWorlds: Set<string>;
  /** What the world tags add up to: worlds and households shown. */
  totals: WorldTotals;
  /** The marks the board shows now, so the key explains those (keyMarks). */
  marks: ReadonlySet<KeyMark>;
  /** Hide while a filter panel is open so it does not overlap the controls. */
  hidden?: boolean;
  onPickWorld: (world: string) => void;
  ref?: Ref<HTMLDivElement>;
};

/** The plan marks, for "Your plans": violet until a save has them. */
const PLAN_MARKS: KeyMark[] = ['added', 'plannedRole', 'offPlan', 'closing', 'otherLink'];

/**
 * The key: what each board mark means, in four groups (family lines,
 * couples, cards and tags, your plans). The board's grammar always shows;
 * the other marks only when the board has one, with every mark a click
 * away. Every sample is drawn the same size, so the meanings line up.
 */
function KeyPanel({ marks, sheet, onClose }: { marks: ReadonlySet<KeyMark>; sheet: boolean; onClose: () => void }) {
  const [every, setEvery] = useState(false);
  const has = (m: KeyMark) => every || marks.has(m);
  const missing = [...ALL_KEY_MARKS].filter((m) => !marks.has(m)).length;
  const plans = PLAN_MARKS.some(has);
  return (
    <section id="legend-key" className="legend-card legend-key" aria-labelledby="legend-key-h">
      <div className="lgk-head">
        <h3 id="legend-key-h">Key</h3>
        {!sheet && (
          <button type="button" className="lgk-close" aria-label="Close the key" onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        )}
      </div>
      {(missing > 0 || every) && (
        <p className="lgk-scope">
          {every ? 'Every mark the board can show. ' : 'The marks on your board. '}
          <button type="button" className="lgk-scope__toggle" onClick={() => setEvery((e) => !e)}>
            {every ? 'Only the ones on your board' : 'Show every mark'}
          </button>
        </p>
      )}
      <div className="lgk-groups">
        <h4>Family lines</h4>
        {/*
         * Two rules, each shown once: the line's style says where the two
         * live, its colour whether your save has the link yet.
         */}
        <table className="lgk-lines">
          <colgroup>
            <col />
            <col className="lgk-lines__col" />
            <col className="lgk-lines__col" />
          </colgroup>
          <thead>
            <tr>
              <td />
              <th scope="col">Save</th>
              <th scope="col" className="lgk-lines__plan">
                Planned
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Same household</th>
              <td>
                <LineSample label="Solid line, from your save" />
              </td>
              <td>
                <LineSample label="Solid violet line, planned" color={UEDIT} />
              </td>
            </tr>
            <tr>
              <th scope="row">Other household</th>
              <td>
                <LineSample label="Thin dashed line, from your save" across />
              </td>
              <td>
                <LineSample label="Thin dashed violet line, planned" color={UEDIT} across />
              </td>
            </tr>
          </tbody>
        </table>
        <ul>
          <KeyRow
            sample={<ShapeSample label="Fork, arrows to the children" d="M13 1.5 V6 M5 12 V6 H21 V12" into={[5, 21]} />}
            label="Parents to children"
          />
          <KeyRow
            sample={<ShapeSample label="U shape, arrow to the child" d="M5 1.5 V6 H21 V1.5 M13 6 V12" into={[13]} />}
            label="Co-parents"
            note="parents who aren't a couple"
          />
          <KeyRow sample={<ShapeSample label="Bracket" d="M5 13.5 V3 H21 V13.5" />} label="Siblings" />
          {has('secretParent') && (
            <KeyRow
              sample={
                <Sample label="Padlock on a child's line">
                  <line x1={13} y1={0} x2={13} y2={SH} stroke={COL.blood} strokeWidth={LINK_STROKE} />
                  <circle cx={13} cy={SH / 2} r={6} fill="#fff" stroke={`${COL.blood}55`} strokeWidth={1} />
                  <LockGlyph x={13} y={SH / 2} color={COL.blood} size={7} />
                </Sample>
              }
              label="Secret parent"
              note="the family tree doesn't list them"
            />
          )}
        </ul>
        <h4>Couples</h4>
        <ul>
          <KeyRow
            sample={
              <PillSample label="Rings">
                <RingPill x={0} y={0} color={COL.marriage} />
              </PillSample>
            }
            label="Married"
          />
          {has('romance') && (
            <KeyRow
              sample={
                <PillSample label="Heart">
                  <HeartPill x={0} y={0} color={COL.romance} />
                </PillSample>
              }
              label="Romance"
              note="dating, engaged, or an affair"
            />
          )}
          {has('secretLovers') && (
            <KeyRow
              sample={
                <PillSample label="Heart and padlock">
                  <SecretLoversPill x={0} y={0} color={COL.romance} />
                </PillSample>
              }
              label="Secret lovers"
            />
          )}
          {has('divorced') && (
            <KeyRow
              sample={
                <PillSample label="Broken rings">
                  <DivorcePill x={0} y={0} color={COL.marriage} />
                </PillSample>
              }
              label="Divorced"
            />
          )}
        </ul>
        <h4>Cards and tags</h4>
        <ul>
          {has('dynastyRoles') && (
            // The three dynasty marks share a line: one idea, three values.
            <li className="lgk lgk--marks" aria-label="Dynasty marks: crown head, fleur-de-lis heir, wilted rose outcast">
              {(Object.keys(DYNASTY_ROLES) as DynastyRole[]).map((r) => (
                <span key={r} className="lgk__mark" aria-hidden="true">
                  <span className="lgk__emoji">{DYNASTY_ROLES[r].mark}</span>
                  {DYNASTY_ROLES[r].noun}
                </span>
              ))}
            </li>
          )}
          {has('deceased') && <KeyRow sample={<CardSample label="Faded card" kind="dead" />} label="Deceased" />}
          {has('fromSave') && (
            <KeyRow
              sample={
                <Sample label="S badge">
                  <circle cx={13} cy={SH / 2} r={6} fill={SAMPLE_HH} stroke="#fff" strokeWidth={1} />
                  <text x={13} y={SH / 2 + 3} fontSize={8} fontWeight={700} textAnchor="middle" fill="#fff">
                    S
                  </text>
                </Sample>
              }
              label="From your save"
              note="not on the original roster"
            />
          )}
          {has('pets') && (
            <KeyRow
              sample={
                <Sample label="Two cards with a dashed line between">
                  <rect x={1} y={1.5} width={8} height={12} rx={2} fill="#fff" stroke="#8a94a0" strokeWidth={1.1} />
                  <line x1={13} y1={0.5} x2={13} y2={SH - 0.5} stroke={SAMPLE_HH} strokeWidth={1.3} strokeDasharray="1.5 2" />
                  <rect x={17} y={1.5} width={8} height={12} rx={2} fill="#fff" stroke="#8a94a0" strokeWidth={1.1} />
                </Sample>
              }
              label="Pets and horses"
              note="in a lane of their own, right of the dashed line"
            />
          )}
          <KeyRow
            sample={<TagSample />}
            label={
              <span className="lgk__counts">
                Tags count <User weight="fill" aria-label="sims" /> <House weight="fill" aria-label="households" />{' '}
                <Crown weight="fill" aria-label="dynasties" />
              </span>
            }
            note="sims, households and dynasties"
          />
          {has('unhoused') && (
            <KeyRow
              sample={
                <Sample label="Unhoused mark" viewBox="-13 -7.5 26 15">
                  <UnhousedGlyph x={0} y={0} color="#697380" />
                </Sample>
              }
              label="Unhoused sims"
              note="townies the game made as you played"
            />
          )}
          {has('freeLots') && (
            <KeyRow
              sample={
                <Sample label="A faded lot tile with a dashed edge">
                  <rect x={1} y={2} width={SW - 2} height={SH - 4} rx={3} fill="#fbfcfe" stroke="#8a94a0" strokeWidth={1.1} strokeDasharray="2 1.6" />
                  <circle cx={6} cy={SH / 2} r={2.6} fill="#b8c2cd" />
                  <rect x={10.5} y={SH / 2 - 2.2} width={SW - 15} height={1.6} rx={0.8} fill="#8a94a0" />
                  <rect x={10.5} y={SH / 2 + 1} width={SW - 19} height={1.3} rx={0.65} fill="#b8c2cd" />
                </Sample>
              }
              label="Free lots"
              note="no one lives there: click one to move sims in"
            />
          )}
        </ul>
        <h4 className="lgk__plans">Your plans</h4>
        <p className="lgk__lead">Violet means not in your save yet.</p>
        {plans ? (
          <ul>
            {has('added') && <KeyRow sample={<CardSample label="Violet dashed card" kind="added" />} label="A sim you added" />}
            {has('plannedRole') && (
              <KeyRow
                sample={
                  <span className="lgk__emoji lgk__emoji--planned" aria-label="Faded crown">
                    {DYNASTY_ROLES.head.mark}
                  </span>
                }
                label="A dynasty role you set"
                note="faded until your save has it"
              />
            )}
            {has('offPlan') && (
              <KeyRow
                sample={
                  <PillSample label="Couple badge with an amber ring" line={UEDIT}>
                    <RingPill x={0} y={0} color={UEDIT} />
                    <OffPlanMark x={0} y={0} />
                  </PillSample>
                }
                label="⚠ Off plan"
                note="your game went another way"
              />
            )}
            {has('closing') && (
              <KeyRow
                sample={
                  <span className="lgk__badge" aria-label="Amber badge on a household tag">
                    ⏳ 1
                  </span>
                }
                label="Closing"
                note="a planned couple running out of time for babies: its plan says whom to play"
              />
            )}
            {has('otherLink') && (
              <KeyRow
                sample={<LineSample label="Violet dotted line" color={UEDIT} dotted />}
                label="Other link, not family"
                note="one you drew with Connect"
              />
            )}
          </ul>
        ) : (
          <p className="lgk__empty">Nothing planned yet. Add a sim, or Connect two sims, and it shows violet until your save has it.</p>
        )}
      </div>
    </section>
  );
}

export function Legend({ worlds, liveWorlds, totals, marks, hidden, onPickWorld, ref }: Props) {
  const compact = useCompactChrome();
  const [expanded, setExpanded] = useState(!compact);
  const [keyOpen, setKeyOpen] = useState(readKeyOpen);

  useEffect(() => {
    if (compact) setExpanded(false);
  }, [compact]);

  // How much of the stage's right side the corner takes (world list, and the
  // key when open), as --legend-inset: the board's centred controls (zoom,
  // status, selection) centre on the rest, so the key never covers them.
  useLayoutEffect(() => {
    const el = document.getElementById('legend');
    const stage = el?.parentElement;
    if (!el || !stage || compact) return;
    const set = () =>
      stage.style.setProperty('--legend-inset', `${Math.max(0, Math.round(stage.getBoundingClientRect().right - el.getBoundingClientRect().left))}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    ro.observe(stage);
    return () => {
      ro.disconnect();
      stage.style.removeProperty('--legend-inset');
    };
  }, [compact, hidden, keyOpen]);

  if (hidden) return null;

  if (compact && !expanded) {
    return (
      <button
        type="button"
        className="legend-chip"
        aria-expanded={false}
        onClick={() => setExpanded(true)}
      >
        Legend
      </button>
    );
  }

  const toggleKey = (open: boolean) => {
    setKeyOpen(open);
    keepKeyOpen(open);
  };
  const keyPanel = keyOpen && <KeyPanel marks={marks} sheet={compact} onClose={() => toggleKey(false)} />;

  return (
    <div
      id="legend"
      ref={ref}
      className={compact ? 'legend--sheet' : undefined}
    >
      {compact && (
        <button
          type="button"
          className="legend-close"
          aria-label="Close legend"
          onClick={() => setExpanded(false)}
        >
          Close
        </button>
      )}
      {/* Beside the world list on a wide screen, so the list stays in view; under it on a phone. */}
      {!compact && keyPanel}
      <div className="legend-col">
        <section
          className="legend-card legend-card--worlds"
          aria-labelledby="legend-worlds-h"
        >
          <h3 id="legend-worlds-h">Worlds</h3>
          <WorldTotalsRow totals={totals} hidden={worlds.filter((w) => w.name !== NOT_IN_WORLD && !liveWorlds.has(w.name))} />
          <div className="legend-card__body">
            {worlds.map((w) => {
              const live = liveWorlds.has(w.name);
              return (
                <button
                  key={w.name}
                  type="button"
                  className="lg lg--world"
                  /* Nothing to frame when the world's sims are all filtered out. */
                  disabled={!live}
                  title={
                    live
                      ? `Zoom to ${w.name}`
                      : `${w.name}: hidden, its game is switched off`
                  }
                  onClick={() => onPickWorld(w.name)}
                >
                  {worldIconUrl(w.name) ? (
                    // The world's picture in a ring of its colour, so the colour
                    // still keys its frame on the board.
                    <span className="lg__world" style={{ borderColor: w.color }}>
                      <img src={worldIconUrl(w.name)} alt="" width={16} height={16} />
                    </span>
                  ) : (
                    // No picture (Not in any world): the
                    // same ring, left blank inside.
                    <span className="lg__world lg__world--blank" style={{ borderColor: w.color }} aria-hidden="true" />
                  )}
                  {w.name}
                </button>
              );
            })}
          </div>
        </section>
        {/* Needed while you learn the marks, in the way once you know them. */}
        <button
          type="button"
          className="legend-keybtn"
          aria-expanded={keyOpen}
          aria-controls="legend-key"
          onClick={() => toggleKey(!keyOpen)}
        >
          <Key aria-hidden="true" />
          <span className="legend-keybtn__label">Key</span>
          <span className="legend-keybtn__what">what the marks mean</span>
        </button>
      </div>
      {compact && keyPanel}
    </div>
  );
}
