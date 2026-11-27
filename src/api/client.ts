/**
 * Thin, typed wrapper around `fetch` for the same-origin JSON API under `/api`.
 *
 * It never throws: every outcome, including network failures and unexpected
 * responses, is returned as a {@link Result}, so callers must handle errors.
 */

/** Error codes the API (or this client) can produce. Unknown server codes still type-check. */
export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'EMAIL_TAKEN'
  | 'INVALID_CREDENTIALS'
  | 'UNAUTHENTICATED'
  | 'RATE_LIMITED'
  | 'CSRF_REJECTED'
  | 'INTERNAL_ERROR'
  /** The request never reached the server (offline, DNS, connection refused, ...). */
  | 'NETWORK_ERROR'
  /** The server answered with something that is not the documented JSON shape. */
  | 'UNEXPECTED_RESPONSE'
  | (string & {})

/** Per-field validation messages, keyed by request body property. */
export type ApiFieldErrors = Readonly<Partial<Record<string, readonly string[]>>>

export interface ApiError {
  readonly code: ApiErrorCode
  /** Safe to show to users. */
  readonly message: string
  readonly fields?: ApiFieldErrors
}

export type Result<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: ApiError }

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export interface RequestOptions {
  readonly method?: HttpMethod
  /** Serialised as JSON. */
  readonly body?: unknown
  readonly signal?: AbortSignal
}

export const NETWORK_ERROR_MESSAGE =
  'Could not reach the server. Check your connection and try again.'
export const UNEXPECTED_ERROR_MESSAGE = 'Something went wrong. Please try again.'

const networkError: ApiError = { code: 'NETWORK_ERROR', message: NETWORK_ERROR_MESSAGE }
const unexpectedError: ApiError = { code: 'UNEXPECTED_RESPONSE', message: UNEXPECTED_ERROR_MESSAGE }

export const ok = <T>(data: T): Result<T> => ({ ok: true, data })
export const fail = <T = never>(error: ApiError): Result<T> => ({ ok: false, error })

/** Transforms the data of a successful result; errors pass through unchanged. */
export function mapResult<T, U>(result: Result<T>, fn: (data: T) => U): Result<U> {
  return result.ok ? ok(fn(result.data)) : result
}

/**
 * Sends a JSON request and resolves to the parsed response body (`undefined`
 * for 204 No Content). The response body is trusted to match `T`: it comes from
 * our own API, whose contract is mirrored by the types in `src/api/`.
 */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<Result<T>> {
  const { method = 'GET', body, signal } = options
  const headers: Record<string, string> = { Accept: 'application/json' }
  // The server's CSRF guard rejects any non-GET request that is not declared
  // as JSON, including bodiless ones such as logout.
  if (method !== 'GET') headers['Content-Type'] = 'application/json'

  let response: Response
  try {
    response = await fetch(path, {
      method,
      headers,
      credentials: 'same-origin',
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    })
  } catch {
    return fail(networkError)
  }

  const payload = await readJson(response)

  if (response.ok) {
    if (response.status === 204) return ok(undefined as T)
    return payload.ok ? ok(payload.value as T) : fail(unexpectedError)
  }

  return fail(payload.ok ? toApiError(payload.value) : unexpectedError)
}

type JsonPayload = { readonly ok: true; readonly value: unknown } | { readonly ok: false }

async function readJson(response: Response): Promise<JsonPayload> {
  try {
    const text = await response.text()
    return text === '' ? { ok: false } : { ok: true, value: JSON.parse(text) as unknown }
  } catch {
    return { ok: false }
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Narrows an `{ error: { code, message, fields? } }` body; anything else is unexpected. */
function toApiError(body: unknown): ApiError {
  if (!isRecord(body) || !isRecord(body.error)) return unexpectedError
  const { code, message, fields } = body.error
  if (typeof code !== 'string' || typeof message !== 'string') return unexpectedError
  // Server-side failures may carry internal detail in development; never show it.
  if (code === 'INTERNAL_ERROR') return { code, message: UNEXPECTED_ERROR_MESSAGE }
  const parsedFields = toFieldErrors(fields)
  return parsedFields ? { code, message, fields: parsedFields } : { code, message }
}

function toFieldErrors(fields: unknown): ApiFieldErrors | undefined {
  if (!isRecord(fields)) return undefined
  const entries = Object.entries(fields).filter(
    (entry): entry is [string, string[]] =>
      Array.isArray(entry[1]) && entry[1].every((message) => typeof message === 'string'),
  )
  return entries.length > 0 ? Object.fromEntries(entries) : undefined
}
