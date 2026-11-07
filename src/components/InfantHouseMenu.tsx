import { useFitMenuInStage } from '../hooks/useFitMenuInStage.ts';

/** One answer: the household the baby lives in, and the last name it takes there. */
export type InfantHouseChoice = {
  gid: string;
  sur: string;
  label: string;
};

type Props = {
  left: number;
  top: number;
  /** "Where will the baby live?" or "Which last name will the baby have?" */
  question: string;
  options: InfantHouseChoice[];
  onPick: (gid: string, sur: string) => void;
  onCancel: () => void;
};

export function InfantHouseMenu({
  left,
  top,
  question,
  options,
  onPick,
  onCancel,
}: Props) {
  const { compact, ref, style } = useFitMenuInStage(left, top);
  return (
    <div
      ref={ref}
      id="menu"
      className={compact ? 'menu menu--sheet' : 'menu'}
      role="dialog"
      aria-label={question}
      style={style}
    >
      <div style={{ fontSize: 10, color: '#889', padding: '2px 4px' }}>{question}</div>
      {options.map((o) => (
        <button key={`${o.gid}|${o.sur}`} type="button" onClick={() => onPick(o.gid, o.sur)}>
          {o.label}
        </button>
      ))}
      <button type="button" style={{ color: '#b00' }} onClick={onCancel}>
        ✕ cancel
      </button>
    </div>
  );
}
