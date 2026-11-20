import { useEffect, useRef, useState } from 'react';
import { Check, Copy } from '../icons.ts';
import { useCompactChrome } from '../hooks/useCompactChrome.ts';
import { copyText } from '../lib/clipboard.ts';
import { DEVELOPER_NAME } from '../lib/credits.ts';
import { CloseButton, IconButton } from './CloseButton.tsx';
import { DeveloperContact } from './DeveloperContact.tsx';

type Props = {
  anchorRect: DOMRect | null;
  /** The report, as copied. */
  text: string;
  /** Whether the copy from the menu worked; null while it is still copying. */
  copied: boolean | null;
  onClose: () => void;
};

/**
 * What the ⋮ menu's "Copy a problem report" did: the report is on the
 * clipboard (or why not), what it holds and what it never holds, all of
 * its text to read, and a button to copy it again. Hangs from the ⋮ as
 * Credits does; a bottom sheet on a phone.
 */
export function ProblemReportPanel({ anchorRect, text, copied, onClose }: Props) {
  const compact = useCompactChrome();
  const [again, setAgain] = useState<boolean | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  if (!compact && !anchorRect) return null;

  const desktopPos = (() => {
    if (compact || !anchorRect) return {};
    const w = 340;
    let left = anchorRect.right - w;
    if (left + w > window.innerWidth - 6) left = window.innerWidth - w - 6;
    if (left < 6) left = 6;
    return { left, top: anchorRect.bottom + 6, width: w };
  })();

  const copyAgain = () => {
    void copyText(text).then((ok) => {
      setAgain(ok);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setAgain(null), 2400);
    });
  };
  const ok = again ?? copied;

  return (
    <div
      id="problem-report"
      className={compact ? 'gpanel report-panel gpanel--sheet' : 'gpanel report-panel'}
      role="dialog"
      aria-labelledby="problem-report-title"
      style={{ display: 'block', ...desktopPos }}
    >
      <div className="gph">
        <b id="problem-report-title">{copied === false ? 'Copy the problem report' : 'Problem report copied'}</b>
        <span>
          <IconButton label={again ? 'Copied' : 'Copy again'} onClick={copyAgain}>
            {again ? <Check aria-hidden="true" weight="bold" /> : <Copy aria-hidden="true" />}
          </IconButton>
          <CloseButton label="Close the problem report" onClick={onClose} />
        </span>
      </div>
      <p className="report-panel__lead" role="status" aria-live="polite">
        {ok === false
          ? 'Your browser didn’t let the board copy it. Select all the text below and copy it, or try the copy button again.'
          : again
            ? `Copied again. Paste it into a message to ${DEVELOPER_NAME}, with a few words on what went wrong.`
            : ok === null
              ? 'Copying.'
              : `It’s on your clipboard. Paste it into a message to ${DEVELOPER_NAME}, the developer, with a few words on what went wrong.`}
      </p>
      <p className="report-panel__note">
        It has no names: not your sims’, households’, lots’ or dynasties’, and none of your notes. Only counts, the
        game’s own world names and numbers, your game settings, your browser and any recent errors. This is all of it:
      </p>
      <pre className="report-panel__text" tabIndex={0} aria-label="The problem report">
        {text}
      </pre>
      <DeveloperContact
        variant="panel"
        heading={`Send it to ${DEVELOPER_NAME}`}
        note="By email, or a message on Threads"
        subject="Family Trees Whiteboard: problem report"
      />
    </div>
  );
}
