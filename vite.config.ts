import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/** The commit the app is built from, for the problem report. */
function buildId(): string {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return 'unknown'
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __BUILD_ID__: JSON.stringify(buildId()),
  },
  server: {
    /*
     * Bind IPv4 explicitly. Vite defaults to `localhost`, which Node 17+
     * resolves to `::1` first, leaving the server on IPv6 loopback only —
     * IPv4 clients get ECONNREFUSED while the server sits there healthy.
     *
     * `true` (`::`) is not enough either. A dual-stack socket accepts IPv4
     * connections, but the kernel only lists it in /proc/net/tcp6, never in
     * /proc/net/tcp. Port forwarding that discovers ports by scanning the
     * IPv4 table therefore never sees the server at all and never opens a
     * tunnel, so the browser still gets ECONNREFUSED. '0.0.0.0' lands in
     * /proc/net/tcp where it can be found.
     *
     * The cost is that the literal http://[::1]:5173/ stops working; clients
     * asking for `localhost` fall back to IPv4 and are unaffected. Note this
     * also puts the dev server on your LAN — use '127.0.0.1' for IPv4
     * loopback and nothing else, which keeps the port scanner happy too.
     */
    host: '0.0.0.0',
  },
})
