import { useState } from 'react'
import type { FormEvent } from 'react'
import type { ApiError, ApiErrorCode, Result } from '../api/client.ts'
import type { FieldErrors, Validation } from './validation.ts'

export interface UseFormOptions<F extends string, I, R> {
  /** Also defines the field order used to focus the first invalid field. */
  readonly initialValues: Readonly<Record<F, string>>
  readonly validate: (values: Readonly<Record<F, string>>) => Validation<I, F>
  readonly submit: (input: I) => Promise<Result<R>>
  readonly onSuccess: (data: R) => void
  /** Server error codes that concern a single field, e.g. `EMAIL_TAKEN` → `email`. */
  readonly fieldForErrorCode?: Readonly<Partial<Record<ApiErrorCode, NoInfer<F>>>>
}

export interface FormController<F extends string> {
  readonly values: Readonly<Record<F, string>>
  readonly fieldErrors: FieldErrors<F>
  /** An error that belongs to no single field; render it in a `role="alert"` region. */
  readonly formError: string | undefined
  readonly submitting: boolean
  readonly setValue: (field: F, value: string) => void
  readonly handleSubmit: (event: FormEvent<HTMLFormElement>) => void
}

interface ErrorPlacement<F extends string> {
  readonly fieldErrors: FieldErrors<F>
  readonly formError: string | undefined
}

/**
 * Form state for "validate locally, then submit to the API" forms. Invalid
 * input never reaches `submit`; server errors are placed under their field
 * when possible and otherwise reported as a form-level error.
 */
export function useForm<F extends string, I, R>({
  initialValues,
  validate,
  submit,
  onSuccess,
  fieldForErrorCode = {},
}: UseFormOptions<F, I, R>): FormController<F> {
  const fields = Object.keys(initialValues) as F[]
  const [values, setValues] = useState(initialValues)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<F>>({})
  const [formError, setFormError] = useState<string>()
  const [submitting, setSubmitting] = useState(false)

  const setValue = (field: F, value: string) => {
    setValues((current) => ({ ...current, [field]: value }))
    // The message described the previous value; drop it once the user edits.
    setFieldErrors((current) => {
      if (current[field] === undefined) return current
      const next = { ...current }
      delete next[field]
      return next
    })
  }

  const showErrors = (form: HTMLFormElement, placement: ErrorPlacement<F>) => {
    setFieldErrors(placement.fieldErrors)
    setFormError(placement.formError)
    const firstInvalid = fields.find((field) => placement.fieldErrors[field] !== undefined)
    if (firstInvalid) focusField(form, firstInvalid)
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitting) return
    const form = event.currentTarget

    const validation = validate(values)
    if (!validation.ok) {
      showErrors(form, { fieldErrors: validation.errors, formError: undefined })
      return
    }

    setFieldErrors({})
    setFormError(undefined)
    setSubmitting(true)
    void submit(validation.value).then((result) => {
      if (result.ok) {
        // The page usually navigates away here, so leave the form as it is.
        onSuccess(result.data)
        return
      }
      setSubmitting(false)
      showErrors(form, placeApiError(result.error, fields, fieldForErrorCode))
    })
  }

  return { values, fieldErrors, formError, submitting, setValue, handleSubmit }
}

function placeApiError<F extends string>(
  error: ApiError,
  fields: readonly F[],
  fieldForErrorCode: Readonly<Partial<Record<ApiErrorCode, F>>>,
): ErrorPlacement<F> {
  const codeField = fieldForErrorCode[error.code]
  if (codeField) return { fieldErrors: { [codeField]: error.message } as FieldErrors<F>, formError: undefined }

  const fieldErrors: FieldErrors<F> = {}
  for (const field of fields) {
    const message = error.fields?.[field]?.[0]
    if (message !== undefined) fieldErrors[field] = message
  }
  const placedAny = Object.keys(fieldErrors).length > 0
  return { fieldErrors, formError: placedAny ? undefined : error.message }
}

function focusField(form: HTMLFormElement, field: string) {
  const element = form.elements.namedItem(field)
  if (element instanceof HTMLElement) element.focus()
}
