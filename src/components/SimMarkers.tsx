import { useState } from 'react';
import { Trash } from '../icons.ts';
import { MARKER_SYMBOLS, markerColor, newMarkerId } from '../lib/markers.ts';
import type { SimMarker } from '../types/whiteboard.ts';

/** The symbol picker: one symbol of MARKER_SYMBOLS, as a row of buttons. */
function SymbolPicker({ value, onChange, label }: { value: string; onChange: (mark: string) => void; label: string }) {
  return (
    <span className="edmarkers__symbols" role="radiogroup" aria-label={label}>
      {MARKER_SYMBOLS.map((s) => (
        <button
          key={s.mark}
          type="button"
          role="radio"
          aria-checked={value === s.mark}
          aria-label={s.name}
          title={s.name}
          style={{ color: s.color }}
          onClick={() => onChange(s.mark)}
        >
          {s.mark}
        </button>
      ))}
    </span>
  );
}

/**
 * A sim's markers, in the editor: the board's markers as chips to put on or
 * take off (saved with the editor's Save), a new one in your words, and the
 * board's list to rename or remove, which changes every card at once (one
 * undo step each).
 */
export function SimMarkers({
  defs,
  picked,
  onPick,
  onDefs,
}: {
  defs: readonly SimMarker[];
  picked: readonly string[];
  onPick: (ids: string[]) => void;
  onDefs: (next: SimMarker[], undoLabel: string) => void;
}) {
  const [mode, setMode] = useState<'pick' | 'new' | 'edit'>('pick');
  const [label, setLabel] = useState('');
  const [mark, setMark] = useState(MARKER_SYMBOLS[2]!.mark);
  const has = new Set(picked);
  const add = () => {
    const words = label.trim();
    if (!words) return;
    const id = newMarkerId(defs);
    onDefs([...defs, { id, label: words, mark }], `New marker: ${words}`);
    onPick([...picked, id]);
    setLabel('');
    setMode('pick');
  };
  return (
    <section className="edmarkers" aria-labelledby="edMarkersHead">
      <div className="edlabel">
        <span className="edlabel__text" id="edMarkersHead">
          Markers
        </span>
        {mode === 'pick' && defs.length > 0 && (
          <button type="button" className="edlink" onClick={() => setMode('edit')}>
            Edit markers
          </button>
        )}
      </div>
      {mode === 'edit' ? (
        <div className="edmarkers__edit">
          <ul className="edmarkers__list">
            {defs.map((d) => (
              <li key={d.id}>
                <SymbolPicker
                  value={d.mark}
                  label={`Symbol for ${d.label}`}
                  onChange={(m) => m !== d.mark && onDefs(defs.map((x) => (x.id === d.id ? { ...x, mark: m } : x)), `Marker ${d.label}: ${m}`)}
                />
                <span className="edmarkers__row">
                  <input
                    type="text"
                    defaultValue={d.label}
                    aria-label={`Name of the marker ${d.label}`}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), e.currentTarget.blur())}
                    onBlur={(e) => {
                      const words = e.currentTarget.value.trim();
                      if (words && words !== d.label) onDefs(defs.map((x) => (x.id === d.id ? { ...x, label: words } : x)), `Rename the marker ${d.label} to ${words}`);
                      else e.currentTarget.value = d.label;
                    }}
                  />
                  <button
                    type="button"
                    className="edmarkers__bin"
                    aria-label={`Remove the marker ${d.label} from the board`}
                    title="Remove this marker from every sim. Undo takes it back."
                    onClick={() => {
                      onDefs(defs.filter((x) => x.id !== d.id), `Remove the marker ${d.label}`);
                      if (has.has(d.id)) onPick(picked.filter((id) => id !== d.id));
                    }}
                  >
                    <Trash aria-hidden="true" />
                  </button>
                </span>
              </li>
            ))}
          </ul>
          <div className="edmarkers__actions">
            <button type="button" className="edmarkers__done" onClick={() => setMode('pick')}>
              Done
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="edmarkers__chips" role="group" aria-labelledby="edMarkersHead">
            {defs.map((d) => (
              <button
                key={d.id}
                type="button"
                className="edmarkers__chip"
                aria-pressed={has.has(d.id)}
                onClick={() => onPick(has.has(d.id) ? picked.filter((id) => id !== d.id) : [...picked, d.id])}
              >
                <span className="edmarkers__mark" style={{ color: markerColor(d.mark) }} aria-hidden="true">
                  {d.mark}
                </span>
                <span>{d.label}</span>
              </button>
            ))}
            {mode === 'pick' && (
              <button type="button" className="edmarkers__chip edmarkers__chip--new" onClick={() => setMode('new')}>
                New marker
              </button>
            )}
          </div>
          {mode === 'new' && (
            <div className="edmarkers__new" role="group" aria-label="New marker">
              <label className="edmarkers__field">
                <span>Marker</span>
                <input
                  type="text"
                  autoFocus
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())}
                />
              </label>
              <SymbolPicker value={mark} onChange={setMark} label="Its symbol" />
              <div className="edmarkers__actions">
                <button type="button" className="edmarkers__done" onClick={() => setMode('pick')}>
                  Cancel
                </button>
                <button type="button" className="edmarkers__add" disabled={!label.trim()} onClick={add}>
                  Add marker
                </button>
              </div>
            </div>
          )}
          <p className="edhint">Markers show before the name on every card that has them, and the Key explains them.</p>
        </>
      )}
    </section>
  );
}
