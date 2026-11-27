import { type ChildProcess, spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { getTestDatabaseUrl } from '../test/env.js'

/**
 * Starts the real entry point (`index.ts`) in a child process, the way
 * `npm run dev:server` does, minus the file watcher.
 */
const ENTRY = fileURLToPath(new URL('./index.ts', import.meta.url))
const TSX = fileURLToPath(new URL('../../node_modules/.bin/tsx', import.meta.url))
const START_TIMEOUT_MS = 15_000

interface Exit {
  readonly code: number | null
  readonly signal: NodeJS.Signals | null
}

interface RunningServer {
  readonly child: ChildProcess
  readonly output: () => string
  readonly exited: Promise<Exit>
}

/** Env with only what the server needs: nothing inherited that could leak config in. */
function baseEnv(): NodeJS.ProcessEnv {
  return { PATH: process.env.PATH, HOME: process.env.HOME }
}

// Run from an empty directory so `dotenv` cannot pick up a developer's `.env`.
let cwd: string
beforeAll(async () => {
  cwd = await mkdtemp(join(tmpdir(), 'api-startup-'))
})
afterAll(async () => {
  await rm(cwd, { recursive: true, force: true })
})

const running: ChildProcess[] = []
afterEach(() => {
  for (const child of running.splice(0)) {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
  }
})

function startServer(env: NodeJS.ProcessEnv): RunningServer {
  const child = spawn(TSX, [ENTRY], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] })
  running.push(child)
  let output = ''
  child.stdout?.on('data', (chunk: Buffer) => (output += chunk.toString()))
  child.stderr?.on('data', (chunk: Buffer) => (output += chunk.toString()))
  const exited = new Promise<Exit>((resolve) => {
    child.on('exit', (code, signal) => resolve({ code, signal }))
  })
  return { child, output: () => output, exited }
}

async function waitForOutput(server: RunningServer, pattern: RegExp): Promise<void> {
  const deadline = Date.now() + START_TIMEOUT_MS
  while (!pattern.test(server.output())) {
    if (server.child.exitCode !== null) {
      throw new Error(`Server exited early:\n${server.output()}`)
    }
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for ${pattern}:\n${server.output()}`)
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer()
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      probe.close(() => {
        if (address && typeof address === 'object') resolve(address.port)
        else reject(new Error('Could not determine a free port'))
      })
    })
  })
}

describe('server entry point', () => {
  it(
    'exits non-zero with a clear config error when DATABASE_URL is missing',
    async () => {
      const server = startServer(baseEnv())

      const exit = await server.exited

      expect(exit.code).toBe(1)
      expect(server.output()).toContain('Invalid server configuration')
      expect(server.output()).toContain('DATABASE_URL: is required')
      expect(server.output()).not.toMatch(/\n\s+at /) // no stack trace
    },
    START_TIMEOUT_MS,
  )

  it(
    'serves GET /api/health and shuts down cleanly on SIGTERM',
    async () => {
      const port = await freePort()
      const server = startServer({
        ...baseEnv(),
        DATABASE_URL: getTestDatabaseUrl(),
        PORT: String(port),
        NODE_ENV: 'test',
      })
      await waitForOutput(server, /API listening/)

      const res = await fetch(`http://127.0.0.1:${port}/api/health`)

      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ status: 'ok' })

      server.child.kill('SIGTERM')
      const exit = await server.exited
      expect(exit.code).toBe(0)
      expect(server.output()).toContain('SIGTERM received, shutting down')
    },
    START_TIMEOUT_MS * 2,
  )
})
