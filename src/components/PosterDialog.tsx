import { useEffect, useMemo, useRef, useState } from 'react';
import { CloseButton } from './CloseButton.tsx';
import { DownloadSimple, ShareNetwork } from '../icons.ts';
import type { PosterModel } from '../lib/poster.ts';
import { drawPoster } from '../lib/posterDraw.ts';

type Props = {
  model: PosterModel;
  onClose: () => void;
};

/**
 * A household's or a dynasty's poster, to keep or share: the picture
 * first, so you see what you'd send, then Download, and Share where the
 * device can (a phone's share sheet). Made on this device; nothing is
 * uploaded.
 */
export function PosterDialog({ model, onClose }: Props) {
  /** With its story from the chronicle, when it has one. */
  const [withStory, setWithStory] = useState(false);
  const drawn = useMemo(() => (withStory ? model : { ...model, story: undefined }), [model, withStory]);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const fileName = `${model.slug}-poster.png`;

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    let alive = true;
    let made: string | null = null;
    drawPoster(drawn)
      .then((b) => {
        if (!alive) return;
        made = URL.createObjectURL(b);
        setBlob(b);
        setUrl(made);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [drawn]);

  const file = blob ? new File([blob], fileName, { type: 'image/png' }) : null;
  const canShare = !!file && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });

  const download = () => {
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
  };
  const share = () => {
    if (!file) return;
    navigator.share({ files: [file], title: model.title }).catch(() => {
      // Closed the share sheet: nothing to do.
    });
  };

  return (
    <div
      className="poster"
      role="dialog"
      aria-modal="true"
      aria-labelledby="poster-title"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return;
        e.stopPropagation();
        onClose();
      }}
    >
      <div className="poster__card" onClick={(e) => e.stopPropagation()}>
        <div className="poster__head">
          <h2 id="poster-title">Poster: {model.title}</h2>
          <CloseButton ref={closeRef} label="Close the poster" onClick={onClose} />
        </div>
        <div className="poster__view">
          {url ? (
            <img src={url} alt={`${model.title}: ${model.rows.reduce((s, r) => s + r.cards.length, 0)} sims`} />
          ) : (
            <p className="poster__wait" role="status">
              {failed ? 'This browser couldn’t draw the poster.' : 'Drawing the poster'}
            </p>
          )}
        </div>
        {!!model.story?.length && (
          <label className="poster__opt">
            <input type="checkbox" checked={withStory} onChange={(e) => setWithStory(e.target.checked)} />
            Add its story so far: {model.story.length === 1 ? '1 moment' : `${model.story.length} moments`} from your saves
          </label>
        )}
        <p className="poster__lead">Made on this device from your board: nothing is uploaded.</p>
        <div className="poster__acts">
          {canShare && (
            <button type="button" className="poster__btn" onClick={share}>
              <ShareNetwork aria-hidden="true" /> Share
            </button>
          )}
          <button type="button" className="poster__btn poster__btn--go" disabled={!url} onClick={download}>
            <DownloadSimple aria-hidden="true" /> Download PNG
          </button>
        </div>
      </div>
    </div>
  );
}
