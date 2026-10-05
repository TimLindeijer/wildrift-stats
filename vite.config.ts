import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// GitHub Pages serves the site from https://<user>.github.io/wildrift-stats/
export default defineConfig({
  base: '/wildrift-stats/',
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 700,
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
    environment: 'node',
  },
})
