import { useEffect, useState } from 'react';
import type { Ref } from 'react';
import type { World } from '../types/whiteboard.ts';
import { useCompactChrome } from '../hooks/useCompactChrome.ts';

type Props = {
  worlds: World[];
  /** Worlds with at least one sim currently on the board. */
  liveWorlds: Set<string>;
  onPickWorld: (world: string) => void;
  ref?: Ref<HTMLDivElement>;
};

export function Legend({ worlds, liveWorlds, onPickWorld, ref }: Props) {
  const compact = useCompactChrome();
  const [expanded, setExpanded] = useState(!compact);

  useEffect(() => {
    if (compact) setExpanded(false);
  }, [compact]);

  if (compact && !expanded) {
    return (
      <button
        type="button"
        className="legend-chip"
        aria-expanded={false}
        onClick={() => setExpanded(true)}
      >
        Legend
      </button>
    );
  }

  return (
    <div
      id="legend"
      ref={ref}
      className={compact ? 'legend--sheet' : undefined}
    >
      {compact && (
        <button
          type="button"
          className="legend-close"
          aria-label="Close legend"
          onClick={() => setExpanded(false)}
        >
          Close
        </button>
      )}
      <section
        className="legend-card legend-card--worlds"
        aria-labelledby="legend-worlds-h"
      >
        <h3 id="legend-worlds-h">Worlds</h3>
        <div className="legend-card__body">
          {worlds.map((w) => {
            const live = liveWorlds.has(w.name);
            return (
              <button
                key={w.name}
                type="button"
                className="lg lg--world"
                /* Nothing to frame when the world's sims are all filtered out. */
                disabled={!live}
                title={
                  live
                    ? `Zoom to ${w.name}`
                    : `${w.name} — hidden, its game is switched off`
                }
                onClick={() => onPickWorld(w.name)}
              >
                <i style={{ background: w.color }} />
                {w.name}
              </button>
            );
          })}
        </div>
      </section>
      <section
        className="legend-card legend-card--links"
        aria-labelledby="legend-links-h"
      >
        <h3 id="legend-links-h">Links</h3>
        <div className="lg">
          <span style={{ fontSize: 13, lineHeight: 1, color: '#3f4756' }}>⊥</span>{' '}
          parent → child
        </div>
        <div className="lg">
          <span style={{ fontSize: 12, lineHeight: 1 }}>⊓</span> siblings
        </div>
        <div className="lg">
          <span style={{ fontSize: 13, lineHeight: 1, color: '#e0365f' }}>❤</span>{' '}
          romance / partners (dating, engaged, affair)
        </div>
        <div className="lg">
          <span style={{ fontSize: 13, lineHeight: 1 }}>⚭</span> married
        </div>
        <div className="lg">
          <span style={{ fontSize: 13, lineHeight: 1, color: '#7c3aed' }}>⚮</span>{' '}
          divorced
        </div>
        <div className="lg lg--notes">
          <span className="lg__swatch" aria-hidden="true" />
          <span>
            <b style={{ color: '#7c3aed' }}>violet</b> = planned, not in the save
            yet
            <br />
            <span style={{ color: '#8a7f63' }}>
              gray canon colours = in the save, or original roster links
            </span>
            <br />
            <span style={{ color: '#5b6472' }}>
              <b>S</b> on a card = in your save, not on the original spreadsheet
              <br />＋ / violet dash = you added on the board, not in the save yet
            </span>
          </span>
        </div>
      </section>
    </div>
  );
}
