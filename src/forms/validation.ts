/** One message per field, for the fields that are invalid. */
export type FieldErrors<F extends string> = Partial<Record<F, string>>

/** Either the normalised input ready to send, or the per-field errors. */
export type Validation<I, F extends string> =
  | { readonly ok: true; readonly value: I }
  | { readonly ok: false; readonly errors: FieldErrors<F> }

export const valid = <I>(value: I): Validation<I, never> => ({ ok: true, value })

/** Builds a validation outcome: `value` is used only if no field has an error. */
export function collect<I, F extends string>(
  errors: Partial<Record<F, string | undefined>>,
  value: () => I,
): Validation<I, F> {
  const present = Object.fromEntries(
    Object.entries(errors).filter((entry): entry is [F, string] => typeof entry[1] === 'string'),
  ) as FieldErrors<F>
  return Object.keys(present).length > 0 ? { ok: false, errors: present } : valid(value())
}
