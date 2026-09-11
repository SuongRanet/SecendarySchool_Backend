import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // The env module validates configuration on import, so tests get a
    // self-contained configuration rather than depending on a developer's .env.
    setupFiles: ['./src/test/setup-env.ts'],
    // A suite whose setup throws never reaches its teardown, and the academic
    // year it created then blocks every later fixture that wants the same
    // window. Clearing those once, before anything runs, keeps a past failure
    // from being mistaken for a present one.
    globalSetup: ['./src/test/clear-orphan-fixtures.ts'],
    // The API suites share one PostgreSQL database: they create academic years,
    // which may not overlap, and records with unique codes. Run test files one
    // at a time so two suites cannot claim the same slot at the same moment.
    fileParallelism: false,
  },
});
