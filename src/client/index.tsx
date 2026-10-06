import React, { useCallback, useEffect, useState, type KeyboardEvent } from 'react'
import {
  Button,
  DisclosureRow,
  Input,
  Pill,
  StateDot,
  Tag,
} from '@deepseek-ai/dsh-client-ui-primitives'
import {
  API_BASE,
  type ClientPluginContext,
  type PanelState,
  type PoolViewClient,
  type KeyState,
} from '../types.js'
import {
  SETTINGS_NAV_LABEL,
  installNavIconStyles,
  registerSettingsNavIcon,
} from './settings-nav-icon.js'

const PLUGIN_VERSION = '0.5.9'

const sectionStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
  width: '100%',
  maxWidth: 760,
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '4px 0',
}

const fieldRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  alignItems: 'center',
  marginTop: 4,
}

interface LlmProvidersApiResponse {
  providers?: string[]
}

interface PoolsApiResponse {
  pools?: Record<string, PoolViewClient>
}

interface MutateApiResponse {
  ok?: boolean
  error?: string
}

async function fetchJson<T>(url: string, opts?: RequestInit): Promise<T> {
  const r = await fetch(url, {
    credentials: 'include',
    ...opts,
    headers: {
      ...(opts?.headers || {}),
    },
  })
  let data: unknown = {}
  try {
    data = await r.json()
  } catch {
    data = {}
  }
  if (!r.ok) {
    const err =
      data && typeof data === 'object' && 'error' in data
        ? String((data as { error?: unknown }).error || r.statusText)
        : r.statusText || `HTTP ${r.status}`
    throw new Error(err || `HTTP ${r.status}`)
  }
  return data as T
}

function summarizePool(
  keys: string[],
  states: Record<string, KeyState>,
  isLlm: boolean,
): string {
  const now = Date.now()
  const cooling = keys.filter((k) => (states[k]?.cooldownUntil || 0) > now).length
  const parts: string[] = []
  if (isLlm) parts.push('LLM provider')
  parts.push(`${keys.length} key${keys.length === 1 ? '' : 's'}`)
  if (cooling > 0) parts.push(`${cooling} cooling`)
  else if (keys.length > 0) parts.push('healthy')
  else parts.push('no keys yet')
  return parts.join(' · ')
}

function ProviderIcon(): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M5 7.5a2.5 2.5 0 1 1 5 0v1.5h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1V7.5Z"
        stroke="currentColor"
        strokeWidth="1.25"
      />
    </svg>
  )
}

function ApiKeyPoolSection(): React.ReactElement {
  const [state, setState] = useState<PanelState>({
    llmProviders: [],
    pools: {},
    loading: true,
    msg: null,
    addInputs: {},
    newProvName: '',
    expanded: {},
  })

  const refresh = useCallback(async () => {
    try {
      const [provRes, poolRes] = await Promise.all([
        fetchJson<LlmProvidersApiResponse>(`${API_BASE}/llm-providers`),
        fetchJson<PoolsApiResponse>(`${API_BASE}/pools`),
      ])
      setState((s) => ({
        ...s,
        llmProviders: provRes.providers ?? [],
        pools: poolRes.pools ?? {},
        loading: false,
      }))
    } catch (err: unknown) {
      setState((s) => ({
        ...s,
        loading: false,
        msg: {
          type: 'err',
          text: err instanceof Error ? err.message : 'Load failed',
        },
      }))
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const showMsg = (type: 'ok' | 'err', text: string): void => {
    setState((s) => ({ ...s, msg: { type, text } }))
    setTimeout(() => setState((s) => ({ ...s, msg: null })), 3000)
  }

  const toggleExpanded = (provider: string): void => {
    setState((s) => ({
      ...s,
      expanded: { ...s.expanded, [provider]: !s.expanded[provider] },
    }))
  }

  const handleAddKey = async (provider: string): Promise<void> => {
    const key = (state.addInputs[provider] || '').trim()
    if (!key) return

    const action = state.pools[provider] ? 'add' : 'addProvider'
    try {
      await fetchJson<MutateApiResponse>(`${API_BASE}/pools`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, provider, key }),
      })
      setState((s) => ({
        ...s,
        addInputs: { ...s.addInputs, [provider]: '' },
        expanded: { ...s.expanded, [provider]: true },
      }))
      showMsg('ok', 'Key added')
      await refresh()
    } catch (err: unknown) {
      showMsg('err', err instanceof Error ? err.message : 'Add failed')
    }
  }

  const handleAddProvider = async (): Promise<void> => {
    const name = state.newProvName.trim()
    if (!name) return
    try {
      await fetchJson<MutateApiResponse>(`${API_BASE}/pools`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'addProvider', provider: name, key: '' }),
      })
      setState((s) => ({
        ...s,
        newProvName: '',
        expanded: { ...s.expanded, [name]: true },
      }))
      showMsg('ok', 'Provider added')
      await refresh()
    } catch (err: unknown) {
      showMsg('err', err instanceof Error ? err.message : 'Add provider failed')
    }
  }

  const handleRemoveKey = async (provider: string, index: number): Promise<void> => {
    try {
      await fetchJson<MutateApiResponse>(`${API_BASE}/pools`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remove', provider, index }),
      })
      await refresh()
    } catch (err: unknown) {
      showMsg('err', err instanceof Error ? err.message : 'Remove failed')
    }
  }

  const handleReset = async (provider: string): Promise<void> => {
    try {
      await fetchJson<MutateApiResponse>(`${API_BASE}/pools`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset', provider }),
      })
      showMsg('ok', 'Cooldown reset')
      await refresh()
    } catch (err: unknown) {
      showMsg('err', err instanceof Error ? err.message : 'Reset failed')
    }
  }

  const allProviders = [...new Set([...state.llmProviders, ...Object.keys(state.pools)])]

  return (
    <section style={sectionStyle}>
      <p style={{ margin: 0, fontSize: 13, lineHeight: '20px' }}>
        Round-robin API keys per provider. Expand a provider to manage keys. Failed keys cool down
        automatically.
      </p>

      <Pill active>
        dsh-api-key-pool <Tag tone="quiet">v{PLUGIN_VERSION}</Tag>
      </Pill>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '0 2px' }}>
          <strong style={{ fontSize: 13 }}>Providers</strong>
          <Tag tone="neutral">{allProviders.length}</Tag>
        </div>

        {state.loading ? <p style={{ margin: 0, fontSize: 12 }}>Loading…</p> : null}
        {!state.loading && allProviders.length === 0 ? (
          <p style={{ margin: 0, fontSize: 12 }}>No providers yet — add one below.</p>
        ) : null}

        {allProviders.map((name) => {
          const pool = state.pools[name]
          const keys = pool?.maskedKeys || []
          const states = pool?.states || {}
          const isLlm = state.llmProviders.includes(name)
          const open = Boolean(state.expanded[name])

          return (
            <DisclosureRow
              key={name}
              icon={<ProviderIcon />}
              title={name}
              open={open}
              expandable
              expandOnRowClick
              onToggle={() => toggleExpanded(name)}
              collapsedContent={summarizePool(keys, states, isLlm)}
            >
              {keys.map((masked, i) => {
                const st = states[masked] || { failCount: 0, cooldownUntil: 0 }
                const cooling = st.cooldownUntil > Date.now()
                return (
                  <div key={`${masked}-${i}`} style={rowStyle}>
                    <StateDot state={cooling ? 'warning' : 'done'} />
                    <code style={{ flex: 1, minWidth: 0, fontSize: 12 }}>{masked}</code>
                    <Tag tone={cooling ? 'warning' : st.failCount > 0 ? 'info' : 'success'}>
                      {cooling
                        ? `cooling until ${new Date(st.cooldownUntil).toLocaleTimeString()}`
                        : st.failCount > 0
                          ? `fails ${st.failCount}`
                          : 'healthy'}
                    </Tag>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => void handleRemoveKey(name, i)}
                    >
                      Remove
                    </Button>
                  </div>
                )
              })}

              {keys.length === 0 ? <p style={{ margin: 0, fontSize: 12 }}>No keys yet</p> : null}

              <div style={fieldRowStyle}>
                <Input
                  placeholder="Paste API key…"
                  value={state.addInputs[name] || ''}
                  onChange={(e) =>
                    setState((s) => ({
                      ...s,
                      addInputs: { ...s.addInputs, [name]: e.target.value },
                    }))
                  }
                  onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
                    if (e.key === 'Enter') void handleAddKey(name)
                  }}
                />
                <Button
                  type="button"
                  variant="primary"
                  disabled={!(state.addInputs[name] || '').trim()}
                  onClick={() => void handleAddKey(name)}
                >
                  Add
                </Button>
              </div>

              {pool ? (
                <Button type="button" variant="outline" onClick={() => void handleReset(name)}>
                  Reset cooldown
                </Button>
              ) : null}
            </DisclosureRow>
          )
        })}

        <div style={{ ...fieldRowStyle, marginTop: 8, paddingTop: 12, borderTop: '0.5px solid var(--dsw-alias-border-l2, #444)' }}>
          <Input
            placeholder="Provider id (if not listed)…"
            value={state.newProvName}
            onChange={(e) => setState((s) => ({ ...s, newProvName: e.target.value }))}
            onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
              if (e.key === 'Enter') void handleAddProvider()
            }}
          />
          <Button
            type="button"
            variant="outline"
            disabled={!state.newProvName.trim()}
            onClick={() => void handleAddProvider()}
          >
            Add provider
          </Button>
        </div>

        {state.msg ? (
          <Tag tone={state.msg.type === 'ok' ? 'success' : 'danger'}>{state.msg.text}</Tag>
        ) : null}
      </div>
    </section>
  )
}

export function apply(ctx: ClientPluginContext): void {
  ctx.effect(installNavIconStyles, 'dsh-api-key-pool: nav icon styles')
  ctx.effect(
    () => registerSettingsNavIcon(() => SETTINGS_NAV_LABEL),
    'dsh-api-key-pool: settings navigation icon',
  )
  ctx.slots.inject('settings.section', function* () {
    yield ctx.slots.register(
      {
        name: 'settings.section',
        id: 'api-key-pool',
        order: 90,
        label: () => SETTINGS_NAV_LABEL,
        inject: () => ({}),
      },
      ApiKeyPoolSection,
    )
  })
}

export const inject = ['configForms', 'slots'] as const
