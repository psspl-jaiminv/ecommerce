import type { ReactNode } from 'react'

interface AuthCardProps {
  readonly title: string
  readonly children: ReactNode
  /** Secondary content under the card body, e.g. a link to the other auth page. */
  readonly footer?: ReactNode
}

/** The centred card shared by the login, signup and home pages. */
export function AuthCard({ title, children, footer }: AuthCardProps) {
  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="auth-card-title">
        <h1 id="auth-card-title">{title}</h1>
        {children}
        {footer !== undefined && <footer className="auth-card-footer">{footer}</footer>}
      </section>
    </main>
  )
}

/** Live region for errors that belong to no single field. Always mounted so updates are announced. */
export function FormAlert({ message }: { readonly message: string | undefined }) {
  return (
    <div role="alert" className="form-alert">
      {message}
    </div>
  )
}
