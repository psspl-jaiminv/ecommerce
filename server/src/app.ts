import cookieParser from 'cookie-parser'
import express, { type Express } from 'express'
import { createAuthRouter } from './auth/authRouter.js'
import { createAuthService } from './auth/authService.js'
import { createArgon2PasswordHasher, type PasswordHasher } from './auth/passwordHasher.js'
import { createSessionCookie, sessionTtlMs } from './auth/sessionCookie.js'
import { createSessionRepository } from './auth/sessionRepository.js'
import type { Config } from './config.js'
import type { Db } from './db/pool.js'
import { createErrorHandler, notFoundHandler } from './http/errors.js'
import { createCsrfGuard } from './http/middleware/csrfGuard.js'
import { createRateLimiter } from './http/middleware/rateLimit.js'
import { createRequireAuth } from './http/middleware/requireAuth.js'
import type { Logger } from './logger.js'
import { createHealthRouter } from './routes/health.js'
import { createUserRepository } from './users/userRepository.js'

export interface AppDeps {
  readonly db: Db
  readonly config: Config
  /** Defaults to `console`. */
  readonly logger?: Logger
  /** Defaults to argon2id. */
  readonly passwordHasher?: PasswordHasher
}

export function createApp({
  db,
  config,
  logger = console,
  passwordHasher = createArgon2PasswordHasher(),
}: AppDeps): Express {
  const app = express()

  const sessionCookie = createSessionCookie(config)
  const auth = createAuthService({
    users: createUserRepository(db),
    sessions: createSessionRepository(db),
    passwordHasher,
    sessionTtlMs: sessionTtlMs(config),
    logger,
  })
  const requireAuth = createRequireAuth({ auth, sessionCookie })

  app.disable('x-powered-by')
  // Before body parsing, so rejected requests are not parsed at all.
  app.use(createCsrfGuard(config))
  app.use(express.json({ limit: '10kb' }))
  app.use(cookieParser())

  app.use('/api', createHealthRouter(db))
  app.use(
    '/api/auth',
    createAuthRouter({
      auth,
      sessionCookie,
      requireAuth,
      signupRateLimiter: createRateLimiter(config.authRateLimit),
      loginRateLimiter: createRateLimiter(config.authRateLimit),
    }),
  )

  app.use(notFoundHandler)
  app.use(createErrorHandler({ nodeEnv: config.nodeEnv, logger }))

  return app
}
