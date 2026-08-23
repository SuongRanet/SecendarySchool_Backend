import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // The env module validates configuration on import, so tests get a
    // self-contained configuration rather than depending on a developer's .env.
    setupFiles: ['./src/test/setup-env.ts'],
  },
});
