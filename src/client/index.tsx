import React, { useCallback, useEffect, useState, type ChangeEvent, type KeyboardEvent } from 'react'
import {
  API_BASE,
  type ClientPluginContext,
  type PanelState,
  type PoolViewClient,
  type KeyState,
} from '../types.js'

const SETTINGS_NAV_LABEL = 'API Key Pool'
const SETTINGS_NAV_MARKER = 'data-dsh-api-key-pool-settings-nav'
const PLUGIN_VERSION = '0.5.0'

/** Lucide `key-round` — painted as a currentColor mask on the settings nav row. */
const NAV_ICON_MASK =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z'/%3E%3Ccircle cx='16.5' cy='7.5' r='.5' fill='black'/%3E%3C/svg%3E\")"

function installStyles(): () => void {
  const css = document.createElement('style')
  css.textContent = `
    /* Replace shell fallback gear with a key glyph (same trick as better-sidebar). */
    [${SETTINGS_NAV_MARKER}] > svg:first-child { display: none; }
    [${SETTINGS_NAV_MARKER}]::before {
      content: ''; flex: none; width: 16px; height: 16px;
      background: currentColor;
      -webkit-mask: ${NAV_ICON_MASK} center / contain no-repeat;
      mask: ${NAV_ICON_MASK} center / contain no-repeat;
    }

    .akp-section {
      display: flex; flex-direction: column; gap: 16px;
      width: 100%; max-width: 760px;
      color: var(--dsw-alias-label-primary, inherit);
      font-family: inherit;
    }
    .akp-intro {
      margin: 0; padding: 0 2px;
      font-size: 13px; line-height: 20px;
      color: var(--dsw-alias-label-tertiary, #888);
    }
    .akp-badge {
      display: inline-flex; align-items: center; gap: 8px; align-self: flex-start;
      padding: 4px 12px 4px 14px; border-radius: 999px;
      border: 1px solid var(--dsw-alias-border-l2, #444);
      background: var(--dsw-alias-bg-layer-2, transparent);
      font-size: 12px; line-height: 18px;
    }
    .akp-badge-name { color: var(--dsw-alias-label-primary, inherit); font-weight: 600; }
    .akp-badge-tag {
      padding: 1px 8px; border-radius: 999px;
      background: var(--dsw-alias-accent-soft, var(--dsw-alias-border-l2, #444));
      color: var(--dsw-alias-label-secondary, #aaa);
      font-variant-numeric: tabular-nums;
    }
    .akp-group {
      display: flex; flex-direction: column; gap: 8px;
      padding: 20px; box-sizing: border-box;
      border: 1px solid var(--dsw-alias-border-l2, #444);
      border-radius: 16px;
      background: var(--dsw-alias-bg-layer-3, transparent);
    }
    .akp-group-heading {
      display: flex; align-items: baseline; gap: 7px;
      padding: 0 2px 6px;
      font-size: 13px; line-height: 20px; font-weight: 600;
      color: var(--dsw-alias-label-primary, inherit);
    }
    .akp-count {
      padding: 1px 8px; border-radius: 999px;
      background: var(--dsw-alias-accent-soft, var(--dsw-alias-bg-layer-2, #333));
      font-size: 11px; line-height: 16px; font-weight: 500;
      color: var(--dsw-alias-label-secondary, #aaa);
      font-variant-numeric: tabular-nums;
    }
    .akp-prov {
      border-top: 0.5px solid var(--dsw-alias-border-l2, #444);
    }
    .akp-prov:first-of-type { border-top: none; }
    .akp-prov-toggle {
      width: 100%; display: flex; align-items: center; gap: 12px; text-align: left;
      padding: 12px 2px; border: none; background: transparent; cursor: pointer;
      color: inherit; font: inherit; border-radius: 8px;
    }
    .akp-prov-toggle:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.12)); }
    .akp-prov-toggle:focus-visible {
      outline: 2px solid var(--dsw-alias-brand-primary, #4a9eff);
      outline-offset: -2px;
    }
    .akp-prov-toggle-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .akp-prov-name {
      font-weight: 600; font-size: 13px; line-height: 20px;
      color: var(--dsw-alias-label-primary, inherit);
    }
    .akp-prov-sub {
      font-size: 12px; line-height: 18px;
      color: var(--dsw-alias-label-tertiary, #888);
    }
    .akp-chevron {
      flex: none; width: 14px; height: 14px;
      color: var(--dsw-alias-label-tertiary, #888);
      transition: transform .16s ease;
      display: inline-flex; align-items: center; justify-content: center;
    }
    .akp-prov.open .akp-chevron { transform: rotate(180deg); }
    .akp-prov-body { padding: 0 2px 12px; display: flex; flex-direction: column; gap: 8px; }
    .akp-row {
      display: flex; align-items: center; gap: 8px;
      padding: 6px 0; font-size: 12px;
      color: var(--dsw-alias-label-secondary, inherit);
    }
    .akp-key-masked {
      flex: 1; min-width: 0; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 12px; color: var(--dsw-alias-label-primary, inherit);
    }
    .akp-status { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
    .akp-status.healthy { background: var(--dsw-alias-state-success-primary, #4caf50); }
    .akp-status.cooling { background: var(--dsw-alias-state-warn-primary, #ff9800); }
    .akp-meta { font-size: 11px; color: var(--dsw-alias-label-tertiary, #888); }
    .akp-x {
      cursor: pointer; font-size: 12px; padding: 2px 6px; border: none; border-radius: 6px;
      background: transparent; color: var(--dsw-alias-label-tertiary, #888);
    }
    .akp-x:hover {
      color: var(--dsw-alias-state-error-primary, #e57373);
      background: var(--dsw-alias-bg-layer-2, rgba(127,127,127,.12));
    }
    .akp-field { display: flex; gap: 8px; align-items: center; }
    .akp-field input, .akp-addprov input {
      flex: 1; min-width: 0; height: 34px; box-sizing: border-box;
      padding: 0 12px; font: inherit; font-size: 13px; line-height: 1.5;
      border: 0.5px solid var(--dsw-alias-border-l4, #555);
      border-radius: 8px;
      background: var(--dsw-alias-bg-layer-3, transparent);
      color: var(--dsw-alias-label-primary, inherit);
    }
    .akp-field input:focus-visible, .akp-addprov input:focus-visible {
      border-color: var(--dsw-alias-brand-primary, #4a9eff); outline: none;
    }
    .akp-field input::placeholder, .akp-addprov input::placeholder {
      color: var(--dsw-alias-label-tertiary, #888);
    }
    .akp-btn {
      appearance: none; font: inherit; cursor: pointer;
      border: 1px solid var(--dsw-alias-border-l2, #555);
      border-radius: 8px; padding: 5px 14px; font-size: 13px; line-height: 1.5;
      background: transparent; color: var(--dsw-alias-label-secondary, inherit);
    }
    .akp-btn:hover:not(:disabled) {
      color: var(--dsw-alias-label-primary, inherit);
      border-color: var(--dsw-alias-label-dimmed, #777);
      background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.12));
    }
    .akp-btn:disabled { opacity: .4; cursor: default; }
    .akp-btn:focus-visible {
      outline: 2px solid var(--dsw-alias-brand-primary, #4a9eff); outline-offset: 1px;
    }
    .akp-btn.primary {
      border-color: transparent;
      background: var(--dsw-alias-label-primary, #eee);
      color: var(--dsw-alias-bg-layer-3, #111);
    }
    .akp-btn.primary:hover:not(:disabled) {
      background: var(--dsw-alias-button-primary-hover, #ddd);
      border-color: transparent;
      color: var(--dsw-alias-bg-layer-3, #111);
    }
    .akp-addprov {
      display: flex; gap: 8px; margin-top: 4px; padding-top: 12px;
      border-top: 0.5px solid var(--dsw-alias-border-l2, #444);
    }
    .akp-msg { font-size: 12px; line-height: 1.5; margin: 0; padding: 4px 2px; }
    .akp-msg.ok { color: var(--dsw-alias-state-success-primary, #81c784); }
    .akp-msg.err { color: var(--dsw-alias-label-error, #e57373); }
    .akp-empty {
      font-size: 12px; line-height: 18px; margin: 0; padding: 4px 2px;
      color: var(--dsw-alias-label-tertiary, #888);
    }
  `
  document.head.appendChild(css)
  return () => css.remove()
}

/** Mark our Settings nav row so CSS can swap the fallback gear for a key icon. */
function registerSettingsNavIcon(label: () => string): () => void {
  let disposed = false
  const sync = (): void => {
    if (disposed) return
    const currentLabel = label().trim()
    const buttons = document.querySelectorAll<HTMLButtonElement>('[role="dialog"] nav button')
    for (const button of buttons) {
      const matches = currentLabel.length > 0 && button.textContent?.trim() === currentLabel
      if (matches) button.setAttribute(SETTINGS_NAV_MARKER, '')
      else button.removeAttribute(SETTINGS_NAV_MARKER)
    }
  }
  sync()
  const observer = new MutationObserver(sync)
  observer.observe(document.body, { childList: true, subtree: true, characterData: true })
  return () => {
    disposed = true
    observer.disconnect()
    document.querySelectorAll(`[${SETTINGS_NAV_MARKER}]`).forEach((el) => {
      el.removeAttribute(SETTINGS_NAV_MARKER)
    })
  }
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

function ChevronIcon(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M3 5.25L7 9.25L11 5.25"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
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
    <div className="akp-section">
      <p className="akp-intro">
        Round-robin API keys per provider. Expand a provider to manage keys. Failed keys cool down
        automatically.
      </p>

      <div className="akp-badge">
        <span className="akp-badge-name">dsh-api-key-pool</span>
        <span className="akp-badge-tag">v{PLUGIN_VERSION}</span>
      </div>

      <div className="akp-group">
        <div className="akp-group-heading">
          Providers
          <span className="akp-count">{allProviders.length}</span>
        </div>

        {state.loading ? <p className="akp-empty">Loading…</p> : null}
        {!state.loading && allProviders.length === 0 ? (
          <p className="akp-empty">No providers yet — add one below.</p>
        ) : null}

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
                <span className="akp-chevron">
                  <ChevronIcon />
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
                        <span className="akp-meta">
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
                    <button className="akp-btn" type="button" onClick={() => void handleReset(name)}>
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
      </div>
    </div>
  )
}

export function apply(ctx: ClientPluginContext): void {
  ctx.effect(installStyles, 'dsh-api-key-pool: styles')
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

export const inject = ['settingsScope', 'slots'] as const
