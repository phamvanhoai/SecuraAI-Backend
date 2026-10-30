import { vi } from 'vitest';
import type * as AuthRepositoryModule from '../src/modules/authentication-account/auth.repository.js';

// HTTP contract tests use a valid account at the database boundary by default.
// Revocation tests replace this lookup explicitly to exercise real middleware.
vi.mock('../src/modules/authentication-account/auth.repository.js', async (importOriginal) => {
  const actual = await importOriginal<typeof AuthRepositoryModule>();
  return {
    ...actual,
    authRepository: {
      ...actual.authRepository,
      findAccessTokenUser: vi.fn(async () => ({
        status: 'ACTIVE' as const,
        password_changed_at: null,
      })),
    },
  };
});
