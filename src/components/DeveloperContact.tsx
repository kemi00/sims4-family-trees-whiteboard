import { EnvelopeSimple, ThreadsLogo } from '../icons.ts';
import {
  CONTACT_EMAIL,
  CONTACT_THREADS,
  CONTACT_THREADS_URL,
  DEVELOPER_NAME,
  contactMailto,
  developerPictureUrl,
} from '../lib/credits.ts';

type Props = {
  /** In the ⋮ menu (its links are menu items), or at the foot of a panel. */
  variant: 'menu' | 'panel';
  /** The first line, beside the picture: "Contact kemi". */
  heading: string;
  /** A line under it: what to write about. */
  note?: string;
  /** The email's subject. */
  subject?: string;
  /** A link was followed: the menu closes. */
  onPick?: () => void;
};

/**
 * How to reach the developer, the same wherever it shows: their picture
 * and name, their email and Threads. The ⋮ menu's Contact and the problem
 * report's foot.
 */
export function DeveloperContact({ variant, heading, note, subject, onPick }: Props) {
  const role = variant === 'menu' ? 'menuitem' : undefined;
  return (
    <div className={`devcontact devcontact--${variant}`} role="group" aria-label={`Contact ${DEVELOPER_NAME}`}>
      <div className="devcontact__head">
        <img className="devcontact__pic" src={developerPictureUrl()} alt="" width={32} height={32} />
        <span className="devcontact__who">
          {heading}
          {note && <small>{note}</small>}
        </span>
      </div>
      <a
        role={role}
        className="devcontact__link"
        href={contactMailto(subject)}
        title={`Email ${DEVELOPER_NAME}: ${CONTACT_EMAIL}`}
        onClick={onPick}
      >
        <EnvelopeSimple aria-hidden="true" />
        <span>{CONTACT_EMAIL}</span>
      </a>
      <a
        role={role}
        className="devcontact__link"
        href={CONTACT_THREADS_URL}
        target="_blank"
        rel="noreferrer"
        title={`${DEVELOPER_NAME} on Threads (opens in a new tab)`}
        onClick={onPick}
      >
        <ThreadsLogo aria-hidden="true" />
        <span>
          {CONTACT_THREADS} <span className="devcontact__where">on Threads</span>
        </span>
      </a>
    </div>
  );
}
