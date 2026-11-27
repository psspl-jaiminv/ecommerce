import type { RequestHandler } from 'express'
import { rateLimit } from 'express-rate-limit'
import type { RateLimitConfig } from '../../config.js'
import { HttpError } from '../errors.js'

const passThrough: RequestHandler = (_req, _res, next) => next()

/**
 * Per-IP limiter; a disabled config yields a no-op. Each call creates an
 * independent in-memory counter, so limits are per process and per route.
 * Exceeding the limit responds 429 `RATE_LIMITED` via the central error handler.
 */
export function createRateLimiter(config: RateLimitConfig): RequestHandler {
  if (!config.enabled) return passThrough

  return rateLimit({
    windowMs: config.windowMs,
    limit: config.limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, _res, next) => {
      next(new HttpError(429, 'RATE_LIMITED', 'Too many requests, please try again later'))
    },
  })
}
