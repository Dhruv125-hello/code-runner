import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Needed so Python and JavaScript can wait for your typing inside the browser
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
    },
    // The page talks to the backend through these paths
    proxy: {
      '/api': 'http://127.0.0.1:3001',
      '/ws': { target: 'ws://127.0.0.1:3001', ws: true },
    },
  },
})
