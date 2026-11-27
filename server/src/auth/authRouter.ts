import { Router } from 'express'
import type { RequestHandler } from 'express'
import { authenticatedUser } from '../http/middleware/requireAuth.js'
import { parseBody } from '../http/validate.js'
import type { PublicUser } from '../users/user.js'
import type { AuthService } from './authService.js'
import { loginSchema, signupSchema } from './schemas.js'
import type { SessionCookie } from './sessionCookie.js'

export interface UserBody {
  readonly user: PublicUser
}

export interface AuthRouterDeps {
  readonly auth: AuthService
  readonly sessionCookie: SessionCookie
  readonly requireAuth: RequestHandler
  readonly signupRateLimiter: RequestHandler
  readonly loginRateLimiter: RequestHandler
}

/** Mount under `/api/auth`. Expects `cookie-parser`, `express.json()` and the CSRF guard upstream. */
export function createAuthRouter({
  auth,
  sessionCookie,
  requireAuth,
  signupRateLimiter,
  loginRateLimiter,
}: AuthRouterDeps): Router {
  const router = Router()

  // Responses carry user data or set session cookies; never let them be cached.
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store')
    next()
  })

  router.post('/signup', signupRateLimiter, async (req, res) => {
    const input = parseBody(signupSchema, req.body)
    const { user, session } = await auth.signup(input)
    sessionCookie.set(res, session.token)
    const body: UserBody = { user }
    res.status(201).json(body)
  })

  router.post('/login', loginRateLimiter, async (req, res) => {
    const input = parseBody(loginSchema, req.body)
    const { user, session } = await auth.login(input)
    sessionCookie.set(res, session.token)
    const body: UserBody = { user }
    res.status(200).json(body)
  })

  router.post('/logout', async (req, res) => {
    const token = sessionCookie.read(req)
    if (token) await auth.logout(token)
    sessionCookie.clear(res)
    res.status(204).end()
  })

  router.get('/me', requireAuth, (req, res) => {
    const body: UserBody = { user: authenticatedUser(req) }
    res.json(body)
  })

  return router
}
