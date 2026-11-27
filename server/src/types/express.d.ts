import type { PublicUser } from '../users/user.js'

declare global {
  namespace Express {
    interface Request {
      /** Set by `requireAuth`; use `authenticatedUser(req)` to read it in protected handlers. */
      user?: PublicUser
    }
  }
}

export {}
