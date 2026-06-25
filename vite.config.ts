import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// GitHub Pages serves project sites under /<repo>/; override with BASE_PATH for custom hosts.
const base = process.env.BASE_PATH ?? '/'

export default defineConfig({
  base,
  plugins: [react()],
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    // Minimax on 4×4 can exceed the default 5s on slower CI runners.
    testTimeout: 20_000,
  },
})
