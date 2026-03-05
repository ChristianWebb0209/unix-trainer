import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
  ],
  resolve: {
    alias: {
      'problem-config': resolve(__dirname, '../problem-config.mjs'),
    },
  },
  server: {
    fs: {
      // Allow importing shared config from the monorepo root.
      allow: [resolve(__dirname, '..')],
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        ws: true,
      },
    },
  },
})
