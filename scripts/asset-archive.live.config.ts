import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['scripts/asset-archive.live.ts'], environment: 'node', testTimeout: 60000 } });
