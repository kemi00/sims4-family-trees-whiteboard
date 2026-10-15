/** Padlock centred on (x, y), about `size` px tall — marks a secret on the board. */
export function LockGlyph({
  x,
  y,
  color,
  size = 10,
}: {
  x: number;
  y: number;
  color: string;
  size?: number;
}) {
  return (
    <g transform={`translate(${x} ${y}) scale(${size / 10})`}>
      <path
        d="M-2.6 -0.5 V-2.4 A2.6 2.6 0 0 1 2.6 -2.4 V-0.5"
        fill="none"
        stroke={color}
        strokeWidth={1.7}
      />
      <rect x={-4} y={-0.8} width={8} height={5.8} rx={1.4} fill={color} />
    </g>
  );
}

/** The same padlock inline in text (legend rows, menus). */
export function InlineLock({ color }: { color: string }) {
  return (
    <svg
      viewBox="-6 -6 12 12"
      aria-hidden="true"
      style={{ width: 12, height: 12, display: 'inline-block', flex: '0 0 auto' }}
    >
      <LockGlyph x={0} y={0.4} color={color} size={10} />
    </svg>
  );
}
