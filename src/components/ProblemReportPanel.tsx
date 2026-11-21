import { useRef } from 'react';
import { useSheet } from '../hooks/useSheet.ts';
import { SheetGrabber } from './SheetGrabber.tsx';
import { useCompactChrome } from '../hooks/useCompactChrome.ts';
import { CloseButton } from './CloseButton.tsx';
import { SendReport } from './SendReport.tsx';

type Props = {
  anchorRect: DOMRect | null;
  /** The report, made when the panel opened. */
  text: string;
  onClose: () => void;
};

/**
 * The ⋮ menu's "Send a problem report": a few words and Send (or copy it,
 * SendReport, as on the crash screen), then all of the report's text, so
 * the player sees what goes. Hangs from the ⋮ as Credits does; a bottom
 * sheet on a phone.
 */
export function ProblemReportPanel({ anchorRect, text, onClose }: Props) {
  const compact = useCompactChrome();
  const ref = useRef<HTMLDivElement>(null);
  const drawer = useSheet(ref, { enabled: compact, head: '.gph' });
  if (!compact && !anchorRect) return null;

  const desktopPos = (() => {
    if (compact || !anchorRect) return {};
    const w = 340;
    let left = anchorRect.right - w;
    if (left + w > window.innerWidth - 6) left = window.innerWidth - w - 6;
    if (left < 6) left = 6;
    return { left, top: anchorRect.bottom + 6, width: w };
  })();

  return (
    <div
      ref={ref}
      id="problem-report"
      className={compact ? 'gpanel report-panel gpanel--sheet' : 'gpanel report-panel'}
      role="dialog"
      aria-labelledby="problem-report-title"
      style={{ display: 'block', ...desktopPos }}
    >
      <SheetGrabber sheet={drawer} what="the problem report" />
      <div className="gph">
        <b id="problem-report-title">Send a problem report</b>
        <CloseButton label="Close the problem report" onClick={onClose} />
      </div>
      <SendReport report={() => text} />
      <p className="report-panel__note">
        The report holds only counts, the game’s own world names and numbers, your game settings, your browser and
        any recent errors. This is all of it:
      </p>
      <pre className="report-panel__text" tabIndex={0} aria-label="The problem report">
        {text}
      </pre>
    </div>
  );
}
