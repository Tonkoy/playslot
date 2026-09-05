import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// Integration/E2E tests that hit a real Postgres (spec §25). Requires
// DATABASE_URL to point at a disposable test database with migrations applied.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.e2e-spec.ts'],
    root: '.',
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false, // share one DB; avoid cross-file races
    setupFiles: ['test/setup-e2e.ts'],
  },
  plugins: [
    swc.vite({
      module: { type: 'es6' },
    }),
  ],
});
