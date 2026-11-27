import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { vi } from 'vitest'
import type { Mock } from 'vitest'
import App from '../App.tsx'
import type { AuthApi, PublicUser } from '../api/auth.ts'
import { fail, ok } from '../api/client.ts'
import type { ApiError } from '../api/client.ts'
import { AuthProvider } from '../auth/AuthContext.tsx'

export const testUser: PublicUser = {
  id: '6f1c2a4e-8d7b-4c1a-9e2f-3b5d7a9c1e0f',
  email: 'ada@example.com',
  name: 'Ada Lovelace',
  createdAt: '2026-11-27T12:00:00.000Z',
}

export const unauthenticated: ApiError = { code: 'UNAUTHENTICATED', message: 'Authentication required' }

export type FakeAuthApi = { readonly [K in keyof AuthApi]: Mock<AuthApi[K]> }

/** An auth API double. By default nobody is signed in and every other call succeeds. */
export function createFakeAuthApi(): FakeAuthApi {
  return {
    me: vi.fn<AuthApi['me']>().mockResolvedValue(fail(unauthenticated)),
    login: vi.fn<AuthApi['login']>().mockResolvedValue(ok(testUser)),
    signup: vi.fn<AuthApi['signup']>().mockResolvedValue(ok(testUser)),
    logout: vi.fn<AuthApi['logout']>().mockResolvedValue(ok(undefined)),
  }
}

/** Renders the whole app at `route` against `api`. */
export function renderApp(route: string, api: FakeAuthApi = createFakeAuthApi()) {
  const user = userEvent.setup()
  const view = render(
    <MemoryRouter initialEntries={[route]}>
      <AuthProvider api={api}>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  )
  return { ...view, user, api }
}

/** A promise you settle by hand, to observe in-flight UI states. */
export function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}
