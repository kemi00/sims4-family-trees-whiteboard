import { memo } from 'react';
import { CARD_H, CARD_MIN_W, COL, DECEASED_STATE, DYNASTY_ROLES, OCC, PILL_H, SPECIES, UEDIT } from '../lib/constants.ts';
import { dynastyPhrase } from '../lib/generations.ts';
import { cardDetailLine } from '../lib/layout.ts';
import { textWidth } from '../lib/textWidth.ts';
import { isUserE, isHighlightMatch } from '../lib/utils.ts';
import { NOT_YET_AGE, cardName, isPlannedSim } from '../lib/plan.ts';
import type { SimNode } from '../types/whiteboard.ts';

type Props = {
  node: SimNode;
  selected: boolean;
  /** Soft highlight when this card is inside a selected world/household. */
  groupSelected?: boolean;
  /** False when zoomed out far enough that card type would be sub-pixel. */
  labels: boolean;
  connectHighlight: boolean;
  searchHit: boolean;
  searchCurrent: boolean;
  hiAges: Set<string>;
  hiSingle: boolean;
  partneredIds: Set<string>;
  /** Sims with a child, for the No children highlight. */
  parentIds: Set<string>;
  /** Planned babies, for the Not born yet highlight. */
  unbornIds: Set<string>;
  bloodlineIds: Set<string> | null;
  /** A highlighted family (familyOf): they glow, everyone else dims. */
  familyIds?: Set<string> | null;
  /** Their dynasty generation ("Gen 2"), added to the dynasty mark's hover. */
  generation?: string;
  /** Why their plan is off track ("Off plan: Beatrice married Adekoya…"): a ⚠ before the name. */
  offPlan?: string;
  /** A planned sim not in the game yet: "Not born yet" in place of the life stage. */
  notYet?: string;
  /**
   * An unnamed planned child's parents (parentsLines, longest first), on
   * the card's last line so planned siblings and cousins tell apart.
   */
  parents?: { lines: string[]; title: string };
  /**
   * A ＋ on the card's foot, as a couple has under its ring: a child of this
   * sim alone, a new sim (a planned baby) or one to adopt (ChildMenu).
   * Shown on hover and while the card is selected.
   */
  babyPlus?: boolean;
  /**
   * A ♥ on each side of the card, where a couple's line meets it: it plans
   * a partner (married, romance, secret lovers, divorced). Shown on hover
   * and while the card is selected, as the ＋ below is.
   */
  partnerPlus?: boolean;
  /**
   * "Travis’s line" when another dynasty has the same name as theirs: the
   * last line then reads "Scott dynasty (Travis’s line)".
   */
  dynastyTag?: string;
  /** Why their dynasty could die out ("no heir"): "at risk" follows the dynasty on the last line. */
  dynastyRisk?: string;
  onPointerDown: (e: React.PointerEvent, n: SimNode) => void;
};

/** A piece of a card's last line; `dyn` marks the dynasty, styled by its plan, and `risk` its warning. */
type Part = { text: string; dyn?: true; risk?: true };

/**
 * The first line (of parts) that fits `room`, else the last with its end
 * cut short with an ellipsis.
 */
function fitParts(lines: Part[][], room: number): Part[] {
  const width = (ps: Part[]) => textWidth(ps.map((p) => p.text).join(''), 10.5, 400);
  for (const line of lines) if (width(line) <= room) return line;
  const last = (lines[lines.length - 1] ?? []).map((p) => ({ ...p }));
  const tail = last[last.length - 1];
  if (!tail) return last;
  while (tail.text.length > 1 && width(last) > room) tail.text = tail.text.slice(0, -1);
  tail.text = `${tail.text.trimEnd()}…`;
  return last;
}

export const SimNodeView = memo(function SimNodeView({
  node: n,
  selected,
  groupSelected = false,
  labels,
  connectHighlight,
  searchHit,
  searchCurrent,
  hiAges,
  hiSingle,
  partneredIds,
  parentIds,
  unbornIds,
  bloodlineIds,
  familyIds = null,
  generation,
  offPlan,
  notYet,
  parents,
  babyPlus = false,
  partnerPlus = false,
  dynastyTag,
  dynastyRisk,
  onPointerDown,
}: Props) {
  const added = !!n.added;
  const fromSave = !!n.fromSave && !added;
  const fill = added ? '#f4efff' : '#ffffff';
  const bcol = added ? UEDIT : n.color;
  const speciesBadge = n.species ? SPECIES[n.species] : null;
  const stateBadge =
    !speciesBadge && n.state && n.state !== 'Sim' && OCC[n.state]
      ? OCC[n.state]
      : null;
  const hasBadge = !!(speciesBadge || stateBadge);
  const highlighting = hiAges.size > 0 || hiSingle;
  const ageMatch =
    !highlighting || isHighlightMatch(n, hiAges, hiSingle, { partnered: partneredIds, parents: parentIds, unborn: unbornIds });
  const bloodMatch = !bloodlineIds || bloodlineIds.has(n.id);
  const familyMatch = !familyIds || familyIds.has(n.id);
  const match = ageMatch && bloodMatch && familyMatch;
  const dim = (highlighting || !!bloodlineIds || !!familyIds) && !match;
  const ageClass = (highlighting || !!familyIds) && match ? 'agehl' : dim ? 'agedim' : '';
  const searchClass = searchCurrent
    ? 'searchcur'
    : searchHit
      ? 'searchhit'
      : '';
  const detail = cardDetailLine(n);
  const h = n.h || CARD_H;
  const role = n.dynastyRole ? DYNASTY_ROLES[n.dynastyRole] : null;
  const name = `${offPlan ? '⚠ ' : ''}${role ? role.mark + ' ' : ''}${cardName(n)}`;
  const stage = isPlannedSim(n) && n.age === NOT_YET_AGE && notYet ? notYet : n.age;
  // The name stops short of the corner badges; a long one (a crown and
  // "Anne-Shirley Cuthbert") is set a little smaller rather than run under them.
  const corner = fromSave && (hasBadge || added) ? 48 : hasBadge || added || fromSave ? 27 : 10;
  const room = (n.w || CARD_MIN_W) - 16 - corner;
  const wide = labels ? textWidth(name, 13, 700) : 0;
  const nameSize = wide > room ? Math.max(10, Math.floor((13 * room) / wide * 2) / 2) : 13;
  /** "Scott dynasty", or "Scott dynasty (Travis’s line)" for one of two Scotts. */
  const phrase = n.dynasty ? dynastyPhrase({ name: n.dynasty, ...(dynastyTag ? { tag: dynastyTag } : {}) }) : '';
  const roleText = role ? (phrase ? `${role.noun} of the ${phrase}` : role.label) : '';
  // One planned to leave keeps the game's role until they do.
  const rolePlanned = n.dynastyPlan === 'member' || n.dynastyPlan === 'role';
  // A role planned on the board: its mark shows faded, like a plan not in the game yet.
  const roleTitle = role
    ? `${rolePlanned ? `Planned ${roleText.charAt(0).toLowerCase()}${roleText.slice(1)}: not in your save yet` : roleText}${generation ? ` · ${generation}` : ''}`
    : null;
  /**
   * The dynasty they are in, on the last line beside how they play (or an
   * unnamed planned baby's parents): faded while only planned, crossed out
   * while planned to leave. Nothing for a sim in none. Where the line is
   * short of room, the dynasty is kept over "Resident"; a planned baby's
   * parents are kept over the dynasty, as they tell planned siblings apart.
   * One of two dynasties of a name keeps its founder's tag over the word
   * "dynasty": "Scott (Travis’s line)".
   */
  const dyn: Part | null = phrase && !n.species ? { text: phrase, dyn: true } : null;
  const dynShort: Part | null = dyn && dynastyTag ? { text: `${n.dynasty} (${dynastyTag})`, dyn: true } : null;
  const dynTitle = !dyn
    ? ''
    : `${
        n.dynastyPlan === 'member'
          ? `Planned into the ${phrase}: not in your save yet`
          : n.dynastyPlan === 'none'
            ? `Planned to leave the ${phrase}: your save still has them in it`
            : `In the ${phrase}`
      }${dynastyRisk ? `\nThe ${phrase} is at risk: ${dynastyRisk}` : ''}`;
  const sep: Part = { text: ' · ' };
  const dyns = [dyn, dynShort].filter((p): p is Part => !!p);
  /**
   * A dynasty at risk says so after its name, kept over "Resident" (as the
   * dynasty is), and given up only when the dynasty alone doesn't fit.
   */
  const risk: Part[] = dynastyRisk && dyn ? [sep, { text: 'at risk', risk: true }] : [];
  const lines: Part[][] = parents
    ? [
        ...dyns.flatMap((d) => parents.lines.map((l) => [{ text: l }, sep, d])),
        ...parents.lines.map((l) => [{ text: l }]),
      ]
    : detail
      ? dyns.length
        ? [...dyns.map((d) => [{ text: detail }, sep, d]), ...dyns.map((d) => [d])]
        : [[{ text: detail }]]
      : dyns.map((d) => [d]);
  const lastLines: Part[][] = risk.length
    ? [...lines.filter((l) => l.some((p) => p.dyn)).map((l) => [...l, ...risk]), ...lines]
    : lines;
  const lastTitle = [parents?.title, dynTitle].filter(Boolean).join('\n');

  return (
    <g
      className={`node ${ageClass} ${searchClass} ${selected ? 'sel' : ''} ${groupSelected && !selected ? 'msel' : ''}${n.state === DECEASED_STATE ? ' dead' : ''}`}
      data-id={n.id}
      transform={`translate(${n.x},${n.y})`}
      onPointerDown={(e) => onPointerDown(e, n)}
    >
      <rect
        x={0}
        y={0}
        width={n.w}
        height={h}
        rx={11}
        fill={fill}
        stroke={connectHighlight ? '#1b6cd6' : bcol}
        strokeWidth={2.4}
        strokeDasharray={added ? '5 3' : undefined}
        style={{ cursor: 'grab' }}
      />
      <rect
        x={0}
        y={0}
        width={7}
        height={h}
        fill={bcol}
        clipPath="url(#tagclip)"
      />
      {labels && (
        <>
          <text
            x={16}
            y={32}
            fontSize={nameSize}
            fontWeight={700}
            fill="#1b2b3a"
            fontStyle={isPlannedSim(n) && !n.first.trim() ? 'italic' : undefined}
          >
            {(roleTitle || offPlan) && <title>{[offPlan, roleTitle].filter(Boolean).join('\n')}</title>}
            {offPlan && <tspan fill="#b45309">⚠ </tspan>}
            {role && <tspan fillOpacity={rolePlanned ? 0.4 : undefined}>{role.mark} </tspan>}
            {cardName(n)}
          </text>
          <text x={16} y={52} fontSize={10.5} fill="#5b6472">
            {stage}
            {n.gender && n.gender !== '-' ? ` · ${n.gender}` : ''}
            {n.species ? ` · ${n.species}` : ''}
          </text>
          {lastLines.length > 0 && (
            <text x={16} y={72} fontSize={10.5} fill="#697380">
              {lastTitle && <title>{lastTitle}</title>}
              {fitParts(lastLines, (n.w || CARD_MIN_W) - 16 - 30).map((p, i) =>
                p.risk ? (
                  <tspan key={i} fill="#b45309" fontWeight={600}>
                    {p.text}
                  </tspan>
                ) : p.dyn ? (
                  <tspan
                    key={i}
                    fill="#3b4757"
                    fillOpacity={n.dynastyPlan === 'member' || n.dynastyPlan === 'none' ? 0.5 : undefined}
                    textDecoration={n.dynastyPlan === 'none' ? 'line-through' : undefined}
                  >
                    {p.text}
                  </tspan>
                ) : (
                  <tspan key={i}>{p.text}</tspan>
                ),
              )}
            </text>
          )}
        </>
      )}
      {hasBadge && (
        <>
          <circle
            cx={n.w - 15}
            cy={15}
            r={10}
            fill="#fff"
            stroke={n.color}
            strokeWidth={1.4}
          />
          {labels && (
            <text
              x={n.w - 15}
              y={19}
              fontSize={11}
              textAnchor="middle"
            >
              {speciesBadge ?? stateBadge}
            </text>
          )}
        </>
      )}
      {added && !hasBadge && (
        <>
          <circle
            cx={n.w - 15}
            cy={15}
            r={10}
            fill={UEDIT}
            stroke="#fff"
            strokeWidth={1.4}
          />
          {labels && (
            <text
              x={n.w - 15}
              y={19.5}
              fontSize={13}
              fontWeight={700}
              textAnchor="middle"
              fill="#fff"
            >
              ＋
            </text>
          )}
        </>
      )}
      {/* ⠇ says the card has more to it: one click opens its editor (see
          WhiteboardStage), where double-clicking the card is easy to miss.
          Drawn only with the text, like Age up, so it is never a blank spot. */}
      {labels && (
        <g className="node__more" transform={`translate(${n.w - 17},${h - 17})`}>
          <title>Edit or move this sim</title>
          <circle className="node__more-bg" r={11} />
          {[-5, 0, 5].map((dy) => (
            <circle key={dy} cy={dy} r={1.7} />
          ))}
        </g>
      )}
      {/* Where a child's line leaves the card, so it reads as "a child
          below"; the same ＋ as a couple's. Clicked through WhiteboardStage. */}
      {labels && babyPlus && (
        <g className="node__baby" transform={`translate(${(n.w || CARD_MIN_W) / 2},${h})`}>
          <title>Add a child of {cardName(n)}: a new sim, or one to adopt</title>
          <circle r={PILL_H / 2} fill={UEDIT} stroke="#fff" strokeWidth={1.4} />
          <text y={4.5} fontSize={13} fontWeight={700} textAnchor="middle" fill="#fff">
            ＋
          </text>
        </g>
      )}
      {/* Couples' lines meet a card at its sides, children's at its foot:
          the ♥ on either side plans a partner. Clicked through WhiteboardStage. */}
      {labels &&
        partnerPlus &&
        (['left', 'right'] as const).map((side) => (
          <g
            key={side}
            className="node__partner"
            data-side={side}
            transform={`translate(${side === 'left' ? 0 : n.w || CARD_MIN_W},${h / 2})`}
          >
            <title>Plan a partner for {cardName(n)}</title>
            <circle r={PILL_H / 2} fill={UEDIT} stroke="#fff" strokeWidth={1.4} />
            <text y={4} fontSize={11} fontWeight={700} textAnchor="middle" fill="#fff">
              ♥
            </text>
          </g>
        ))}
      {fromSave && (
        <g
          transform={`translate(${hasBadge || added ? n.w - 38 : n.w - 15}, 15)`}
        >
          <circle r={8} fill={n.color} stroke="#fff" strokeWidth={1.3} />
          {labels && (
            <text
              y={4}
              fontSize={10}
              fontWeight={700}
              textAnchor="middle"
              fill="#fff"
            >
              S
            </text>
          )}
        </g>
      )}
    </g>
  );
});

export { COL, isUserE };
