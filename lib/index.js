import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

//#region src/types.ts
const API_BASE = "/dsh-api-key-pool";
const DEFAULT_COOLDOWN_MS = 3e4;
const RETRYABLE_CODES = new Set([
	"RATE_LIMIT",
	"AUTH",
	"QUOTA_EXCEEDED",
	"TIMEOUT",
	"TRANSPORT"
]);

//#endregion
//#region src/util.ts
function settingsPath() {
	const home = process.env.DSH_HOME || join(homedir(), ".dsh");
	return join(home, "settings.yaml");
}
function maskKey(key) {
	if (!key) return "";
	if (key.length <= 8) return `${key.slice(0, 2)}****`;
	return `${key.slice(0, 6)}****${key.slice(-4)}`;
}
function log(ctx, level, msg) {
	try {
		ctx?.logger?.[level]?.(`[api-key-pool] ${msg}`);
	} catch {}
}
function readJsonBody(req) {
	return new Promise((resolve) => {
		let body = "";
		req.on("data", (chunk) => {
			body += chunk;
			if (body.length > 1e6) req.destroy();
		});
		req.on("end", () => {
			try {
				resolve(JSON.parse(body || "{}"));
			} catch {
				resolve({});
			}
		});
		req.on("error", () => resolve({}));
	});
}
function sendJson(res, code, data) {
	const payload = JSON.stringify(data);
	res.writeHead(code, {
		"Content-Type": "application/json; charset=utf-8",
		"Content-Length": Buffer.byteLength(payload),
		"Cache-Control": "no-store"
	});
	res.end(payload);
}
/** Best-effort YAML-ish parse for `llm-pi-ai.providers` keys only. */
function discoverProvidersFromSettings(ctx) {
	const file = settingsPath();
	try {
		if (!existsSync(file)) return [];
		const raw = readFileSync(file, "utf8");
		const names = [];
		let inPiAi = false;
		let inProviders = false;
		for (const line of raw.split("\n")) {
			if (/^llm-pi-ai:\s*$/.test(line)) {
				inPiAi = true;
				inProviders = false;
				continue;
			}
			if (inPiAi && /^[A-Za-z0-9_-]+:/.test(line) && !/^\s/.test(line)) break;
			if (inPiAi && /^\s{2}providers:\s*$/.test(line)) {
				inProviders = true;
				continue;
			}
			if (inProviders) {
				const m = line.match(/^\s{4}([A-Za-z0-9_-]+):\s*$/);
				if (m) {
					names.push(m[1]);
					continue;
				}
				if (/^\s{2}[A-Za-z0-9_-]+:/.test(line) && !/^\s{4}/.test(line)) inProviders = false;
			}
		}
		return names;
	} catch (e) {
		log(ctx, "warn", `discoverProviders failed: ${e?.message || e}`);
		return [];
	}
}
function isRetryableFailure(code, message) {
	const digits = code.replace(/\D/g, "");
	if (digits.length >= 3 && digits[0] >= "4") return true;
	return /rate|limit|quota|exhaust|throttl|429|too many|timeout|timed.?out|auth|credential|permission|denied|forbidden|unavailable|busy/i.test(message);
}

//#endregion
//#region src/pool.ts
const CONFIG_FILE = join(dirname(fileURLToPath(import.meta.url)), "..", "pool-config.json");
function emptyState() {
	return {
		failCount: 0,
		cooldownUntil: 0
	};
}
function readPersisted() {
	try {
		if (!existsSync(CONFIG_FILE)) return {};
		return JSON.parse(readFileSync(CONFIG_FILE, "utf8"));
	} catch {
		return {};
	}
}
var KeyPoolManager = class {
	pools = new Map();
	modes = new Map();
	probeTimers = new Map();
	envQueues = new Map();
	lifetime = new AbortController();
	defaultCooldownMs;
	ctx;
	constructor(ctx, config = {}) {
		this.ctx = ctx;
		this.defaultCooldownMs = config.defaultCooldownMs ?? DEFAULT_COOLDOWN_MS;
		this.bootstrap(config);
	}
	bootstrap(config) {
		const persisted = readPersisted();
		const merged = { ...config.pools || {} };
		for (const [provider, entry] of Object.entries(persisted.pools || {})) {
			const cur = merged[provider] || {};
			merged[provider] = {
				apiKeyEnv: entry.apiKeyEnv || cur.apiKeyEnv,
				keys: entry.keys ?? cur.keys ?? [],
				cooldownMs: cur.cooldownMs
			};
		}
		const names = new Set([...Object.keys(merged), ...discoverProvidersFromSettings(this.ctx)]);
		for (const provider of names) {
			const pcfg = merged[provider] || {};
			const env = pcfg.apiKeyEnv || `${provider.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_API_KEY`;
			const fromCfg = Array.isArray(pcfg.keys) ? pcfg.keys.filter(Boolean) : [];
			const fromEnv = process.env[env] && process.env[env] !== "public" ? [process.env[env]] : [];
			const keys = [...new Set([...fromCfg, ...fromEnv])];
			const cooldown = pcfg.cooldownMs || this.defaultCooldownMs;
			this.pools.set(provider, {
				env,
				keys,
				cooldown,
				idx: 0,
				states: new Map(keys.map((k) => [k, emptyState()]))
			});
			if (keys.length > 0) log(this.ctx, "info", `pool '${provider}': ${keys.length} key(s)`);
		}
		log(this.ctx, "info", `loaded ${this.pools.size} pool(s): ${[...this.pools.keys()].join(", ") || "(none)"}`);
	}
	persist() {
		try {
			mkdirSync(dirname(CONFIG_FILE), { recursive: true });
			const out = { pools: {} };
			for (const [provider, pool] of this.pools) out.pools[provider] = {
				apiKeyEnv: pool.env,
				keys: pool.keys
			};
			writeFileSync(CONFIG_FILE, JSON.stringify(out, null, 2), "utf8");
		} catch (e) {
			log(this.ctx, "warn", `persist failed: ${e?.message || e}`);
		}
	}
	pickKey(provider) {
		const pool = this.pools.get(provider);
		if (!pool || pool.keys.length === 0) return void 0;
		const now = Date.now();
		const live = pool.keys.filter((k) => (pool.states.get(k)?.cooldownUntil || 0) <= now);
		if (live.length === 0) {
			log(this.ctx, "warn", `pool '${provider}': all keys cooling`);
			return pool.keys[pool.idx % pool.keys.length];
		}
		for (let i = 0; i < live.length; i++) {
			const key = live[(pool.idx + i) % live.length];
			const realIdx = pool.keys.indexOf(key);
			if (realIdx >= 0) {
				pool.idx = (realIdx + 1) % pool.keys.length;
				return key;
			}
		}
		return pool.keys[0];
	}
	markSuccess(provider, key) {
		const pool = this.pools.get(provider);
		if (!pool || !key) return;
		const st = pool.states.get(key);
		if (st) {
			st.failCount = 0;
			st.cooldownUntil = 0;
		}
		const t = this.probeTimers.get(key);
		if (t) {
			clearTimeout(t);
			this.probeTimers.delete(key);
		}
	}
	markFailed(provider, key, reason) {
		const pool = this.pools.get(provider);
		if (!pool || !key) return;
		const st = pool.states.get(key);
		if (!st) return;
		st.failCount += 1;
		const backoff = pool.cooldown * Math.min(st.failCount, 5);
		st.cooldownUntil = Date.now() + backoff;
		log(this.ctx, "warn", `key ${maskKey(key)} for '${provider}' failed (${reason}), cooldown ${backoff}ms`);
		const prev = this.probeTimers.get(key);
		if (prev) clearTimeout(prev);
		if (!this.lifetime.signal.aborted) this.probeTimers.set(key, setTimeout(() => {
			this.probeTimers.delete(key);
			st.failCount = 0;
			st.cooldownUntil = 0;
			log(this.ctx, "info", `key ${maskKey(key)} for '${provider}' finished cooldown`);
		}, backoff + 100));
	}
	applyKeyToEnv(provider, key) {
		const pool = this.pools.get(provider);
		if (!pool || !key) return;
		process.env[pool.env] = key;
	}
	withEnvSerial(provider, fn) {
		const prev = this.envQueues.get(provider) || Promise.resolve();
		const next = prev.then(fn, fn);
		this.envQueues.set(provider, next);
		return next;
	}
	ensurePool(provider, apiKeyEnv, firstKey) {
		let pool = this.pools.get(provider);
		if (!pool) {
			const env = apiKeyEnv || `${provider.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_API_KEY`;
			const keys = firstKey ? [firstKey] : [];
			pool = {
				env,
				keys,
				cooldown: this.defaultCooldownMs,
				idx: 0,
				states: new Map(keys.map((k) => [k, emptyState()]))
			};
			this.pools.set(provider, pool);
		}
		return pool;
	}
	addKey(provider, key) {
		const pool = this.ensurePool(provider, void 0, key);
		if (!pool.keys.includes(key)) {
			pool.keys.push(key);
			pool.states.set(key, emptyState());
		}
		this.persist();
	}
	removeKeyAt(provider, index) {
		const pool = this.pools.get(provider);
		if (!pool || index < 0 || index >= pool.keys.length) return false;
		const [removed] = pool.keys.splice(index, 1);
		if (removed) pool.states.delete(removed);
		pool.idx = 0;
		this.persist();
		return true;
	}
	updateKeys(provider, keys) {
		const pool = this.ensurePool(provider);
		pool.keys = keys.filter(Boolean);
		pool.states = new Map(pool.keys.map((k) => [k, emptyState()]));
		pool.idx = 0;
		this.persist();
	}
	resetCooldown(provider) {
		const pool = this.pools.get(provider);
		if (!pool) return;
		pool.states = new Map(pool.keys.map((k) => [k, emptyState()]));
	}
	removeProvider(provider) {
		if (!this.pools.has(provider)) return false;
		this.pools.delete(provider);
		this.persist();
		return true;
	}
	publicView(provider) {
		const pool = this.pools.get(provider);
		if (!pool) return void 0;
		return {
			apiKeyEnv: pool.env,
			maskedKeys: pool.keys.map(maskKey),
			keyCount: pool.keys.length,
			mode: this.modes.get(provider) || "auto",
			states: Object.fromEntries([...pool.states].map(([k, s]) => [maskKey(k), { ...s }]))
		};
	}
	dispose() {
		this.lifetime.abort();
		for (const t of this.probeTimers.values()) clearTimeout(t);
		this.probeTimers.clear();
	}
};

//#endregion
//#region src/routes.ts
function registerRoutes(ctx, manager) {
	ctx.effect(() => ctx.webServer.register({
		kind: "exact",
		path: `${API_BASE}/llm-providers`,
		handler: async (req, res) => {
			if (req.method !== "GET") {
				sendJson(res, 405, { error: "method not allowed" });
				return;
			}
			sendJson(res, 200, { providers: discoverProvidersFromSettings(ctx) });
		}
	}), "api-key-pool: llm-providers");
	ctx.effect(() => ctx.webServer.register({
		kind: "exact",
		path: `${API_BASE}/pools`,
		handler: (req, res) => handlePools(req, res, manager, ctx)
	}), "api-key-pool: pools");
	ctx.effect(() => ctx.webServer.register({
		kind: "exact",
		path: `${API_BASE}/verify`,
		handler: (req, res) => handleVerify(req, res, manager)
	}), "api-key-pool: verify");
}
async function handlePools(req, res, manager, ctx) {
	if (req.method === "GET") {
		const pools = {};
		for (const name$1 of manager.pools.keys()) pools[name$1] = manager.publicView(name$1);
		sendJson(res, 200, {
			pools,
			defaultCooldownMs: DEFAULT_COOLDOWN_MS,
			providers: discoverProvidersFromSettings(ctx)
		});
		return;
	}
	if (req.method !== "POST") {
		sendJson(res, 405, { error: "method not allowed" });
		return;
	}
	const body = await readJsonBody(req);
	const provider = String(body.provider || "");
	const action = String(body.action || "");
	if (action === "addProvider") {
		if (!provider) {
			sendJson(res, 400, { error: "provider name required" });
			return;
		}
		if (manager.pools.has(provider)) {
			sendJson(res, 409, { error: `provider '${provider}' already exists` });
			return;
		}
		const pool = manager.ensurePool(provider, body.apiKeyEnv, body.key);
		manager.persist();
		sendJson(res, 200, {
			ok: true,
			pool: {
				provider,
				apiKeyEnv: pool.env,
				keyCount: pool.keys.length
			}
		});
		return;
	}
	if (action === "removeProvider") {
		if (!manager.removeProvider(provider)) {
			sendJson(res, 404, { error: `no pool for '${provider}'` });
			return;
		}
		sendJson(res, 200, { ok: true });
		return;
	}
	if (!provider || !manager.pools.has(provider)) {
		sendJson(res, 404, { error: `no pool for '${provider}'` });
		return;
	}
	if (action === "add" && body.key) {
		manager.addKey(provider, String(body.key));
		sendJson(res, 200, {
			ok: true,
			count: manager.pools.get(provider).keys.length
		});
		return;
	}
	if (action === "remove") {
		const index = Number(body.index);
		if (!Number.isInteger(index)) {
			sendJson(res, 400, { error: "index required" });
			return;
		}
		if (!manager.removeKeyAt(provider, index)) {
			sendJson(res, 404, { error: "key index out of range" });
			return;
		}
		sendJson(res, 200, {
			ok: true,
			count: manager.pools.get(provider).keys.length
		});
		return;
	}
	if (action === "update" && Array.isArray(body.keys)) {
		manager.updateKeys(provider, body.keys.map(String));
		sendJson(res, 200, {
			ok: true,
			count: manager.pools.get(provider).keys.length
		});
		return;
	}
	if (action === "reset") {
		manager.resetCooldown(provider);
		sendJson(res, 200, { ok: true });
		return;
	}
	sendJson(res, 400, { error: `unknown action '${action}'` });
}
async function handleVerify(req, res, manager) {
	if (req.method !== "POST") {
		sendJson(res, 405, { error: "method not allowed" });
		return;
	}
	const body = await readJsonBody(req);
	const provider = String(body.provider || "");
	const baseURL = String(body.baseURL || "").replace(/\/$/, "");
	const maxAttempts = Math.min(Number(body.maxAttempts) || 4, 8);
	if (!provider || !manager.pools.has(provider)) {
		sendJson(res, 404, { error: `no pool for '${provider}'` });
		return;
	}
	if (!baseURL) {
		sendJson(res, 400, { error: "baseURL required" });
		return;
	}
	manager.resetCooldown(provider);
	const pool = manager.pools.get(provider);
	pool.idx = 0;
	const attempts = [];
	let ok = false;
	for (let i = 0; i < maxAttempts; i++) {
		const key = manager.pickKey(provider);
		if (!key) {
			attempts.push({
				attempt: i + 1,
				error: "no key"
			});
			break;
		}
		manager.applyKeyToEnv(provider, key);
		let status = 0;
		let errMsg = "";
		try {
			const r = await fetch(`${baseURL}/models`, {
				method: "GET",
				headers: {
					Authorization: `Bearer ${key}`,
					"Content-Type": "application/json"
				},
				signal: AbortSignal.timeout(2e4)
			});
			status = r.status;
			if (!r.ok) errMsg = (await r.text().catch(() => "")).slice(0, 180);
		} catch (e) {
			status = 0;
			errMsg = String(e?.message || e).slice(0, 180);
		}
		attempts.push({
			attempt: i + 1,
			key: maskKey(key),
			status,
			error: errMsg || void 0
		});
		if (status >= 200 && status < 300) {
			manager.markSuccess(provider, key);
			ok = true;
			break;
		}
		manager.markFailed(provider, key, String(status || "TRANSPORT"));
	}
	sendJson(res, 200, {
		ok,
		provider,
		baseURL,
		attempts,
		states: manager.publicView(provider)?.states || {}
	});
}

//#endregion
//#region src/index.ts
const name = "api-key-pool";
const inject = ["llm", "webServer"];
function apply(ctx, config = {}) {
	const manager = new KeyPoolManager(ctx, config);
	ctx.on("agent/request", async (_payload, next) => {
		const call = await next();
		const provider = call?.provider;
		if (!provider) return call;
		const key = manager.pickKey(provider);
		if (!key) return call;
		return manager.withEnvSerial(provider, () => {
			manager.applyKeyToEnv(provider, key);
			log(ctx, "info", `injected key ${maskKey(key)} for '${provider}'`);
			return call;
		});
	});
	ctx.on("agent/request-error", async (payload, next) => {
		const code = String(payload?.failure?.code || payload?.code || "");
		const rawMsg = String(payload?.failure?.message || payload?.message || "");
		const provider = payload?.provider;
		const retryable = RETRYABLE_CODES.has(code) || isRetryableFailure(code, rawMsg);
		if (provider && retryable) {
			const pool = manager.pools.get(provider);
			if (pool) {
				const currentKey = process.env[pool.env];
				if (currentKey && pool.keys.includes(currentKey)) {
					manager.markFailed(provider, currentKey, code);
					log(ctx, "info", `key ${maskKey(currentKey)} failed (${code}), retrying with next key...`);
				}
			}
			return { kind: "retry" };
		}
		return next();
	});
	registerRoutes(ctx, manager);
	ctx.effect(() => () => manager.dispose(), "api-key-pool: dispose");
}

//#endregion
export { apply, inject, maskKey, name };