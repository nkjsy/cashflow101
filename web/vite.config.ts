import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // Relative asset paths so the build works when a game portal serves it from a sub-path or iframe.
  base: './',
  plugins: [react()],
  test: {
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
  },
})
