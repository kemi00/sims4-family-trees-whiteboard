import { memo } from 'react';
import { CARD_H, COL, OCC, SPECIES, UEDIT } from '../lib/constants.ts';
import { cardDetailLine } from '../lib/layout.ts';
import { isUserE, isHighlightMatch } from '../lib/utils.ts';
import type { SimNode } from '../types/whiteboard.ts';

type Props = {
  node: SimNode;
  selected: boolean;
  /** Soft highlight when this card is inside a selected world/household. */
  groupSelected?: boolean;
  connectHighlight: boolean;
  searchHit: boolean;
  searchCurrent: boolean;
  hiAges: Set<string>;
  hiSingle: boolean;
  partneredIds: Set<string>;
  bloodlineIds: Set<string> | null;
  onPointerDown: (e: React.PointerEvent, n: SimNode) => void;
};

export const SimNodeView = memo(function SimNodeView({
  node: n,
  selected,
  groupSelected = false,
  connectHighlight,
  searchHit,
  searchCurrent,
  hiAges,
  hiSingle,
  partneredIds,
  bloodlineIds,
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
    !highlighting || isHighlightMatch(n, hiAges, hiSingle, partneredIds);
  const bloodMatch = !bloodlineIds || bloodlineIds.has(n.id);
  const dim = (highlighting || !!bloodlineIds) && !(ageMatch && bloodMatch);
  const ageClass = highlighting && ageMatch && bloodMatch ? 'agehl' : dim ? 'agedim' : '';
  const searchClass = searchCurrent
    ? 'searchcur'
    : searchHit
      ? 'searchhit'
      : '';
  const detail = cardDetailLine(n);
  const h = n.h || CARD_H;

  return (
    <g
      className={`node ${ageClass} ${searchClass} ${selected ? 'sel' : ''} ${groupSelected && !selected ? 'msel' : ''}`}
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
      <text x={16} y={32} fontSize={13} fontWeight={700} fill="#1b2b3a">
        {n.first} {n.sur}
      </text>
      <text x={16} y={52} fontSize={10.5} fill="#5b6472">
        {n.age}
        {n.gender && n.gender !== '-' ? ` · ${n.gender}` : ''}
        {n.species ? ` · ${n.species}` : ''}
      </text>
      {detail ? (
        <text x={16} y={72} fontSize={10.5} fill="#697380">
          {detail}
        </text>
      ) : null}
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
          <text
            x={n.w - 15}
            y={19}
            fontSize={11}
            textAnchor="middle"
          >
            {speciesBadge ?? stateBadge}
          </text>
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
        </>
      )}
      {fromSave && (
        <g
          transform={`translate(${hasBadge || added ? n.w - 38 : n.w - 15}, 15)`}
        >
          <circle r={8} fill={n.color} stroke="#fff" strokeWidth={1.3} />
          <text
            y={4}
            fontSize={10}
            fontWeight={700}
            textAnchor="middle"
            fill="#fff"
          >
            S
          </text>
        </g>
      )}
    </g>
  );
});

export { COL, isUserE };
