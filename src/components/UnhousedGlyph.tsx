/**
 * A house struck through, centred on (x, y), about `size` px across — marks
 * the Unhoused sims box (townies the game generated, with no home lot).
 */
export function UnhousedGlyph({
  x,
  y,
  color,
  size = 12,
}: {
  x: number;
  y: number;
  color: string;
  size?: number;
}) {
  return (
    <g transform={`translate(${x} ${y}) scale(${size / 12})`}>
      <path
        d="M-4.6 -0.6 L0 -4.8 L4.6 -0.6 V4.8 H-4.6 Z"
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      <path d="M-5.6 -5.6 L5.6 5.6" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
    </g>
  );
}
