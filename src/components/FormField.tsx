import { useId } from 'react'
import type { InputHTMLAttributes } from 'react'

type ManagedInputProps = 'id' | 'name' | 'value' | 'onChange' | 'aria-invalid' | 'aria-describedby'

export interface FormFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, ManagedInputProps> {
  readonly label: string
  readonly name: string
  readonly value: string
  readonly onValueChange: (value: string) => void
  /** Persistent help text, e.g. password rules. Linked via `aria-describedby`. */
  readonly hint?: string
  /** Shown under the input and linked to it via `aria-describedby`. */
  readonly error?: string
}

/** A labelled text input with hint and error slots wired up for assistive technology. */
export function FormField({
  label,
  name,
  value,
  onValueChange,
  hint,
  error,
  ...inputProps
}: FormFieldProps) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const invalid = error !== undefined
  const describedBy = [invalid && errorId, hint !== undefined && hintId].filter(Boolean).join(' ')

  return (
    <div className="form-field">
      <label htmlFor={id}>{label}</label>
      <input
        {...inputProps}
        id={id}
        name={name}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        aria-invalid={invalid}
        aria-describedby={describedBy || undefined}
      />
      {hint !== undefined && (
        <p id={hintId} className="form-field-hint">
          {hint}
        </p>
      )}
      {invalid && (
        <p id={errorId} className="form-field-error">
          {error}
        </p>
      )}
    </div>
  )
}
