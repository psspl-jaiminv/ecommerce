import type { RequestHandler } from 'express'
import { HttpError } from '../errors.js'

const SAFE_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS'])

function isJsonContentType(header: string | undefined): boolean {
  const mediaType = header?.split(';', 1)[0]?.trim().toLowerCase()
  return mediaType === 'application/json'
}

/**
 * CSRF defence for cookie-authenticated, state-changing requests:
 * - requires `Content-Type: application/json`, which cross-site HTML forms
 *   cannot send and which forces a CORS preflight for cross-origin `fetch`;
 * - rejects requests whose `Origin` header (when present) is not the app's own.
 * Both checks respond 403 `CSRF_REJECTED`.
 */
export function createCsrfGuard({ appOrigin }: { appOrigin: string }): RequestHandler {
  const allowedOrigin = new URL(appOrigin).origin

  return (req, _res, next) => {
    if (SAFE_METHODS.has(req.method)) {
      next()
      return
    }
    if (!isJsonContentType(req.headers['content-type'])) {
      throw new HttpError(403, 'CSRF_REJECTED', 'Content-Type must be application/json')
    }
    const origin = req.headers.origin
    if (origin !== undefined && origin !== allowedOrigin) {
      throw new HttpError(403, 'CSRF_REJECTED', 'Cross-origin request rejected')
    }
    next()
  }
}
