import { useEffect, useRef, useState } from 'react';
import { NOTE_MAX } from '../lib/utils.ts';

type Props = {
  initial: string;
  placeholder?: string;
  onSave: (text: string) => void;
  onCancel: () => void;
};

/** Inline note box. Enter saves, Shift+Enter adds a line, and Escape cancels. */
export function NoteEditor({ initial, placeholder = 'Write a note…', onSave, onCancel }: Props) {
  const [text, setText] = useState(initial);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  return (
    <div
      className="note-editor"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !e.nativeEvent.isComposing) {
          e.stopPropagation();
          onCancel();
        }
      }}
    >
      <textarea
        ref={ref}
        rows={2}
        maxLength={NOTE_MAX}
        value={text}
        aria-label="Note"
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            onSave(text);
          }
        }}
      />
      <div className="note-editor__actions">
        <span className="note-editor__hint">
          {initial && !text.trim() ? 'Save an empty note to remove it' : 'Enter to save · Shift+Enter for a new line'}
        </span>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="note-editor__save" onClick={() => onSave(text)}>
          Save
        </button>
      </div>
    </div>
  );
}
