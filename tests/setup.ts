import { vi } from 'vitest';

// HTTP tests issue synthetic JWTs without a database. Mock the database boundary,
// keeping middleware and account-access business rules real.
vi.mock('../src/modules/auth/account-access.repository.js', () => ({
  accountAccessRepository: {
    findById: vi.fn(async () => ({ status: 'active', deleted_at: null })),
  },
}));
