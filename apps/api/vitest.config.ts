import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 10_000,
    hookTimeout: 10_000,
    include: ['src/**/*.test.ts'],
    // Ensure clean module state between test files
    isolate: true,
  },
  resolve: {
    alias: {
      '@rivertown/shared': path.resolve(__dirname, '../../packages/shared/src'),
      '@rivertown/db': path.resolve(__dirname, '../../packages/db/src'),
    },
  },
});
