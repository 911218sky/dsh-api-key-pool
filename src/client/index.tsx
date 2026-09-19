import React, { useCallback, useEffect, useState, type ChangeEvent, type KeyboardEvent } from 'react'
import {
  API_BASE,
  type ClientPluginContext,
  type PanelState,
  type PoolViewClient,
  type KeyState,
} from '../types.js'

function installStyles(): () => void {
  const css = document.createElement('style')
  css.textContent = `
    .akp-card {
      font-family: inherit; color: var(--dsw-alias-label-primary, inherit);
      border: 1px solid var(--dsw-alias-border-l2, #444); border-radius: 10px;
      background: var(--dsw-alias-bg-layer-1, transparent); overflow: hidden;
    }
    .akp-panel-toggle {
      width: 100%; display: flex; align-items: center; gap: 10px; text-align: left;
      padding: 12px 14px; border: none; background: transparent; cursor: pointer;
      color: inherit; font: inherit;
    }
    .akp-panel-toggle:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.12)); }
    .akp-panel-toggle-main { flex: 1; min-width: 0; }
    .akp-panel-title { font-weight: 600; font-size: 14px; color: var(--dsw-alias-label-primary, inherit); display: block; }
    .akp-panel-sub { margin-top: 2px; font-size: 11px; color: var(--dsw-alias-label-secondary, inherit); opacity: .85; }
    .akp-panel-body { padding: 0 14px 14px; border-top: 1px solid var(--dsw-alias-border-l1, transparent); }
    .akp-desc { margin: 10px 0 12px; font-size: 12px; color: var(--dsw-alias-label-secondary, inherit); opacity: .85; }
    .akp-prov {
      margin-bottom: 8px; border: 1px solid var(--dsw-alias-border-l2, #444); border-radius: 10px;
      background: var(--dsw-alias-bg-layer-2, transparent); overflow: hidden;
    }
    .akp-prov-toggle {
      width: 100%; display: flex; align-items: center; gap: 10px; text-align: left;
      padding: 12px 14px; border: none; background: transparent; cursor: pointer;
      color: inherit; font: inherit;
    }
    .akp-prov-toggle:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.12)); }
    .akp-prov-toggle-main { flex: 1; min-width: 0; }
    .akp-prov-name { font-weight: 600; font-size: 13px; color: var(--dsw-alias-label-primary, inherit); display: block; }
    .akp-prov-sub { margin-top: 2px; font-size: 11px; color: var(--dsw-alias-label-secondary, inherit); opacity: .85; }
    .akp-chevron {
      flex: none; width: 18px; height: 18px; color: var(--dsw-alias-label-tertiary, #888);
      transition: transform .15s ease; display: inline-flex; align-items: center; justify-content: center;
    }
    .akp-card.open > .akp-panel-toggle .akp-chevron,
    .akp-prov.open .akp-chevron { transform: rotate(180deg); }
    .akp-prov-body { padding: 0 14px 12px; border-top: 1px solid var(--dsw-alias-border-l1, transparent); }
    .akp-row { display: flex; align-items: center; gap: 6px; padding: 4px 0; font-size: 12px; color: var(--dsw-alias-label-secondary, inherit); }
    .akp-key-masked { flex: 1; font-family: monospace; font-size: 11px; color: var(--dsw-alias-label-primary, inherit); }
    .akp-status { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
    .akp-status.healthy { background: #4caf50; }
    .akp-status.cooling { background: #ff9800; }
    .akp-x { cursor: pointer; opacity: .55; font-size: 10px; padding: 2px 4px; border: none; background: transparent; color: var(--dsw-alias-label-secondary, inherit); }
    .akp-x:hover { opacity: 1; color: var(--dsw-alias-label-primary, inherit); }
    .akp-field { display: flex; gap: 6px; margin: 6px 0 4px; }
    .akp-field input, .akp-addprov input {
      flex: 1; min-width: 0; padding: 6px 10px; font-size: 12px;
      border: 1px solid var(--dsw-alias-border-l2, #555);
      border-radius: 6px;
      background: var(--dsw-alias-bg-base, transparent);
      color: var(--dsw-alias-label-primary, inherit);
    }
    .akp-field input::placeholder, .akp-addprov input::placeholder {
      color: var(--dsw-alias-label-tertiary, #888);
    }
    .akp-btn {
      padding: 6px 12px; font-size: 12px; border-radius: 6px; cursor: pointer;
      border: 1px solid var(--dsw-alias-border-l2, #555);
      background: transparent;
      color: var(--dsw-alias-label-primary, inherit);
    }
    .akp-btn:hover:not(:disabled) {
      background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.18));
    }
    .akp-btn:disabled { opacity: .45; cursor: default; }
    .akp-btn.primary {
      background: var(--dsw-alias-state-business-primary, #1976d2);
      border-color: var(--dsw-alias-state-business-primary, #1976d2);
      color: #fff;
    }
    .akp-btn.primary:hover:not(:disabled) { filter: brightness(1.08); }
    .akp-msg { font-size: 11px; margin-top: 6px; padding: 4px 8px; border-radius: 4px; }
    .akp-msg.ok { background: color-mix(in srgb, #4caf50 18%, transparent); color: var(--dsw-alias-state-success-primary, #81c784); }
    .akp-msg.err { background: color-mix(in srgb, #f44336 18%, transparent); color: var(--dsw-alias-state-error-primary, #e57373); }
    .akp-addprov { display: flex; gap: 6px; margin-top: 12px; padding-top: 10px; border-top: 1px dashed var(--dsw-alias-border-l2, #444); }
    .akp-empty { font-size: 11px; color: var(--dsw-alias-label-tertiary, #888); margin: 6px 0; }
  `
  document.head.appendChild(css)
  return () => css.remove()
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

function summarizePanel(
  providers: string[],
  pools: Record<string, PoolViewClient>,
  loading: boolean,
): string {
  if (loading) return 'Loading…'
  const providerCount = providers.length
  let keyCount = 0
  let cooling = 0
  const now = Date.now()
  for (const name of providers) {
    const pool = pools[name]
    if (!pool) continue
    keyCount += pool.maskedKeys.length
    for (const masked of pool.maskedKeys) {
      if ((pool.states[masked]?.cooldownUntil || 0) > now) cooling += 1
    }
  }
  const parts: string[] = [
    `${providerCount} provider${providerCount === 1 ? '' : 's'}`,
    `${keyCount} key${keyCount === 1 ? '' : 's'}`,
  ]
  if (cooling > 0) parts.push(`${cooling} cooling`)
  return parts.join(' · ')
}

function ApiKeyPoolCard(): React.ReactElement {
  const [state, setState] = useState<PanelState>({
    llmProviders: [],
    pools: {},
    loading: true,
    msg: null,
    addInputs: {},
    newProvName: '',
    panelOpen: false,
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

  const togglePanel = (): void => {
    setState((s) => ({ ...s, panelOpen: !s.panelOpen }))
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
  const panelOpen = state.panelOpen

  return (
    <div className={`akp-card${panelOpen ? ' open' : ''}`}>
      <button
        type="button"
        className="akp-panel-toggle"
        aria-expanded={panelOpen}
        onClick={togglePanel}
      >
        <span className="akp-panel-toggle-main">
          <span className="akp-panel-title">API Key Pool</span>
          <span className="akp-panel-sub">
            {summarizePanel(allProviders, state.pools, state.loading)}
          </span>
        </span>
        <span className="akp-chevron" aria-hidden="true">
          ▾
        </span>
      </button>

      {panelOpen ? (
        <div className="akp-panel-body">
          <p className="akp-desc">
            Round-robin keys per provider. Expand a provider to manage keys. Failed keys cool down
            automatically.
          </p>

          {allProviders.map((name) => {
            const pool = state.pools[name]
            const keys = pool?.maskedKeys || []
            const states = pool?.states || {}
            const isLlm = state.llmProviders.includes(name)
            const open = Boolean(state.expanded[name])

            return (
              <div key={name} className={`akp-prov${open ? ' open' : ''}`}>
                <button
                  type="button"
                  className="akp-prov-toggle"
                  aria-expanded={open}
                  onClick={() => toggleExpanded(name)}
                >
                  <span className="akp-prov-toggle-main">
                    <span className="akp-prov-name">{name}</span>
                    <span className="akp-prov-sub">{summarizePool(keys, states, isLlm)}</span>
                  </span>
                  <span className="akp-chevron" aria-hidden="true">
                    ▾
                  </span>
                </button>

                {open ? (
                  <div className="akp-prov-body">
                    {keys.map((masked, i) => {
                      const st = states[masked] || { failCount: 0, cooldownUntil: 0 }
                      const cooling = st.cooldownUntil > Date.now()
                      return (
                        <div key={`${masked}-${i}`} className="akp-row">
                          <span className={`akp-status ${cooling ? 'cooling' : 'healthy'}`} />
                          <span className="akp-key-masked">{masked}</span>
                          <span style={{ fontSize: 10, opacity: 0.6 }}>
                            {cooling
                              ? `cooling until ${new Date(st.cooldownUntil).toLocaleTimeString()}`
                              : st.failCount > 0
                                ? `fails ${st.failCount}`
                                : 'healthy'}
                          </span>
                          <button
                            className="akp-x"
                            type="button"
                            onClick={() => void handleRemoveKey(name, i)}
                          >
                            ✕
                          </button>
                        </div>
                      )
                    })}

                    {keys.length === 0 ? <p className="akp-empty">No keys yet</p> : null}

                    <div className="akp-field">
                      <input
                        placeholder="Paste API key…"
                        value={state.addInputs[name] || ''}
                        onChange={(e: ChangeEvent<HTMLInputElement>) =>
                          setState((s) => ({
                            ...s,
                            addInputs: { ...s.addInputs, [name]: e.target.value },
                          }))
                        }
                        onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
                          if (e.key === 'Enter') void handleAddKey(name)
                        }}
                      />
                      <button
                        className="akp-btn primary"
                        type="button"
                        onClick={() => void handleAddKey(name)}
                        disabled={!(state.addInputs[name] || '').trim()}
                      >
                        Add
                      </button>
                    </div>
                    {pool ? (
                      <button
                        className="akp-btn"
                        type="button"
                        onClick={() => void handleReset(name)}
                      >
                        Reset cooldown
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )
          })}

          <div className="akp-addprov">
            <input
              placeholder="Provider id (if not listed)…"
              value={state.newProvName}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setState((s) => ({ ...s, newProvName: e.target.value }))
              }
              onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
                if (e.key === 'Enter') void handleAddProvider()
              }}
            />
            <button
              className="akp-btn"
              type="button"
              onClick={() => void handleAddProvider()}
              disabled={!state.newProvName.trim()}
            >
              Add provider
            </button>
          </div>

          {state.msg ? <div className={`akp-msg ${state.msg.type}`}>{state.msg.text}</div> : null}
          {state.loading ? <p className="akp-empty">Loading…</p> : null}
        </div>
      ) : null}
    </div>
  )
}

export function apply(ctx: ClientPluginContext): void {
  ctx.effect(installStyles, 'dsh-api-key-pool: styles')
  ctx.slots.inject('settings.plugin.item', function* () {
    yield ctx.slots.register(
      {
        name: 'settings.plugin.item',
        id: 'dsh-api-key-pool',
        // Pair with cordis.patch.yml `id` / settings.register namespace — not the npm name.
        key: 'api-key-pool',
        order: 50,
        label: () => 'API Key Pool',
        inject: () => ({}),
      },
      ApiKeyPoolCard,
    )
  })
}

export const inject = ['settingsScope', 'slots'] as const
