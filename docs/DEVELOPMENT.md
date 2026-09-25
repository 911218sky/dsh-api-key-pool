# Development notes (dsh-api-key-pool)

Internal notes for maintaining Host logic and the Settings UI. End-user docs: [README.md](../README.md).

繁體中文（較完整）: [DEVELOPMENT.zh-TW.md](./DEVELOPMENT.zh-TW.md)

---

## Layout

| Path | Role |
|------|------|
| `src/index.ts` | Host: Cordis apply, events, REST, `settings.register` |
| `src/pool.ts` | Pool state, persistence, `credentials.set` |
| `src/routes.ts` | `/dsh-api-key-pool/*` |
| `src/util.ts` | Auth, SSRF, safe `apiKeyEnv` |
| `src/client/index.tsx` | **Settings sidebar section** (not under Plugins) |
| `src/types.ts` | Shared types (no `any`) |
| `cordis.patch.yml` | Plugin id / inject / config |
| `lib/` | Build output — **rebuild after every `src/` change** |

```bash
npm run build
cd ~/.config/dsh/profiles/web && pnpm update dsh-api-key-pool
systemctl --user restart dsh-web.service   # or restart your dsh web process
```

---

## Where the UI lives

| Slot | Appears in | This repo |
|------|------------|-----------|
| `settings.plugin.item` | Plugins → Plugin configuration (`PluginCard`) | ❌ removed |
| `settings.section` | Settings **left nav** (like Side card) | ✅ current |

Register with `id`, `order`, `label` only — DSH 0.1.x has **no icon field** on `settings.section`. We mark the nav button with `data-dsh-api-key-pool-settings-nav` and paint a key glyph via CSS mask (same approach as `dsh-better-sidebar`).

Client inject: `['configForms', 'slots']` (0.1.7+; was `settingsScope` on 0.1.5).  
`package.json` → `dsh.client.inject` must include `@deepseek-ai/dsh-client-ui-settings`.

---

## Match native DSH UI

Do **not** invent a custom look. Mirror official Settings / Side card:

1. Use only `--dsw-alias-*` tokens (no hardcoded purple gradients / cream themes).
2. Page recipe: intro (13px tertiary) → optional version badge → group card (`border-radius: 16px`, `bg-layer-3`, `border-l2`).
3. Fields: hairline separators; inputs height 34px, radius 8px, `border-l4`, focus `brand-primary`.
4. Buttons: secondary = outline `border-l2`; primary = `label-primary` fill + `bg-layer-3` text (PluginCard Save).

### Token cheat sheet

| Use | Token |
|-----|--------|
| Title / body | `--dsw-alias-label-primary` |
| Hints | `--dsw-alias-label-tertiary` |
| Card fill | `--dsw-alias-bg-layer-3` |
| Borders | `--dsw-alias-border-l2` / `l4` |
| Hover | `--dsw-alias-interactive-bg-hover` |
| Focus | `--dsw-alias-brand-primary` |
| Status | `state-success-primary` / `state-warn-primary` / `label-error` |

Canonical styles live in `installStyles()` inside `src/client/index.tsx`.

### Local references (installed DSH)

- PluginCard: `~/.config/dsh/profiles/node_modules/@deepseek-ai/dsh-client-ui-settings-plugins/`
- Slot contract: `…/dsh-client-ui-settings/lib/types/client/contract/slots.d.ts`
- Side card CSS: `…/dsh-better-sidebar/src/client/SideCardSection.module.css`
- Nav icon hack: `…/dsh-better-sidebar/src/client/settings-nav-icon.ts`

---

## Host reminders

- Apply keys via `process.env` **and** `credentials.set` (newer llm-pi-ai).
- REST auth on by default; keep SSRF checks on `/verify`; `pool-config.json` mode `0600`.
- Validate `apiKeyEnv` with `assertSafeApiKeyEnv`.
- Listen to `llm/stream` with `{ global: true }` as well as `agent/request`.

### Remote browsers & Models "settings are unavailable"

DSH sets settings persistence to `memory` when `ctx.remote.$host.isLoopback` is false (any non-localhost hostname). `--trusted-host` only opens the `/api` trust fence — it does **not** enable Host settings. Models then fails with `settings are unavailable in this browser`.

This plugin defaults `enableRemoteHostSettings: true`, injecting `__DSH_TRANSPORT__.ownsHost = true` via `webserver/index-inject` so Settings/Models work through a trusted host. Set `enableRemoteHostSettings: false` to keep upstream behaviour. You still need CLI `--trusted-host`.

---

## Checklist before shipping

- [ ] `npm run build` and commit updated `lib/`
- [ ] UI uses `--dsw-alias-*`; readable in dark mode
- [ ] Sidebar shows **API Key Pool**; no duplicate under Plugins configuration
- [ ] Add/remove key + reset cooldown still work
- [ ] Update both READMEs if user-facing paths change
