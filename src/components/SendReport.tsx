import { useId, useRef, useState } from 'react';
import { Check, Copy } from '../icons.ts';
import { copyText } from '../lib/clipboard.ts';
import { DEVELOPER_NAME } from '../lib/credits.ts';
import { sendReport, type SendResult } from '../lib/sendReport.ts';
import { IconButton } from './CloseButton.tsx';
import { DeveloperContact } from './DeveloperContact.tsx';

type Props = {
  /** The report as it is when the player sends or copies it. */
  report: () => string;
};

type Phase = { at: 'idle' } | { at: 'sending' } | { at: 'sent'; number: number } | { at: 'failed'; why: Extract<SendResult, { ok: false }>['why'] };

const FAILED: Record<Extract<Phase, { at: 'failed' }>['why'], string> = {
  offline: `It couldn’t be sent: your browser seems to be offline. Copy it instead, and send it to ${DEVELOPER_NAME} when you’re back online.`,
  'too-many': 'You’ve sent a few reports in the last few minutes. Copy this one instead, or send it again in a little while.',
  failed: `It couldn’t be sent just now. Copy it instead and send it to ${DEVELOPER_NAME} by email or on Threads, or press Send again later.`,
};

/**
 * Sending a problem report to the developer, the same on the crash screen
 * and in the ⋮ menu's panel: a few words on what the player was doing,
 * Send, and the report's number to quote on Threads. Copying stays for
 * when sending can't, with the developer's email and Threads beside it.
 * Nothing leaves the browser until the player presses Send.
 */
export function SendReport({ report }: Props) {
  const id = useId();
  const [note, setNote] = useState('');
  const [phase, setPhase] = useState<Phase>({ at: 'idle' });
  const [copied, setCopied] = useState<boolean | null>(null);
  const [numberCopied, setNumberCopied] = useState(false);
  const busy = useRef(false);

  const send = () => {
    if (busy.current) return;
    busy.current = true;
    setPhase({ at: 'sending' });
    void sendReport(report(), note).then((r) => {
      busy.current = false;
      setPhase(r.ok ? { at: 'sent', number: r.number } : { at: 'failed', why: r.why });
    });
  };
  // Copied in the click itself: browsers allow it only then.
  const copy = () => void copyText(report()).then(setCopied);

  if (phase.at === 'sent') {
    const code = `report ${phase.number}`;
    return (
      <section className="sendrep" aria-labelledby={`${id}-title`}>
        <p className="sendrep__ok" id={`${id}-title`} role="status">
          <Check aria-hidden="true" weight="bold" />
          Sent to {DEVELOPER_NAME}
        </p>
        <div className="sendrep__code">
          <span>
            <small>Your report’s number</small>
            <b>Report {phase.number}</b>
          </span>
          <IconButton
            label={numberCopied ? 'Copied' : `Copy “${code}”`}
            onClick={() => void copyText(code).then(setNumberCopied)}
          >
            {numberCopied ? <Check aria-hidden="true" weight="bold" /> : <Copy aria-hidden="true" />}
          </IconButton>
        </div>
        <p className="sendrep__fine">
          If you message {DEVELOPER_NAME} on Threads, “{code}” is all you need to write.
        </p>
      </section>
    );
  }

  const sending = phase.at === 'sending';
  const message =
    phase.at === 'failed'
      ? FAILED[phase.why]
      : copied === true
        ? `It’s on your clipboard. Paste it into a message to ${DEVELOPER_NAME}, with a few words on what you were doing.`
        : copied === false
          ? 'Your browser didn’t let the board copy it. Select all of the report and copy it yourself.'
          : sending
            ? 'Sending.'
            : `It goes to ${DEVELOPER_NAME} with what you write above, and nothing is sent until you press Send. It has no names: not your sims’, households’, lots’ or dynasties’, and none of your board’s notes.`;
  return (
    <section className="sendrep" aria-labelledby={`${id}-title`}>
      <b className="sendrep__title" id={`${id}-title`}>
        Send it to {DEVELOPER_NAME}
      </b>
      <label className="sendrep__label" htmlFor={`${id}-note`}>
        What were you doing? <span>(optional)</span>
      </label>
      <textarea
        id={`${id}-note`}
        className="sendrep__note"
        rows={2}
        maxLength={2000}
        value={note}
        placeholder="Linking two sims, then I pressed Undo"
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="sendrep__acts">
        <button type="button" className="sendrep__btn sendrep__btn--main" aria-busy={sending} onClick={send}>
          {sending ? 'Sending' : 'Send the report'}
        </button>
        <button type="button" className="sendrep__btn" onClick={copy}>
          {copied ? 'Copied' : 'Copy it instead'}
        </button>
      </div>
      <p className={phase.at === 'failed' || copied === false ? 'sendrep__fine sendrep__fine--warn' : 'sendrep__fine'} role="status" aria-live="polite">
        {message}
      </p>
      {(phase.at === 'failed' || copied !== null) && (
        <DeveloperContact
          variant="panel"
          heading="Or send it yourself"
          note="By email, or a message on Threads"
          subject="The Sims 4 Family Tree Planner: problem report"
        />
      )}
    </section>
  );
}
