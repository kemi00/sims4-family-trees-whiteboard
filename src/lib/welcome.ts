/** Set once the welcome has been answered, so it greets a visitor once. */
const WELCOME_SEEN = 'welcome-seen';

/** A first visit: no board of theirs in this browser, and the welcome not answered yet. */
export function isFirstVisit(hasBoard: boolean): boolean {
  if (hasBoard) return false;
  try {
    return localStorage.getItem(WELCOME_SEEN) === null;
  } catch {
    return false;
  }
}

export function markWelcomeSeen() {
  try {
    localStorage.setItem(WELCOME_SEEN, '1');
  } catch {
    // Private mode: it greets again next time.
  }
}
