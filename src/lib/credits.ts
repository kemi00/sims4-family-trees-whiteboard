/** Attribution for the pre-made sim roster compiled by u/SkyChips2Go. */
export const ROSTER_CREDIT = {
  author: 'SkyChips2Go',
  profileUrl: 'https://www.reddit.com/user/SkyChips2Go/',
  postUrl:
    'https://www.reddit.com/r/Sims4/comments/1rff9ly/i_made_a_comprehensive_list_of_all_437_premade/',
  driveUrl:
    'https://drive.google.com/drive/folders/1iEBslkMdUs2uyw1Ij15rH5gKiPEg5sv4?usp=sharing',
} as const;

export const SIMS_WIKI_URL = 'https://sims.fandom.com/wiki/The_Sims_4';

export const REPO_URL = 'https://github.com/kemi00/sims4-family-trees-whiteboard';

export const SITE_URL = 'https://sims4-family-trees.vercel.app';

export const EA_FAN_CONTENT_URL =
  'https://help.ea.com/en/help/faq/fan-content-guidelines/';

/** Inbox for problems, feedback, suggestions, or ideas. */
export const CONTACT_EMAIL = 'giggle.34richter@icloud.com';

/** An email to the developer, with this subject. */
export function contactMailto(subject = 'The Sims 4 Family Tree Planner'): string {
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}`;
}

/** The developer, as they sign. */
export const DEVELOPER_NAME = 'kemi';

/** The developer on Threads. */
export const CONTACT_THREADS = '@kemi01234';
export const CONTACT_THREADS_URL = 'https://www.threads.com/@kemi01234';

/** The developer's profile picture (public/developer.webp), from the app's own files. */
export function developerPictureUrl(): string {
  const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
  return `${base}developer.webp`;
}
