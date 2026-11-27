import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'server',
          environment: 'node',
          include: ['server/**/*.test.ts'],
          // Migrates TEST_DATABASE_URL once per run.
          globalSetup: ['server/test/global-setup.ts'],
          // Test files share one database and truncate it, so run them serially.
          fileParallelism: false,
        },
      },
    ],
  },
})
