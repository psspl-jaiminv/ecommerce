import { describe, expect, it } from 'vitest'
import { ConfigError, loadConfig } from './config.js'

const DATABASE_URL = 'postgres://app:app@localhost:5432/app'

describe('loadConfig', () => {
  it('applies defaults when only DATABASE_URL is set', () => {
    expect(loadConfig({ DATABASE_URL })).toEqual({
      databaseUrl: DATABASE_URL,
      port: 3001,
      nodeEnv: 'development',
      appOrigin: 'http://localhost:5173',
      sessionTtlDays: 7,
    })
  })

  it('parses explicit values', () => {
    const config = loadConfig({
      DATABASE_URL,
      PORT: '8080',
      NODE_ENV: 'production',
      APP_ORIGIN: 'https://shop.example.com',
      SESSION_TTL_DAYS: '30',
    })

    expect(config).toMatchObject({
      port: 8080,
      nodeEnv: 'production',
      appOrigin: 'https://shop.example.com',
      sessionTtlDays: 30,
    })
  })

  it('treats empty strings as unset', () => {
    expect(loadConfig({ DATABASE_URL, PORT: '', SESSION_TTL_DAYS: '' })).toMatchObject({
      port: 3001,
      sessionTtlDays: 7,
    })
  })

  it('returns a frozen object', () => {
    expect(Object.isFrozen(loadConfig({ DATABASE_URL }))).toBe(true)
  })

  it('fails with a readable error when DATABASE_URL is missing', () => {
    expect(() => loadConfig({})).toThrow(ConfigError)
    expect(() => loadConfig({})).toThrow(/DATABASE_URL: is required/)
  })

  it('reports every invalid variable at once', () => {
    let error: unknown
    try {
      loadConfig({
        DATABASE_URL: 'mysql://localhost/app',
        PORT: '70000',
        NODE_ENV: 'staging',
        APP_ORIGIN: 'not a url',
        SESSION_TTL_DAYS: '0',
      })
    } catch (err) {
      error = err
    }

    expect(error).toBeInstanceOf(ConfigError)
    expect((error as ConfigError).issues).toEqual([
      'DATABASE_URL: must be a postgres:// or postgresql:// connection URL',
      'PORT: must be between 1 and 65535',
      'NODE_ENV: must be one of development, test, production',
      'APP_ORIGIN: must be an http(s) URL',
      'SESSION_TTL_DAYS: must be a positive number of days',
    ])
  })
})
