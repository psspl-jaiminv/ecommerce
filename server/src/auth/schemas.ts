import { z } from 'zod'

const requestBody = { error: 'Request body must be a JSON object' }

const email = z
  .string({ error: 'Email is required' })
  .trim()
  .toLowerCase()
  .max(254, { error: 'Email must be at most 254 characters' })
  .pipe(z.email({ error: 'Enter a valid email address' }))

export const signupSchema = z.object(
  {
    name: z
      .string({ error: 'Name is required' })
      .trim()
      .min(1, { error: 'Name is required' })
      .max(100, { error: 'Name must be at most 100 characters' }),
    email,
    // Passwords are never trimmed: whitespace is part of the secret.
    password: z
      .string({ error: 'Password is required' })
      .min(8, { error: 'Password must be at least 8 characters' })
      .max(128, { error: 'Password must be at most 128 characters' }),
  },
  requestBody,
)

export const loginSchema = z.object(
  {
    email,
    password: z
      .string({ error: 'Password is required' })
      .min(1, { error: 'Password is required' })
      .max(128, { error: 'Password must be at most 128 characters' }),
  },
  requestBody,
)

export type SignupInput = z.output<typeof signupSchema>
export type LoginInput = z.output<typeof loginSchema>
