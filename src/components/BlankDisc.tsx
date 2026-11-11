/** Id of the light hatch a blank disc is filled with (defined once on the stage). */
export const BLANK_HATCH_ID = 'blankHatch';

/** The hatch itself, for the stage's <defs>. */
export function BlankHatchPattern() {
  return (
    <pattern id={BLANK_HATCH_ID} width={4} height={4} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width={4} height={4} style={{ fill: 'var(--chrome)' }} />
      <line x1={0} y1={0} x2={0} y2={4} strokeWidth={1.2} style={{ stroke: 'var(--rule)' }} />
    </pattern>
  );
}

/**
 * A place with no picture of its own (Bellacorde, Verdemar, Gibbi Point's
 * neighbourhoods): the same circle as a picture, left blank inside, in a
 * ring of `color`, as the Worlds list draws a world with none.
 */
export function BlankDisc({ cx, cy, r, color }: { cx: number; cy: number; r: number; color: string }) {
  return <circle cx={cx} cy={cy} r={r - 0.8} fill={`url(#${BLANK_HATCH_ID})`} stroke={color} strokeWidth={1.6} />;
}
