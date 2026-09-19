window.__ModuleLoader__.load({
	id: "dsh-api-key-pool",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		//#region \0rolldown/runtime.js
		var __create = Object.create;
		var __defProp = Object.defineProperty;
		var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
		var __getOwnPropNames = Object.getOwnPropertyNames;
		var __getProtoOf = Object.getPrototypeOf;
		var __hasOwnProp = Object.prototype.hasOwnProperty;
		var __copyProps = (to, from, except, desc) => {
			if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
				key = keys[i];
				if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
					get: ((k) => from[k]).bind(null, key),
					enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
				});
			}
			return to;
		};
		var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule || !__hasOwnProp.call(mod, "default") ? __defProp(target, "default", {
			value: mod,
			enumerable: true
		}) : target, mod));
		//#endregion
		let react = require("react");
		react = __toESM(react, 1);
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/types.ts
		const API_BASE = "/dsh-api-key-pool";
		//#endregion
		//#region src/client/index.tsx
		function installStyles() {
			const css = document.createElement("style");
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
    .akp-addprov { display: flex; gap: 6px; margin-top: 12px; padding-top: 10px; border-top: 1px dashed var(--dsw-alias-border-l2, #ddd); }
    .akp-addprov input { flex: 1; min-width: 0; padding: 4px 8px; font-size: 12px; border: 1px solid var(--dsw-alias-border-l2, #ddd); border-radius: 4px; background: var(--dsw-alias-bg-base, #fff); color: var(--dsw-alias-label-primary, #333); }
  `;
			document.head.appendChild(css);
			return () => css.remove();
		}
		async function fetchJson(url, opts) {
			return await (await fetch(url, {
				credentials: "include",
				...opts,
				headers: { ...opts?.headers || {} }
			})).json();
		}
		function ApiKeyPoolCard() {
			const [state, setState] = (0, react.useState)({
				llmProviders: [],
				pools: {},
				loading: true,
				msg: null,
				addInputs: {},
				newProvName: ""
			});
			const refresh = (0, react.useCallback)(async () => {
				const [provRes, poolRes] = await Promise.all([fetchJson(`${API_BASE}/llm-providers`), fetchJson(`${API_BASE}/pools`)]);
				setState((s) => ({
					...s,
					llmProviders: provRes.providers ?? [],
					pools: poolRes.pools ?? {},
					loading: false
				}));
			}, []);
			(0, react.useEffect)(() => {
				refresh();
			}, [refresh]);
			const showMsg = (type, text) => {
				setState((s) => ({
					...s,
					msg: {
						type,
						text
					}
				}));
				setTimeout(() => setState((s) => ({
					...s,
					msg: null
				})), 3e3);
			};
			const handleAddKey = async (provider) => {
				const key = (state.addInputs[provider] || "").trim();
				if (!key) return;
				const action = state.pools[provider] ? "add" : "addProvider";
				const r = await fetchJson(`${API_BASE}/pools`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						action,
						provider,
						key
					})
				});
				if (!r.ok) {
					showMsg("err", r.error || "Add failed");
					return;
				}
				setState((s) => ({
					...s,
					addInputs: {
						...s.addInputs,
						[provider]: ""
					}
				}));
				showMsg("ok", "Key added");
				await refresh();
			};
			const handleAddProvider = async () => {
				const name = state.newProvName.trim();
				if (!name) return;
				const r = await fetchJson(`${API_BASE}/pools`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						action: "addProvider",
						provider: name,
						key: ""
					})
				});
				if (!r.ok) {
					showMsg("err", r.error || "Add provider failed");
					return;
				}
				setState((s) => ({
					...s,
					newProvName: ""
				}));
				showMsg("ok", "Provider added");
				await refresh();
			};
			const handleRemoveKey = async (provider, index) => {
				await fetchJson(`${API_BASE}/pools`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						action: "remove",
						provider,
						index
					})
				});
				await refresh();
			};
			const handleReset = async (provider) => {
				await fetchJson(`${API_BASE}/pools`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						action: "reset",
						provider
					})
				});
				await refresh();
			};
			const allProviders = [.../* @__PURE__ */ new Set([...state.llmProviders, ...Object.keys(state.pools)])];
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "akp-card",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
						style: {
							margin: "0 0 8px",
							fontSize: 14,
							fontWeight: 600
						},
						children: "API Key Pool"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "akp-desc",
						children: "Round-robin keys per provider. Failed keys (401/403/429/…) cool down, then the next key is used. Add a provider below if discovery misses it."
					}),
					allProviders.map((name) => {
						const pool = state.pools[name];
						const keys = pool?.maskedKeys || [];
						const states = pool?.states || {};
						const isLlm = state.llmProviders.includes(name);
						return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "akp-prov",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: "akp-prov-head",
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "akp-prov-name",
											children: name
										}),
										isLlm ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											style: {
												fontSize: 10,
												opacity: .5,
												marginLeft: 6
											},
											children: "LLM"
										}) : null,
										pool ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											style: {
												fontSize: 10,
												opacity: .5,
												marginLeft: 6
											},
											children: [
												keys.length,
												" key",
												keys.length === 1 ? "" : "s"
											]
										}) : null
									] })
								}),
								keys.map((masked, i) => {
									const st = states[masked] || {
										failCount: 0,
										cooldownUntil: 0
									};
									const cooling = st.cooldownUntil > Date.now();
									return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: "akp-row",
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: `akp-status ${cooling ? "cooling" : "healthy"}` }),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: "akp-key-masked",
												children: masked
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												style: {
													fontSize: 10,
													opacity: .5
												},
												children: cooling ? `cooling until ${new Date(st.cooldownUntil).toLocaleTimeString()}` : st.failCount > 0 ? `fails ${st.failCount}` : "healthy"
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												className: "akp-x",
												type: "button",
												onClick: () => void handleRemoveKey(name, i),
												children: "✕"
											})
										]
									}, `${masked}-${i}`);
								}),
								keys.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									style: {
										fontSize: 11,
										opacity: .5
									},
									children: "No keys yet"
								}) : null,
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "akp-field",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										placeholder: "Paste API key…",
										value: state.addInputs[name] || "",
										onChange: (e) => setState((s) => ({
											...s,
											addInputs: {
												...s.addInputs,
												[name]: e.target.value
											}
										})),
										onKeyDown: (e) => {
											if (e.key === "Enter") handleAddKey(name);
										}
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										className: "akp-btn primary",
										type: "button",
										onClick: () => void handleAddKey(name),
										disabled: !(state.addInputs[name] || "").trim(),
										children: "Add"
									})]
								}),
								pool ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									className: "akp-btn",
									type: "button",
									onClick: () => void handleReset(name),
									children: "Reset cooldown"
								}) : null
							]
						}, name);
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "akp-addprov",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							placeholder: "Provider id (if not listed)…",
							value: state.newProvName,
							onChange: (e) => setState((s) => ({
								...s,
								newProvName: e.target.value
							})),
							onKeyDown: (e) => {
								if (e.key === "Enter") handleAddProvider();
							}
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							className: "akp-btn",
							type: "button",
							onClick: () => void handleAddProvider(),
							disabled: !state.newProvName.trim(),
							children: "Add provider"
						})]
					}),
					state.msg ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: `akp-msg ${state.msg.type}`,
						children: state.msg.text
					}) : null,
					state.loading ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: {
							fontSize: 11,
							opacity: .5
						},
						children: "Loading…"
					}) : null
				]
			});
		}
		function apply(ctx) {
			ctx.effect(installStyles, "dsh-api-key-pool: styles");
			ctx.slots.inject("settings.plugin.item", function* () {
				yield ctx.slots.register({
					name: "settings.plugin.item",
					id: "dsh-api-key-pool",
					key: "api-key-pool",
					order: 50,
					label: () => "API Key Pool",
					inject: () => ({})
				}, ApiKeyPoolCard);
			});
		}
		const inject = ["settingsScope", "slots"];
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map