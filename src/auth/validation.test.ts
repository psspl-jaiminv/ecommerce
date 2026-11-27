import { describe, expect, it } from 'vitest'
import { validateLogin, validateSignup } from './validation.ts'

describe('validateSignup', () => {
  const valid = { name: 'Ada', email: 'ada@example.com', password: 'password1' }

  it('normalises valid input like the server does', () => {
    expect(validateSignup({ name: '  Ada ', email: ' ADA@Example.COM ', password: ' pass word ' })).toEqual({
      ok: true,
      value: { name: 'Ada', email: 'ada@example.com', password: ' pass word ' },
    })
  })

  it.each([
    [{ name: ' ' }, { name: 'Name is required' }],
    [{ name: 'x'.repeat(101) }, { name: 'Name must be at most 100 characters' }],
    [{ name: 'x'.repeat(100) }, undefined],
    [{ email: '' }, { email: 'Email is required' }],
    [{ email: 'ada@example' }, { email: 'Enter a valid email address' }],
    [{ email: 'ada..x@example.com' }, { email: 'Enter a valid email address' }],
    [{ email: `${'a'.repeat(243)}@example.com` }, { email: 'Email must be at most 254 characters' }],
    [{ password: '' }, { password: 'Password is required' }],
    [{ password: '1234567' }, { password: 'Password must be at least 8 characters' }],
    [{ password: '12345678' }, undefined],
    [{ password: 'x'.repeat(129) }, { password: 'Password must be at most 128 characters' }],
    [{ password: 'x'.repeat(128) }, undefined],
  ])('%o → %o', (override, errors) => {
    const result = validateSignup({ ...valid, ...override })
    if (errors === undefined) expect(result.ok).toBe(true)
    else expect(result).toEqual({ ok: false, errors })
  })
})

describe('validateLogin', () => {
  it('accepts any non-empty password (password rules may have changed since signup)', () => {
    expect(validateLogin({ email: 'Ada@example.com', password: 'x' })).toEqual({
      ok: true,
      value: { email: 'ada@example.com', password: 'x' },
    })
  })

  it('reports every invalid field at once', () => {
    expect(validateLogin({ email: '', password: '' })).toEqual({
      ok: false,
      errors: { email: 'Email is required', password: 'Password is required' },
    })
  })
})
