import type { CookieOptions, Request, Response } from 'express'
import type { Config } from '../config.js'

export const SESSION_COOKIE_NAME = 'sid'

const DAY_MS = 24 * 60 * 60 * 1000

export interface SessionCookie {
  /** The raw session token from the request, if any. Requires `cookie-parser`. */
  read(req: Request): string | undefined
  set(res: Response, token: string): void
  clear(res: Response): void
}

export function sessionTtlMs(config: Pick<Config, 'sessionTtlDays'>): number {
  return config.sessionTtlDays * DAY_MS
}

export function createSessionCookie(
  config: Pick<Config, 'nodeEnv' | 'sessionTtlDays'>,
): SessionCookie {
  const attributes: CookieOptions = {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.nodeEnv === 'production',
    path: '/',
  }
  const maxAge = sessionTtlMs(config)

  return {
    read(req) {
      const value: unknown = (req.cookies as Record<string, unknown> | undefined)?.[
        SESSION_COOKIE_NAME
      ]
      return typeof value === 'string' && value !== '' ? value : undefined
    },
    set(res, token) {
      res.cookie(SESSION_COOKIE_NAME, token, { ...attributes, maxAge })
    },
    clear(res) {
      // Attributes must match the ones the cookie was set with, or browsers keep it.
      res.clearCookie(SESSION_COOKIE_NAME, attributes)
    },
  }
}
