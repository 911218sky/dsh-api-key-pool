# dsh-api-key-pool

DeepSeek Harness 的多 Key **輪詢** + **失敗切換** 外掛。

參考／改寫自 [xiaozhe7772222/dsh-api-key-pool](https://github.com/xiaozhe7772222/dsh-api-key-pool)。本倉庫以 TypeScript 重寫，支援 `DSH_HOME`，並保留簡易 Web 設定面板。

[English](./README.md)

## 功能

- 同一個 provider 可放多把 API Key，請求時輪流使用
- 遇到 401 / 403 / 429 / 配額 / 逾時等錯誤 → 該 Key 冷卻，改用下一把並重試
- Web：**設定 → 插件 → API Key Pool**
- 可選探測：`POST /dsh-api-key-pool/verify`

## 安裝

```bash
dsh plugin --profile web add github:911218sky/dsh-api-key-pool#main
```

或在 `profiles/web/package.json`：

```json
{
  "dependencies": {
    "dsh-api-key-pool": "github:911218sky/dsh-api-key-pool#main"
  },
  "dsh": {
    "profile": {
      "bundles": ["dsh-api-key-pool"]
    }
  }
}
```

然後重啟 DSH（若用 systemd：`sudo systemctl restart dsh-web.service`）。

## 設定 Key

**介面：** 設定 → 插件 → API Key Pool → 貼上 Key → Add。

**API：**

```bash
curl http://127.0.0.1:3080/dsh-api-key-pool/pools

curl -X POST http://127.0.0.1:3080/dsh-api-key-pool/pools \
  -H 'Content-Type: application/json' \
  -d '{"action":"add","provider":"easytokens-gpt","key":"sk-..."}'
```

介面新增的 Key 會存到外掛旁的 `pool-config.json`（已 gitignore）。

## 開發

```bash
npm install
npm run build
```

## 授權

MIT
