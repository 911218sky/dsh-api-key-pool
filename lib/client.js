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
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/types.ts
		const API_BASE = "/dsh-api-key-pool";
		//#endregion
		//#region src/client/settings-nav-icon.ts
		/**
		* Settings left-nav icon hack: DSH has no icon field on `settings.section`,
		* so we mark our nav button and paint a key glyph via CSS mask.
		*
		* Upstream permanent fix: an icon/slot API on `settings.section`. Until then
		* this observer must stay scoped and debounced.
		*/
		const SETTINGS_NAV_LABEL = "API Key Pool";
		const SETTINGS_NAV_MARKER = "data-dsh-api-key-pool-settings-nav";
		/** Lucide `key-round` — painted as a currentColor mask on the settings nav row. */
		const NAV_ICON_MASK = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z'/%3E%3Ccircle cx='16.5' cy='7.5' r='.5' fill='black'/%3E%3C/svg%3E\")";
		const SYNC_DEBOUNCE_MS = 64;
		function installNavIconStyles(doc = document) {
			const css = doc.createElement("style");
			css.textContent = `
    [${SETTINGS_NAV_MARKER}] > svg:first-child { display: none; }
    [${SETTINGS_NAV_MARKER}]::before {
      content: ''; flex: none; width: 16px; height: 16px;
      background: currentColor;
      -webkit-mask: ${NAV_ICON_MASK} center / contain no-repeat;
      mask: ${NAV_ICON_MASK} center / contain no-repeat;
    }
  `;
			doc.head.appendChild(css);
			return () => css.remove();
		}
		function buttonMatchesLabel(button, label) {
			if (label.length === 0) return false;
			const aria = button.getAttribute("aria-label")?.trim();
			if (aria !== void 0 && aria.length > 0) return aria === label;
			return button.textContent?.trim() === label;
		}
		/** Sync marker attributes onto settings-nav buttons under the given root. */
		function syncSettingsNavMarkers(root, label) {
			const buttons = root.querySelectorAll("[role=\"dialog\"] nav button, nav button");
			for (const button of buttons) if (buttonMatchesLabel(button, label)) button.setAttribute(SETTINGS_NAV_MARKER, "");
			else button.removeAttribute(SETTINGS_NAV_MARKER);
		}
		function settingsDialogRoot(doc) {
			return doc.querySelector("[role=\"dialog\"]");
		}
		/**
		* Mark our Settings nav row so CSS can swap the fallback gear for a key icon.
		* Observes the open dialog when present; falls back to `document.body`.
		*/
		function registerSettingsNavIcon(label, doc = document) {
			let disposed = false;
			let timer = null;
			let observer = null;
			let observed = null;
			const runSync = () => {
				if (disposed) return;
				syncSettingsNavMarkers(doc, label().trim());
			};
			const scheduleSync = () => {
				if (disposed) return;
				if (timer !== null) clearTimeout(timer);
				timer = setTimeout(() => {
					timer = null;
					retargetObserver();
					runSync();
				}, SYNC_DEBOUNCE_MS);
			};
			const retargetObserver = () => {
				if (disposed || observer === null) return;
				const preferred = settingsDialogRoot(doc) ?? doc.body;
				if (preferred === observed) return;
				observer.disconnect();
				observed = preferred;
				observer.observe(preferred, {
					childList: true,
					subtree: true,
					characterData: true
				});
			};
			runSync();
			observer = new MutationObserver(scheduleSync);
			retargetObserver();
			return () => {
				disposed = true;
				if (timer !== null) clearTimeout(timer);
				observer?.disconnect();
				observer = null;
				observed = null;
				doc.querySelectorAll(`[${SETTINGS_NAV_MARKER}]`).forEach((el) => {
					el.removeAttribute(SETTINGS_NAV_MARKER);
				});
			};
		}
		//#endregion
		//#region src/client/index.tsx
		const PLUGIN_VERSION = "0.5.9";
		const sectionStyle = {
			display: "flex",
			flexDirection: "column",
			gap: 16,
			width: "100%",
			maxWidth: 760
		};
		const rowStyle = {
			display: "flex",
			alignItems: "center",
			gap: 8,
			padding: "4px 0"
		};
		const fieldRowStyle = {
			display: "flex",
			gap: 8,
			alignItems: "center",
			marginTop: 4
		};
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
		function ProviderIcon() {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
				width: "16",
				height: "16",
				viewBox: "0 0 16 16",
				fill: "none",
				"aria-hidden": "true",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M5 7.5a2.5 2.5 0 1 1 5 0v1.5h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1V7.5Z",
					stroke: "currentColor",
					strokeWidth: "1.25"
				})
			});
		}
		function ApiKeyPoolSection() {
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
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				style: sectionStyle,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: {
							margin: 0,
							fontSize: 13,
							lineHeight: "20px"
						},
						children: "Round-robin API keys per provider. Expand a provider to manage keys. Failed keys cool down automatically."
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.Pill, {
						active: true,
						children: ["dsh-api-key-pool ", /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.Tag, {
							tone: "quiet",
							children: ["v", PLUGIN_VERSION]
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "flex",
							flexDirection: "column",
							gap: 8
						},
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: {
									display: "flex",
									alignItems: "baseline",
									gap: 8,
									padding: "0 2px"
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", {
									style: { fontSize: 13 },
									children: "Providers"
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tag, {
									tone: "neutral",
									children: allProviders.length
								})]
							}),
							state.loading ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								style: {
									margin: 0,
									fontSize: 12
								},
								children: "Loading…"
							}) : null,
							!state.loading && allProviders.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								style: {
									margin: 0,
									fontSize: 12
								},
								children: "No providers yet — add one below."
							}) : null,
							allProviders.map((name) => {
								const pool = state.pools[name];
								const keys = pool?.maskedKeys || [];
								const states = pool?.states || {};
								const isLlm = state.llmProviders.includes(name);
								const open = Boolean(state.expanded[name]);
								return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.DisclosureRow, {
									icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ProviderIcon, {}),
									title: name,
									open,
									expandable: true,
									expandOnRowClick: true,
									onToggle: () => toggleExpanded(name),
									collapsedContent: summarizePool(keys, states, isLlm),
									children: [
										keys.map((masked, i) => {
											const st = states[masked] || {
												failCount: 0,
												cooldownUntil: 0
											};
											const cooling = st.cooldownUntil > Date.now();
											return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												style: rowStyle,
												children: [
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, { state: cooling ? "warning" : "done" }),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", {
														style: {
															flex: 1,
															minWidth: 0,
															fontSize: 12
														},
														children: masked
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tag, {
														tone: cooling ? "warning" : st.failCount > 0 ? "info" : "success",
														children: cooling ? `cooling until ${new Date(st.cooldownUntil).toLocaleTimeString()}` : st.failCount > 0 ? `fails ${st.failCount}` : "healthy"
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
														type: "button",
														variant: "ghost",
														size: "sm",
														onClick: () => void handleRemoveKey(name, i),
														children: "Remove"
													})
												]
											}, `${masked}-${i}`);
										}),
										keys.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
											style: {
												margin: 0,
												fontSize: 12
											},
											children: "No keys yet"
										}) : null,
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											style: fieldRowStyle,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
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
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
												type: "button",
												variant: "primary",
												disabled: !(state.addInputs[name] || "").trim(),
												onClick: () => void handleAddKey(name),
												children: "Add"
											})]
										}),
										pool ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
											type: "button",
											variant: "outline",
											onClick: () => void handleReset(name),
											children: "Reset cooldown"
										}) : null
									]
								}, name);
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: {
									...fieldRowStyle,
									marginTop: 8,
									paddingTop: 12,
									borderTop: "0.5px solid var(--dsw-alias-border-l2, #444)"
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
									placeholder: "Provider id (if not listed)…",
									value: state.newProvName,
									onChange: (e) => setState((s) => ({
										...s,
										newProvName: e.target.value
									})),
									onKeyDown: (e) => {
										if (e.key === "Enter") handleAddProvider();
									}
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
									type: "button",
									variant: "outline",
									disabled: !state.newProvName.trim(),
									onClick: () => void handleAddProvider(),
									children: "Add provider"
								})]
							}),
							state.msg ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tag, {
								tone: state.msg.type === "ok" ? "success" : "danger",
								children: state.msg.text
							}) : null
						]
					})
				]
			});
		}
		function apply(ctx) {
			ctx.effect(installNavIconStyles, "dsh-api-key-pool: nav icon styles");
			ctx.effect(() => registerSettingsNavIcon(() => SETTINGS_NAV_LABEL), "dsh-api-key-pool: settings navigation icon");
			ctx.slots.inject("settings.section", function* () {
				yield ctx.slots.register({
					name: "settings.section",
					id: "api-key-pool",
					order: 90,
					label: () => SETTINGS_NAV_LABEL,
					inject: () => ({})
				}, ApiKeyPoolSection);
			});
		}
		const inject = ["configForms", "slots"];
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map