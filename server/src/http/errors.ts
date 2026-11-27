import type { ErrorRequestHandler, RequestHandler } from 'express'
import type { NodeEnv } from '../config.js'
import type { Logger } from '../logger.js'

/** Wire format for every error response the API sends. */
export interface ErrorBody {
  readonly error: {
    readonly code: string
    readonly message: string
  }
}

/** An error that is safe to expose to clients: its status, code and message are sent as-is. */
export class HttpError extends Error {
  readonly status: number
  readonly code: string

  constructor(
    status: number,
    code: string,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options)
    this.name = 'HttpError'
    this.status = status
    this.code = code
  }
}

/**
 * Shape of the client errors raised by Express' own middleware (body-parser,
 * `http-errors`): a 4xx `status`, `expose: true` and an optional `type`.
 */
interface ExposableClientError {
  status: number
  expose: true
  type?: string
  message: string
}

const BODY_PARSER_CODES: Readonly<Record<string, string>> = {
  'entity.parse.failed': 'INVALID_JSON',
  'entity.too.large': 'PAYLOAD_TOO_LARGE',
  'encoding.unsupported': 'UNSUPPORTED_ENCODING',
  'charset.unsupported': 'UNSUPPORTED_CHARSET',
}

function isExposableClientError(err: unknown): err is ExposableClientError {
  if (typeof err !== 'object' || err === null) return false
  const { status, expose } = err as Record<string, unknown>
  return (
    expose === true &&
    typeof status === 'number' &&
    status >= 400 &&
    status < 500
  )
}

const errorBody = (code: string, message: string): ErrorBody => ({
  error: { code, message },
})

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new HttpError(404, 'NOT_FOUND', `Route ${req.method} ${req.path} not found`))
}

interface ErrorHandlerDeps {
  nodeEnv: NodeEnv
  logger: Logger
}

/**
 * Central error handler. Always responds with an {@link ErrorBody}; stack
 * traces are only logged server-side, never sent. In production, messages of
 * unexpected errors are replaced by a generic one.
 */
export function createErrorHandler({
  nodeEnv,
  logger,
}: ErrorHandlerDeps): ErrorRequestHandler {
  return (err: unknown, req, res, next) => {
    if (res.headersSent) {
      // Too late to send a JSON body; let Express close the connection.
      next(err)
      return
    }

    if (err instanceof HttpError) {
      if (err.status >= 500) logger.error(`${req.method} ${req.path} failed`, err)
      res.status(err.status).json(errorBody(err.code, err.message))
      return
    }

    if (isExposableClientError(err)) {
      const code = (err.type && BODY_PARSER_CODES[err.type]) || 'BAD_REQUEST'
      res.status(err.status).json(errorBody(code, err.message))
      return
    }

    logger.error(`${req.method} ${req.path} failed`, err)
    const message =
      nodeEnv === 'production' || !(err instanceof Error)
        ? 'Internal server error'
        : err.message
    res.status(500).json(errorBody('INTERNAL_ERROR', message))
  }
}
