/**
 * Test environment.
 *
 * `config/env` validates the configuration the moment it is imported, so the
 * test run supplies its own values instead of reading a developer's `.env`.
 * These point at nothing real — the unit tests cover pure logic and never open a
 * database connection.
 */
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/primary_school_test';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-only-access-secret-value-0123456789';
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET ?? 'test-only-refresh-secret-value-0123456789';
process.env.LOG_LEVEL = 'error';
