import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // The env module validates configuration on import, so tests get a
    // self-contained configuration rather than depending on a developer's .env.
    setupFiles: ['./src/test/setup-env.ts'],
    // The API suites share one PostgreSQL database: they create academic years,
    // which may not overlap, and records with unique codes. Run test files one
    // at a time so two suites cannot claim the same slot at the same moment.
    fileParallelism: false,
  },
});
