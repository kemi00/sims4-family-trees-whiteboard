import { ArrowsDownUp, X } from '../icons.ts';
import { useMemo, useState } from 'react';
import { CONNECTION_LOG_PANEL_W } from '../lib/constants.ts';
import { panelPosition } from '../lib/chrome.ts';
import { useCompactChrome } from '../hooks/useCompactChrome.ts';
import {
  connectionLogRows,
  relDisplay,
  sortConnectionLog,
  type ConnectionLogEntry,
  type LogPart,
} from '../lib/connectionLog.ts';

type Props = {
  entries: ConnectionLogEntry[];
  anchorRect: DOMRect | null;
  selectedSimId: string | null;
  isSelLink: (ids: string[]) => boolean;
  onPick: (entry: ConnectionLogEntry) => void;
  onFocusSim: (id: string) => void;
  onClose: () => void;
};

function LogParts({
  parts,
  createdAt,
  onFocusSim,
}: {
  parts: LogPart[];
  createdAt?: string;
  onFocusSim: (id: string) => void;
}) {
  return parts.map((part, i) => {
    if (part.kind === 'time') {
      return (
        <time
          key={i}
          className="connection-log__time"
          dateTime={createdAt}
        >
          {part.value}
        </time>
      );
    }
    if (part.kind === 'break') {
      return <br key={i} />;
    }
    if (part.kind === 'sim') {
      return (
        <button
          key={i}
          type="button"
          className="connection-log__sim"
          title={`Show ${part.name} on the board`}
          onClick={(e) => {
            e.stopPropagation();
            onFocusSim(part.id);
          }}
        >
          {part.name}
        </button>
      );
    }
    if (part.kind === 'rel') {
      return (
        <strong key={i} className="connection-log__rel">
          {relDisplay(part.mark, part.label)}
        </strong>
      );
    }
    return <span key={i}>{part.value}</span>;
  });
}

export function ConnectionLogPanel({
  entries,
  anchorRect,
  selectedSimId,
  isSelLink,
  onPick,
  onFocusSim,
  onClose,
}: Props) {
  const compact = useCompactChrome();
  const pos = panelPosition(anchorRect, CONNECTION_LOG_PANEL_W);
  const [newestFirst, setNewestFirst] = useState(true);
  const [origin, setOrigin] = useState<'all' | 'planned' | 'save'>('all');
  const filtered = useMemo(
    () =>
      origin === 'all'
        ? entries
        : entries.filter((e) => (e.origin ?? 'planned') === origin),
    [entries, origin],
  );
  const rows = useMemo(
    () => connectionLogRows(sortConnectionLog(filtered, newestFirst)),
    [filtered, newestFirst],
  );
  if (!pos) return null;

  const sortLabel = newestFirst
    ? 'Newest first. Click for oldest first.'
    : 'Oldest first. Click for newest first.';

  return (
    <div
      id="connection-log"
      className={
        compact
          ? 'gpanel connection-log gpanel--sheet'
          : 'gpanel connection-log'
      }
      style={{ display: 'block', ...pos }}
    >
      <div className="gph">
        <b>Your connections</b>
        <span>
          <button
            type="button"
            title={sortLabel}
            aria-label={sortLabel}
            aria-pressed={newestFirst}
            disabled={entries.length < 2}
            onClick={() => setNewestFirst((on) => !on)}
          >
            <ArrowsDownUp aria-hidden="true" />
          </button>
          <button type="button" aria-label="Close connection log" onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </span>
      </div>
      <div className="connection-log__filters" role="tablist" aria-label="Log source">
        {(
          [
            ['all', 'All'],
            ['planned', 'Planned'],
            ['save', 'In save'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={origin === id}
            className={
              origin === id
                ? 'connection-log__filter connection-log__filter--on'
                : 'connection-log__filter'
            }
            onClick={() => setOrigin(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {entries.length === 0 ? (
        <p className="connection-log__empty">
          Planned links you add with Connect, and links confirmed by a save,
          show up here. Original roster links stay off this list.
        </p>
      ) : filtered.length === 0 ? (
        <p className="connection-log__empty">No connections in this filter.</p>
      ) : (
        <ul className="connection-log__list">
          {rows.map((row, i) => {
            if (row.kind === 'day') {
              return (
                <li key={row.key} className="connection-log__day">
                  <time dateTime={row.day}>{row.day}</time>
                </li>
              );
            }
            const { entry } = row;
            const selected = entry.edgeIds.length
              ? isSelLink(entry.edgeIds)
              : !!entry.simId && entry.simId === selectedSimId;
            let stripe = 0;
            for (let j = i - 1; j >= 0; j--) {
              if (rows[j]!.kind === 'day') break;
              stripe++;
            }
            const classes = ['connection-log__item'];
            if (stripe % 2 === 1) classes.push('connection-log__item--alt');
            if (selected) classes.push('connection-log__item--on');
            const tag = entry.origin === 'save' ? 'in save' : 'planned';
            return (
              <li key={row.key}>
                <div
                  className={classes.join(' ')}
                  aria-current={selected ? 'true' : undefined}
                  onClick={() => onPick(entry)}
                >
                  <span
                    className={
                      entry.origin === 'save'
                        ? 'connection-log__tag connection-log__tag--save'
                        : 'connection-log__tag connection-log__tag--planned'
                    }
                  >
                    {tag}
                  </span>
                  <LogParts
                    parts={entry.parts}
                    createdAt={entry.createdAt}
                    onFocusSim={onFocusSim}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
