import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['test/unit/**/*.spec.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'live',
          include: ['test/live/**/*.live.spec.ts'],
          environment: 'node',
          testTimeout: 60000,
          hookTimeout: 60000,
          // Live specs talk to one merchant account: run them one file at a time.
          fileParallelism: false,
        },
      },
    ],
  },
});
