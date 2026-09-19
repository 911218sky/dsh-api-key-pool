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
    .akp-card { font-family: inherit; color: var(--dsw-alias-label-primary, inherit); }
    .akp-desc { margin: 0 0 12px; font-size: 12px; color: var(--dsw-alias-label-secondary, inherit); opacity: .85; }
    .akp-prov {
      margin-bottom: 8px; border: 1px solid var(--dsw-alias-border-l2, #444); border-radius: 10px;
      background: var(--dsw-alias-bg-layer-1, transparent); overflow: hidden;
    }
    .akp-prov-toggle {
      width: 100%; display: flex; align-items: center; gap: 10px; text-align: left;
      padding: 12px 14px; border: none; background: transparent; cursor: pointer;
      color: inherit; font: inherit;
    }
    .akp-prov-toggle:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.12)); }
    .akp-prov-toggle-main { flex: 1; min-width: 0; }
    .akp-prov-name { font-weight: 600; font-size: 13px; color: var(--dsw-alias-label-primary, inherit); display: block; }
    .akp-prov-sub { margin-top: 2px; font-size: 11px; color: var(--dsw-alias-label-secondary, inherit); opacity: .85; }
    .akp-chevron {
      flex: none; width: 18px; height: 18px; color: var(--dsw-alias-label-tertiary, #888);
      transition: transform .15s ease; display: inline-flex; align-items: center; justify-content: center;
    }
    .akp-prov.open .akp-chevron { transform: rotate(180deg); }
    .akp-prov-body { padding: 0 14px 12px; border-top: 1px solid var(--dsw-alias-border-l1, transparent); }
    .akp-row { display: flex; align-items: center; gap: 6px; padding: 4px 0; font-size: 12px; color: var(--dsw-alias-label-secondary, inherit); }
    .akp-key-masked { flex: 1; font-family: monospace; font-size: 11px; color: var(--dsw-alias-label-primary, inherit); }
    .akp-status { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
    .akp-status.healthy { background: #4caf50; }
    .akp-status.cooling { background: #ff9800; }
    .akp-x { cursor: pointer; opacity: .55; font-size: 10px; padding: 2px 4px; border: none; background: transparent; color: var(--dsw-alias-label-secondary, inherit); }
    .akp-x:hover { opacity: 1; color: var(--dsw-alias-label-primary, inherit); }
    .akp-field { display: flex; gap: 6px; margin: 6px 0 4px; }
    .akp-field input, .akp-addprov input {
      flex: 1; min-width: 0; padding: 6px 10px; font-size: 12px;
      border: 1px solid var(--dsw-alias-border-l2, #555);
      border-radius: 6px;
      background: var(--dsw-alias-bg-base, transparent);
      color: var(--dsw-alias-label-primary, inherit);
    }
    .akp-field input::placeholder, .akp-addprov input::placeholder {
      color: var(--dsw-alias-label-tertiary, #888);
    }
    .akp-btn {
      padding: 6px 12px; font-size: 12px; border-radius: 6px; cursor: pointer;
      border: 1px solid var(--dsw-alias-border-l2, #555);
      background: transparent;
      color: var(--dsw-alias-label-primary, inherit);
    }
    .akp-btn:hover:not(:disabled) {
      background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.18));
    }
    .akp-btn:disabled { opacity: .45; cursor: default; }
    .akp-btn.primary {
      background: var(--dsw-alias-state-business-primary, #1976d2);
      border-color: var(--dsw-alias-state-business-primary, #1976d2);
      color: #fff;
    }
    .akp-btn.primary:hover:not(:disabled) { filter: brightness(1.08); }
    .akp-msg { font-size: 11px; margin-top: 6px; padding: 4px 8px; border-radius: 4px; }
    .akp-msg.ok { background: color-mix(in srgb, #4caf50 18%, transparent); color: var(--dsw-alias-state-success-primary, #81c784); }
    .akp-msg.err { background: color-mix(in srgb, #f44336 18%, transparent); color: var(--dsw-alias-state-error-primary, #e57373); }
    .akp-addprov { display: flex; gap: 6px; margin-top: 12px; padding-top: 10px; border-top: 1px dashed var(--dsw-alias-border-l2, #444); }
    .akp-empty { font-size: 11px; color: var(--dsw-alias-label-tertiary, #888); margin: 6px 0; }
  `;
			document.head.appendChild(css);
			return () => css.remove();
		}
		async function fetchJson(url, opts) {
			const r = await fetch(url, {
				credentials: "include",
				...opts,
				headers: { ...opts?.headers || {} }
			});
			let data = {};
			try {
				data = await r.json();
			} catch {
				data = {};
			}
			if (!r.ok) {
				const err = data && typeof data === "object" && "error" in data ? String(data.error || r.statusText) : r.statusText || `HTTP ${r.status}`;
				throw new Error(err || `HTTP ${r.status}`);
			}
			return data;
		}
		function summarizePool(keys, states, isLlm) {
			const now = Date.now();
			const cooling = keys.filter((k) => (states[k]?.cooldownUntil || 0) > now).length;
			const parts = [];
			if (isLlm) parts.push("LLM provider");
			parts.push(`${keys.length} key${keys.length === 1 ? "" : "s"}`);
			if (cooling > 0) parts.push(`${cooling} cooling`);
			else if (keys.length > 0) parts.push("healthy");
			else parts.push("no keys yet");
			return parts.join(" · ");
		}
		function ApiKeyPoolCard() {
			const [state, setState] = (0, react.useState)({
				llmProviders: [],
				pools: {},
				loading: true,
				msg: null,
				addInputs: {},
				newProvName: "",
				expanded: {}
			});
			const refresh = (0, react.useCallback)(async () => {
				try {
					const [provRes, poolRes] = await Promise.all([fetchJson(`${API_BASE}/llm-providers`), fetchJson(`${API_BASE}/pools`)]);
					setState((s) => ({
						...s,
						llmProviders: provRes.providers ?? [],
						pools: poolRes.pools ?? {},
						loading: false
					}));
				} catch (err) {
					setState((s) => ({
						...s,
						loading: false,
						msg: {
							type: "err",
							text: err instanceof Error ? err.message : "Load failed"
						}
					}));
				}
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
			const toggleExpanded = (provider) => {
				setState((s) => ({
					...s,
					expanded: {
						...s.expanded,
						[provider]: !s.expanded[provider]
					}
				}));
			};
			const handleAddKey = async (provider) => {
				const key = (state.addInputs[provider] || "").trim();
				if (!key) return;
				const action = state.pools[provider] ? "add" : "addProvider";
				try {
					await fetchJson(`${API_BASE}/pools`, {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({
							action,
							provider,
							key
						})
					});
					setState((s) => ({
						...s,
						addInputs: {
							...s.addInputs,
							[provider]: ""
						},
						expanded: {
							...s.expanded,
							[provider]: true
						}
					}));
					showMsg("ok", "Key added");
					await refresh();
				} catch (err) {
					showMsg("err", err instanceof Error ? err.message : "Add failed");
				}
			};
			const handleAddProvider = async () => {
				const name = state.newProvName.trim();
				if (!name) return;
				try {
					await fetchJson(`${API_BASE}/pools`, {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({
							action: "addProvider",
							provider: name,
							key: ""
						})
					});
					setState((s) => ({
						...s,
						newProvName: "",
						expanded: {
							...s.expanded,
							[name]: true
						}
					}));
					showMsg("ok", "Provider added");
					await refresh();
				} catch (err) {
					showMsg("err", err instanceof Error ? err.message : "Add provider failed");
				}
			};
			const handleRemoveKey = async (provider, index) => {
				try {
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
				} catch (err) {
					showMsg("err", err instanceof Error ? err.message : "Remove failed");
				}
			};
			const handleReset = async (provider) => {
				try {
					await fetchJson(`${API_BASE}/pools`, {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({
							action: "reset",
							provider
						})
					});
					showMsg("ok", "Cooldown reset");
					await refresh();
				} catch (err) {
					showMsg("err", err instanceof Error ? err.message : "Reset failed");
				}
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
						children: "Round-robin keys per provider. Expand a provider to manage keys. Failed keys cool down automatically."
					}),
					allProviders.map((name) => {
						const pool = state.pools[name];
						const keys = pool?.maskedKeys || [];
						const states = pool?.states || {};
						const isLlm = state.llmProviders.includes(name);
						const open = Boolean(state.expanded[name]);
						return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: `akp-prov${open ? " open" : ""}`,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								className: "akp-prov-toggle",
								"aria-expanded": open,
								onClick: () => toggleExpanded(name),
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: "akp-prov-toggle-main",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "akp-prov-name",
										children: name
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "akp-prov-sub",
										children: summarizePool(keys, states, isLlm)
									})]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "akp-chevron",
									"aria-hidden": "true",
									children: "▾"
								})]
							}), open ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "akp-prov-body",
								children: [
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
														opacity: .6
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
										className: "akp-empty",
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
							}) : null]
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
						className: "akp-empty",
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