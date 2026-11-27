/** A user as exposed to clients and the rest of the app. Never carries the password hash. */
export interface PublicUser {
  readonly id: string
  readonly email: string
  readonly name: string
  readonly createdAt: Date
}

/** Credential lookup result; only the login flow should ever see `passwordHash`. */
export interface UserWithPasswordHash {
  readonly user: PublicUser
  readonly passwordHash: string
}

export interface NewUser {
  readonly email: string
  readonly name: string
  readonly passwordHash: string
}
