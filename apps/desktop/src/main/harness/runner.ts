/**
 * Generic harness process runner. Everything CLI-agnostic lives here: PATH
 * augmentation for GUI-launched apps, binary resolution/detection, temp-file
 * lifecycle, timeouts, and JSONL line buffering. Adapters own argv and parsing.
 */

import { spawn } from 'child_process'
import { existsSync, writeFileSync, rmSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import type { HarnessDetection, HarnessRequest } from './types'

const DETECT_TIMEOUT_MS = 10_000

/** Common places agent CLIs land that a GUI-launched app's PATH misses. */
function candidateBinDirs(): string[] {
  const home = homedir()
  return [
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/usr/bin',
    join(home, '.local', 'bin'),
    join(home, '.claude', 'local'),
    join(home, '.bun', 'bin'),
    join(home, '.npm-global', 'bin')
  ]
}

/**
 * PATH augmented with common install dirs. A packaged Electron app launched from
 * the GUI does not inherit the login-shell PATH on macOS, so CLIs are often
 * invisible without this.
 */
export function augmentedPath(): string {
  const extra = candidateBinDirs().join(':')
  return process.env.PATH ? `${process.env.PATH}:${extra}` : extra
}

/** Resolve a harness binary: explicit env override, then known dirs, then bare name. */
export function resolveBinary(binaryName: string, overrideEnvVar: string): string {
  const override = process.env[overrideEnvVar]
  if (override && existsSync(override)) return override
  for (const dir of candidateBinDirs()) {
    const candidate = join(dir, binaryName)
    if (existsSync(candidate)) return candidate
  }
  return binaryName
}

export interface RunnerOpts {
  timeoutMs: number
  /** Human name used in error messages, e.g. 'Claude CLI'. */
  cliLabel: string
  /** Message for ENOENT, e.g. install + sign-in instructions. */
  notFoundMessage: string
}

/**
 * Spawn the harness process and deliver each parsed stdout JSON line to
 * `onLine`. Buffers across chunk boundaries; at close, the remaining buffer is
 * parsed too, which also covers a single JSON document with no trailing newline
 * (the claude one-shot envelope). Temp files are written before spawn and
 * always removed afterwards. stdin is closed so a CLI never waits on input.
 */
export function runHarnessProcess(
  request: HarnessRequest,
  opts: RunnerOpts,
  onLine: (obj: unknown) => void
): Promise<{ stderr: string; code: number | null }> {
  for (const f of request.tempFiles ?? []) writeFileSync(f.path, f.content, 'utf8')
  const cleanup = (): void => {
    for (const f of request.tempFiles ?? []) {
      try {
        rmSync(f.path, { force: true })
      } catch {
        /* best-effort */
      }
    }
  }

  return new Promise((resolve, reject) => {
    // A missing cwd makes spawn throw the same ENOENT as a missing binary,
    // which would misdiagnose as "CLI not found" — tell those cases apart.
    if (request.cwd && !existsSync(request.cwd)) {
      cleanup()
      reject(new Error(`${opts.cliLabel} working directory disappeared: ${request.cwd}`))
      return
    }
    const child = spawn(request.binary, request.args, {
      env: request.env,
      cwd: request.cwd,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stderr = ''
    let buf = ''
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      cleanup()
      reject(new Error(`${opts.cliLabel} timed out after ${Math.round(opts.timeoutMs / 1000)}s`))
    }, opts.timeoutMs)

    const consume = (chunk: string): void => {
      buf += chunk
      let nl: number
      while ((nl = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, nl).trim()
        buf = buf.slice(nl + 1)
        if (!line) continue
        try {
          onLine(JSON.parse(line))
        } catch {
          /* ignore a non-JSON noise line */
        }
      }
    }

    child.stdout.on('data', (d) => consume(d.toString()))
    child.stderr.on('data', (d) => (stderr += d.toString()))
    child.on('error', (err) => {
      clearTimeout(timer)
      cleanup()
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        reject(err)
        return
      }
      // spawn reports a vanished cwd exactly like a missing binary; the
      // preflight can't cover the window between its check and the spawn.
      reject(
        request.cwd && !existsSync(request.cwd)
          ? new Error(`${opts.cliLabel} working directory disappeared: ${request.cwd}`)
          : new Error(opts.notFoundMessage)
      )
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      cleanup()
      const rest = buf.trim()
      if (rest) {
        try {
          onLine(JSON.parse(rest))
        } catch {
          /* ignore trailing noise */
        }
      }
      resolve({ stderr, code })
    })
  })
}

/** Detect whether the user has a usable harness CLI installed. */
export function detectBinary(
  binaryName: string,
  overrideEnvVar: string,
  notFoundMessage: string
): Promise<HarnessDetection> {
  const bin = resolveBinary(binaryName, overrideEnvVar)
  return new Promise((resolve) => {
    const child = spawn(bin, ['--version'], {
      env: { ...process.env, PATH: augmentedPath() },
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stdout = ''
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      resolve({ available: false, path: bin, error: `${binaryName} --version timed out` })
    }, DETECT_TIMEOUT_MS)
    child.stdout.on('data', (d) => (stdout += d.toString()))
    child.on('error', (err) => {
      clearTimeout(timer)
      const notFound = (err as NodeJS.ErrnoException).code === 'ENOENT'
      resolve({ available: false, error: notFound ? notFoundMessage : String(err) })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code !== 0) {
        resolve({ available: false, path: bin, error: `${binaryName} --version failed` })
      } else {
        resolve({ available: true, path: bin, version: stdout.trim() })
      }
    })
  })
}
