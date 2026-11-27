import { Router } from 'express'
import type { Db } from '../db/pool.js'
import { HttpError } from '../http/errors.js'

export interface HealthBody {
  readonly status: 'ok'
}

/** `GET /health`: 200 when the database answers, 503 otherwise. */
export function createHealthRouter(db: Db): Router {
  const router = Router()

  router.get('/health', async (_req, res) => {
    try {
      await db.query('SELECT 1')
    } catch (cause) {
      throw new HttpError(503, 'SERVICE_UNAVAILABLE', 'Database is unavailable', {
        cause,
      })
    }
    const body: HealthBody = { status: 'ok' }
    res.set('Cache-Control', 'no-store').json(body)
  })

  return router
}
