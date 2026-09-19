# dsh-api-key-pool

Multi-key **round-robin** + **failover** for DeepSeek Harness providers.

Based on / inspired by [xiaozhe7772222/dsh-api-key-pool](https://github.com/xiaozhe7772222/dsh-api-key-pool). This fork is rewritten in TypeScript, honors `DSH_HOME`, and keeps a small Web settings panel.

[繁體中文](./README.zh-TW.md)

## Features

- Rotate several API keys per provider (round-robin)
- On 401 / 403 / 429 / quota / timeout-style failures → cool down that key and retry the next one
- Web UI: **Settings → Plugins → API Key Pool**
- Optional live probe: `POST /dsh-api-key-pool/verify`

## Install

```bash
dsh plugin --profile web add github:911218sky/dsh-api-key-pool#main
```

Or in `profiles/web/package.json`:

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

Then restart DSH (`sudo systemctl restart dsh-web.service` if you use systemd).

## Configure keys

**UI:** Settings → Plugins → API Key Pool → paste keys → Add.

**API:**

```bash
# list pools (keys are masked)
curl http://127.0.0.1:3080/dsh-api-key-pool/pools

# add a key
curl -X POST http://127.0.0.1:3080/dsh-api-key-pool/pools \
  -H 'Content-Type: application/json' \
  -d '{"action":"add","provider":"easytokens-gpt","key":"sk-..."}'
```

Keys added in the UI are saved to `pool-config.json` next to the plugin (gitignored).

## Develop

```bash
npm install
npm run build
```

## License

MIT
