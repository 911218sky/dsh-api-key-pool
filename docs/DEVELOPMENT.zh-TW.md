# 開發文件（dsh-api-key-pool）

給後續維護／改 UI／改 Host 邏輯用的內部說明。使用者文件請看 [README.zh-TW.md](../README.zh-TW.md)。

English: [DEVELOPMENT.md](./DEVELOPMENT.md)

---

## 專案地圖

| 路徑 | 職責 |
|------|------|
| `src/index.ts` | Host：Cordis `apply`、事件、REST 註冊、`settings.register` |
| `src/pool.ts` | Key pool 狀態、持久化、`credentials.set` |
| `src/routes.ts` | `/dsh-api-key-pool/*` REST |
| `src/util.ts` | 認證、SSRF、`apiKeyEnv` 安全檢查 |
| `src/client/index.tsx` | **Web Settings 頁**（側邊欄獨立 section） |
| `src/types.ts` | Host + Client 共用型別（避免 `any`） |
| `cordis.patch.yml` | 外掛 id / inject / config 範本 |
| `lib/` | `npm run build` 產出（**改 `src/` 後必須 rebuild**） |

---

## 日常流程

```bash
cd /path/to/dsh-api-key-pool
npm run build

# profile 同步（本機常見路徑）
cd ~/.config/dsh/profiles/web
pnpm update dsh-api-key-pool

# 重啟 web（有 systemd 用 systemctl；否則重啟 dsh web process）
systemctl --user restart dsh-web.service
```

- 只改 `src/` 卻沒 rebuild → profile 仍跑舊的 `lib/`
- GitHub `main` 更新後，profile 用 `github:…#main` 時要再 `pnpm update`
- 前端變更請硬重新整理 Settings 頁

---

## Settings UI：放哪裡？

DSH Settings 有兩種常見掛載點，**不要混用**：

| Slot | 出現位置 | 本專案 |
|------|----------|--------|
| `settings.plugin.item` | **Plugins → Plugin configuration** 裡的折疊卡（`PluginCard`） | ❌ 已棄用 |
| `settings.section` | Settings **左側導覽獨立一頁**（同 Side card） | ✅ 目前使用 |

註冊範例（見 `src/client/index.tsx`）：

```ts
ctx.slots.inject('settings.section', function* () {
  yield ctx.slots.register({
    name: 'settings.section',
    id: 'api-key-pool',   // section key
    order: 90,            // 導覽順序（Side card 約 100）
    label: () => 'API Key Pool',
    inject: () => ({}),
  }, ApiKeyPoolSection)
})
```

Host 仍可 `settings.register('api-key-pool', …)`（空 schema 亦可），但 **沒有** `settings.plugin.item` 時，Plugins 設定頁不會再出現這張卡。

Client `inject`：`['settingsScope', 'slots']`  
`package.json` → `dsh.client.inject` 需含 `@deepseek-ai/dsh-client-ui-settings`。

---

## 必須對齊的 DSH UI 風格

目標：看起來像官方 Settings / Side card，**不是**自創儀表板風。

### 設計原則

1. **只用 `--dsw-alias-*` token**，不要硬編碼亮色／紫色漸層／奶油底。
2. **一頁一個 section**：上方 intro → 可選版本徽章 → 群組卡（group）。
3. **群組卡**對齊 better-sidebar / PluginCard 食譜：圓角 16px、細邊框、layer 背景。
4. **欄位列**用髮絲分隔（`border-l2` / `0.5px`），label 在上、hint 次要色。
5. **按鈕**：次要＝透明 + `border-l2`；主要＝`label-primary` 底 + `bg-layer-3` 字（同 PluginCard Save）。
6. **輸入框**：高 34px、圓角 8px、`border-l4`、`bg-layer-3`；focus → `brand-primary`。

### 常用 token

| 用途 | Token |
|------|--------|
| 頁面主文字 | `--dsw-alias-label-primary` |
| 次要／說明 | `--dsw-alias-label-secondary` / `--dsw-alias-label-tertiary` |
| 群組卡底 | `--dsw-alias-bg-layer-3` |
| 展開卡／hover 區 | `--dsw-alias-bg-layer-2` |
| 卡邊框 | `--dsw-alias-border-l2` 或 PluginCard 的 `border-l4` |
| Hover | `--dsw-alias-interactive-bg-hover` |
| Focus | `--dsw-alias-brand-primary` |
| 成功／警告／錯誤 | `--dsw-alias-state-success-primary` / `state-warn-primary` / `label-error` |
| 主按鈕字色 | `--dsw-alias-bg-layer-3`（配 `label-primary` 底） |

### 版面結構（本專案 class）

```
.akp-section          max-width: 760px；直向 gap 16px
  .akp-intro          13px tertiary 說明
  .akp-badge          名稱 + 版本 pill（可選）
  .akp-group          16px 圓角卡；padding 20px
    .akp-group-heading + .akp-count
    .akp-prov         每個 provider（可折疊）
    .akp-addprov      底部新增 provider
```

參考實作：`src/client/index.tsx` 的 `installStyles()`。

### 側邊欄圖示（DSH 0.1.x 限制）

`settings.section` **合約沒有 icon 欄位**，殼層對外部 section 一律畫齒輪。

本專案沿用 better-sidebar 做法：

1. `MutationObserver` 找到 `[role="dialog"] nav` 裡文字等於 label 的 button
2. 打上 `data-dsh-api-key-pool-settings-nav`
3. CSS 藏起預設 SVG，用 `mask` 畫鑰匙圖示

改 nav 文案時，記得同步 `SETTINGS_NAV_LABEL` 與 observer。

---

## 對照官方原始碼（本機）

在已安裝 DSH profile 的機器上可讀：

| 主題 | 路徑（範例） |
|------|----------------|
| PluginCard 樣式／結構 | `~/.config/dsh/profiles/node_modules/@deepseek-ai/dsh-client-ui-settings-plugins/lib/client.js` |
| Settings slot 合約 | `…/dsh-client-ui-settings/lib/types/client/contract/slots.d.ts` |
| Side card 頁面食譜 | `…/dsh-better-sidebar/src/client/SideCardSection.module.css` |
| Nav icon hack | `…/dsh-better-sidebar/src/client/settings-nav-icon.ts` |
| Input／Button token | `…/dsh-client-ui-primitives/lib/Input.module.css`、`Button.module.css` |

改 UI 前先對一下上述檔案的 token，再動本專案 CSS。

---

## Host 行為注意

- Key 注入：寫 `process.env[apiKeyEnv]` **且** `credentials.set`（rc.1+ `llm-pi-ai` 讀 credentials snapshot）。
- REST：預設需認證（loopback / Bearer / 同站 session cookie）；勿再打開未認證 mutation。
- `/verify`：SSRF 防護（私網、DNS、redirect）；勿把 upstream body 回給瀏覽器。
- `apiKeyEnv`：必須通過 `assertSafeApiKeyEnv`（格式 + 保留名）。
- 持久化 `pool-config.json`：權限 `0600`。
- `llm/stream` 用 `{ global: true }`，避免漏掉非 `agent/request` 路徑。

---

## TypeScript

- 禁止 `any`；新 API 先補 `src/types.ts`。
- Client／Host 分開 entry（`tsdown`）；client 為 CJS bundle。
- 動態 import `@deepseek-ai/schemastery` 時用 `src/schemastery.d.ts`。

---

## 提交前檢查清單

- [ ] `npm run build` 成功，`lib/` 已更新
- [ ] UI 只用 `--dsw-alias-*`，深色模式可讀
- [ ] Settings 側邊欄有 **API Key Pool**，Plugins configuration **沒有**重複卡
- [ ] 新增／刪除 key、cooldown reset 仍可用
- [ ] README 路徑若改動（EN + zh-TW）一併更新
- [ ] 需要時 push + `pnpm update` + 重啟 dsh web
