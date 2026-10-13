import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { seo } from './vite-seo.ts'

// Cross-origin isolation enables SharedArrayBuffer, which the Stop button uses
// to interrupt a running Python script without restarting the runtime.
const isolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // SITE_URL and VITE_GA_ID come from .env files or the host's build environment.
  const env = { ...loadEnv(mode, process.cwd(), ['SITE_URL', 'VITE_']), ...process.env }
  return {
    plugins: [react(), seo({ siteUrl: env.SITE_URL, gaId: env.VITE_GA_ID })],
    worker: { format: 'es' },
    optimizeDeps: { exclude: ['pyodide'] },
    server: { headers: isolation },
    preview: { headers: isolation },
  }
})
