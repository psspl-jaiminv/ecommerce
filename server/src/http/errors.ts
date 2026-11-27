import type { ErrorRequestHandler, RequestHandler } from 'express'
import {
  EmailTakenError,
  InvalidCredentialsError,
  UnauthenticatedError,
} from '../auth/errors.js'
import type { NodeEnv } from '../config.js'
import type { Logger } from '../logger.js'

/** Per-field validation messages, keyed by request body field name. */
export type FieldErrors = Readonly<Record<string, readonly string[]>>

/** Wire format for every error response the API sends. */
export interface ErrorBody {
  readonly error: {
    readonly code: string
    readonly message: string
    /** Only present on `VALIDATION_ERROR` responses. */
    readonly fields?: FieldErrors
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

/** 400 `VALIDATION_ERROR` with per-field messages. */
export class ValidationError extends HttpError {
  readonly fields: FieldErrors

  constructor(message: string, fields: FieldErrors) {
    super(400, 'VALIDATION_ERROR', message)
    this.name = 'ValidationError'
    this.fields = fields
  }
}

/** Maps domain errors to their HTTP representation; `undefined` for anything else. */
function fromDomainError(err: unknown): HttpError | undefined {
  if (err instanceof EmailTakenError) {
    return new HttpError(409, err.code, err.message)
  }
  if (err instanceof InvalidCredentialsError || err instanceof UnauthenticatedError) {
    return new HttpError(401, err.code, err.message)
  }
  return undefined
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

const errorBody = (code: string, message: string, fields?: FieldErrors): ErrorBody => ({
  error: fields ? { code, message, fields } : { code, message },
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

    const httpError = err instanceof HttpError ? err : fromDomainError(err)
    if (httpError) {
      if (httpError.status >= 500) logger.error(`${req.method} ${req.path} failed`, httpError)
      const fields = httpError instanceof ValidationError ? httpError.fields : undefined
      res.status(httpError.status).json(errorBody(httpError.code, httpError.message, fields))
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
