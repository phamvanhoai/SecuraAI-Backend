import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

// Focused component-integration suite for the mandatory durable queue.
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'node',
    setupFiles: ['tests/auth-boundary.setup.ts'],
    include: ['tests/durable-detection-pipeline.integration.test.ts'],
    testTimeout: 30_000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
      JWT_ACCESS_SECRET: 'test-secret-with-at-least-thirty-two-characters',
      LOG_LEVEL: 'silent',
    },
  },
});
