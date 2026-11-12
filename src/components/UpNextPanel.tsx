import { BarPanel } from './BarPanel.tsx';
import { upNextReason, type UpNextRow } from '../lib/householdPlan.ts';
import type { Group } from '../types/whiteboard.ts';

type Props = {
  rows: UpNextRow[];
  groups: Group[];
  nameOf: (id: string) => string;
  /** "the Munch household". */
  hhOf: (gid: string) => string;
  onClose: () => void;
  onOpen: (row: UpNextRow) => void;
  onSkip: (gid: string, skip: boolean) => void;
};

/** "Gen 2 · you played them last". */
function metaText(r: UpNextRow): string {
  const parts: string[] = [];
  if (r.gen !== undefined) parts.push(`Gen ${r.gen}`);
  if (r.playedAgo === 0) parts.push('you played them last');
  if (r.skipped) parts.push('skipped until your next save import');
  return parts.join(' · ');
}

/**
 * A suggested order to play households in, for when you'd rather be
 * handed a plan than pick by mood: only households where playing does
 * something, each with why it is where it is. It never changes the board.
 */
export function UpNextPanel({ rows, groups, nameOf, hhOf, onClose, onOpen, onSkip }: Props) {
  // The suggestion is the first household you can play now.
  const first = rows.findIndex((r) => !r.skipped && !r.notInGame);
  return (
    <BarPanel
      id="upnext"
      className="gpanel upnext"
      title="Up next"
      description="A suggested order to play your households in"
      onClose={onClose}
    >
      {!rows.length ? (
        <p className="upnext__empty">
          Nothing to suggest yet. Plan a couple or a baby, and the households with something to do show up here.
        </p>
      ) : (
        <ol className="upnext__list">
          {rows.map((r, i) => {
            const g = groups.find((x) => x.gid === r.gid);
            const meta = metaText(r);
            return (
              <li
                key={r.gid}
                className={
                  r.skipped ? 'upnext__row upnext__row--skipped' : r.notInGame ? 'upnext__row upnext__row--away' : 'upnext__row'
                }
              >
                <div className="upnext__top">
                  <span className="upnext__n">{i + 1}</span>
                  <span className="brief__dot" style={{ background: g?.color ?? '#697380' }} aria-hidden />
                  <b className="upnext__hh">{g?.hh ?? hhOf(r.gid)}</b>
                  {i === first && <span className="upnext__next">Next</span>}
                </div>
                <p className={r.closing && !r.notInGame ? 'upnext__why upnext__why--closing' : 'upnext__why'}>
                  {r.closing && !r.notInGame && <span aria-hidden="true">⏳ </span>}
                  {upNextReason(r, nameOf, hhOf)}
                </p>
                {meta && <p className="upnext__meta">{meta}</p>}
                <div className="upnext__actions">
                  <button type="button" className="upnext__open" onClick={() => onOpen(r)}>
                    Open plan
                  </button>
                  <button type="button" className="upnext__skip" onClick={() => onSkip(r.gid, !r.skipped)}>
                    {r.skipped ? 'Bring back' : 'Skip for now'}
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <p className="upnext__rules">
        A couple running out of time for babies comes first: playing there grows up the one still too young before
        the other turns Elder. Then plays that help other households’ plans, an elder short on days, the most ready,
        the oldest generation, and whoever you played longest ago. Households not in your game yet come last. It only
        suggests: play who you like.
      </p>
    </BarPanel>
  );
}
