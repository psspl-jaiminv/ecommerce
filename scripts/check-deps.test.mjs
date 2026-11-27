import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  checkDependencies,
  findMissingDependencies,
  formatMissingMessage,
  installedIn,
} from './check-deps.mjs'

describe('findMissingDependencies', () => {
  it('returns declared dependencies and devDependencies that are not installed, sorted', () => {
    const manifest = {
      dependencies: { react: '^19.0.0', express: '^5.0.0' },
      devDependencies: { vite: '^8.0.0' },
    }
    const installed = new Set(['react'])

    expect(findMissingDependencies(manifest, (name) => installed.has(name))).toEqual([
      'express',
      'vite',
    ])
  })

  it('handles a manifest without dependency sections', () => {
    expect(findMissingDependencies({}, () => false)).toEqual([])
  })
})

describe('formatMissingMessage', () => {
  it('names the missing packages and tells the user to install', () => {
    const message = formatMissingMessage(['vite'])

    expect(message).toContain('missing: vite')
    expect(message).toContain('npm install')
  })

  it('truncates long lists', () => {
    const message = formatMissingMessage(['a', 'b', 'c', 'd', 'e', 'f', 'g'])

    expect(message).toContain('missing: a, b, c, d, e and 2 more')
  })
})

describe('checkDependencies', () => {
  /** @type {string} */
  let root
  /** @type {string[]} */
  let errors
  const logger = { error: (/** @type {string} */ message) => errors.push(message) }

  /** @param {string} name */
  function install(name) {
    const dir = join(root, 'node_modules', name)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name }))
  }

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'check-deps-'))
    errors = []
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({ dependencies: { react: '^19' }, devDependencies: { '@vitejs/plugin-react': '^6', vite: '^8' } }),
    )
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('fails with an install hint when node_modules is missing (DG-4)', () => {
    expect(checkDependencies({ root, logger })).toBe(1)
    expect(errors.join('\n')).toContain('Run `npm install`')
  })

  it('fails when only some dependencies are installed', () => {
    install('react')

    expect(checkDependencies({ root, logger })).toBe(1)
    expect(errors.join('\n')).toContain('missing: @vitejs/plugin-react, vite')
  })

  it('passes when every declared dependency is installed, including scoped ones', () => {
    install('react')
    install('vite')
    install('@vitejs/plugin-react')

    expect(installedIn(root)('@vitejs/plugin-react')).toBe(true)
    expect(checkDependencies({ root, logger })).toBe(0)
    expect(errors).toEqual([])
  })
})

describe('package.json wiring', () => {
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

  it.each(['predev', 'predev:server', 'prebuild'])('%s runs the dependency check', (script) => {
    expect(manifest.scripts[script]).toBe('node scripts/check-deps.mjs')
  })
})
