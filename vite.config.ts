import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Cross-origin isolation enables SharedArrayBuffer, which the Stop button uses
// to interrupt a running Python script without restarting the runtime.
const isolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  worker: { format: 'es' },
  optimizeDeps: { exclude: ['pyodide'] },
  server: { headers: isolation },
  preview: { headers: isolation },
})
