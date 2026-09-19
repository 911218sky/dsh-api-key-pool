import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { LoggerLike, PluginContext } from './types.js'

export function settingsPath(): string {
  const home = process.env.DSH_HOME || join(homedir(), '.dsh')
  return join(home, 'settings.yaml')
}

export function maskKey(key: string): string {
  if (!key) return ''
  if (key.length <= 8) return `${key.slice(0, 2)}****`
  return `${key.slice(0, 6)}****${key.slice(-4)}`
}

export function log(ctx: PluginContext | null | undefined, level: keyof LoggerLike, msg: string): void {
  try {
    ctx?.logger?.[level]?.(`[api-key-pool] ${msg}`)
  } catch {
    // ignore logger failures
  }
}

export function readJsonBody(req: IncomingMessage): Promise<Record<string, any>> {
  return new Promise((resolve) => {
    let body = ''
    req.on('data', (chunk: Buffer | string) => {
      body += chunk
      if (body.length > 1_000_000) req.destroy()
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}') as Record<string, any>)
      } catch {
        resolve({})
      }
    })
    req.on('error', () => resolve({}))
  })
}

export function sendJson(res: ServerResponse, code: number, data: unknown): void {
  const payload = JSON.stringify(data)
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
  })
  res.end(payload)
}

/** Best-effort YAML-ish parse for `llm-pi-ai.providers` keys only. */
export function discoverProvidersFromSettings(ctx?: PluginContext | null): string[] {
  const file = settingsPath()
  try {
    if (!existsSync(file)) return []
    const raw = readFileSync(file, 'utf8')
    const names: string[] = []
    let inPiAi = false
    let inProviders = false
    for (const line of raw.split('\n')) {
      if (/^llm-pi-ai:\s*$/.test(line)) {
        inPiAi = true
        inProviders = false
        continue
      }
      if (inPiAi && /^[A-Za-z0-9_-]+:/.test(line) && !/^\s/.test(line)) {
        break
      }
      if (inPiAi && /^\s{2}providers:\s*$/.test(line)) {
        inProviders = true
        continue
      }
      if (inProviders) {
        const m = line.match(/^\s{4}([A-Za-z0-9_-]+):\s*$/)
        if (m) {
          names.push(m[1]!)
          continue
        }
        if (/^\s{2}[A-Za-z0-9_-]+:/.test(line) && !/^\s{4}/.test(line)) {
          inProviders = false
        }
      }
    }
    return names
  } catch (e: any) {
    log(ctx, 'warn', `discoverProviders failed: ${e?.message || e}`)
    return []
  }
}

export function isRetryableFailure(code: string, message: string): boolean {
  const digits = code.replace(/\D/g, '')
  if (digits.length >= 3 && digits[0]! >= '4') return true
  return /rate|limit|quota|exhaust|throttl|429|too many|timeout|timed.?out|auth|credential|permission|denied|forbidden|unavailable|busy/i.test(
    message,
  )
}
