import { useEffect, useMemo, useRef, useState } from 'react';
import { DownloadSimple } from '../icons.ts';
import { editionHasNews, gazetteEdition, type Article, type GazetteEdition } from '../lib/gazette.ts';
import { drawGazette } from '../lib/gazetteDraw.ts';
import { STICKERS, stickerUrl } from '../lib/gazetteStickers.ts';
import type { ChronicleEntry } from '../lib/chronicle.ts';
import type { Edge, PlannerCalendar, SaveGameInfo, SimNode } from '../types/whiteboard.ts';
import { CloseButton } from './CloseButton.tsx';
import { useGameNames } from '../hooks/useGameNames.ts';

function Sticker({ kind, tilt }: { kind: string; tilt: number }) {
  const url = stickerUrl(kind);
  if (!url) return null;
  return <img className="gz__sticker" src={url} alt={STICKERS[kind]} title={STICKERS[kind]} style={{ transform: `rotate(${tilt}deg)` }} />;
}

/** A slight, steady tilt for each sticker: as if pressed on by hand. */
const tiltOf = (i: number) => [-6, 4, -3, 7, -5, 3][i % 6]!;

function Story({ a, i, big, onFind }: { a: Article; i: number; big?: boolean; onFind: (ids: string[]) => void }) {
  return (
    <article className={big ? 'gz__story gz__story--lead' : 'gz__story'}>
      {a.kind !== 'society' && <Sticker kind={a.kind} tilt={tiltOf(i)} />}
      <h3 className="gz__headline">
        <button type="button" title="Show them on the board" onClick={() => onFind(a.ids)}>
          {a.headline}
        </button>
      </h3>
      <p className="gz__body">{a.body}</p>
    </article>
  );
}

/**
 * The story as a newspaper: each save upload an edition, the biggest news on
 * the front page (scandals, royal and star weddings, tragic deaths, new
 * heads and titles), then columns for society, births, birthdays and
 * obituaries. Stickers are the game's own moodlets. Download it as an
 * image to share; made on this device.
 */
export function GazetteDialog({
  chronicle,
  nodes,
  edges,
  saveGame,
  calendar,
  world,
  onFind,
  onClose,
}: {
  chronicle: readonly ChronicleEntry[];
  nodes: readonly SimNode[];
  edges: readonly Edge[];
  saveGame?: SaveGameInfo | null;
  calendar?: PlannerCalendar | null;
  world?: string;
  onFind: (ids: string[]) => void;
  onClose: () => void;
}) {
  // The game's words for how they died ("Fire"), once loaded.
  const { names } = useGameNames();
  const deathName = useMemo(() => (names?.deaths ? (id: string) => names.deaths![id] : undefined), [names]);
  const editions = useMemo(
    () =>
      chronicle
        .map((entry, i) => gazetteEdition({ entry, number: i + 1, nodes, edges, saveGame, calendar, ...(world ? { world } : {}), ...(deathName ? { deathName } : {}) }))
        .filter(editionHasNews)
        .reverse(),
    [chronicle, nodes, edges, saveGame, calendar, world, deathName],
  );
  const [at, setAt] = useState(0);
  const e: GazetteEdition | undefined = editions[at];
  const closeRef = useRef<HTMLButtonElement>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  const download = async () => {
    if (!e) return;
    setSaving(true);
    try {
      const blob = await drawGazette(e, (kind) => stickerUrl(kind));
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `gazette-edition-${e.number}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="gz"
      role="dialog"
      aria-modal="true"
      aria-labelledby="gz-title"
      onClick={onClose}
      onKeyDown={(ev) => {
        if (ev.key !== 'Escape') return;
        ev.stopPropagation();
        onClose();
      }}
    >
      <div className="gz__frame" onClick={(ev) => ev.stopPropagation()}>
        <div className="gz__bar">
          {editions.length > 1 ? (
            <select className="gz__pick" aria-label="Edition" value={at} onChange={(ev) => setAt(Number(ev.target.value))}>
              {editions.map((ed, i) => (
                <option key={ed.number} value={i}>{`Edition ${ed.number} · ${ed.dateline}${i === 0 ? ' · latest' : ''}`}</option>
              ))}
            </select>
          ) : (
            <span className="gz__pickone">{e ? `Edition ${e.number} · ${e.dateline}` : 'The Gazette'}</span>
          )}
          <button type="button" className="poster__btn poster__btn--go" disabled={!e || saving} onClick={() => void download()}>
            <DownloadSimple aria-hidden="true" /> {saving ? 'Making the image' : 'Image'}
          </button>
          <CloseButton ref={closeRef} label="Close the gazette" onClick={onClose} />
        </div>
        <div className="gz__paper">
          {e ? (
            <>
              <header className="gz__mast">
                <p className="gz__meta">
                  <span>{`No. ${e.number}`}</span>
                  <span>{e.dateline}</span>
                  <span>§1</span>
                </p>
                <h2 id="gz-title" className="gz__title">
                  {e.title}
                </h2>
                <p className="gz__motto">All the news fit to print, from your save</p>
              </header>
              {e.lead && <Story a={e.lead} i={0} big onFind={onFind} />}
              {e.front.length > 0 && (
                <div className="gz__front">
                  {e.front.map((a, i) => (
                    <Story key={i} a={a} i={i + 1} onFind={onFind} />
                  ))}
                </div>
              )}
              <div className="gz__columns">
                {e.columns.map((c) => (
                  <section key={c.title} className="gz__column">
                    <h3 className="gz__coltitle">{c.title}</h3>
                    {c.articles.map((a, i) => (
                      <div key={i} className="gz__item">
                        <button type="button" className="gz__itemhead" title="Show them on the board" onClick={() => onFind(a.ids)}>
                          {a.headline}
                        </button>
                        <p className="gz__itembody">{a.body}</p>
                      </div>
                    ))}
                  </section>
                ))}
              </div>
              <p className="gz__foot">Printed from your board on this device. Stickers are the game’s own moodlets.</p>
            </>
          ) : (
            <p className="gz__empty" id="gz-title">
              No news yet. Each save you upload is an edition: upload a newer save and the Gazette prints what happened.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
