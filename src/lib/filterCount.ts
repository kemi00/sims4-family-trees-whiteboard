/**
 * How many filters are on, for the Filters button's count and its panel. A
 * game switched off with no sims on the board hides nothing, so it is not
 * an active filter (Games lists it, off, all the same).
 */
export function filterCounts(f: {
  hiddenPacks: ReadonlySet<string>;
  packCounts: ReadonlyMap<string, number>;
  hiddenPlay: ReadonlySet<string>;
  hiAges: ReadonlySet<string>;
  hiSingle: boolean;
  bloodlineId: string | null;
  hideSecrets: boolean;
  hideDeceased: boolean;
}) {
  const games = [...f.hiddenPacks].filter((p) => f.packCounts.get(p)).length;
  const play = f.hiddenPlay.size;
  const highlight = f.hiAges.size + (f.hiSingle ? 1 : 0);
  const total = games + play + highlight + (f.bloodlineId ? 1 : 0) + (f.hideSecrets ? 1 : 0) + (f.hideDeceased ? 1 : 0);
  return { games, play, highlight, total };
}
