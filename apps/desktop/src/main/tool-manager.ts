import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, createWriteStream, readdirSync, unlinkSync, statSync } from 'fs'
import { ChildProcessWithoutNullStreams, exec, spawn } from 'child_process'
import { promisify } from 'util'
import type {
  PostgresVersion,
  PostgresTool,
  ToolVersionInfo,
  ToolDownloadProgress,
  ToolDownloadPlatform
} from '@shared/index'
import { createLogger } from './lib/logger'

const log = createLogger('tool-manager')
const execAsync = promisify(exec)

const EDB_VERSION_MAP: Record<number, string> = {
  17: '17.2-1',
  16: '16.6-1',
  15: '15.10-1',
  14: '14.15-1',
  13: '13.18-1',
  12: '12.22-1',
  11: '11.22-1'
}

const SUPPORTED_MAJOR_VERSIONS = Object.keys(EDB_VERSION_MAP)
  .map(Number)
  .sort((a, b) => b - a)

export class ToolManager {
  private toolsDir: string

  constructor() {
    this.toolsDir = join(app.getPath('userData'), 'tools', 'postgresql')
    this.ensureToolsDir()
  }

  private ensureToolsDir(): void {
    if (!existsSync(this.toolsDir)) {
      mkdirSync(this.toolsDir, { recursive: true })
    }
  }

  parseToolVersion(versionString: string): PostgresVersion | null {
    const match = versionString.match(/\(PostgreSQL\)\s+(\d+)\.(\d+)(?:\.(\d+))?/)
    if (!match) return null

    return {
      major: parseInt(match[1], 10),
      minor: parseInt(match[2], 10),
      patch: match[3] ? parseInt(match[3], 10) : undefined,
      full: versionString.trim().split('\n')[0]
    }
  }

  parseServerVersion(versionString: string): PostgresVersion | null {
    const match = versionString.match(/^(\d+)\.(\d+)(?:\.(\d+))?/)
    if (!match) return null

    return {
      major: parseInt(match[1], 10),
      minor: parseInt(match[2], 10),
      patch: match[3] ? parseInt(match[3], 10) : undefined,
      full: versionString.trim()
    }
  }

  async getSystemToolPath(tool: string): Promise<string | null> {
    try {
      const cmd = process.platform === 'win32' ? `where ${tool}` : `which ${tool}`
      const { stdout } = await execAsync(cmd)
      const path = stdout.trim().split('\n')[0]
      return path || null
    } catch {
      return null
    }
  }

  getManagedToolPath(tool: string, majorVersion: number): string | null {
    const binDir = join(this.toolsDir, String(majorVersion), 'bin')
    const ext = process.platform === 'win32' ? '.exe' : ''
    const toolPath = join(binDir, `${tool}${ext}`)

    return existsSync(toolPath) ? toolPath : null
  }

  async getToolVersion(toolPath: string): Promise<PostgresVersion | null> {
    try {
      const { stdout } = await execAsync(`"${toolPath}" --version`)
      return this.parseToolVersion(stdout)
    } catch {
      return null
    }
  }

  getInstalledManagedVersions(): number[] {
    if (!existsSync(this.toolsDir)) return []

    return readdirSync(this.toolsDir, { withFileTypes: true })
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => parseInt(dirent.name, 10))
      .filter((v) => !isNaN(v))
      .sort((a, b) => b - a)
  }

  async getBestToolPath(
    tool: PostgresTool,
    targetMajorVersion: number
  ): Promise<ToolVersionInfo | null> {
    const managedPath = this.getManagedToolPath(tool, targetMajorVersion)
    if (managedPath) {
      const version = await this.getToolVersion(managedPath)
      return { tool, version, path: managedPath, source: 'managed' }
    }

    const managedVersions = this.getInstalledManagedVersions()
    for (const mv of managedVersions) {
      if (mv >= targetMajorVersion) {
        const path = this.getManagedToolPath(tool, mv)
        if (path) {
          const version = await this.getToolVersion(path)
          return { tool, version, path, source: 'managed' }
        }
      }
    }

    const systemPath = await this.getSystemToolPath(tool)
    if (systemPath) {
      const version = await this.getToolVersion(systemPath)
      return { tool, version, path: systemPath, source: 'system' }
    }

    return null
  }

  isVersionCompatible(toolMajor: number, serverMajor: number): boolean {
    return toolMajor >= serverMajor
  }

  getSupportedVersions(): number[] {
    return [...SUPPORTED_MAJOR_VERSIONS]
  }

  getEDBDownloadUrl(majorVersion: number): string {
    const version = EDB_VERSION_MAP[majorVersion]
    if (!version) {
      throw new Error(
        `PostgreSQL ${majorVersion} is not available for download. Supported versions: ${SUPPORTED_MAJOR_VERSIONS.join(', ')}`
      )
    }

    const platform = process.platform as ToolDownloadPlatform

    const platformConfig: Record<ToolDownloadPlatform, { suffix: string; ext: string }> = {
      darwin: { suffix: 'osx', ext: 'zip' },
      win32: { suffix: 'windows-x64', ext: 'zip' },
      linux: { suffix: 'linux-x64', ext: 'tar.gz' }
    }

    const config = platformConfig[platform]
    if (!config) {
      throw new Error(`Unsupported platform: ${platform}`)
    }

    return `https://get.enterprisedb.com/postgresql/postgresql-${version}-${config.suffix}-binaries.${config.ext}`
  }

  async downloadTools(
    majorVersion: number,
    onProgress?: (progress: ToolDownloadProgress) => void
  ): Promise<void> {
    const url = this.getEDBDownloadUrl(majorVersion)
    const platform = process.platform as ToolDownloadPlatform
    const isZip = platform !== 'linux'
    const ext = isZip ? 'zip' : 'tar.gz'
    const tempFile = join(this.toolsDir, `temp-${majorVersion}.${ext}`)
    const versionDir = join(this.toolsDir, String(majorVersion))

    log.info(`Starting download for PostgreSQL ${majorVersion}`)
    log.info(`URL: ${url}`)
    log.info(`Temp file: ${tempFile}`)
    log.info(`Version dir: ${versionDir}`)

    onProgress?.({ phase: 'downloading', progress: 0 })

    try {
      log.info('Fetching from URL...')
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`Download failed: ${response.status} ${response.statusText}`)
      }

      const totalBytes = parseInt(response.headers.get('content-length') || '0', 10)
      log.info(`Total download size: ${(totalBytes / 1024 / 1024).toFixed(1)} MB`)
      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error('No response body')
      }

      const writer = createWriteStream(tempFile)
      let bytesDownloaded = 0

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        writer.write(Buffer.from(value))
        bytesDownloaded += value.length

        onProgress?.({
          phase: 'downloading',
          progress: totalBytes ? Math.round((bytesDownloaded / totalBytes) * 70) : 0,
          bytesDownloaded,
          totalBytes
        })
      }

      log.info(`Download complete: ${(bytesDownloaded / 1024 / 1024).toFixed(1)} MB`)
      writer.end()
      await new Promise<void>((resolve, reject) => {
        writer.on('finish', resolve)
        writer.on('error', reject)
      })
      log.info('File written to disk')

      onProgress?.({ phase: 'extracting', progress: 75 })
      log.info('Starting extraction phase...')

      if (existsSync(versionDir)) {
        log.info(`Removing existing version dir: ${versionDir}`)
        await execAsync(`rm -rf "${versionDir}"`)
      }
      mkdirSync(versionDir, { recursive: true })
      log.info(`Created version dir: ${versionDir}`)

      if (isZip) {
        log.info('Calling extractZip...')
        await this.extractZip(tempFile, versionDir)
        log.info('extractZip returned')
      } else {
        log.info('Calling extractTarGz...')
        await this.extractTarGz(tempFile, versionDir)
        log.info('extractTarGz returned')
      }

      onProgress?.({ phase: 'verifying', progress: 90 })

      const pgsqlDir = join(versionDir, 'pgsql')
      const pgsqlBinDir = join(pgsqlDir, 'bin')
      const pgsqlLibDir = join(pgsqlDir, 'lib')
      const targetBinDir = join(versionDir, 'bin')
      const targetLibDir = join(versionDir, 'lib')

      if (existsSync(pgsqlBinDir)) {
        log.info('Moving bin and lib directories...')
        await execAsync(`mv "${pgsqlBinDir}" "${targetBinDir}"`)
        if (existsSync(pgsqlLibDir)) {
          await execAsync(`mv "${pgsqlLibDir}" "${targetLibDir}"`)
        }
        await execAsync(`rm -rf "${pgsqlDir}"`)
      }

      const tools: PostgresTool[] = ['pg_dump', 'pg_restore', 'psql']
      const toolExt = platform === 'win32' ? '.exe' : ''

      for (const tool of tools) {
        const toolPath = join(targetBinDir, `${tool}${toolExt}`)
        if (!existsSync(toolPath)) {
          throw new Error(`Tool ${tool} not found after extraction at ${toolPath}`)
        }

        if (platform !== 'win32') {
          await execAsync(`chmod +x "${toolPath}"`)
        }
      }

      if (existsSync(tempFile)) {
        unlinkSync(tempFile)
      }

      onProgress?.({ phase: 'complete', progress: 100 })
    } catch (error) {
      if (existsSync(tempFile)) {
        try {
          unlinkSync(tempFile)
        } catch {
          // Ignore cleanup errors
        }
      }

      onProgress?.({
        phase: 'error',
        progress: 0,
        error: error instanceof Error ? error.message : String(error)
      })

      throw error
    }
  }

  private async extractZip(archivePath: string, destDir: string): Promise<void> {
    const platform = process.platform

    const archiveSize = existsSync(archivePath) ? statSync(archivePath).size : 0
    log.info(
      `Starting extraction: ${archivePath} (${(archiveSize / 1024 / 1024).toFixed(1)} MB) -> ${destDir}`
    )
    log.info(`Platform: ${platform}`)

    return new Promise<void>((resolve, reject) => {
      let cmd: string
      let args: string[]

      if (platform === 'darwin') {
        cmd = 'ditto'
        args = ['-xk', archivePath, destDir]
      } else if (platform === 'win32') {
        cmd = 'powershell'
        args = [
          '-Command',
          `Expand-Archive -Path "${archivePath}" -DestinationPath "${destDir}" -Force`
        ]
      } else {
        cmd = 'unzip'
        args = ['-o', '-q', archivePath, '-d', destDir]
      }

      log.info(`Spawning: ${cmd} ${args.join(' ')}`)
      const child = spawn(cmd, args)
      log.info(`Child process spawned with PID: ${child.pid}`)

      let stderr = ''
      let stdout = ''

      child.stdout?.on('data', (data) => {
        const str = data.toString()
        stdout += str
        log.debug(`[stdout] ${str.trim()}`)
      })

      child.stderr?.on('data', (data) => {
        const str = data.toString()
        stderr += str
        log.debug(`[stderr] ${str.trim()}`)
      })

      child.on('close', (code, signal) => {
        log.info(`Extraction process closed - code: ${code}, signal: ${signal}`)
        if (code === 0) {
          log.info('Extraction completed successfully')
          resolve()
        } else {
          const errorMsg = `Extraction failed with code ${code}: ${stderr}`
          log.error(errorMsg)
          reject(new Error(errorMsg))
        }
      })

      child.on('error', (err) => {
        log.error(`Failed to start extraction process: ${err.message}`)
        reject(new Error(`Failed to start extraction: ${err.message}`))
      })

      child.on('exit', (code, signal) => {
        log.info(`Extraction process exited - code: ${code}, signal: ${signal}`)
      })
    })
  }

  private async extractTarGz(archivePath: string, destDir: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const child = spawn('tar', ['-xzf', archivePath, '-C', destDir])

      let stderr = ''
      child.stderr?.on('data', (data) => {
        stderr += data.toString()
      })

      child.on('close', (code) => {
        if (code === 0) {
          resolve()
        } else {
          reject(new Error(`Extraction failed with code ${code}: ${stderr}`))
        }
      })

      child.on('error', (err) => {
        reject(new Error(`Failed to start tar: ${err.message}`))
      })
    })
  }

  async deleteManagedVersion(majorVersion: number): Promise<void> {
    const versionDir = join(this.toolsDir, String(majorVersion))
    if (existsSync(versionDir)) {
      await execAsync(`rm -rf "${versionDir}"`)
    }
  }
}

export const toolManager = new ToolManager()
