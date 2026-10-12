import { useFitMenuInStage } from '../hooks/useFitMenuInStage.ts';

type Props = {
  aName: string;
  bName: string;
  left: number;
  top: number;
  /** Hide sibling option when both sims already share parents on the board. */
  hideSibling?: boolean;
  /** Why a parent/child option is off — it would make a sim their own ancestor. */
  blocked?: Partial<Record<'parent' | 'childof', string>>;
  onConfirm: (type: string) => void;
  onCancel: () => void;
};

const OPTIONS: [string, string][] = [
  ['marriage', '⚭ Marriage'],
  ['romance', '❤ Romance / partners'],
  ['divorced', '⚮ Divorced'],
  ['parent', '┳ parent → child'],
  ['childof', '┻ child of'],
  ['sibling', '⊓ Siblings'],
  ['custom', '➖ Other link'],
];

function labelFor(ty: string, aName: string, bName: string, lab: string) {
  if (ty === 'parent') return `┳ ${aName} is the parent of ${bName}`;
  if (ty === 'childof') return `┻ ${aName} is the child of ${bName}`;
  return lab;
}

export function ConnectMenu({
  aName,
  bName,
  left,
  top,
  hideSibling,
  blocked,
  onConfirm,
  onCancel,
}: Props) {
  const { compact, ref, style } = useFitMenuInStage(left, top);
  const options = hideSibling
    ? OPTIONS.filter(([ty]) => ty !== 'sibling')
    : OPTIONS;
  return (
    <div
      ref={ref}
      id="menu"
      className={compact ? 'menu menu--sheet' : 'menu'}
      role="dialog"
      aria-label={`Link ${aName} and ${bName}`}
      style={style}
    >
      <div style={{ fontSize: 10, color: '#889', padding: '2px 4px' }}>
        {aName} ↔ {bName}
      </div>
      {options.map(([ty, lab]) => {
        const why = blocked?.[ty as 'parent' | 'childof'];
        return (
          <button
            key={ty}
            type="button"
            disabled={!!why}
            onClick={() => onConfirm(ty)}
          >
            {labelFor(ty, aName, bName, lab)}
            {why && <span className="menu__why">{why}</span>}
          </button>
        );
      })}
      <button type="button" style={{ color: '#b00' }} onClick={onCancel}>
        ✕ cancel
      </button>
    </div>
  );
}
