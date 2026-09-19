# dsh-api-key-pool

Multi-key **round-robin** + **failover** for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) providers.

Based on / inspired by [xiaozhe7772222/dsh-api-key-pool](https://github.com/xiaozhe7772222/dsh-api-key-pool). This fork is rewritten in TypeScript, honors `DSH_HOME`, masks keys in the public API, and includes a small Web settings panel.

[繁體中文說明](./README.zh-TW.md)

---

## When to use this

DSH’s Models page stores **one** API key per provider. If you have several keys for the same gateway (rate limits, shared quota, backup keys), this plugin lets you:

1. Put multiple keys in one **pool** for that provider
2. Rotate them on each request (round-robin)
3. Automatically cool down a bad key (401 / 403 / 429 / quota / timeout-style errors) and **retry with the next key**

---

## How it works

```
Chat request
   → plugin picks a healthy key (round-robin)
   → writes it into process.env[apiKeyEnv]
   → DSH credentials prefer env over .credentials.yaml
   → provider API call

On failure (auth / rate limit / …)
   → mark that key cooling
   → ask agent loop to retry
   → next request picks another key
```

**Important:** the pool’s `apiKeyEnv` must match the provider’s `apiKeyEnv` in your DSH config (for example `EASYTOKENS_CODEX_API_KEY`).

---

## Requirements

- Node.js 18+
- DSH web profile (this plugin injects `llm` + `webServer`)
- At least one LLM provider already configured in DSH

---

## Install

### Option A — CLI

```bash
dsh plugin --profile web add github:911218sky/dsh-api-key-pool#main
```

### Option B — edit `package.json`

In `$DSH_HOME/profiles/web/package.json` (often `~/.config/dsh/profiles/web/package.json`):

```json
{
  "dependencies": {
    "dsh-api-key-pool": "github:911218sky/dsh-api-key-pool#main"
  },
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app",
        "dsh-api-key-pool"
      ]
    }
  }
}
```

Then install deps in that profile directory (whatever you normally use: `pnpm install` / `dsh plugin …`) and **restart DSH**.

If you run DSH via systemd:

```bash
sudo systemctl restart dsh-web.service
```

### Check that it loaded

```bash
curl -s http://127.0.0.1:3080/dsh-api-key-pool/pools | head
```

You should get JSON with a `pools` object (not 404).

---

## Quick start (Web UI)

1. Open the DSH Web UI
2. Go to **Settings → API Key Pool**
3. Find your provider name (same id as in Models / `llm-pi-ai`, e.g. `easytokens-gpt`, `dieqiyun-claude`)
4. Paste an API key → **Add**
5. Add a second key the same way
6. Chat as usual — requests will rotate across those keys

UI tips:

- Green dot = healthy; orange = cooling
- **✕** removes that key (by index; full secrets are not shown)
- **Reset cooldown** clears cooling state for that provider

Keys added in the UI are saved under `$DSH_HOME/storages/dsh-api-key-pool/pool-config.json` (survives plugin reinstalls).

### Security notes

- **POST** `/pools` and `/verify` require loopback, a DSH session cookie, or header `x-api-key-pool-token` matching env `DSH_API_KEY_POOL_TOKEN` (disable with `requireAuthForMutations: false` only if trusted).
- `/verify` rejects private/loopback `baseURL` targets (SSRF protection).
- Failover only rotates on auth / rate-limit / quota / timeout-style errors, with a per-turn retry cap (`maxRetriesPerTurn`, default 5).

## Develop

You can also seed pools in the plugin’s `cordis.patch.yml` (or your profile `cordis.patch.yml` insert for `api-key-pool`):

```yaml
- insert:
    - id: api-key-pool
      name: dsh-api-key-pool
      inject: [llm, webServer, settings]
      config:
        defaultCooldownMs: 30000
        pools:
          easytokens-gpt:
            apiKeyEnv: EASYTOKENS_CODEX_API_KEY
            keys:
              - sk-your-first-key
              - sk-your-second-key
            cooldownMs: 30000
          dieqiyun-claude:
            apiKeyEnv: DIEQIYUN_CLAUDE_API_KEY
            keys:
              - sk-key-a
              - sk-key-b
```

| Field | Meaning |
|---|---|
| `pools.<name>` | Must match the DSH **provider id** (not the display name) |
| `apiKeyEnv` | Same env name as that provider’s `apiKeyEnv` |
| `keys` | List of API keys to rotate |
| `cooldownMs` | Cooldown after a failure (ms). Default follows `defaultCooldownMs` (30000) |

**Do not commit real keys to a public repo.** Prefer the Web UI / REST API so keys stay in local `pool-config.json`.

Runtime merge order:

1. Plugin config (`cordis` / `pools`)
2. Overwritten/merged with `pool-config.json` (UI / API)
3. If `process.env[apiKeyEnv]` is set, that value is also included in the pool

---

## REST API

Base path: `/dsh-api-key-pool`  
Default port in many setups: `3080` (adjust host/port to yours).

Keys in list responses are **masked** (`sk-abc****1234`). Full secrets are not returned by GET.

### `GET /dsh-api-key-pool/pools`

List pools, masked keys, and health state.

```bash
curl -s http://127.0.0.1:3080/dsh-api-key-pool/pools
```

### `GET /dsh-api-key-pool/llm-providers`

Providers discovered from `$DSH_HOME/settings.yaml` → `llm-pi-ai.providers` (best-effort).

### `POST /dsh-api-key-pool/pools`

| `action` | Body | What it does |
|---|---|---|
| `addProvider` | `{ action, provider, apiKeyEnv?, key? }` | Create an empty/new pool |
| `removeProvider` | `{ action, provider }` | Delete a pool |
| `add` | `{ action, provider, key }` | Add one key |
| `remove` | `{ action, provider, index }` | Remove key at `index` (0-based) |
| `update` | `{ action, provider, keys: string[] }` | Replace the full key list |
| `reset` | `{ action, provider }` | Clear cooldown / fail counts |

Examples:

```bash
# Add a key to an existing provider pool
curl -X POST http://127.0.0.1:3080/dsh-api-key-pool/pools \
  -H 'Content-Type: application/json' \
  -d '{"action":"add","provider":"easytokens-gpt","key":"sk-..."}'

# Replace all keys
curl -X POST http://127.0.0.1:3080/dsh-api-key-pool/pools \
  -H 'Content-Type: application/json' \
  -d '{"action":"update","provider":"easytokens-gpt","keys":["sk-a","sk-b"]}'

# Remove the first key (index 0)
curl -X POST http://127.0.0.1:3080/dsh-api-key-pool/pools \
  -H 'Content-Type: application/json' \
  -d '{"action":"remove","provider":"easytokens-gpt","index":0}'

# Reset cooldown
curl -X POST http://127.0.0.1:3080/dsh-api-key-pool/pools \
  -H 'Content-Type: application/json' \
  -d '{"action":"reset","provider":"easytokens-gpt"}'
```

### `POST /dsh-api-key-pool/verify`

Live probe: pick keys in order, call `{baseURL}/models`, rotate on failure. Useful to confirm the pool before chatting.

```bash
curl -X POST http://127.0.0.1:3080/dsh-api-key-pool/verify \
  -H 'Content-Type: application/json' \
  -d '{
    "provider": "easytokens-gpt",
    "baseURL": "https://api.easytokens.org/v1",
    "maxAttempts": 4
  }'
```

Success looks like: first key 401 (if bad), next key 200, `"ok": true`.

---

## Finding the provider id and apiKeyEnv

In your profile `cordis.patch.yml` (or Models UI → provider settings), each custom provider looks like:

```yaml
llm-pi-ai:
  providers:
    easytokens-gpt:          # ← provider id (pool name)
      apiKeyEnv: EASYTOKENS_CODEX_API_KEY   # ← must match pool.apiKeyEnv
      baseURL: https://api.easytokens.org/v1
```

Use that same id (`easytokens-gpt`) when calling the API or naming a YAML pool.

---

## Troubleshooting

| Problem | What to check |
|---|---|
| `404` on `/dsh-api-key-pool/pools` | Plugin not in `dsh.profile.bundles`, or DSH not restarted |
| Pool exists but chat still uses one key | Only one key in the pool; add a second key |
| Rotation never triggers | Failures must look like auth/rate-limit/timeout; some gateways return a different shape |
| Wrong account / still old key | `apiKeyEnv` mismatch between pool and provider |
| UI empty | Open Settings → **API Key Pool**; create/add keys there |
| Keys lost after reinstall | Keys live in `$DSH_HOME/storages/dsh-api-key-pool/pool-config.json` (v0.5+); migrate from the old package-dir file automatically |
| POST returns 401 | Need loopback, DSH session cookie, or `x-api-key-pool-token` |
| verify rejects baseURL | Private/loopback hosts are blocked (SSRF guard) |

---

## Develop

```bash
git clone https://github.com/911218sky/dsh-api-key-pool.git
cd dsh-api-key-pool
npm install
npm run build
```

Source is under `src/`; build output is `lib/` (published with the package).

Maintainer notes (Settings UI tokens, `settings.section`, Host pitfalls):  
[docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md) · [繁中](./docs/DEVELOPMENT.zh-TW.md)

---

## Credits

- Original idea & earlier implementation: [xiaozhe7772222/dsh-api-key-pool](https://github.com/xiaozhe7772222/dsh-api-key-pool)
- This repository: TypeScript rewrite and packaging for `github:911218sky/dsh-api-key-pool#main`

## License

MIT
