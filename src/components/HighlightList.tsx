import type { WhiteboardApi } from '../hooks/useWhiteboard.ts';
import { Warning } from '../icons.ts';
import { DECEASED_STATE } from '../lib/constants.ts';
import { riskText } from '../lib/dynastyMenu.ts';
import { BLOODLINE_REACHES, REACH_HINT, REACH_LABEL, REACH_NOUN, generationName } from '../lib/bloodline.ts';
import { familyRoleWord } from '../lib/family.ts';
import { dynastyPhrase } from '../lib/generations.ts';
import { highlightSummary } from '../lib/highlight.ts';
import { cardName } from '../lib/plan.ts';
import { bloodlineWhat, dynastyWhat, familyWhat, generationGroups, simList, stageWord, type SimList } from '../lib/simList.ts';
import { isHighlightMatch } from '../lib/utils.ts';
import { SimListPanel } from './SimListPanel.tsx';

/** Which highlight a list shows: the Filters chips, a dynasty, a sim's family, or a sim's bloodline. */
export type ListOf = 'highlight' | 'dynasty' | 'family' | 'bloodline';

type Props = {
  wb: WhiteboardApi;
  of: ListOf;
  /** The view goes to a sim; `select` false for a family, whose highlight follows the selection. */
  onPick: (id: string, select: boolean) => void;
  /** Change the chips (Filters › Highlight), coming back to the list after. */
  onChange: () => void;
  /** Frame the dynasty's members on screen together. */
  onShowAll: () => void;
  onClose: () => void;
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const homesIn = (list: SimList) => list.worlds.reduce((s, w) => s + w.homes.length, 0);
const spread = (list: SimList) => `${plural(list.count, 'sim')} in ${plural(homesIn(list), 'household')}`;

/**
 * A highlight's list, beside the board: the Filters chips, a dynasty lit
 * from the Dynasties panel, or the selected sim's family. One list for the
 * three, each with its own controls from its banner.
 */
export function HighlightList({ wb, of, onPick, onChange, onShowAll, onClose }: Props) {
  const unborn = (id: string) => wb.plannedChildIds.has(id);
  const base = { nodes: wb.nodes, shown: wb.nodeVis, worlds: wb.worlds };
  const common = { onHover: wb.setBriefHover, onClose, dynasties: wb.dynastyNames, risks: wb.dynastyRisks };

  if (of === 'dynasty') {
    const ids = wb.dynastyFocusIds ?? new Set<string>();
    const d = wb.dynastyFocus ? wb.dynastyNames.get(wb.dynastyFocus) : undefined;
    // Its cards leave the dynasty off, so its risk is said once, as the Dynasties panel says it.
    const risk = wb.dynastyFocus ? wb.dynastyRisks.get(wb.dynastyFocus) : undefined;
    const list = simList({ ...base, pick: (n) => ids.has(n.id), what: (n) => dynastyWhat(n, unborn(n.id)) });
    return (
      <SimListPanel
        {...common}
        title={`The ${d ? dynastyPhrase(d) : 'dynasty'}`}
        description={
          <>
            {spread(list)}, lit on the board
            {risk && (
              <span className="slist__risk">
                <Warning size={13} weight="fill" aria-hidden />
                At risk: {riskText(risk)}
              </span>
            )}
          </>
        }
        list={list}
        noDynasty
        empty="No one in this dynasty is shown on the board. Check Filters."
        onPick={(id) => onPick(id, true)}
        tools={
          <>
            <button type="button" className="slist__act" onClick={onShowAll}>
              Show all
            </button>
            <button type="button" className="slist__act" onClick={() => wb.setDynastyFocus(null)}>
              Done
            </button>
          </>
        }
      />
    );
  }

  if (of === 'bloodline') {
    const line = wb.bloodline;
    const node = line ? wb.byid[line.id] : undefined;
    const reach = wb.bloodlineReach;
    const noun = REACH_NOUN[reach];
    const name = node ? cardName(node) : 'This sim';
    const list = simList({
      ...base,
      pick: (n) => !!line && n.id !== line.id && line.ids.has(n.id),
      what: (n) => (line ? bloodlineWhat(n, line, wb.byid, unborn(n.id)) : ''),
    });
    const gens = line ? generationGroups(list, line, name, generationName) : [];
    const levels = gens.filter((g) => !g.me).length;
    const sims = plural(list.count, 'sim');
    return (
      <SimListPanel
        {...common}
        title={`${name}’s ${noun}`}
        description={
          !node
            ? 'Select a sim, then Filters › Bloodline'
            : list.count === 0
              ? 'No one lit on the board'
              : reach === 'descendants' && levels > 1
              ? `${sims} in ${levels} generations, lit on the board`
              : `${sims}, lit on the board`
        }
        list={list}
        noDynasty
        brief
        groups={{ label: 'Generation', list: gens }}
        empty={`${name} has no ${noun === 'bloodline' ? 'parents or descendants' : noun} on the board.`}
        onPick={(id) => onPick(id, true)}
        tools={
          <div className="seg seg--wide" role="group" aria-label="How far the bloodline reaches">
            {BLOODLINE_REACHES.map((r) => (
              <button key={r} type="button" className="seg__opt" aria-pressed={reach === r} title={REACH_HINT[r]} onClick={() => wb.setBloodlineReach(r)}>
                {REACH_LABEL[r]}
              </button>
            ))}
          </div>
        }
        footer={
          line?.hasAdopted ? (
            <label className="slist__check">
              <input type="checkbox" checked={wb.bloodlineAdopted} onChange={(e) => wb.setBloodlineAdopted(e.target.checked)} />
              Count adopted children
            </label>
          ) : undefined
        }
      />
    );
  }

  if (of === 'family') {
    const family = wb.family;
    const node = family ? wb.byid[family.id] : undefined;
    const which = wb.familyScope === 'extended' ? 'extended family' : 'close family';
    const list = simList({
      ...base,
      pick: (n) => !!family?.roles.has(n.id),
      what: (n) => familyWhat(n, family ? familyRoleWord(family.roles.get(n.id)!, n) : '', unborn(n.id)),
    });
    return (
      <SimListPanel
        {...common}
        title={node ? `${cardName(node)}’s ${which}` : `A sim’s ${which}`}
        description={node ? `${spread(list)}, lit on the board` : 'Select a sim on the board'}
        list={list}
        empty={node ? `${cardName(node)} has no ${which} on the board.` : `Select a sim to list their ${which}.`}
        onPick={(id) => onPick(id, false)}
        tools={
          <>
            <span className="slist__scope" role="group" aria-label="How far the family reaches">
              <button type="button" className="slist__act" aria-pressed={wb.familyScope === 'close'} onClick={() => wb.setFamilyScope('close')}>
                Close
              </button>
              <button
                type="button"
                className="slist__act"
                aria-pressed={wb.familyScope === 'extended'}
                onClick={() => wb.setFamilyScope('extended')}
              >
                Extended
              </button>
            </span>
            <button type="button" className="slist__act" onClick={() => wb.setFamilyFocus(false)}>
              Done
            </button>
          </>
        }
      />
    );
  }

  const sets = wb.highlightSets;
  const summary = highlightSummary({ nodes: wb.nodes, shown: wb.nodeVis, hi: wb.hiAges, hiSingle: wb.hiSingle, ...sets });
  const list = simList({
    ...base,
    pick: (n) => n.state !== DECEASED_STATE && isHighlightMatch(n, wb.hiAges, wb.hiSingle, sets),
    what: (n) => stageWord(n, unborn(n.id)),
  });
  return (
    <SimListPanel
      {...common}
      title={`${summary.count} ${summary.phrase}`}
      description={`Highlighted on the board, of ${summary.living} living`}
      list={list}
      empty="No living sim matches this highlight. Change it to light up others."
      onPick={(id) => onPick(id, true)}
      tools={
        <>
          <button type="button" className="slist__act" onClick={onChange}>
            Change
          </button>
          <button
            type="button"
            className="slist__act"
            onClick={() => {
              wb.setHiAges(new Set());
              wb.setHiSingle(false);
            }}
          >
            Clear
          </button>
        </>
      }
    />
  );
}
