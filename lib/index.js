import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
//#region src/types.ts
const API_BASE = "/dsh-api-key-pool";
const DEFAULT_COOLDOWN_MS = 3e4;
/** Narrow set of pi-ai / transport failure codes that justify key rotation. */
const RETRYABLE_CODES = /* @__PURE__ */ new Set([
	"RATE_LIMIT",
	"AUTH",
	"QUOTA_EXCEEDED",
	"TIMEOUT",
	"TRANSPORT"
]);
//#endregion
//#region src/util.ts
function dshHome() {
	return process.env.DSH_HOME || join(homedir(), ".dsh");
}
function settingsPath() {
	return join(dshHome(), "settings.yaml");
}
/** Stable path that survives package reinstalls. */
function poolConfigPath() {
	return join(dshHome(), "storages", "dsh-api-key-pool", "pool-config.json");
}
/** Legacy location next to the installed package (migrate-once source). */
function legacyPoolConfigPath(packageRoot) {
	return join(packageRoot, "pool-config.json");
}
function ensureStorageDir() {
	mkdirSync(join(dshHome(), "storages", "dsh-api-key-pool"), { recursive: true });
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
function errorMessage(err) {
	if (err instanceof Error) return err.message;
	return String(err);
}
function isPlainObject(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
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
				const parsed = JSON.parse(body || "{}");
				resolve(isPlainObject(parsed) ? parsed : {});
			} catch {
				resolve({});
			}
		});
		req.on("error", () => resolve({}));
	});
}
function asPoolsPostBody(raw) {
	const keysRaw = raw.keys;
	return {
		action: typeof raw.action === "string" ? raw.action : void 0,
		provider: typeof raw.provider === "string" ? raw.provider : void 0,
		apiKeyEnv: typeof raw.apiKeyEnv === "string" ? raw.apiKeyEnv : void 0,
		key: typeof raw.key === "string" ? raw.key : void 0,
		keys: Array.isArray(keysRaw) ? keysRaw.map(String) : void 0,
		index: typeof raw.index === "number" ? raw.index : raw.index !== void 0 ? Number(raw.index) : void 0
	};
}
function asVerifyPostBody(raw) {
	return {
		provider: typeof raw.provider === "string" ? raw.provider : void 0,
		baseURL: typeof raw.baseURL === "string" ? raw.baseURL : void 0,
		maxAttempts: typeof raw.maxAttempts === "number" ? raw.maxAttempts : raw.maxAttempts !== void 0 ? Number(raw.maxAttempts) : void 0
	};
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
/** Loopback or DSH session cookie / bearer — used for mutating admin routes. */
function isMutationAllowed(req) {
	const addr = req.socket.remoteAddress || "";
	if (addr === "127.0.0.1" || addr === "::1" || addr === ":ffff:127.0.0.1" || addr.endsWith("127.0.0.1")) return true;
	const cookie = String(req.headers.cookie || "");
	if (/dsh-auth-[^=]+=/.test(cookie)) return true;
	if (req.headers.authorization) return true;
	const token = process.env.DSH_API_KEY_POOL_TOKEN;
	if (token && req.headers["x-api-key-pool-token"] === token) return true;
	return false;
}
function isPrivateOrLocalHostname(hostname) {
	const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
	if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "0.0.0.0") return true;
	if (host.endsWith(".local") || host.endsWith(".internal")) return true;
	const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(host);
	if (m) {
		const a = Number(m[1]);
		const b = Number(m[2]);
		if (a === 10) return true;
		if (a === 127) return true;
		if (a === 0) return true;
		if (a === 169 && b === 254) return true;
		if (a === 172 && b >= 16 && b <= 31) return true;
		if (a === 192 && b === 168) return true;
		if (a === 100 && b >= 64 && b <= 127) return true;
	}
	if (host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80")) return true;
	return false;
}
/**
* Reject non-http(s) and private/local targets for server-side verify fetches (SSRF).
*/
function assertSafePublicBaseURL(baseURL) {
	let url;
	try {
		url = new URL(baseURL);
	} catch {
		throw new Error("invalid baseURL");
	}
	if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("baseURL must be http(s)");
	if (url.username || url.password) throw new Error("baseURL must not include credentials");
	if (isPrivateOrLocalHostname(url.hostname)) throw new Error("baseURL must not target private/loopback hosts");
}
/** Extract provider ids under any `providers:` block (settings.yaml / cordis.patch.yml). */
function extractProvidersFromText(raw) {
	const names = [];
	let inProviders = false;
	let providersIndent = 0;
	for (const line of raw.split("\n")) {
		const prov = /^(\s*)providers:\s*$/.exec(line);
		if (prov) {
			inProviders = true;
			providersIndent = prov[1].length;
			continue;
		}
		if (!inProviders) continue;
		const m = /^(\s*)([A-Za-z0-9_-]+):\s*(?:#.*)?$/.exec(line);
		if (!m) {
			if (line.trim() === "" || line.trim().startsWith("#")) continue;
			if ((/^(\s*)/.exec(line)?.[1].length ?? 0) <= providersIndent) inProviders = false;
			continue;
		}
		const indent = m[1].length;
		const key = m[2];
		if (indent <= providersIndent) {
			inProviders = false;
			continue;
		}
		if (indent === providersIndent + 2 || indent === providersIndent + 4) {
			if (!(/* @__PURE__ */ new Set([
				"displayName",
				"apiKeyEnv",
				"api",
				"baseURL",
				"models",
				"compat",
				"retryPolicy",
				"defaultInput",
				"cacheRetention",
				"streamIdleTimeoutMs",
				"config"
			])).has(key)) names.push(key);
		} else if (indent > providersIndent + 4) {}
	}
	return names;
}
function discoverProvidersFromSettings(ctx) {
	const found = /* @__PURE__ */ new Set();
	const files = [
		settingsPath(),
		join(dshHome(), "profiles", "web", "cordis.patch.yml"),
		join(dshHome(), "profiles", "web", "cordis.yml")
	];
	for (const file of files) try {
		if (!existsSync(file)) continue;
		for (const name of extractProvidersFromText(readFileSync(file, "utf8"))) found.add(name);
	} catch (err) {
		log(ctx, "warn", `discoverProviders (${file}) failed: ${errorMessage(err)}`);
	}
	return [...found];
}
/**
* Only rotate on auth / rate-limit / quota / timeout / transport — not generic 4xx model errors.
*/
function isRetryableFailure(code, message) {
	if (RETRYABLE_CODES.has(code)) return true;
	const upper = code.toUpperCase();
	if (RETRYABLE_CODES.has(upper)) return true;
	const http = Number((code.match(/\d{3}/) || [])[0] || 0);
	if ([
		401,
		403,
		429,
		502,
		503,
		504
	].includes(http)) return true;
	return /(?:^|[^\w])(401|403|429)(?:[^\w]|$)|rate\s*limit|too many requests|quota|throttl|unauthorized|forbidden|invalid[_\s-]?api[_\s-]?key|authentication|exhausted|timeout|timed\s*out|econnreset|econnrefused|socket hang up|network/i.test(`${code} ${message}`);
}
function turnIdFromPayload(payload) {
	const t = payload.turn;
	if (t?.id) return String(t.id);
	if (t?.turnId) return String(t.turnId);
	return `anon-${Date.now()}`;
}
//#endregion
//#region src/pool.ts
const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
function emptyState() {
	return {
		failCount: 0,
		cooldownUntil: 0
	};
}
function defaultApiKeyEnv(provider) {
	return `${provider.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_API_KEY`;
}
function readPersisted() {
	ensureStorageDir();
	const primary = poolConfigPath();
	const legacy = legacyPoolConfigPath(PACKAGE_ROOT);
	try {
		if (!existsSync(primary) && existsSync(legacy)) {
			mkdirSync(dirname(primary), { recursive: true });
			renameSync(legacy, primary);
		}
	} catch {
		try {
			if (existsSync(legacy) && !existsSync(primary)) writeFileSync(primary, readFileSync(legacy, "utf8"), "utf8");
		} catch {}
	}
	try {
		if (!existsSync(primary)) return {};
		const parsed = JSON.parse(readFileSync(primary, "utf8"));
		if (typeof parsed !== "object" || parsed === null) return {};
		return parsed;
	} catch {
		return {};
	}
}
/**
* Merge persisted + static config keys.
* - Prefer union so an empty persisted list does not wipe YAML seed keys on first boot.
* - Persisted order first, then config-only extras.
*/
function mergeKeys(persistedKeys, configKeys) {
	const a = Array.isArray(persistedKeys) ? persistedKeys.filter(Boolean) : [];
	const b = Array.isArray(configKeys) ? configKeys.filter(Boolean) : [];
	if (a.length === 0) return [...new Set(b)];
	if (b.length === 0) return [...new Set(a)];
	return [.../* @__PURE__ */ new Set([...a, ...b])];
}
var KeyPoolManager = class {
	pools = /* @__PURE__ */ new Map();
	modes = /* @__PURE__ */ new Map();
	/** Per-provider stack of keys bound to in-flight requests (LIFO). */
	inflight = /* @__PURE__ */ new Map();
	/** Last successfully used key per provider (for markSuccess heuristics). */
	lastSuccessCandidate = /* @__PURE__ */ new Map();
	probeTimers = /* @__PURE__ */ new Map();
	envQueues = /* @__PURE__ */ new Map();
	lifetime = new AbortController();
	defaultCooldownMs;
	ctx;
	constructor(ctx, config = {}) {
		this.ctx = ctx;
		this.defaultCooldownMs = config.defaultCooldownMs ?? 3e4;
		this.bootstrap(config);
	}
	bootstrap(config) {
		const persisted = readPersisted();
		const merged = { ...config.pools || {} };
		for (const [provider, entry] of Object.entries(persisted.pools || {})) {
			const cur = merged[provider] || {};
			merged[provider] = {
				apiKeyEnv: entry.apiKeyEnv || cur.apiKeyEnv,
				keys: mergeKeys(entry.keys, cur.keys),
				cooldownMs: cur.cooldownMs
			};
		}
		const names = /* @__PURE__ */ new Set([...Object.keys(merged), ...discoverProvidersFromSettings(this.ctx)]);
		for (const provider of names) {
			const pcfg = merged[provider] || {};
			const env = pcfg.apiKeyEnv || defaultApiKeyEnv(provider);
			const fromCfg = Array.isArray(pcfg.keys) ? pcfg.keys.filter(Boolean) : [];
			const envValue = process.env[env];
			const fromEnv = envValue && envValue !== "public" ? [envValue] : [];
			const keys = [.../* @__PURE__ */ new Set([...fromCfg, ...fromEnv])];
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
			ensureStorageDir();
			const out = { pools: {} };
			for (const [provider, pool] of this.pools) out.pools[provider] = {
				apiKeyEnv: pool.env,
				keys: pool.keys
			};
			writeFileSync(poolConfigPath(), JSON.stringify(out, null, 2), "utf8");
		} catch (err) {
			log(this.ctx, "warn", `persist failed: ${errorMessage(err)}`);
		}
	}
	hasHealthyKey(provider) {
		const pool = this.pools.get(provider);
		if (!pool || pool.keys.length === 0) return false;
		const now = Date.now();
		return pool.keys.some((k) => (pool.states.get(k)?.cooldownUntil || 0) <= now);
	}
	pickKey(provider) {
		const pool = this.pools.get(provider);
		if (!pool || pool.keys.length === 0) return void 0;
		const now = Date.now();
		const live = pool.keys.filter((k) => (pool.states.get(k)?.cooldownUntil || 0) <= now);
		if (live.length === 0) {
			log(this.ctx, "warn", `pool '${provider}': all keys cooling`);
			return;
		}
		for (let i = 0; i < live.length; i++) {
			const key = live[(pool.idx + i) % live.length];
			const realIdx = pool.keys.indexOf(key);
			if (realIdx >= 0) {
				pool.idx = (realIdx + 1) % pool.keys.length;
				return key;
			}
		}
		return live[0];
	}
	/** Bind a key to the current in-flight request for this provider. */
	bindInflight(provider, key) {
		const stack = this.inflight.get(provider) || [];
		stack.push(key);
		this.inflight.set(provider, stack);
		this.lastSuccessCandidate.set(provider, key);
	}
	/** Pop the key bound to the failing request (LIFO). */
	takeInflightKey(provider) {
		const stack = this.inflight.get(provider);
		if (!stack || stack.length === 0) return void 0;
		return stack.pop();
	}
	/** Drop inflight binding after a successful turn start for a new non-retry request. */
	clearInflight(provider) {
		this.inflight.delete(provider);
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
	/** Mark previous candidate successful when starting a fresh (non-retry) request. */
	markPreviousSuccess(provider) {
		const key = this.lastSuccessCandidate.get(provider);
		if (key) this.markSuccess(provider, key);
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
	/**
	* Also stamp common call-config fields so credential resolution that already
	* captured env is less likely to miss the rotated key (best-effort).
	*/
	applyKeyToCallConfig(call, key) {
		call.apiKey = key;
		call.authorization = `Bearer ${key}`;
		const headers = { ...call.headers || {} };
		headers.Authorization = `Bearer ${key}`;
		call.headers = headers;
	}
	withEnvSerial(provider, fn) {
		const next = (this.envQueues.get(provider) || Promise.resolve()).then(fn, fn);
		this.envQueues.set(provider, next);
		return next;
	}
	ensurePool(provider, apiKeyEnv, firstKey) {
		let pool = this.pools.get(provider);
		if (!pool) {
			const env = apiKeyEnv || defaultApiKeyEnv(provider);
			const keys = firstKey ? [firstKey] : [];
			pool = {
				env,
				keys,
				cooldown: this.defaultCooldownMs,
				idx: 0,
				states: new Map(keys.map((k) => [k, emptyState()]))
			};
			this.pools.set(provider, pool);
		} else if (apiKeyEnv && !pool.env) pool.env = apiKeyEnv;
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
		this.inflight.clear();
	}
};
//#endregion
//#region src/routes.ts
function registerRoutes(ctx, manager, config = {}) {
	const requireAuth = config.requireAuthForMutations !== false;
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
		handler: (req, res) => {
			handlePools(req, res, manager, ctx, requireAuth);
		}
	}), "api-key-pool: pools");
	ctx.effect(() => ctx.webServer.register({
		kind: "exact",
		path: `${API_BASE}/verify`,
		handler: (req, res) => {
			handleVerify(req, res, manager, requireAuth);
		}
	}), "api-key-pool: verify");
}
async function handlePools(req, res, manager, ctx, requireAuth) {
	if (req.method === "GET") {
		const pools = {};
		for (const name of manager.pools.keys()) pools[name] = manager.publicView(name);
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
	if (requireAuth && !isMutationAllowed(req)) {
		sendJson(res, 401, { error: "unauthorized" });
		return;
	}
	const body = asPoolsPostBody(await readJsonBody(req));
	const provider = body.provider ?? "";
	const action = body.action ?? "";
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
		manager.addKey(provider, body.key);
		sendJson(res, 200, {
			ok: true,
			count: manager.pools.get(provider).keys.length
		});
		return;
	}
	if (action === "remove") {
		const index = body.index;
		if (index === void 0 || !Number.isInteger(index)) {
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
		manager.updateKeys(provider, body.keys);
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
async function handleVerify(req, res, manager, requireAuth) {
	if (req.method !== "POST") {
		sendJson(res, 405, { error: "method not allowed" });
		return;
	}
	if (requireAuth && !isMutationAllowed(req)) {
		sendJson(res, 401, { error: "unauthorized" });
		return;
	}
	const body = asVerifyPostBody(await readJsonBody(req));
	const provider = body.provider ?? "";
	const baseURL = (body.baseURL ?? "").replace(/\/$/, "");
	const maxAttempts = Math.min(body.maxAttempts || 4, 8);
	if (!provider || !manager.pools.has(provider)) {
		sendJson(res, 404, { error: `no pool for '${provider}'` });
		return;
	}
	if (!baseURL) {
		sendJson(res, 400, { error: "baseURL required" });
		return;
	}
	try {
		assertSafePublicBaseURL(baseURL);
	} catch (err) {
		sendJson(res, 400, { error: errorMessage(err) });
		return;
	}
	const savedIdx = manager.pools.get(provider).idx;
	manager.resetCooldown(provider);
	manager.pools.get(provider).idx = 0;
	const attempts = [];
	let ok = false;
	for (let i = 0; i < maxAttempts; i++) {
		const key = manager.pickKey(provider);
		if (!key) {
			attempts.push({
				attempt: i + 1,
				error: "no healthy key"
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
		} catch (err) {
			status = 0;
			errMsg = errorMessage(err).slice(0, 180);
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
	manager.pools.get(provider).idx = savedIdx;
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
const inject = [
	"llm",
	"webServer",
	"settings"
];
function apply(ctx, config = {}) {
	ctx.inject(["settings"], async (sctx) => {
		const schemastery = await import("@deepseek-ai/schemastery");
		const zs = schemastery.default ?? schemastery;
		sctx.settings.register("api-key-pool", zs.object({}), { base: {} });
		sctx.effect(() => () => {}, "api-key-pool: settings namespace");
	});
	const manager = new KeyPoolManager(ctx, config);
	const maxRetries = config.maxRetriesPerTurn ?? 5;
	const turnRetries = /* @__PURE__ */ new Map();
	ctx.on("agent/request", async (payload, next) => {
		const call = await next();
		const provider = call.provider;
		if (!provider) return call;
		const turnId = turnIdFromPayload(payload);
		const retriesSoFar = turnRetries.get(turnId) || 0;
		const isRetry = retriesSoFar > 0;
		if (!isRetry) {
			manager.markPreviousSuccess(provider);
			manager.clearInflight(provider);
		}
		const key = manager.pickKey(provider);
		if (!key) return call;
		return manager.withEnvSerial(provider, () => {
			manager.applyKeyToEnv(provider, key);
			manager.applyKeyToCallConfig(call, key);
			manager.bindInflight(provider, key);
			log(ctx, "info", `injected key ${maskKey(key)} for '${provider}'${isRetry ? ` (retry ${retriesSoFar})` : ""}`);
			return call;
		});
	});
	ctx.on("agent/request-error", async (payload, next) => {
		const code = String(payload.failure?.code ?? payload.code ?? "");
		const rawMsg = String(payload.failure?.message ?? payload.message ?? "");
		const provider = payload.provider;
		const turnId = turnIdFromPayload(payload);
		const retryable = isRetryableFailure(code, rawMsg);
		if (!provider || !retryable) return next();
		const boundKey = manager.takeInflightKey(provider);
		if (boundKey) {
			manager.markFailed(provider, boundKey, code);
			log(ctx, "info", `key ${maskKey(boundKey)} failed (${code})`);
		}
		const used = (turnRetries.get(turnId) || 0) + 1;
		turnRetries.set(turnId, used);
		if (used > maxRetries) {
			log(ctx, "warn", `turn ${turnId}: max key retries (${maxRetries}) reached — stop rotating`);
			return next();
		}
		if (!manager.hasHealthyKey(provider)) {
			log(ctx, "warn", `pool '${provider}': no healthy keys left — stop rotating`);
			return next();
		}
		log(ctx, "info", `retrying '${provider}' with next key (attempt ${used}/${maxRetries})`);
		return { kind: "retry" };
	});
	registerRoutes(ctx, manager, config);
	ctx.effect(() => () => manager.dispose(), "api-key-pool: dispose");
}
//#endregion
export { apply, inject, maskKey, name };
