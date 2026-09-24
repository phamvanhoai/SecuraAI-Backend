import { fileURLToPath, URL } from 'node:url';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'node',
    exclude: [...configDefaults.exclude, 'reference/legacy-v3/**'],
    testTimeout: 30_000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
      JWT_ACCESS_SECRET: 'test-secret-with-at-least-thirty-two-characters',
      LOG_LEVEL: 'silent',
    },
  },
});
