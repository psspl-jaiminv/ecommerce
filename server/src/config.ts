import { z } from 'zod'

/** Treat empty strings (e.g. `PORT=` in a .env file) as "not set". */
const unsetIfEmpty = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema)

const postgresUrl = z.url({
  protocol: /^postgres(ql)?$/,
  error: 'must be a postgres:// or postgresql:// connection URL',
})

const envSchema = z
  .object({
    DATABASE_URL: unsetIfEmpty(
      z.string({ error: 'is required' }).pipe(postgresUrl),
    ),
    PORT: unsetIfEmpty(
      z.coerce
        .number({ error: 'must be a number' })
        .int({ error: 'must be an integer' })
        .min(1, { error: 'must be between 1 and 65535' })
        .max(65535, { error: 'must be between 1 and 65535' })
        .default(3001),
    ),
    NODE_ENV: unsetIfEmpty(
      z
        .enum(['development', 'test', 'production'], {
          error: 'must be one of development, test, production',
        })
        .default('development'),
    ),
    APP_ORIGIN: unsetIfEmpty(
      z
        .url({ protocol: /^https?$/, error: 'must be an http(s) URL' })
        .default('http://localhost:5173'),
    ),
    SESSION_TTL_DAYS: unsetIfEmpty(
      z.coerce
        .number({ error: 'must be a number' })
        .int({ error: 'must be an integer' })
        .positive({ error: 'must be a positive number of days' })
        .default(7),
    ),
  })
  .transform((env) => ({
    databaseUrl: env.DATABASE_URL,
    port: env.PORT,
    nodeEnv: env.NODE_ENV,
    appOrigin: env.APP_ORIGIN,
    sessionTtlDays: env.SESSION_TTL_DAYS,
  }))

export type Config = Readonly<z.output<typeof envSchema>>
export type NodeEnv = Config['nodeEnv']

export class ConfigError extends Error {
  readonly issues: readonly string[]

  constructor(issues: readonly string[]) {
    super(
      `Invalid server configuration:\n${issues.map((issue) => `  - ${issue}`).join('\n')}`,
    )
    this.name = 'ConfigError'
    this.issues = issues
  }
}

/**
 * Parses and validates environment variables into a typed {@link Config}.
 * Throws a {@link ConfigError} listing every invalid variable.
 */
export function loadConfig(
  env: Record<string, string | undefined> = process.env,
): Config {
  const result = envSchema.safeParse(env)
  if (!result.success) {
    throw new ConfigError(
      result.error.issues.map(
        (issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`,
      ),
    )
  }
  return Object.freeze(result.data)
}
