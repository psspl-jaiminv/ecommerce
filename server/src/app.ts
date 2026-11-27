import cookieParser from 'cookie-parser'
import express, { type Express } from 'express'
import type { Config } from './config.js'
import type { Db } from './db/pool.js'
import { createErrorHandler, notFoundHandler } from './http/errors.js'
import type { Logger } from './logger.js'
import { createHealthRouter } from './routes/health.js'

export interface AppDeps {
  readonly db: Db
  readonly config: Config
  /** Defaults to `console`. */
  readonly logger?: Logger
}

export function createApp({ db, config, logger = console }: AppDeps): Express {
  const app = express()

  app.disable('x-powered-by')
  app.use(express.json({ limit: '10kb' }))
  app.use(cookieParser())

  app.use('/api', createHealthRouter(db))

  app.use(notFoundHandler)
  app.use(createErrorHandler({ nodeEnv: config.nodeEnv, logger }))

  return app
}
