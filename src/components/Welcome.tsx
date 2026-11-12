import { useEffect, useRef, useState, type DragEvent } from 'react';
import { FolderOpen, LockSimple, Translate } from '../icons.ts';
import { useCompactChrome } from '../hooks/useCompactChrome.ts';
import { markWelcomeSeen } from '../lib/welcome.ts';

type Props = {
  /** A .save picked or dropped: the board reads it (the Open your save dialog follows). */
  onOpenSave: (file: File) => void;
  /** A board file (.json) picked or dropped. */
  onOpenBoard: (file: File) => void;
  /** Close, to look around the example board first. */
  onClose: () => void;
};

/**
 * The first visit's welcome, over the example board: the one step that
 * makes the board theirs is opening their save, so it asks for that first,
 * says where the file is, that it never leaves their computer, and that
 * only games set to English work for now. Looking around first is a click
 * away, and the board's status line keeps "Open your save" in reach after.
 */
export function Welcome({ onOpenSave, onOpenBoard, onClose }: Props) {
  const compact = useCompactChrome();
  const saveRef = useRef<HTMLInputElement>(null);
  const boardRef = useRef<HTMLInputElement>(null);
  const openRef = useRef<HTMLButtonElement>(null);
  const [dragging, setDragging] = useState(false);
  const [wrongFile, setWrongFile] = useState<string | null>(null);

  useEffect(() => {
    openRef.current?.focus();
  }, []);

  const close = () => {
    markWelcomeSeen();
    onClose();
  };
  const take = (file: File | undefined) => {
    if (!file) return;
    const name = file.name.toLowerCase();
    if (name.endsWith('.save')) {
      markWelcomeSeen();
      onOpenSave(file);
    } else if (name.endsWith('.json')) {
      markWelcomeSeen();
      onOpenBoard(file);
    } else {
      setWrongFile(file.name);
    }
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    take(e.dataTransfer.files?.[0]);
  };

  return (
    <div
      className="welcome"
      // A press beside the card, like any popup's outside: look around first.
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return;
        e.stopPropagation();
        close();
      }}
    >
      <section
        className={dragging ? 'welcome__card welcome__card--drop' : 'welcome__card'}
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-title"
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
        }}
        onDrop={onDrop}
      >
        <p className="welcome__kicker">Welcome</p>
        <h2 id="welcome-title">Start with your save</h2>
        <p className="welcome__lead">
          Open your Sims 4 save, and its sims, households and family ties land on the board, ready for your plans.
        </p>
        <div className="welcome__drop">
          <button ref={openRef} type="button" className="welcome__open" onClick={() => saveRef.current?.click()}>
            <FolderOpen aria-hidden="true" />
            Open your save file
          </button>
          {!compact && <p className="welcome__droptext">or drop the .save file here</p>}
          {wrongFile && (
            <p className="welcome__wrong" role="alert">
              “{wrongFile}” isn’t a save. Pick the file named like Slot_00000001.save.
            </p>
          )}
        </div>
        <details className="welcome__where">
          <summary>Where is my save?</summary>
          <p>
            In your Documents folder: <b>Electronic Arts › The Sims 4 › saves</b>, on Windows and on Mac. Pick the newest
            file there, named like Slot_00000001.save: it’s the game you saved last.
          </p>
          {compact && (
            <p>Your save is on the computer you play on: open this page there, or send the file to this phone first.</p>
          )}
        </details>
        <ul className="welcome__facts">
          <li>
            <LockSimple aria-hidden="true" />
            <span>
              Your save stays on your computer. It’s read here in your browser and never sent anywhere, and your board is
              kept in this browser. To keep a copy, download the board from More (⋮) in the top bar.
            </span>
          </li>
          <li>
            <Translate aria-hidden="true" />
            <span>Works with games set to English for now. Other languages are planned.</span>
          </li>
        </ul>
        <div className="welcome__foot">
          <button type="button" className="welcome__explore" onClick={close}>
            Look around the example board first
          </button>
          <button type="button" className="welcome__board" onClick={() => boardRef.current?.click()}>
            Have a board file? Open a .json
          </button>
        </div>
        <input
          ref={saveRef}
          type="file"
          accept=".save"
          hidden
          onChange={(e) => {
            take(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <input
          ref={boardRef}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            take(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </section>
    </div>
  );
}
