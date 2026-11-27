import { Link, useNavigate } from 'react-router'
import { useAuth } from '../auth/useAuth.ts'
import { validateLogin } from '../auth/validation.ts'
import type { LoginValues } from '../auth/validation.ts'
import { AuthCard, FormAlert } from '../components/AuthCard.tsx'
import { FormField } from '../components/FormField.tsx'
import { useForm } from '../forms/useForm.ts'

const initialValues: LoginValues = { email: '', password: '' }

export function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const form = useForm({
    initialValues,
    validate: validateLogin,
    submit: login,
    onSuccess: () => navigate('/', { replace: true }),
  })

  return (
    <AuthCard
      title="Log in"
      footer={
        <p>
          Don&apos;t have an account? <Link to="/signup">Sign up</Link>
        </p>
      }
    >
      <form className="auth-form" noValidate onSubmit={form.handleSubmit}>
        <FormAlert message={form.formError} />
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
          autoComplete="current-password"
          required
          value={form.values.password}
          onValueChange={(value) => form.setValue('password', value)}
          error={form.fieldErrors.password}
        />
        <button type="submit" disabled={form.submitting}>
          {form.submitting ? 'Logging in…' : 'Log in'}
        </button>
      </form>
    </AuthCard>
  )
}
