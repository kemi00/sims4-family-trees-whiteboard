/** The commit the app was built from (vite.config.ts), for problem reports; "dev" in tests. */
export const BUILD = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev';
