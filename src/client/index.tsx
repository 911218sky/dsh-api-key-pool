import React, { useCallback, useEffect, useState, type ChangeEvent, type KeyboardEvent } from 'react'
import {
  API_BASE,
  type ClientPluginContext,
  type PanelState,
  type PoolViewClient,
} from '../types.js'

function installStyles(): () => void {
  const css = document.createElement('style')
  css.textContent = `
    .akp-card { font-family: inherit; }
    .akp-desc { margin: 0 0 12px; font-size: 12px; opacity: .7; }
    .akp-prov { margin-bottom: 14px; padding: 12px; border: 1px solid var(--dsw-alias-border-l2, #ddd); border-radius: 8px; }
    .akp-prov-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
    .akp-prov-name { font-weight: 600; font-size: 13px; }
    .akp-row { display: flex; align-items: center; gap: 6px; padding: 3px 0; font-size: 12px; }
    .akp-key-masked { flex: 1; font-family: monospace; font-size: 11px; }
    .akp-status { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
    .akp-status.healthy { background: #4caf50; }
    .akp-status.cooling { background: #ff9800; }
    .akp-x { cursor: pointer; opacity: .45; font-size: 10px; padding: 2px 4px; border: none; background: transparent; }
    .akp-x:hover { opacity: 1; }
    .akp-field { display: flex; gap: 6px; margin: 4px 0; }
    .akp-field input { flex: 1; min-width: 0; padding: 4px 8px; font-size: 12px; border: 1px solid var(--dsw-alias-border-l2, #ddd); border-radius: 4px; background: var(--dsw-alias-bg-base, #fff); color: var(--dsw-alias-label-primary, #333); }
    .akp-btn { padding: 4px 10px; font-size: 12px; border: 1px solid var(--dsw-alias-border-l2, #ddd); border-radius: 4px; background: var(--dsw-alias-interactive-bg, #f0f0f0); color: var(--dsw-alias-label-primary, #333); cursor: pointer; }
    .akp-btn.primary { background: var(--dsw-alias-state-business-primary, #1976d2); border-color: var(--dsw-alias-state-business-primary, #1976d2); color: #fff; }
    .akp-msg { font-size: 11px; margin-top: 6px; padding: 4px 8px; border-radius: 4px; }
    .akp-msg.ok { background: #e8f5e9; color: #2e7d32; }
    .akp-msg.err { background: #ffebee; color: #c62828; }
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
  const r = await fetch(url, opts)
  return (await r.json()) as T
}

function ApiKeyPoolCard(): React.ReactElement {
  const [state, setState] = useState<PanelState>({
    llmProviders: [],
    pools: {},
    loading: true,
    msg: null,
    addInputs: {},
  })

  const refresh = useCallback(async () => {
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
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const showMsg = (type: 'ok' | 'err', text: string): void => {
    setState((s) => ({ ...s, msg: { type, text } }))
    setTimeout(() => setState((s) => ({ ...s, msg: null })), 3000)
  }

  const handleAddKey = async (provider: string): Promise<void> => {
    const key = (state.addInputs[provider] || '').trim()
    if (!key) return

    const action = state.pools[provider] ? 'add' : 'addProvider'
    const r = await fetchJson<MutateApiResponse>(`${API_BASE}/pools`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, provider, key }),
    })
    if (!r.ok) {
      showMsg('err', r.error || 'Add failed')
      return
    }

    setState((s) => ({ ...s, addInputs: { ...s.addInputs, [provider]: '' } }))
    showMsg('ok', 'Key added')
    await refresh()
  }

  const handleRemoveKey = async (provider: string, index: number): Promise<void> => {
    await fetchJson<MutateApiResponse>(`${API_BASE}/pools`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'remove', provider, index }),
    })
    await refresh()
  }

  const handleReset = async (provider: string): Promise<void> => {
    await fetchJson<MutateApiResponse>(`${API_BASE}/pools`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reset', provider }),
    })
    await refresh()
  }

  const allProviders = [...new Set([...state.llmProviders, ...Object.keys(state.pools)])]

  return (
    <div className="akp-card">
      <h3 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 600 }}>API Key Pool</h3>
      <p className="akp-desc">
        Round-robin keys per provider. Failed keys (401/403/429/…) cool down, then the next key is
        used.
      </p>

      {allProviders.map((name) => {
        const pool = state.pools[name]
        const keys = pool?.maskedKeys || []
        const states = pool?.states || {}
        const isLlm = state.llmProviders.includes(name)

        return (
          <div key={name} className="akp-prov">
            <div className="akp-prov-head">
              <div>
                <span className="akp-prov-name">{name}</span>
                {isLlm ? (
                  <span style={{ fontSize: 10, opacity: 0.5, marginLeft: 6 }}>LLM</span>
                ) : null}
              </div>
            </div>

            {keys.map((masked, i) => {
              const st = states[masked] || { failCount: 0, cooldownUntil: 0 }
              const cooling = st.cooldownUntil > Date.now()
              return (
                <div key={`${masked}-${i}`} className="akp-row">
                  <span className={`akp-status ${cooling ? 'cooling' : 'healthy'}`} />
                  <span className="akp-key-masked">{masked}</span>
                  <span style={{ fontSize: 10, opacity: 0.5 }}>
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

            {keys.length === 0 ? (
              <p style={{ fontSize: 11, opacity: 0.5 }}>No keys yet</p>
            ) : null}

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
            <button className="akp-btn" type="button" onClick={() => void handleReset(name)}>
              Reset cooldown
            </button>
          </div>
        )
      })}

      {state.msg ? <div className={`akp-msg ${state.msg.type}`}>{state.msg.text}</div> : null}
      {state.loading ? <p style={{ fontSize: 11, opacity: 0.5 }}>Loading…</p> : null}
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
