import { useEffect, useState } from 'react';
import { CHROME_PANEL_SHEET_MAX_PX } from '../lib/constants.ts';
import { isPanelSheet } from '../lib/chrome.ts';

/** True when filter/log panels should use a full-width bottom sheet. */
export function usePanelSheet(): boolean {
  const [sheet, setSheet] = useState(isPanelSheet);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${CHROME_PANEL_SHEET_MAX_PX}px)`);
    const onChange = () => setSheet(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return sheet;
}
