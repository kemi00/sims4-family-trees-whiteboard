import { SheetGrabber } from './SheetGrabber.tsx';
import { CloseButton } from './CloseButton.tsx';
import { useFitMenuInStage } from '../hooks/useFitMenuInStage.ts';
import { useLightDismiss } from '../hooks/useLightDismiss.ts';
import type { HomeChoice, HomePlace } from '../lib/whereTheyLive.ts';
import { WherePicker } from './WherePicker.tsx';
import { NOT_IN_WORLD } from '../lib/constants.ts';

type Props = {
  x: number;
  y: number;
  /** Who moves: "Planned Sim", or "3 sims". */
  who: string;
  /** How many move, for how full each household would be. */
  count: number;
  places: readonly HomePlace[];
  /** The box's world, whose places come first. */
  inView: string | null;
  limit: number | null;
  onPick: (to: HomeChoice) => void;
  onClose: () => void;
};

/** A Needs a home box's "Choose a home": the same picker as the bar's Add asks with. */
export function HomeMenu({ x, y, who, count, places, inView, limit, onPick, onClose }: Props) {
  const { compact, ref, style, sheet } = useFitMenuInStage(x, y);
  useLightDismiss(ref, onClose);
  return (
    <div
      ref={ref}
      id="menu"
      className={compact ? 'menu menu--sheet pmenu' : 'menu pmenu'}
      role="dialog"
      aria-label={`Where will ${who} live?`}
      style={style}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return;
        e.stopPropagation();
        onClose();
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <SheetGrabber sheet={sheet} what="the menu" />
      <div className="pmenu__head">
        <b>Where will they live?</b>
        <CloseButton label="Close" onClick={onClose} />
      </div>
      <p className="addmenu__who">{who}</p>
      <WherePicker places={places} inView={inView} limit={limit} adding={count} undecided={inView !== NOT_IN_WORLD} onPick={onPick} />
    </div>
  );
}
