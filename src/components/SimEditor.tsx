import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from 'react';
import { AGES, DYNASTY_ROLES, GENDERS, LIFE_STATES, PLAYABILITY } from '../lib/constants.ts';
import { useCompactChrome } from '../hooks/useCompactChrome.ts';
import { HouseholdMoveForm } from './HouseholdMoveForm.tsx';
import type { DynastyRole, Group, SimNode, World } from '../types/whiteboard.ts';

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
    dynastyRole: DynastyRole | undefined;
  }) => void;
  onMove: (world: string, houseGid: string, newName: string) => void;
  onLayout: () => void;
  onClose: () => void;
  /** Focus the name, selected, so a sim just added can be named straight away. */
  focusName?: boolean;
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
  focusName,
}: Props) {
  const compact = useCompactChrome();
  const [name, setName] = useState(`${n.first} ${n.sur}`);
  /** The game's surname from a spouse, when the card shows another. */
  const married =
    n.marriedSur && n.marriedSur.trim().toLowerCase() !== n.sur.trim().toLowerCase()
      ? n.marriedSur
      : '';
  const [age, setAge] = useState(n.age);
  const [gender, setGender] = useState(n.gender);
  const [state, setState] = useState(n.state || 'Sim');
  const [oplay, setOplay] = useState(n.oplay || 'Resident');
  const [dynastyRole, setDynastyRole] = useState<DynastyRole | ''>(n.dynastyRole ?? '');
  const [moveOpen, setMoveOpen] = useState(false);
  const boardHasSave = useMemo(() => nodes.some((x) => x.saveSimId), [nodes]);
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!focusName) return;
    nameRef.current?.focus();
    nameRef.current?.select();
  }, [focusName]);
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

  const save = () => {
    const parts = name.trim().split(' ');
    const first = parts.shift() || name;
    const sur = parts.join(' ');
    onSave({ first, sur, age, gender, state, oplay, dynastyRole: dynastyRole || undefined });
  };

  /**
   * Enter saves and closes, as in any form; in the move section it moves the
   * sim, that section's own action. A button keeps Enter for itself, and an
   * Enter that finishes typing with an input method (Japanese, Chinese…) is
   * left to it: Safari reports that one as key code 229.
   */
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Enter' || e.nativeEvent.isComposing || e.keyCode === 229) return;
    const t = e.target as HTMLElement;
    if (t.closest('button, a, textarea')) return;
    // The move form handles its own Enter.
    if (t.closest('#edMove')) return;
    e.preventDefault();
    save();
  };

  const mid =
    n.onb && n.onb !== '-'
      ? n.onb
      : n.oplay === 'NPC'
        ? 'NPC'
        : n.oplay !== 'Resident'
          ? 'Townie'
          : '—';

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
      onKeyDown={onKeyDown}
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
      <input
        ref={nameRef}
        value={name}
        enterKeyHint="done"
        aria-describedby={married ? 'edMarried' : undefined}
        onChange={(e) => setName(e.target.value)}
      />
      {married && (
        <div id="edMarried" className="edhint">
          In the game: {n.first} {married}, their spouse's surname. Type it here to
          show it on the card.
        </div>
      )}
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
      {!n.species && (
        <>
          <label htmlFor="edDynasty">Dynasty role</label>
          <select
            id="edDynasty"
            value={dynastyRole}
            aria-describedby={n.dynasty ? 'edDynastyHint' : undefined}
            onChange={(e) => setDynastyRole(e.target.value as DynastyRole | '')}
          >
            <option value="">None</option>
            {(Object.keys(DYNASTY_ROLES) as DynastyRole[]).map((r) => (
              <option key={r} value={r}>
                {DYNASTY_ROLES[r].mark} {DYNASTY_ROLES[r].noun}
              </option>
            ))}
          </select>
          {n.dynasty && (
            <div id="edDynastyHint" className="edhint">
              In the {n.dynasty} dynasty. It has one head and one heir, so
              choosing either here takes it from whoever has it now.
            </div>
          )}
        </>
      )}
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
      <button
        className="movebtn"
        aria-expanded={moveOpen}
        aria-controls="edMove"
        onClick={() => setMoveOpen(!moveOpen)}
      >
        ↪ Move to another household
      </button>
      {moveOpen && (
        <div id="edMove">
          <HouseholdMoveForm
            idPrefix="edMove"
            worlds={worlds}
            groups={groups}
            nodes={nodes}
            initialWorld={n.oworld || n.world || worlds[0]?.name || ''}
            exclude={n.gid}
            submitLabel={`Move ${n.first || 'this sim'} here`}
            onMove={onMove}
          />
        </div>
      )}
      <div className="row">
        <button onClick={save}>Save</button>
      </div>
    </div>
  );
}
