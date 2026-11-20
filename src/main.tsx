import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { CrashGuard } from './components/CrashScreen.tsx';
import { BUILD } from './lib/build.ts';
import { installErrorLog } from './lib/errorLog.ts';
import { installTranslateGuard } from './lib/translateGuard.ts';

installErrorLog(BUILD);
// Before React draws: a page the browser translates must not blank the board.
installTranslateGuard();

// A crash while the board draws shows the crash screen, not a blank page.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CrashGuard>
      <App />
    </CrashGuard>
  </StrictMode>,
);
