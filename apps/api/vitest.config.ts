import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// Unit tests only (no database). Nest relies on decorator metadata; SWC emits it
// for Vitest the same way the Nest CLI does for the production build.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    root: '.',
  },
  plugins: [
    swc.vite({
      module: { type: 'es6' },
    }),
  ],
});
