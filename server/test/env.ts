import { config as loadDotenv } from 'dotenv'
import { z } from 'zod'

const testEnvSchema = z.object({
  TEST_DATABASE_URL: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z
      .string({ error: 'TEST_DATABASE_URL is required to run the server tests (see .env.example)' })
      .pipe(
        z.url({ protocol: /^postgres(ql)?$/, error: 'TEST_DATABASE_URL must be a postgres:// URL' }),
      ),
  ),
  DATABASE_URL: z.string().optional(),
})

/**
 * Returns the test database URL from the environment (or `.env`).
 * Refuses to run against `DATABASE_URL`, because the suite truncates tables.
 */
export function getTestDatabaseUrl(): string {
  loadDotenv({ quiet: true })
  const result = testEnvSchema.safeParse(process.env)
  if (!result.success) {
    throw new Error(result.error.issues.map((issue) => issue.message).join('\n'))
  }
  const { TEST_DATABASE_URL, DATABASE_URL } = result.data
  if (TEST_DATABASE_URL === DATABASE_URL) {
    throw new Error(
      'TEST_DATABASE_URL must differ from DATABASE_URL: the test suite truncates every table.',
    )
  }
  return TEST_DATABASE_URL
}
