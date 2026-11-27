import { z } from 'zod'
import { ValidationError } from './errors.js'

/**
 * Parses a request body against `schema`, or throws a {@link ValidationError}
 * with per-field messages. Input values are never echoed back in messages.
 */
export function parseBody<S extends z.ZodType>(schema: S, body: unknown): z.output<S> {
  const result = schema.safeParse(body)
  if (result.success) return result.data

  const { formErrors, fieldErrors } = z.flattenError(result.error)
  const fields = Object.fromEntries(
    Object.entries(fieldErrors).filter(
      (entry): entry is [string, string[]] => Array.isArray(entry[1]) && entry[1].length > 0,
    ),
  )
  throw new ValidationError(formErrors[0] ?? 'Request body is invalid', fields)
}
