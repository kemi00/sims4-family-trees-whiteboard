import { useEffect, useState } from 'react';
import { gameNamesNow, loadGameNames, type GameNames } from '../lib/simAbout.ts';

/**
 * The game's names for traits, careers, skills and aspirations, fetched the
 * first time a sim editor opens and kept for the visit. `failed` when they
 * couldn't be fetched (offline after an update, say).
 */
export function useGameNames(): { names: GameNames | null; failed: boolean } {
  const [names, setNames] = useState(gameNamesNow);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (names) return;
    let on = true;
    loadGameNames().then(
      (g) => on && setNames(g),
      () => on && setFailed(true),
    );
    return () => {
      on = false;
    };
  }, [names]);
  return { names, failed };
}
