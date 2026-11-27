import type { Request, RequestHandler } from 'express'
import type { AuthService } from '../../auth/authService.js'
import { UnauthenticatedError } from '../../auth/errors.js'
import type { SessionCookie } from '../../auth/sessionCookie.js'
import type { PublicUser } from '../../users/user.js'

export interface RequireAuthDeps {
  readonly auth: Pick<AuthService, 'getUserBySessionToken'>
  readonly sessionCookie: Pick<SessionCookie, 'read'>
}

/** Resolves the `sid` cookie to `req.user`, or responds 401 `UNAUTHENTICATED`. */
export function createRequireAuth({ auth, sessionCookie }: RequireAuthDeps): RequestHandler {
  return async (req, _res, next) => {
    const token = sessionCookie.read(req)
    const user = token ? await auth.getUserBySessionToken(token) : null
    if (!user) throw new UnauthenticatedError()
    req.user = user
    next()
  }
}

/** The user set by `requireAuth`; throws if the route is not protected by it. */
export function authenticatedUser(req: Request): PublicUser {
  if (!req.user) throw new UnauthenticatedError()
  return req.user
}
