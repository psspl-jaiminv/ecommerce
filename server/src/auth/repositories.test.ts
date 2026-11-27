import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createTestDb, truncateAll } from '../../test/db.js'
import { createUserRepository } from '../users/userRepository.js'
import { EmailTakenError } from './errors.js'
import { createSessionRepository } from './sessionRepository.js'
import { hashSessionToken } from './sessionToken.js'

const { db, pool } = createTestDb()
const users = createUserRepository(db)
const sessions = createSessionRepository(db)

const newUser = { email: 'Ada@Example.com ', name: 'Ada', passwordHash: '$argon2id$fake' }
const inOneHour = () => new Date(Date.now() + 3_600_000)
const anHourAgo = () => new Date(Date.now() - 3_600_000)

beforeEach(async () => {
  await truncateAll(db)
})

afterAll(async () => {
  await pool.end()
})

describe('userRepository', () => {
  it('creates a user with a normalised email and returns it without the hash', async () => {
    const user = await users.create(newUser)

    expect(user).toEqual({
      id: expect.any(String),
      email: 'ada@example.com',
      name: 'Ada',
      createdAt: expect.any(Date),
    })
    expect(await users.findById(user.id)).toEqual(user)
  })

  it('maps a duplicate email to EmailTakenError', async () => {
    await users.create(newUser)

    await expect(users.create({ ...newUser, email: 'ADA@example.com' })).rejects.toBeInstanceOf(
      EmailTakenError,
    )
  })

  it('finds credentials by email case-insensitively', async () => {
    const user = await users.create(newUser)

    expect(await users.findByEmail(' ADA@EXAMPLE.COM')).toEqual({
      user,
      passwordHash: newUser.passwordHash,
    })
    expect(await users.findByEmail('nobody@example.com')).toBeNull()
  })

  it('returns null for an unknown id', async () => {
    expect(await users.findById('00000000-0000-4000-8000-000000000000')).toBeNull()
  })

  it('treats user input as data, not SQL', async () => {
    expect(await users.findByEmail(`' OR '1'='1`)).toBeNull()
  })
})

describe('sessionRepository', () => {
  it('finds a valid session with its user, and nothing once deleted', async () => {
    const user = await users.create(newUser)
    const hash = hashSessionToken('token-a')
    await sessions.create(user.id, hash, inOneHour())

    expect(await sessions.findValid(hash)).toEqual(user)
    expect(await sessions.findValid(hashSessionToken('token-b'))).toBeNull()

    await sessions.delete(hash)
    expect(await sessions.findValid(hash)).toBeNull()
  })

  it('ignores expired sessions and deleteExpired removes only those', async () => {
    const user = await users.create(newUser)
    const expired = hashSessionToken('expired')
    const live = hashSessionToken('live')
    await sessions.create(user.id, expired, anHourAgo())
    await sessions.create(user.id, live, inOneHour())

    expect(await sessions.findValid(expired)).toBeNull()
    expect(await sessions.deleteExpired()).toBe(1)
    expect(await sessions.findValid(live)).toEqual(user)
  })
})
