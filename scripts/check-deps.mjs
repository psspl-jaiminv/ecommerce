// Preflight for `npm run dev`, `dev:server` and `build` (wired as npm pre-scripts).
//
// Without node_modules, npm cannot find the project's own `vite`/`tsx`/`tsc`, so
// the shell falls back to whatever binary is on PATH (for example a global Vite or
// another project's). That binary then fails to resolve `import 'vite'` from
// vite.config.ts with a misleading ERR_MODULE_NOT_FOUND. This check fails fast
// with an actionable message instead.
//
// It must run before anything is installed, so it uses only Node built-ins.

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/**
 * @typedef {{ dependencies?: Record<string, string>, devDependencies?: Record<string, string> }} Manifest
 * @typedef {(name: string) => boolean} IsInstalled
 * @typedef {{ error: (message: string) => void }} Logger
 */

/**
 * Names of declared dependencies that are not installed, sorted.
 * @param {Manifest} manifest
 * @param {IsInstalled} isInstalled
 * @returns {string[]}
 */
export function findMissingDependencies(manifest, isInstalled) {
  const declared = [
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.devDependencies ?? {}),
  ]
  return declared.filter((name) => !isInstalled(name)).sort()
}

/**
 * npm always places a project's direct dependencies at the top of node_modules.
 * @param {string} root
 * @returns {IsInstalled}
 */
export function installedIn(root) {
  return (name) => existsSync(join(root, 'node_modules', name, 'package.json'))
}

/**
 * @param {string[]} missing
 * @returns {string}
 */
export function formatMissingMessage(missing) {
  const shown = missing.slice(0, 5).join(', ')
  const more = missing.length > 5 ? ` and ${missing.length - 5} more` : ''
  return [
    `Dependencies are not installed (missing: ${shown}${more}).`,
    'Run `npm install` (or `npm ci`) in the project root, then try again.',
  ].join('\n')
}

/**
 * @param {{ root: string, logger: Logger }} options
 * @returns {number} process exit code
 */
export function checkDependencies({ root, logger }) {
  /** @type {Manifest} */
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const missing = findMissingDependencies(manifest, installedIn(root))
  if (missing.length === 0) return 0
  logger.error(formatMissingMessage(missing))
  return 1
}

const isEntryPoint =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href

if (isEntryPoint) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  process.exitCode = checkDependencies({ root, logger: console })
}
