# dsh-api-key-pool

給 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）用的多 Key **輪詢** + **失敗切換** 外掛。

參考／改寫自 [xiaozhe7772222/dsh-api-key-pool](https://github.com/xiaozhe7772222/dsh-api-key-pool)。本倉庫以 TypeScript 重寫，支援 `DSH_HOME`，公開 API 只回傳遮罩後的 Key，並提供簡易 Web 設定面板。

[English](./README.md)

---

## 什麼時候需要用

DSH「模型」頁面每個 provider **只能存一把** API Key。如果你同一個中轉／官方帳號有多把 Key（限流、額度、備援），這個外掛可以：

1. 把多把 Key 放進同一個 **pool**
2. 每次請求輪流使用（round-robin）
3. 遇到 401 / 403 / 429 / 配額 / 逾時等錯誤 → 該 Key 進入冷卻，**自動換下一把重試**

---

## 運作方式

```
對話請求
   → 外掛選一把健康的 Key（輪詢）
   → 寫入 process.env[apiKeyEnv]
   → DSH 憑證優先讀環境變數（高於 .credentials.yaml）
   → 打到 provider API

失敗（認證／限流／…）
   → 標記該 Key 冷卻
   → 請 agent 重試
   → 下次再選下一把
```

**重點：** pool 的 `apiKeyEnv` 必須跟該 provider 在 DSH 裡的 `apiKeyEnv` 一致（例如 `EASYTOKENS_CODEX_API_KEY`）。

---

## 需求

- Node.js 18+
- DSH web profile（外掛會注入 `llm`、`webServer`）
- 至少已設定好一個 LLM provider

---

## 安裝

### 方式 A — CLI

```bash
dsh plugin --profile web add github:911218sky/dsh-api-key-pool#main
```

### 方式 B — 改 `package.json`

編輯 `$DSH_HOME/profiles/web/package.json`（常見路徑：`~/.config/dsh/profiles/web/package.json`）：

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

在該 profile 目錄安裝依賴（你平常怎麼裝就怎麼裝：`pnpm install` / `dsh plugin …`），然後**重啟 DSH**。

若用 systemd：

```bash
sudo systemctl restart dsh-web.service
```

### 確認有載入

```bash
curl -s http://127.0.0.1:3080/dsh-api-key-pool/pools | head
```

應回傳含 `pools` 的 JSON（不要是 404）。

---

## 快速開始（Web UI）

1. 打開 DSH Web UI
2. 進入 **設定 → 插件 → API Key Pool**
3. 找到 provider 名稱（跟模型設定裡的 id 一樣，例如 `easytokens-gpt`、`dieqiyun-claude`）
4. 貼上 API Key → 按 **Add**
5. 再用同樣方式加第二把
6. 正常聊天即可 — 請求會在這些 Key 之間輪流

介面說明：

- 綠點 = 健康；橘點 = 冷卻中
- **✕** 刪除該 Key（依 index；畫面上不會顯示完整密鑰）
- **Reset cooldown** 清除該 provider 的冷卻狀態

介面新增的 Key 會存到 `$DSH_HOME/storages/dsh-api-key-pool/pool-config.json`（重裝外掛也不會丟）。

### 安全說明

- **POST** `/pools`、`/verify` 需要本機 loopback、DSH 登入 cookie，或 header `x-api-key-pool-token`（對應環境變數 `DSH_API_KEY_POOL_TOKEN`）。僅在可信網路才可設 `requireAuthForMutations: false`。
- `/verify` 禁止指向私網／本機的 `baseURL`（防 SSRF）。
- 只有認證／限流／配額／逾時類錯誤才會換 Key，且每輪有重試上限（`maxRetriesPerTurn`，預設 5）。

---

## 用 YAML 預先設定（可選）

也可以在外掛的 `cordis.patch.yml`（或 profile 的 `cordis.patch.yml` 裡 `api-key-pool` 那一段）寫：

```yaml
- insert:
    - id: api-key-pool
      name: dsh-api-key-pool
      inject: [llm, webServer]
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

| 欄位 | 說明 |
|---|---|
| `pools.<name>` | 必須是 DSH 的 **provider id**（不是顯示名稱） |
| `apiKeyEnv` | 跟該 provider 的 `apiKeyEnv` 相同 |
| `keys` | 要輪詢的 API Key 列表 |
| `cooldownMs` | 失敗後冷卻毫秒；預設跟 `defaultCooldownMs`（30000） |

**不要把真實 Key 提交到公開倉庫。** 建議用 Web UI / REST，讓 Key 只留在本機 `pool-config.json`。

合併順序：

1. 外掛設定（cordis / `pools`）
2. 與 `pool-config.json`（UI / API）合併
3. 若已有 `process.env[apiKeyEnv]`，也會併入該 pool

---

## REST API

路徑前綴：`/dsh-api-key-pool`  
很多環境預設埠：`3080`（依你的 host/port 調整）。

列表 API 只回傳**遮罩後**的 Key（`sk-abc****1234`），不會回完整密鑰。

### `GET /dsh-api-key-pool/pools`

列出 pool、遮罩 Key、健康狀態。

```bash
curl -s http://127.0.0.1:3080/dsh-api-key-pool/pools
```

### `GET /dsh-api-key-pool/llm-providers`

從 `$DSH_HOME/settings.yaml` 的 `llm-pi-ai.providers` 盡力發現 provider 名稱。

### `POST /dsh-api-key-pool/pools`

| `action` | Body | 作用 |
|---|---|---|
| `addProvider` | `{ action, provider, apiKeyEnv?, key? }` | 新建一個 pool |
| `removeProvider` | `{ action, provider }` | 刪除整個 pool |
| `add` | `{ action, provider, key }` | 新增一把 Key |
| `remove` | `{ action, provider, index }` | 依 0-based `index` 刪除 |
| `update` | `{ action, provider, keys: string[] }` | 整份替換 Key 列表 |
| `reset` | `{ action, provider }` | 清除冷卻／失敗計數 |

範例：

```bash
# 幫既有 provider 加一把 Key
curl -X POST http://127.0.0.1:3080/dsh-api-key-pool/pools \
  -H 'Content-Type: application/json' \
  -d '{"action":"add","provider":"easytokens-gpt","key":"sk-..."}'

# 一次替換全部 Key
curl -X POST http://127.0.0.1:3080/dsh-api-key-pool/pools \
  -H 'Content-Type: application/json' \
  -d '{"action":"update","provider":"easytokens-gpt","keys":["sk-a","sk-b"]}'

# 刪除第一把（index 0）
curl -X POST http://127.0.0.1:3080/dsh-api-key-pool/pools \
  -H 'Content-Type: application/json' \
  -d '{"action":"remove","provider":"easytokens-gpt","index":0}'

# 重置冷卻
curl -X POST http://127.0.0.1:3080/dsh-api-key-pool/pools \
  -H 'Content-Type: application/json' \
  -d '{"action":"reset","provider":"easytokens-gpt"}'
```

### `POST /dsh-api-key-pool/verify`

線上探測：依序選 Key、打 `{baseURL}/models`，失敗就換下一把。適合聊天前確認 pool 有沒有用。

```bash
curl -X POST http://127.0.0.1:3080/dsh-api-key-pool/verify \
  -H 'Content-Type: application/json' \
  -d '{
    "provider": "easytokens-gpt",
    "baseURL": "https://api.easytokens.org/v1",
    "maxAttempts": 4
  }'
```

成功時常見結果：第一把 401（若是壞 Key）、下一把 200，且 `"ok": true`。

---

## 怎麼查 provider id 跟 apiKeyEnv

在 profile 的 `cordis.patch.yml`（或模型設定）裡，自訂 provider 大概長這樣：

```yaml
llm-pi-ai:
  providers:
    easytokens-gpt:          # ← provider id（pool 名稱）
      apiKeyEnv: EASYTOKENS_CODEX_API_KEY   # ← 必須跟 pool.apiKeyEnv 一致
      baseURL: https://api.easytokens.org/v1
```

呼叫 API 或寫 YAML pool 時，請用這個 id（例如 `easytokens-gpt`）。

---

## 疑難排解

| 狀況 | 檢查 |
|---|---|
| `/dsh-api-key-pool/pools` 回 404 | 沒加進 `dsh.profile.bundles`，或還沒重啟 DSH |
| 有 pool 但聊天仍只用一把 | pool 裡其實只有一把 Key；再加第二把 |
| 好像不會自動換 Key | 失敗類型要像認證／限流／逾時；有些閘道錯誤格式不同 |
| 還是打到舊帳號 | pool 與 provider 的 `apiKeyEnv` 不一致 |
| UI 是空的 | 到 設定 → 插件 → **API Key Pool** 新增 Key |
| 重裝後 Key 不見 | v0.5+ 存在 `$DSH_HOME/storages/dsh-api-key-pool/pool-config.json`，會自動從舊路徑遷移 |
| POST 回 401 | 需要 loopback、DSH cookie，或 `x-api-key-pool-token` |
| verify 拒絕 baseURL | 私網／本機位址會被 SSRF 防護擋下 |

---

## 開發

```bash
git clone https://github.com/911218sky/dsh-api-key-pool.git
cd dsh-api-key-pool
npm install
npm run build
```

原始碼在 `src/`，建置輸出在 `lib/`（會一併發佈）。

---

## 致謝

- 原始構想與早期實作：[xiaozhe7772222/dsh-api-key-pool](https://github.com/xiaozhe7772222/dsh-api-key-pool)
- 本倉庫：TypeScript 重寫，並以 `github:911218sky/dsh-api-key-pool#main` 方式安裝

## 授權

MIT
