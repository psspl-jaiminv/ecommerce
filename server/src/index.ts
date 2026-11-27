import { createServer } from 'node:http'
import { config as loadDotenv } from 'dotenv'
import { createApp } from './app.js'
import { ConfigError, loadConfig } from './config.js'
import { createDb, createPool } from './db/pool.js'

const SHUTDOWN_TIMEOUT_MS = 10_000

function main(): void {
  loadDotenv({ quiet: true })
  const config = loadConfig()

  const pool = createPool(config)
  const app = createApp({ db: createDb(pool), config })
  const server = createServer(app)

  server.on('error', (err) => {
    console.error('HTTP server error', err)
    void pool.end().finally(() => process.exit(1))
  })

  server.listen(config.port, () => {
    console.info(`API listening on http://localhost:${config.port} (${config.nodeEnv})`)
  })

  let shuttingDown = false
  const shutdown = (signal: NodeJS.Signals): void => {
    if (shuttingDown) return
    shuttingDown = true
    console.info(`${signal} received, shutting down`)

    const forceExit = setTimeout(() => {
      console.error('Graceful shutdown timed out, forcing exit')
      process.exit(1)
    }, SHUTDOWN_TIMEOUT_MS)
    forceExit.unref()

    // Stop accepting connections and wait for in-flight requests, then release DB clients.
    server.close((closeErr) => {
      pool
        .end()
        .then(() => process.exit(closeErr ? 1 : 0))
        .catch((poolErr: unknown) => {
          console.error('Failed to close database pool', poolErr)
          process.exit(1)
        })
    })
  }

  process.once('SIGTERM', shutdown)
  process.once('SIGINT', shutdown)
}

try {
  main()
} catch (err) {
  if (err instanceof ConfigError) {
    console.error(err.message)
  } else {
    console.error('Failed to start server', err)
  }
  process.exit(1)
}
