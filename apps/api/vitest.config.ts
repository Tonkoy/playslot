import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// Nest relies on decorator metadata; SWC emits it for Vitest the same way the
// Nest CLI does for the production build.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts', 'test/**/*.e2e-spec.ts'],
    root: '.',
  },
  plugins: [
    swc.vite({
      module: { type: 'es6' },
    }),
  ],
});
