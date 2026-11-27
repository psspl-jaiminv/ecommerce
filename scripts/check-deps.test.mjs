import { spawnSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
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

// Runs the real script as a process, the way npm's pre-scripts do: the script's own
// location defines the project root, and the exit code decides whether npm continues.
describe('command line (as run by npm pre-scripts)', () => {
  const scriptSource = fileURLToPath(new URL('./check-deps.mjs', import.meta.url))
  /** @type {string} */
  let root

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'check-deps-cli-'))
    mkdirSync(join(root, 'scripts'))
    copyFileSync(scriptSource, join(root, 'scripts', 'check-deps.mjs'))
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({
        name: 'fixture',
        private: true,
        scripts: {
          prebuild: 'node scripts/check-deps.mjs',
          build: 'node -e "require(\'fs\').writeFileSync(\'built\', \'\')"',
        },
        devDependencies: { vite: '^8' },
      }),
    )
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  function installVite() {
    const dir = join(root, 'node_modules', 'vite')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'vite' }))
  }

  /** @param {string} cwd */
  function runScript(cwd) {
    return spawnSync(process.execPath, ['scripts/check-deps.mjs'], { cwd, encoding: 'utf8' })
  }

  it('exits 1 with the install hint when node_modules is missing (DG-4)', () => {
    const result = runScript(root)

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('missing: vite')
    expect(result.stderr).toContain('Run `npm install`')
  })

  it('exits 0 silently once dependencies are installed', () => {
    installVite()

    const result = runScript(root)

    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
  })

  it('resolves the project root from the script location, not the working directory', () => {
    installVite()
    const elsewhere = mkdtempSync(join(tmpdir(), 'check-deps-cwd-'))
    try {
      const result = spawnSync(process.execPath, [join(root, 'scripts', 'check-deps.mjs')], {
        cwd: elsewhere,
        encoding: 'utf8',
      })

      expect(result.status).toBe(0)
    } finally {
      rmSync(elsewhere, { recursive: true, force: true })
    }
  })

  it('stops `npm run build` before the build step when dependencies are missing', () => {
    const result = spawnSync('npm', ['run', 'build', '--silent'], { cwd: root, encoding: 'utf8' })

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('Run `npm install`')
    expect(existsSync(join(root, 'built'))).toBe(false)
  })

  it('lets `npm run build` proceed when dependencies are installed', () => {
    installVite()

    const result = spawnSync('npm', ['run', 'build', '--silent'], { cwd: root, encoding: 'utf8' })

    expect(result.status).toBe(0)
    expect(existsSync(join(root, 'built'))).toBe(true)
  })
})

describe('package.json wiring', () => {
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

  it.each(['predev', 'predev:server', 'prebuild'])('%s runs the dependency check', (script) => {
    expect(manifest.scripts[script]).toBe('node scripts/check-deps.mjs')
  })
})
