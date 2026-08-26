import { Info, X } from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';

export function Hint() {
  const [collapsed, setCollapsed] = useState(false);
  const hintRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setCollapsed(true), 3000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (collapsed) return;
    const onPointer = (ev: PointerEvent) => {
      if (hintRef.current?.contains(ev.target as Node)) return;
      setCollapsed(true);
    };
    document.addEventListener('pointerdown', onPointer, true);
    return () => document.removeEventListener('pointerdown', onPointer, true);
  }, [collapsed]);

  if (collapsed) {
    return (
      <button
        id="hintIcon"
        type="button"
        title="How to use"
        aria-label="How to use"
        style={{ display: 'flex' }}
        onClick={(e) => {
          e.stopPropagation();
          setCollapsed(false);
        }}
      >
        <Info />
      </button>
    );
  }

  return (
    <div id="hint" ref={hintRef}>
      <button
        id="hintClose"
        type="button"
        title="Close"
        aria-label="Close"
        onClick={(e) => {
          e.stopPropagation();
          setCollapsed(true);
        }}
      >
        <X />
      </button>
      <b>How to use</b>
      <br />• <b>Drag</b> a tag to move it. Drag empty space to pan. Pinch
      to zoom.
      <br />• <b>Connect</b>, then tap two sims to link them (Marriage /
      Romance / Divorced / Parent→Child / Sibling). Links <b>you</b> add show
      in <b style={{ color: '#7c3aed' }}>violet</b> until they exist in an
      uploaded save, then they turn gray. Two-finger drag pans while Connect
      is on.
      <br />• Hover or tap a <b>⚭ / ❤ / ⚮</b>, then the <b>+</b>, to add
      an infant under that couple.
      <br />• Tap a <b>⚭ / ❤</b> connection, then a sim, to make that sim
      the <b>child of both partners</b>.
      <br />• On a household label, <b>Age up</b> moves everyone in that
      house one life stage (Infant → … → Elder → Deceased). Pets and
      already-deceased stay.
      <br />• Change one sim's age in <b>Edit</b> to age them up alone
      (logged). Household Age up stays on the house label.
      <br />• The <b>map</b> in the corner shows the whole board and where you
      are. Click or drag it to pan; scroll on it to zoom.
      <br />• <b>Undo</b> (Ctrl/⌘ Z) reverses the last add, link, move,
      age-up, edit, or delete.
      <br />• Select a sim, then <b>Filters → Bloodline</b>, to dim everyone
      else. <b>Show everyone</b> on the banner (or Esc, or Bloodline again)
      to leave.
      <br />• <b>Log</b> lists planned links (violet) and links confirmed by
      a save (gray). Deleting a link removes that line.
      <br />• Double-tap or long-press a tag to edit name/age.
      <br />• <b>Save .json</b> keeps your work (including the log and
      filters). <b>Load .json</b> restores it. <b>Load .save</b> merges a
      Sims 4 save into the current board. All three are under the <b>⋮</b>{' '}
      menu.
    </div>
  );
}
