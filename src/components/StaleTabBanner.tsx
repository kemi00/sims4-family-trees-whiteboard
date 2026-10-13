type Props = {
  onReload: () => void;
  onSaveJson: () => void;
};

/**
 * Shown when another tab saved the board after this one loaded it. This tab
 * has stopped saving so it cannot overwrite that work; reloading shows the
 * latest board, and saving a .json first keeps anything done here.
 */
export function StaleTabBanner({ onReload, onSaveJson }: Props) {
  return (
    <div
      className="bloodline-banner tab-banner"
      role="alert"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <p>
        <b>This board changed in another tab.</b> This tab stopped saving so
        it can't overwrite that. Reload to see the latest board, or save this
        tab's version first.
      </p>
      <button type="button" className="tab-banner__save" onClick={onSaveJson}>
        Save this tab as .json
      </button>
      <button type="button" onClick={onReload}>
        Reload
      </button>
    </div>
  );
}
