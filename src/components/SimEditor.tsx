import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { AGES, GENDERS, LIFE_STATES, PLAYABILITY } from '../lib/constants.ts';
import { useCompactChrome } from '../hooks/useCompactChrome.ts';
import type { Group, SimNode, World } from '../types/whiteboard.ts';

function pinnedAlpha<T extends string>(items: readonly T[], pin: T): T[] {
  const rest = items
    .filter((x) => x !== pin)
    .slice()
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  return items.includes(pin) ? [pin, ...rest] : rest;
}

/**
 * Why a card shows no sim ID: none of the board came from a save yet, or
 * this card did not (a family-tree relative, a sim added here, a roster
 * premade the save did not have).
 */
function noSimIdNote(n: SimNode, boardHasSave: boolean): string {
  if (!boardHasSave) return 'Upload your save file to see the sim ID';
  if (n.treeId) return "No sim ID: only in the game's family tree";
  if (n.added) return 'No sim ID: added on the board';
  return 'No sim ID: not in your save';
}

const LIFE_STATE_OPTIONS = pinnedAlpha(LIFE_STATES, 'Sim');
const PLAYABILITY_OPTIONS = pinnedAlpha(PLAYABILITY, 'Resident');

type Props = {
  node: SimNode;
  worlds: World[];
  groups: Group[];
  nodes: SimNode[];
  left: number;
  top: number;
  editorRef: RefObject<HTMLDivElement | null>;
  onSave: (patch: {
    first: string;
    sur: string;
    age: string;
    gender: string;
    state: string;
    oplay: string;
  }) => void;
  onMove: (world: string, houseGid: string | '__new', newName?: string) => void;
  onLayout: () => void;
  onClose: () => void;
};

export function SimEditor({
  node: n,
  worlds,
  groups,
  nodes,
  left,
  top,
  editorRef,
  onSave,
  onMove,
  onLayout,
  onClose,
}: Props) {
  const compact = useCompactChrome();
  const [name, setName] = useState(`${n.first} ${n.sur}`);
  const [age, setAge] = useState(n.age);
  const [gender, setGender] = useState(n.gender);
  const [state, setState] = useState(n.state || 'Sim');
  const [oplay, setOplay] = useState(n.oplay || 'Resident');
  const [moveOpen, setMoveOpen] = useState(false);
  const [world, setWorld] = useState(n.oworld || n.world || worlds[0]?.name || '');
  const [house, setHouse] = useState('');
  const [newName, setNewName] = useState('');
  const boardHasSave = useMemo(() => nodes.some((x) => x.saveSimId), [nodes]);
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idRef = useRef<HTMLInputElement>(null);
  useEffect(() => () => {
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
  }, []);

  const copySimId = async () => {
    const id = n.saveSimId;
    if (!id) return;
    try {
      await navigator.clipboard.writeText(id);
    } catch {
      // No clipboard access (an http page, an old browser): copy the selection.
      idRef.current?.select();
      document.execCommand('copy');
    }
    setCopied(true);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), 1600);
  };

  const mid =
    n.onb && n.onb !== '-'
      ? n.onb
      : n.oplay === 'NPC'
        ? 'NPC'
        : n.oplay !== 'Resident'
          ? 'Townie'
          : '—';

  const houseOptions = (() => {
    const seen = new Set<string>();
    const opts: { gid: string; hh: string }[] = [];
    groups.forEach((g) => {
      if (
        g.world === world &&
        g.gid !== n.gid &&
        !seen.has(g.gid) &&
        nodes.some((x) => x.gid === g.gid)
      ) {
        seen.add(g.gid);
        opts.push({ gid: g.gid, hh: g.hh });
      }
    });
    return opts.sort((a, b) =>
      a.hh.localeCompare(b.hh, undefined, { sensitivity: 'base' }),
    );
  })();

  useEffect(() => {
    if (moveOpen && !house && houseOptions.length) {
      setHouse(houseOptions[0]!.gid);
    }
  }, [moveOpen, world, houseOptions, house]);

  useEffect(() => {
    onLayout();
  }, [moveOpen, onLayout]);

  useEffect(() => {
    if (!compact) return;
    const el = editorRef.current;
    const vv = window.visualViewport;
    if (!el || !vv) return;
    const sync = () => {
      const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      el.style.bottom = `${kb}px`;
    };
    sync();
    vv.addEventListener('resize', sync);
    vv.addEventListener('scroll', sync);
    return () => {
      vv.removeEventListener('resize', sync);
      vv.removeEventListener('scroll', sync);
      el.style.bottom = '';
    };
  }, [compact, editorRef]);

  return (
    <div
      ref={editorRef}
      id="editor"
      className={compact ? 'editor editor--sheet' : 'editor'}
      style={
        compact
          ? { display: 'block' }
          : { display: 'block', left, top }
      }
    >
      <button className="edx" title="close" onClick={onClose}>
        ✕
      </button>
      <label>Name</label>
      <input value={name} onChange={(e) => setName(e.target.value)} />
      <label>Age / life stage</label>
      <select value={age} onChange={(e) => setAge(e.target.value)}>
        {AGES.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
        {!AGES.includes(age as (typeof AGES)[number]) && (
          <option value={age}>{age}</option>
        )}
      </select>
      <label>Gender</label>
      <select value={gender} onChange={(e) => setGender(e.target.value)}>
        {GENDERS.map((g) => (
          <option key={g} value={g}>
            {g}
          </option>
        ))}
        {!GENDERS.includes(gender as (typeof GENDERS)[number]) && (
          <option value={gender}>{gender}</option>
        )}
      </select>
      <label>Life state</label>
      <select value={state} onChange={(e) => setState(e.target.value)}>
        {LIFE_STATE_OPTIONS.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
        {!LIFE_STATES.includes(state as (typeof LIFE_STATES)[number]) && (
          <option value={state}>{state}</option>
        )}
      </select>
      <label>Playability</label>
      <select value={oplay} onChange={(e) => setOplay(e.target.value)}>
        {PLAYABILITY_OPTIONS.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
        {!PLAYABILITY.includes(oplay as (typeof PLAYABILITY)[number]) && (
          <option value={oplay}>{oplay}</option>
        )}
      </select>
      <label>Game pack</label>
      <div className="ro">{n.pack || '—'}</div>
      <label>Original household</label>
      <div className="ro">
        {n.oworld || '—'} · {mid} · {n.ohh || '—'}
      </div>
      <label id="edSimIdLabel" htmlFor={n.saveSimId ? 'edSimId' : undefined}>
        Sim ID
      </label>
      {/* The game's own id for the sim: shown, never edited. */}
      {n.saveSimId ? (
        <div className="idrow">
          <input
            id="edSimId"
            ref={idRef}
            className="ro ro--id"
            readOnly
            value={n.saveSimId}
            onFocus={(e) => e.currentTarget.select()}
          />
          <button type="button" className="copybtn" onClick={copySimId}>
            {copied ? 'Copied ✓' : 'Copy ID'}
          </button>
          <span className="sr-only" role="status">
            {copied ? 'Sim ID copied' : ''}
          </span>
        </div>
      ) : (
        <div className="ro ro--muted" aria-labelledby="edSimIdLabel" aria-disabled="true">
          {noSimIdNote(n, boardHasSave)}
        </div>
      )}
      <button className="movebtn" onClick={() => setMoveOpen(!moveOpen)}>
        ↪ Move to a new household
      </button>
      {moveOpen && (
        <div id="edMove">
          <label>World</label>
          <select
            value={world}
            onChange={(e) => {
              setWorld(e.target.value);
              setHouse('');
            }}
          >
            {worlds.map((w) => (
              <option key={w.name} value={w.name}>
                {w.name}
              </option>
            ))}
          </select>
          <label>Household</label>
          <select
            value={house}
            onChange={(e) => setHouse(e.target.value)}
          >
            {houseOptions.map((o) => (
              <option key={o.gid} value={o.gid}>
                {o.hh}
              </option>
            ))}
            <option value="__new">➕ Create a new household…</option>
          </select>
          {house === '__new' && (
            <input
              placeholder="New household name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              style={{ marginTop: 6 }}
            />
          )}
          <button
            className="movego"
            onClick={() =>
              onMove(world, house as string | '__new', newName)
            }
          >
            Move {n.first} here
          </button>
        </div>
      )}
      <div className="row">
        <button
          onClick={() => {
            const parts = name.trim().split(' ');
            const first = parts.shift() || name;
            const sur = parts.join(' ');
            onSave({ first, sur, age, gender, state, oplay });
          }}
        >
          Save
        </button>
      </div>
    </div>
  );
}
