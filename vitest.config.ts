import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@apptypes': path.resolve(__dirname, 'types'),
      '@schemas': path.resolve(__dirname, 'schemas'),
      '@config': path.resolve(__dirname, 'config'),
      '@agents': path.resolve(__dirname, 'agents'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 30000,
  },
});
