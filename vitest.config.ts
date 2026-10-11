import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [
    vue(),
    {
      name: 'bun-runtime-externals',
      resolveId(id) {
        if (id === 'bun' || id.startsWith('bun:')) return { id, external: true }
      },
    },
  ],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'happy-dom',
    setupFiles: ['src/test/setup.ts'],
    restoreMocks: true,
    coverage: {
      provider: 'istanbul',
      reporter: ['text', 'json', 'lcov'],
      include: ['src/**/*.ts', 'src/**/*.vue', 'e2e/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'e2e/**/*.test.ts',
        // Browser-driven smoke test against a live instance (bun run e2e:smoke)
        'e2e/smoke.ts',
        'e2e/browser.ts',
        'src/components/ui/**',
        'src/db/schema/**',
        'src/middleware.ts',
        'src/pages/api/auth/**',
        'src/test/**',
      ],
    },
  },
})
