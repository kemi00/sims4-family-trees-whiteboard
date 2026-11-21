import { ADDED_HOUSEHOLD, DECEASED_STATE } from './constants.ts';
import { isPlannedSim } from './plan.ts';
import { isUnhousedGid } from './unhoused.ts';
import { fold, theHousehold } from './utils.ts';
import type { SaveHousehold, SimNode } from '../types/whiteboard.ts';

/**
 * Money on the board: each household's funds, as the last save has them
 * (SaveGameInfo.households, by the save's household id). Sims keep the id
 * of the household the game has them in (SimNode.hhId) whatever the plan
 * does, so a household's money can be found wherever the board puts them.
 */

const FORMAT = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

/** "§45,500": simoleons, in full. */
export function money(amount: number): string {
  return `§${FORMAT.format(Math.round(amount))}`;
}

/** One household's part of a box's money. */
export type FundsShare = { hhId: string; name: string; amount: number; lot?: string };

/** A box's money: one household's, or several that join it whole. */
export type BoxFunds = { amount: number; shares: FundsShare[] };

/**
 * Each household box's money. A household's funds stay with the household,
 * and the household is wherever most of its living sims are on the board,
 * a box with its name first on a tie: a sim who moves out alone takes none
 * (the game settles that), and a household that moves in with another, all
 * of it, brings its funds along. The Unhoused and Needs a home boxes hold
 * no household's money.
 */
export function fundsByBox(
  nodes: readonly SimNode[],
  households: Readonly<Record<string, SaveHousehold>> | undefined,
): Map<string, BoxFunds> {
  const out = new Map<string, BoxFunds>();
  if (!households) return out;
  const where = new Map<string, Map<string, { count: number; hh: string }>>();
  for (const n of nodes) {
    if (!n.hhId || !households[n.hhId] || isPlannedSim(n) || n.state === DECEASED_STATE) continue;
    if (isUnhousedGid(n.gid) || n.gid.endsWith(`||${ADDED_HOUSEHOLD}`)) continue;
    const boxes = where.get(n.hhId) ?? new Map<string, { count: number; hh: string }>();
    const b = boxes.get(n.gid) ?? { count: 0, hh: n.hh };
    b.count++;
    boxes.set(n.gid, b);
    where.set(n.hhId, boxes);
  }
  for (const [hhId, boxes] of where) {
    const h = households[hhId]!;
    let best: [string, { count: number; hh: string }] | undefined;
    for (const entry of boxes) {
      if (!best) best = entry;
      else if (entry[1].count > best[1].count) best = entry;
      else if (entry[1].count === best[1].count && fold(entry[1].hh) === fold(h.name) && fold(best[1].hh) !== fold(h.name)) best = entry;
    }
    if (!best) continue;
    const box = out.get(best[0]) ?? { amount: 0, shares: [] };
    box.amount += h.funds;
    box.shares.push({ hhId, name: h.name, amount: h.funds, ...(h.lot ? { lot: h.lot } : {}) });
    out.set(best[0], box);
  }
  // The household named like the box first: it's the one the others join.
  for (const [gid, box] of out) {
    if (box.shares.length < 2) continue;
    const hh = nodes.find((n) => n.gid === gid)?.hh ?? '';
    box.shares.sort((a, b) => Number(fold(b.name) === fold(hh)) - Number(fold(a.name) === fold(hh)) || b.amount - a.amount);
  }
  return out;
}

/** "the Goth household’s §45,500". */
function shareText(s: FundsShare): string {
  return `${theHousehold(s.name)}’s ${money(s.amount)}`;
}

/**
 * Several households' money in one box, in a sentence: "§130,500 together:
 * the Goth household’s §45,500 joins the Landgraab household’s §85,000."
 * Empty for one household's.
 */
export function togetherText(f: BoxFunds | undefined): string {
  if (!f || f.shares.length < 2) return '';
  const [host, ...rest] = f.shares;
  const joiners = rest.map(shareText);
  const list = joiners.length === 1 ? joiners[0]! : `${joiners.slice(0, -1).join(', ')} and ${joiners[joiners.length - 1]}`;
  return `${money(f.amount)} together: ${list} ${rest.length === 1 ? 'joins' : 'join'} ${shareText(host!)}.`;
}

/** What a move into a lot leaves them, when a price was typed: short by how much, or what's left. */
export type MoveMoney = { short: number; left?: undefined } | { left: number; short?: undefined };

export function moveMoney(f: BoxFunds, price: number): MoveMoney {
  return price > f.amount ? { short: price - f.amount } : { left: f.amount - price };
}

/**
 * The homes a move into `lot` sells: the lots its households live on in
 * the game, other than that one. "Ophelia Villa"; "their homes" for more.
 */
export function homesSold(f: BoxFunds, lot: string): string[] {
  return [...new Set(f.shares.map((s) => s.lot).filter((l): l is string => !!l && fold(l) !== fold(lot)))];
}
