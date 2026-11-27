import { Link, useNavigate } from 'react-router'
import { useAuth } from '../auth/useAuth.ts'
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, validateSignup } from '../auth/validation.ts'
import type { SignupValues } from '../auth/validation.ts'
import { AuthCard, FormAlert } from '../components/AuthCard.tsx'
import { FormField } from '../components/FormField.tsx'
import { useForm } from '../forms/useForm.ts'

const initialValues: SignupValues = { name: '', email: '', password: '' }

export function SignupPage() {
  const { signup } = useAuth()
  const navigate = useNavigate()
  const form = useForm({
    initialValues,
    validate: validateSignup,
    submit: signup,
    onSuccess: () => navigate('/', { replace: true }),
    fieldForErrorCode: { EMAIL_TAKEN: 'email' },
  })

  return (
    <AuthCard
      title="Create an account"
      footer={
        <p>
          Already have an account? <Link to="/login">Log in</Link>
        </p>
      }
    >
      <form className="auth-form" noValidate onSubmit={form.handleSubmit}>
        <FormAlert message={form.formError} />
        <FormField
          label="Name"
          name="name"
          type="text"
          autoComplete="name"
          required
          value={form.values.name}
          onValueChange={(value) => form.setValue('name', value)}
          error={form.fieldErrors.name}
        />
        <FormField
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={form.values.email}
          onValueChange={(value) => form.setValue('email', value)}
          error={form.fieldErrors.email}
        />
        <FormField
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          hint={`${PASSWORD_MIN_LENGTH}–${PASSWORD_MAX_LENGTH} characters`}
          value={form.values.password}
          onValueChange={(value) => form.setValue('password', value)}
          error={form.fieldErrors.password}
        />
        <button type="submit" disabled={form.submitting}>
          {form.submitting ? 'Creating account…' : 'Sign up'}
        </button>
      </form>
    </AuthCard>
  )
}
