import { useRef, useState } from 'react';

/**
 * A sim's photo, in the editor: add one from a picture file (a screenshot
 * from Create a Sim works well), change it, or remove it. It is kept in this
 * browser only (photos.ts), at once, outside Undo; removing asks first.
 */
export function SimPhoto({
  url,
  name,
  onPick,
  onRemove,
}: {
  url?: string;
  name: string;
  onPick: (file: File) => Promise<void>;
  onRemove: () => Promise<void>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [asking, setAsking] = useState(false);
  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setFailed(false);
    try {
      await onPick(file);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };
  return (
    <section className="edphoto" aria-labelledby="edPhotoHead">
      <div className="edlabel">
        <span className="edlabel__text" id="edPhotoHead">
          Photo
        </span>
      </div>
      <div className="edphoto__row">
        <span className="edphoto__frame" aria-hidden={!url}>
          {url ? <img src={url} alt={`${name}’s photo`} width={56} height={56} /> : null}
        </span>
        <span className="edphoto__body">
          {asking ? (
            <span className="edphoto__ask" role="group" aria-label="Remove the photo?">
              <span className="edphoto__q">Remove the photo for good?</span>
              <span className="edphoto__actions">
                <button
                  type="button"
                  className="edphoto__remove"
                  onClick={() => {
                    setAsking(false);
                    void onRemove();
                  }}
                >
                  Remove
                </button>
                <button type="button" className="edphoto__keep" onClick={() => setAsking(false)}>
                  Keep it
                </button>
              </span>
            </span>
          ) : (
            <span className="edphoto__actions">
              <button type="button" className="edphoto__add" disabled={busy} onClick={() => input.current?.click()}>
                {busy ? 'Adding the photo' : url ? 'Change photo' : 'Add a photo'}
              </button>
              {url && (
                <button type="button" className="edphoto__keep" onClick={() => setAsking(true)}>
                  Remove
                </button>
              )}
            </span>
          )}
          <span className="edhint">
            {failed
              ? 'That picture couldn’t be read. Try a PNG or JPEG.'
              : 'Kept in this browser only: never uploaded, and not in a board file.'}
          </span>
        </span>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => void pick(e.currentTarget.files?.[0])}
      />
    </section>
  );
}
