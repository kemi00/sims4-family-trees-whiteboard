import { X } from '@phosphor-icons/react/X';
import { useEffect, useMemo, useRef } from 'react';
import { formatDay, groupByDay, type ChangelogEntry } from '../lib/changelog.ts';
import { REPO_URL } from '../lib/credits.ts';

type Props = {
  entries: ChangelogEntry[];
  onClose: () => void;
};

/**
 * What shipped, newest day first. Opens from the ⋮ menu and, for a visitor
 * with entries they have not read yet, once on load.
 *
 * A centred dialog rather than a popover like {@link CreditsPanel}: it has to
 * open on load, when there is no menu button to anchor to.
 */
export function DevUpdatesDialog({ entries, onClose }: Props) {
  const days = useMemo(() => groupByDay(entries), [entries]);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  return (
    <div
      className="devlog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="devlog-title"
      onClick={onClose}
    >
      <div className="devlog__card" onClick={(e) => e.stopPropagation()}>
        <div className="devlog__head">
          <h2 id="devlog-title">Developer updates</h2>
          <button
            ref={closeRef}
            type="button"
            aria-label="Close developer updates"
            onClick={onClose}
          >
            <X aria-hidden="true" />
          </button>
        </div>
        <p className="devlog__lead">
          Everything that has changed on the board, newest first.
        </p>
        <div className="devlog__scroll">
          {days.map((day) => (
            <section key={day.date} className="devlog__day">
              <h3 className="devlog__date">{formatDay(day.date)}</h3>
              <ul className="devlog__list">
                {day.entries.map((e) => (
                  <li key={e.sha} className="devlog__item">
                    <span>{e.text}</span>{' '}
                    <a
                      className="devlog__sha"
                      href={`${REPO_URL}/commit/${e.sha}`}
                      target="_blank"
                      rel="noreferrer"
                      title="View this change on GitHub"
                    >
                      {e.sha}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {!days.length && (
            <p className="devlog__empty">No updates logged yet.</p>
          )}
        </div>
        <div className="devlog__actions">
          <button type="button" className="devlog__ok" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
