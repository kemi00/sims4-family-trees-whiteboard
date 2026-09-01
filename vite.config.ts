import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    /*
     * Vite defaults to `localhost`, which Node 17+ resolves to `::1` first, so
     * the dev server ends up bound to IPv6 loopback only. Anything reaching it
     * over IPv4 — a container port forward, a remote-dev tunnel — then gets
     * ECONNREFUSED even though the server is up. `true` listens on `::`
     * dual-stack, which answers on 127.0.0.1 and ::1 alike.
     *
     * Note this also puts the dev server on your LAN. Use '127.0.0.1' instead
     * if you want IPv4 loopback and nothing else.
     */
    host: true,
  },
})
