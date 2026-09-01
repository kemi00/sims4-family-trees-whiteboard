import { X } from '../icons.ts';
import { useCompactChrome } from '../hooks/useCompactChrome.ts';
import {
  EA_FAN_CONTENT_URL,
  REPO_URL,
  ROSTER_CREDIT,
  SIMS_WIKI_URL,
  SITE_URL,
} from '../lib/credits.ts';

type Props = {
  anchorRect: DOMRect | null;
  onClose: () => void;
};

export function CreditsPanel({ anchorRect, onClose }: Props) {
  const compact = useCompactChrome();
  if (!compact && !anchorRect) return null;

  const desktopPos = (() => {
    if (compact || !anchorRect) return {};
    const w = 300;
    let left = anchorRect.right - w;
    if (left + w > window.innerWidth - 6) left = window.innerWidth - w - 6;
    if (left < 6) left = 6;
    return { left, top: anchorRect.bottom + 6, width: w };
  })();

  return (
    <div
      id="credits"
      className={compact ? 'gpanel credits-panel gpanel--sheet' : 'gpanel credits-panel'}
      style={{
        display: 'block',
        ...desktopPos,
      }}
    >
      <div className="gph">
        <b>Credits</b>
        <button type="button" aria-label="Close credits" onClick={onClose}>
          <X aria-hidden="true" />
        </button>
      </div>
      <p className="credits-panel__lead">
        The pre-made sim roster on this board comes from{' '}
        <a href={ROSTER_CREDIT.profileUrl} target="_blank" rel="noreferrer">
          u/{ROSTER_CREDIT.author}
        </a>
        , who shared a comprehensive list of premade Sims 4 sims (and portraits)
        on r/Sims4.
      </p>
      <ul className="credits-panel__links">
        <li>
          <a href={SITE_URL} target="_blank" rel="noreferrer">
            Live site
          </a>
        </li>
        <li>
          <a href={REPO_URL} target="_blank" rel="noreferrer">
            GitHub repo
          </a>
        </li>
        <li>
          <a href={ROSTER_CREDIT.postUrl} target="_blank" rel="noreferrer">
            Reddit post
          </a>
        </li>
        <li>
          <a href={ROSTER_CREDIT.driveUrl} target="_blank" rel="noreferrer">
            Google Drive folder
          </a>
        </li>
        <li>
          <a href={ROSTER_CREDIT.profileUrl} target="_blank" rel="noreferrer">
            u/{ROSTER_CREDIT.author}
          </a>
        </li>
      </ul>
      <p className="credits-panel__note">
        Sim names and base roster data come from u/{ROSTER_CREDIT.author}.
        Links between sims were sourced from in-game relationships (packs I
        own) and{' '}
        <a href={SIMS_WIKI_URL} target="_blank" rel="noreferrer">
          The Sims Wiki
        </a>{' '}
        (packs I don&apos;t). Board layout and app code are original to{' '}
        <a href={REPO_URL} target="_blank" rel="noreferrer">
          this project
        </a>{' '}
        (MIT). Bundled sim data is not MIT-licensed. Non-commercial fan
        project; not affiliated with EA — see{' '}
        <a href={EA_FAN_CONTENT_URL} target="_blank" rel="noreferrer">
          EA Fan Content Guidelines
        </a>
        .
      </p>
    </div>
  );
}
