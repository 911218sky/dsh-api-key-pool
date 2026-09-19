import type { IncomingMessage, ServerResponse } from 'node:http'

/** Health / cooldown state for one API key. */
export interface KeyState {
  failCount: number
  cooldownUntil: number
}

/** Static pool entry from cordis config. */
export interface PoolConfigEntry {
  apiKeyEnv?: string
  keys?: string[]
  cooldownMs?: number
}

/** Plugin `config` from cordis.patch.yml. */
export interface PluginConfig {
  pools?: Record<string, PoolConfigEntry>
  defaultCooldownMs?: number
  /** Max key swaps per turn after failures. Default 5. */
  maxRetriesPerTurn?: number
  /**
   * If true (default), POST management routes require loopback or a DSH session cookie.
   * Set false only for trusted private networks.
   */
  requireAuthForMutations?: boolean
}

/** Shape of on-disk `pool-config.json`. */
export interface PersistedPoolEntry {
  apiKeyEnv?: string
  keys?: string[]
}

export interface PersistedPools {
  pools?: Record<string, PersistedPoolEntry>
}

/** In-memory pool used at runtime. */
export interface PoolRuntime {
  env: string
  keys: string[]
  cooldown: number
  idx: number
  states: Map<string, KeyState>
}

/** Public/safe pool view (no raw secrets). */
export interface PoolPublicView {
  apiKeyEnv: string
  maskedKeys: string[]
  keyCount: number
  mode: string
  states: Record<string, KeyState>
}

export interface LoggerLike {
  info?: (msg: string) => void
  warn?: (msg: string) => void
  error?: (msg: string) => void
}

/** Minimal LlmCallConfig fields this plugin reads / mutates. */
export interface LlmCallConfig {
  provider?: string
  model?: string
  apiKey?: string
  headers?: Record<string, string>
  authorization?: string
  [key: string]: unknown
}

export interface AgentRequestFailure {
  code?: string | number
  message?: string
}

export interface AgentTurnLike {
  id?: string
  turnId?: string
}

export interface AgentRequestPayload {
  turn?: AgentTurnLike
  step?: unknown
  signal?: AbortSignal
}

export interface AgentRequestErrorPayload {
  provider?: string
  code?: string | number
  message?: string
  failure?: AgentRequestFailure
  turn?: AgentTurnLike
}

export type AgentRequestNext = () => Promise<LlmCallConfig>
export type AgentRequestErrorNext = () => Promise<AgentErrorAction | void>
export type AgentErrorAction = { kind: 'retry' } | { kind: string; [key: string]: unknown }

export type AgentRequestHandler = (
  payload: AgentRequestPayload,
  next: AgentRequestNext,
) => Promise<LlmCallConfig>

export type AgentRequestErrorHandler = (
  payload: AgentRequestErrorPayload,
  next: AgentRequestErrorNext,
) => Promise<AgentErrorAction | void>

export type WebRequestHandler = (
  req: IncomingMessage,
  res: ServerResponse,
) => void | Promise<void>

export interface ExactWebRoute {
  kind: 'exact'
  path: string
  handler: WebRequestHandler
}

export interface WebServerService {
  register: (route: ExactWebRoute) => void | (() => void)
}

/** Minimal settings service used to expose a Settings→Plugins card namespace. */
export interface SettingsService {
  register: (
    ns: string,
    schema: unknown,
    options?: { base?: Record<string, unknown> },
  ) => unknown
  describe?: (opts?: { redactSecrets?: boolean }) => SettingsDescribeRow[] | Promise<SettingsDescribeRow[]>
}

export interface SettingsDescribeRow {
  ns?: string
  value?: {
    providers?: Record<string, unknown>
  }
}

/** Credentials service used by llm-pi-ai to resolve apiKeyEnv (rc.1+). */
export interface CredentialsService {
  set: (envName: string, value: string) => Promise<unknown> | unknown
}

export interface EventHandlerOptions {
  global?: boolean
}

export interface LlmStreamOptions {
  provider?: string
  [key: string]: unknown
}

export type LlmStreamHandler = (
  options: LlmStreamOptions,
  next: () => unknown,
) => unknown

export interface PluginContext {
  logger?: LoggerLike
  effect: (fn: () => void | (() => void), label?: string) => void
  get?: (name: string) => unknown
  inject: (
    deps: string[],
    callback: (scoped: PluginContext & { settings: SettingsService }) => void | Promise<void>,
  ) => void
  webServer: WebServerService
  settings?: SettingsService
}

export interface PluginContextWithEvents extends PluginContext {
  on(event: 'agent/request', handler: AgentRequestHandler): void
  on(event: 'agent/request-error', handler: AgentRequestErrorHandler): void
  on(event: 'llm/stream', handler: LlmStreamHandler, options?: EventHandlerOptions): void
  on(event: string, handler: (...args: unknown[]) => unknown, options?: EventHandlerOptions): void
}

export type PoolsPostAction =
  | 'addProvider'
  | 'removeProvider'
  | 'add'
  | 'remove'
  | 'update'
  | 'reset'

export interface PoolsPostBody {
  action?: PoolsPostAction | string
  provider?: string
  apiKeyEnv?: string
  key?: string
  keys?: string[]
  index?: number
}

export interface VerifyPostBody {
  provider?: string
  baseURL?: string
  maxAttempts?: number
}

export interface VerifyAttempt {
  attempt: number
  key?: string
  status?: number
  error?: string
}

export interface PoolViewClient {
  apiKeyEnv: string
  maskedKeys: string[]
  keyCount: number
  states: Record<string, KeyState>
}

export type PanelMessage = { type: 'ok' | 'err'; text: string } | null

export interface PanelState {
  llmProviders: string[]
  pools: Record<string, PoolViewClient>
  loading: boolean
  msg: PanelMessage
  addInputs: Record<string, string>
  newProvName: string
}

export interface ClientSlotRegistration {
  name: string
  id: string
  /** Must match cordis.patch.yml plugin `id` (e.g. api-key-pool), not the npm package name. */
  key: string
  order: number
  label: () => string
  inject: () => Record<string, unknown>
}

export interface ClientSlotsService {
  inject: (slot: string, factory: () => Generator<unknown, void, unknown>) => void
  register: (meta: ClientSlotRegistration, component: unknown) => unknown
}

export interface ClientPluginContext {
  effect: (fn: () => void | (() => void), label?: string) => void
  slots: ClientSlotsService
}

export const API_BASE = '/dsh-api-key-pool' as const
export const DEFAULT_COOLDOWN_MS = 30_000
export const DEFAULT_MAX_RETRIES_PER_TURN = 5

/** Narrow set of pi-ai / transport failure codes that justify key rotation. */
export const RETRYABLE_CODES = new Set([
  'RATE_LIMIT',
  'AUTH',
  'QUOTA_EXCEEDED',
  'TIMEOUT',
  'TRANSPORT',
])
