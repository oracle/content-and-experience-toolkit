/** vim: et:ts=4:sw=4:sts=4
 * @license RequireJS 2.3.6 Copyright jQuery Foundation and other contributors.
 * Released under MIT license, https://github.com/requirejs/requirejs/blob/master/LICENSE
 */

!function(e, t) {
	"function" == typeof define ? define(t) : "object" == typeof exports ? module.exports = t() : (e.editorSDK = e.editorSDK || {},
	e.editorSDK = t(e.editorSDK));
}(this, function(editorSDK) {
	var requirejs, require, define;
	return function(global, setTimeout) {
		function commentReplace(e, t) {
			return t || "";
		}
		function isFunction(e) {
			return "[object Function]" === ostring.call(e);
		}
		function isArray(e) {
			return "[object Array]" === ostring.call(e);
		}
		function each(e, t) {
			var i;
			if (e) for (i = 0; i < e.length && (!e[i] || !t(e[i], i, e)); i += 1) ;
		}
		function eachReverse(e, t) {
			var i;
			if (e) for (i = e.length - 1; -1 < i && (!e[i] || !t(e[i], i, e)); i -= 1) ;
		}
		function hasProp(e, t) {
			return hasOwn.call(e, t);
		}
		function getOwn(e, t) {
			return hasProp(e, t) && e[t];
		}
		function eachProp(e, t) {
			var i;
			for (i in e) if (hasProp(e, i) && t(e[i], i)) break;
		}
		function mixin(e, t, i, n) {
			return t && eachProp(t, function(t, r) {
				!i && hasProp(e, r) || (!n || "object" != typeof t || !t || isArray(t) || isFunction(t) || t instanceof RegExp ? e[r] = t : (e[r] || (e[r] = {}),
				mixin(e[r], t, i, n)));
			}), e;
		}
		function bind(e, t) {
			return function() {
				return t.apply(e, arguments);
			};
		}
		function scripts() {
			return document.getElementsByTagName("script");
		}
		function defaultOnError(e) {
			throw e;
		}
		function getGlobal(e) {
			if (!e) return e;
			var t = global;
			return each(e.split("."), function(e) {
				t = t[e];
			}), t;
		}
		function makeError(e, t, i, n) {
			var r = new Error(t + "\nhttps://requirejs.org/docs/errors.html#" + e);
			return r.requireType = e, r.requireModules = n, i && (r.originalError = i), r;
		}
		function newContext(e) {
			function t(e, t, i) {
				var n, r, o, a, s, u, d, c, l, f, p = t && t.split("/"), h = w.map, g = h && h["*"];
				if (e && (u = (e = e.split("/")).length - 1, w.nodeIdCompat && jsSuffixRegExp.test(e[u]) && (e[u] = e[u].replace(jsSuffixRegExp, "")),
				"." === e[0].charAt(0) && p && (e = p.slice(0, p.length - 1).concat(e)), function(e) {
					var t, i;
					for (t = 0; t < e.length; t++) if ("." === (i = e[t])) e.splice(t, 1), t -= 1; else if (".." === i) {
						if (0 === t || 1 === t && ".." === e[2] || ".." === e[t - 1]) continue;
						0 < t && (e.splice(t - 1, 2), t -= 2);
					}
				}(e), e = e.join("/")), i && h && (p || g)) {
					e: for (o = (r = e.split("/")).length; 0 < o; o -= 1) {
						if (s = r.slice(0, o).join("/"), p) for (a = p.length; 0 < a; a -= 1) if ((n = getOwn(h, p.slice(0, a).join("/"))) && (n = getOwn(n, s))) {
							d = n, c = o;
							break e;
						}
						!l && g && getOwn(g, s) && (l = getOwn(g, s), f = o);
					}
					!d && l && (d = l, c = f), d && (r.splice(0, c, d), e = r.join("/"));
				}
				return getOwn(w.pkgs, e) || e;
			}
			function i(e) {
				isBrowser && each(scripts(), function(t) {
					if (t.getAttribute("data-requiremodule") === e && t.getAttribute("data-requirecontext") === b.contextName) return t.parentNode.removeChild(t),
					!0;
				});
			}
			function n(e) {
				var t = getOwn(w.paths, e);
				if (t && isArray(t) && 1 < t.length) return t.shift(), b.require.undef(e), b.makeRequire(null, {
					skipMap: !0
				})([ e ]), !0;
			}
			function r(e) {
				var t, i = e ? e.indexOf("!") : -1;
				return -1 < i && (t = e.substring(0, i), e = e.substring(i + 1, e.length)), [ t, e ];
			}
			function o(e, i, n, o) {
				var a, s, u, d, c = null, l = i ? i.name : null, f = e, p = !0, h = "";
				return e || (p = !1, e = "_@r" + (D += 1)), c = (d = r(e))[0], e = d[1], c && (c = t(c, l, o),
				s = getOwn(M, c)), e && (c ? h = n ? e : s && s.normalize ? s.normalize(e, function(e) {
					return t(e, l, o);
				}) : -1 === e.indexOf("!") ? t(e, l, o) : e : (c = (d = r(h = t(e, l, o)))[0], h = d[1],
				n = !0, a = b.nameToUrl(h))), {
					prefix: c,
					name: h,
					parentMap: i,
					unnormalized: !!(u = !c || s || n ? "" : "_unnormalized" + (j += 1)),
					url: a,
					originalName: f,
					isDefine: p,
					id: (c ? c + "!" + h : h) + u
				};
			}
			function a(e) {
				var t = e.id, i = getOwn(k, t);
				return i || (i = k[t] = new b.Module(e)), i;
			}
			function s(e, t, i) {
				var n = e.id, r = getOwn(k, n);
				!hasProp(M, n) || r && !r.defineEmitComplete ? (r = a(e)).error && "error" === t ? i(r.error) : r.on(t, i) : "defined" === t && i(M[n]);
			}
			function u(e, t) {
				var i = e.requireModules, n = !1;
				t ? t(e) : (each(i, function(t) {
					var i = getOwn(k, t);
					i && (i.error = e, i.events.error && (n = !0, i.emit("error", e)));
				}), n || req.onError(e));
			}
			function d() {
				globalDefQueue.length && (each(globalDefQueue, function(e) {
					var t = e[0];
					"string" == typeof t && (b.defQueueMap[t] = !0), q.push(e);
				}), globalDefQueue = []);
			}
			function c(e) {
				delete k[e], delete E[e];
			}
			function l() {
				var e, t, r = 1e3 * w.waitSeconds, o = r && b.startTime + r < new Date().getTime(), a = [], s = [], d = !1, c = !0;
				if (!m) {
					if (m = !0, eachProp(E, function(e) {
						var r = e.map, u = r.id;
						if (e.enabled && (r.isDefine || s.push(e), !e.error)) if (!e.inited && o) n(u) ? d = t = !0 : (a.push(u),
						i(u)); else if (!e.inited && e.fetched && r.isDefine && (d = !0, !r.prefix)) return c = !1;
					}), o && a.length) return (e = makeError("timeout", "Load timeout for modules: " + a, null, a)).contextName = b.contextName,
					u(e);
					c && each(s, function(e) {
						!function e(t, i, n) {
							var r = t.map.id;
							t.error ? t.emit("error", t.error) : (i[r] = !0, each(t.depMaps, function(r, o) {
								var a = r.id, s = getOwn(k, a);
								!s || t.depMatched[o] || n[a] || (getOwn(i, a) ? (t.defineDep(o, M[a]), t.check()) : e(s, i, n));
							}), n[r] = !0);
						}(e, {}, {});
					}), o && !t || !d || !isBrowser && !isWebWorker || y || (y = setTimeout(function() {
						y = 0, l();
					}, 50)), m = !1;
				}
			}
			function f(e) {
				hasProp(M, e[0]) || a(o(e[0], null, !0)).init(e[1], e[2]);
			}
			function p(e, t, i, n) {
				e.detachEvent && !isOpera ? n && e.detachEvent(n, t) : e.removeEventListener(i, t, !1);
			}
			function h(e) {
				var t = e.currentTarget || e.srcElement;
				return p(t, b.onScriptLoad, "load", "onreadystatechange"), p(t, b.onScriptError, "error"),
				{
					node: t,
					id: t && t.getAttribute("data-requiremodule")
				};
			}
			function g() {
				var e;
				for (d(); q.length; ) {
					if (null === (e = q.shift())[0]) return u(makeError("mismatch", "Mismatched anonymous define() module: " + e[e.length - 1]));
					f(e);
				}
				b.defQueueMap = {};
			}
			var m, v, b, x, y, w = {
					waitSeconds: 7,
					baseUrl: "./",
					paths: {},
					bundles: {},
					pkgs: {},
					shim: {},
					config: {}
				}, k = {}, E = {}, S = {}, q = [], M = {}, O = {}, T = {}, D = 1, j = 1;
			return x = {
				require: function(e) {
					return e.require ? e.require : e.require = b.makeRequire(e.map);
				},
				exports: function(e) {
					if (e.usingExports = !0, e.map.isDefine) return e.exports ? M[e.map.id] = e.exports : e.exports = M[e.map.id] = {};
				},
				module: function(e) {
					return e.module ? e.module : e.module = {
						id: e.map.id,
						uri: e.map.url,
						config: function() {
							return getOwn(w.config, e.map.id) || {};
						},
						exports: e.exports || (e.exports = {})
					};
				}
			}, (v = function(e) {
				this.events = getOwn(S, e.id) || {}, this.map = e, this.shim = getOwn(w.shim, e.id),
				this.depExports = [], this.depMaps = [], this.depMatched = [], this.pluginMaps = {},
				this.depCount = 0;
			}).prototype = {
				init: function(e, t, i, n) {
					n = n || {}, this.inited || (this.factory = t, i ? this.on("error", i) : this.events.error && (i = bind(this, function(e) {
						this.emit("error", e);
					})), this.depMaps = e && e.slice(0), this.errback = i, this.inited = !0, this.ignore = n.ignore,
					n.enabled || this.enabled ? this.enable() : this.check());
				},
				defineDep: function(e, t) {
					this.depMatched[e] || (this.depMatched[e] = !0, this.depCount -= 1, this.depExports[e] = t);
				},
				fetch: function() {
					if (!this.fetched) {
						this.fetched = !0, b.startTime = new Date().getTime();
						var e = this.map;
						if (!this.shim) return e.prefix ? this.callPlugin() : this.load();
						b.makeRequire(this.map, {
							enableBuildCallback: !0
						})(this.shim.deps || [], bind(this, function() {
							return e.prefix ? this.callPlugin() : this.load();
						}));
					}
				},
				load: function() {
					var e = this.map.url;
					O[e] || (O[e] = !0, b.load(this.map.id, e));
				},
				check: function() {
					if (this.enabled && !this.enabling) {
						var e, t, i = this.map.id, n = this.depExports, r = this.exports, o = this.factory;
						if (this.inited) {
							if (this.error) this.emit("error", this.error); else if (!this.defining) {
								if (this.defining = !0, this.depCount < 1 && !this.defined) {
									if (isFunction(o)) {
										if (this.events.error && this.map.isDefine || req.onError !== defaultOnError) try {
											r = b.execCb(i, o, n, r);
										} catch (t) {
											e = t;
										} else r = b.execCb(i, o, n, r);
										if (this.map.isDefine && void 0 === r && ((t = this.module) ? r = t.exports : this.usingExports && (r = this.exports)),
										e) return e.requireMap = this.map, e.requireModules = this.map.isDefine ? [ this.map.id ] : null,
										e.requireType = this.map.isDefine ? "define" : "require", u(this.error = e);
									} else r = o;
									if (this.exports = r, this.map.isDefine && !this.ignore && (M[i] = r, req.onResourceLoad)) {
										var a = [];
										each(this.depMaps, function(e) {
											a.push(e.normalizedMap || e);
										}), req.onResourceLoad(b, this.map, a);
									}
									c(i), this.defined = !0;
								}
								this.defining = !1, this.defined && !this.defineEmitted && (this.defineEmitted = !0,
								this.emit("defined", this.exports), this.defineEmitComplete = !0);
							}
						} else hasProp(b.defQueueMap, i) || this.fetch();
					}
				},
				callPlugin: function() {
					var e = this.map, i = e.id, n = o(e.prefix);
					this.depMaps.push(n), s(n, "defined", bind(this, function(n) {
						var r, d, l, f = getOwn(T, this.map.id), p = this.map.name, h = this.map.parentMap ? this.map.parentMap.name : null, g = b.makeRequire(e.parentMap, {
							enableBuildCallback: !0
						});
						return this.map.unnormalized ? (n.normalize && (p = n.normalize(p, function(e) {
							return t(e, h, !0);
						}) || ""), s(d = o(e.prefix + "!" + p, this.map.parentMap, !0), "defined", bind(this, function(e) {
							this.map.normalizedMap = d, this.init([], function() {
								return e;
							}, null, {
								enabled: !0,
								ignore: !0
							});
						})), void ((l = getOwn(k, d.id)) && (this.depMaps.push(d), this.events.error && l.on("error", bind(this, function(e) {
							this.emit("error", e);
						})), l.enable()))) : f ? (this.map.url = b.nameToUrl(f), void this.load()) : ((r = bind(this, function(e) {
							this.init([], function() {
								return e;
							}, null, {
								enabled: !0
							});
						})).error = bind(this, function(e) {
							this.inited = !0, (this.error = e).requireModules = [ i ], eachProp(k, function(e) {
								0 === e.map.id.indexOf(i + "_unnormalized") && c(e.map.id);
							}), u(e);
						}), r.fromText = bind(this, function(t, n) {
							var s = e.name, d = o(s), c = useInteractive;
							n && (t = n), c && (useInteractive = !1), a(d), hasProp(w.config, i) && (w.config[s] = w.config[i]);
							try {
								req.exec(t);
							} catch (t) {
								return u(makeError("fromtexteval", "fromText eval for " + i + " failed: " + t, t, [ i ]));
							}
							c && (useInteractive = !0), this.depMaps.push(d), b.completeLoad(s), g([ s ], r);
						}), void n.load(e.name, g, r, w));
					})), b.enable(n, this), this.pluginMaps[n.id] = n;
				},
				enable: function() {
					(E[this.map.id] = this).enabled = !0, this.enabling = !0, each(this.depMaps, bind(this, function(e, t) {
						var i, n, r;
						if ("string" == typeof e) {
							if (e = o(e, this.map.isDefine ? this.map : this.map.parentMap, !1, !this.skipMap),
							this.depMaps[t] = e, r = getOwn(x, e.id)) return void (this.depExports[t] = r(this));
							this.depCount += 1, s(e, "defined", bind(this, function(e) {
								this.undefed || (this.defineDep(t, e), this.check());
							})), this.errback ? s(e, "error", bind(this, this.errback)) : this.events.error && s(e, "error", bind(this, function(e) {
								this.emit("error", e);
							}));
						}
						i = e.id, n = k[i], hasProp(x, i) || !n || n.enabled || b.enable(e, this);
					})), eachProp(this.pluginMaps, bind(this, function(e) {
						var t = getOwn(k, e.id);
						t && !t.enabled && b.enable(e, this);
					})), this.enabling = !1, this.check();
				},
				on: function(e, t) {
					var i = this.events[e];
					i || (i = this.events[e] = []), i.push(t);
				},
				emit: function(e, t) {
					each(this.events[e], function(e) {
						e(t);
					}), "error" === e && delete this.events[e];
				}
			}, (b = {
				config: w,
				contextName: e,
				registry: k,
				defined: M,
				urlFetched: O,
				defQueue: q,
				defQueueMap: {},
				Module: v,
				makeModuleMap: o,
				nextTick: req.nextTick,
				onError: u,
				configure: function(e) {
					if (e.baseUrl && "/" !== e.baseUrl.charAt(e.baseUrl.length - 1) && (e.baseUrl += "/"),
					"string" == typeof e.urlArgs) {
						var t = e.urlArgs;
						e.urlArgs = function(e, i) {
							return (-1 === i.indexOf("?") ? "?" : "&") + t;
						};
					}
					var i = w.shim, n = {
						paths: !0,
						bundles: !0,
						config: !0,
						map: !0
					};
					eachProp(e, function(e, t) {
						n[t] ? (w[t] || (w[t] = {}), mixin(w[t], e, !0, !0)) : w[t] = e;
					}), e.bundles && eachProp(e.bundles, function(e, t) {
						each(e, function(e) {
							e !== t && (T[e] = t);
						});
					}), e.shim && (eachProp(e.shim, function(e, t) {
						isArray(e) && (e = {
							deps: e
						}), !e.exports && !e.init || e.exportsFn || (e.exportsFn = b.makeShimExports(e)),
						i[t] = e;
					}), w.shim = i), e.packages && each(e.packages, function(e) {
						var t;
						t = (e = "string" == typeof e ? {
							name: e
						} : e).name, e.location && (w.paths[t] = e.location), w.pkgs[t] = e.name + "/" + (e.main || "main").replace(currDirRegExp, "").replace(jsSuffixRegExp, "");
					}), eachProp(k, function(e, t) {
						e.inited || e.map.unnormalized || (e.map = o(t, null, !0));
					}), (e.deps || e.callback) && b.require(e.deps || [], e.callback);
				},
				makeShimExports: function(e) {
					return function() {
						var t;
						return e.init && (t = e.init.apply(global, arguments)), t || e.exports && getGlobal(e.exports);
					};
				},
				makeRequire: function(n, r) {
					function s(t, i, d) {
						var c, f;
						return r.enableBuildCallback && i && isFunction(i) && (i.__requireJsBuild = !0),
						"string" == typeof t ? isFunction(i) ? u(makeError("requireargs", "Invalid require call"), d) : n && hasProp(x, t) ? x[t](k[n.id]) : req.get ? req.get(b, t, n, s) : (c = o(t, n, !1, !0).id,
						hasProp(M, c) ? M[c] : u(makeError("notloaded", 'Module name "' + c + '" has not been loaded yet for context: ' + e + (n ? "" : ". Use require([])")))) : (g(),
						b.nextTick(function() {
							g(), (f = a(o(null, n))).skipMap = r.skipMap, f.init(t, i, d, {
								enabled: !0
							}), l();
						}), s);
					}
					return r = r || {}, mixin(s, {
						isBrowser: isBrowser,
						toUrl: function(e) {
							var i, r = e.lastIndexOf("."), o = e.split("/")[0];
							return -1 !== r && (!("." === o || ".." === o) || 1 < r) && (i = e.substring(r, e.length),
							e = e.substring(0, r)), b.nameToUrl(t(e, n && n.id, !0), i, !0);
						},
						defined: function(e) {
							return hasProp(M, o(e, n, !1, !0).id);
						},
						specified: function(e) {
							return e = o(e, n, !1, !0).id, hasProp(M, e) || hasProp(k, e);
						}
					}), n || (s.undef = function(e) {
						d();
						var t = o(e, n, !0), r = getOwn(k, e);
						r.undefed = !0, i(e), delete M[e], delete O[t.url], delete S[e], eachReverse(q, function(t, i) {
							t[0] === e && q.splice(i, 1);
						}), delete b.defQueueMap[e], r && (r.events.defined && (S[e] = r.events), c(e));
					}), s;
				},
				enable: function(e) {
					getOwn(k, e.id) && a(e).enable();
				},
				completeLoad: function(e) {
					var t, i, r, o = getOwn(w.shim, e) || {}, a = o.exports;
					for (d(); q.length; ) {
						if (null === (i = q.shift())[0]) {
							if (i[0] = e, t) break;
							t = !0;
						} else i[0] === e && (t = !0);
						f(i);
					}
					if (b.defQueueMap = {}, r = getOwn(k, e), !t && !hasProp(M, e) && r && !r.inited) {
						if (!(!w.enforceDefine || a && getGlobal(a))) return n(e) ? void 0 : u(makeError("nodefine", "No define call for " + e, null, [ e ]));
						f([ e, o.deps || [], o.exportsFn ]);
					}
					l();
				},
				nameToUrl: function(e, t, i) {
					var n, r, o, a, s, u, d = getOwn(w.pkgs, e);
					if (d && (e = d), u = getOwn(T, e)) return b.nameToUrl(u, t, i);
					if (req.jsExtRegExp.test(e)) a = e + (t || ""); else {
						for (n = w.paths, o = (r = e.split("/")).length; 0 < o; o -= 1) if (s = getOwn(n, r.slice(0, o).join("/"))) {
							isArray(s) && (s = s[0]), r.splice(0, o, s);
							break;
						}
						a = r.join("/"), a = ("/" === (a += t || (/^data\:|^blob\:|\?/.test(a) || i ? "" : ".js")).charAt(0) || a.match(/^[\w\+\.\-]+:/) ? "" : w.baseUrl) + a;
					}
					return w.urlArgs && !/^blob\:/.test(a) ? a + w.urlArgs(e, a) : a;
				},
				load: function(e, t) {
					req.load(b, e, t);
				},
				execCb: function(e, t, i, n) {
					return t.apply(n, i);
				},
				onScriptLoad: function(e) {
					if ("load" === e.type || readyRegExp.test((e.currentTarget || e.srcElement).readyState)) {
						interactiveScript = null;
						var t = h(e);
						b.completeLoad(t.id);
					}
				},
				onScriptError: function(e) {
					var t = h(e);
					if (!n(t.id)) {
						var i = [];
						return eachProp(k, function(e, n) {
							0 !== n.indexOf("_@r") && each(e.depMaps, function(e) {
								if (e.id === t.id) return i.push(n), !0;
							});
						}), u(makeError("scripterror", 'Script error for "' + t.id + (i.length ? '", needed by: ' + i.join(", ") : '"'), e, [ t.id ]));
					}
				}
			}).require = b.makeRequire(), b;
		}
		function getInteractiveScript() {
			return interactiveScript && "interactive" === interactiveScript.readyState || eachReverse(scripts(), function(e) {
				if ("interactive" === e.readyState) return interactiveScript = e;
			}), interactiveScript;
		}
		var req, s, head, baseElement, dataMain, src, interactiveScript, currentlyAddingScript, mainScript, subPath, version = "2.3.6", commentRegExp = /\/\*[\s\S]*?\*\/|([^:"'=]|^)\/\/.*$/gm, cjsRequireRegExp = /[^.]\s*require\s*\(\s*["']([^'"\s]+)["']\s*\)/g, jsSuffixRegExp = /\.js$/, currDirRegExp = /^\.\//, op = Object.prototype, ostring = op.toString, hasOwn = op.hasOwnProperty, isBrowser = !("undefined" == typeof window || "undefined" == typeof navigator || !window.document), isWebWorker = !isBrowser && "undefined" != typeof importScripts, readyRegExp = isBrowser && "PLAYSTATION 3" === navigator.platform ? /^complete$/ : /^(complete|loaded)$/, defContextName = "_", isOpera = "undefined" != typeof opera && "[object Opera]" === opera.toString(), contexts = {}, cfg = {}, globalDefQueue = [], useInteractive = !1;
		if (void 0 === define) {
			if (void 0 !== requirejs) {
				if (isFunction(requirejs)) return;
				cfg = requirejs, requirejs = void 0;
			}
			void 0 === require || isFunction(require) || (cfg = require, require = void 0),
			req = requirejs = function(e, t, i, n) {
				var r, o, a = defContextName;
				return isArray(e) || "string" == typeof e || (o = e, isArray(t) ? (e = t, t = i,
				i = n) : e = []), o && o.context && (a = o.context), (r = getOwn(contexts, a)) || (r = contexts[a] = req.s.newContext(a)),
				o && r.configure(o), r.require(e, t, i);
			}, req.config = function(e) {
				return req(e);
			}, req.nextTick = void 0 !== setTimeout ? function(e) {
				setTimeout(e, 4);
			} : function(e) {
				e();
			}, require || (require = req), req.version = version, req.jsExtRegExp = /^\/|:|\?|\.js$/,
			req.isBrowser = isBrowser, s = req.s = {
				contexts: contexts,
				newContext: newContext
			}, req({}), each([ "toUrl", "undef", "defined", "specified" ], function(e) {
				req[e] = function() {
					var t = contexts[defContextName];
					return t.require[e].apply(t, arguments);
				};
			}), isBrowser && (head = s.head = document.getElementsByTagName("head")[0], (baseElement = document.getElementsByTagName("base")[0]) && (head = s.head = baseElement.parentNode)),
			req.onError = defaultOnError, req.createNode = function(e, t, i) {
				var n = e.xhtml ? document.createElementNS("http://www.w3.org/1999/xhtml", "html:script") : document.createElement("script");
				return n.type = e.scriptType || "text/javascript", n.charset = "utf-8", n.async = !0,
				n;
			}, req.load = function(e, t, i) {
				var n, r = e && e.config || {};
				if (isBrowser) return (n = req.createNode(r, t, i)).setAttribute("data-requirecontext", e.contextName),
				n.setAttribute("data-requiremodule", t), !n.attachEvent || n.attachEvent.toString && n.attachEvent.toString().indexOf("[native code") < 0 || isOpera ? (n.addEventListener("load", e.onScriptLoad, !1),
				n.addEventListener("error", e.onScriptError, !1)) : (useInteractive = !0, n.attachEvent("onreadystatechange", e.onScriptLoad)),
				n.src = i, r.onNodeCreated && r.onNodeCreated(n, r, t, i), currentlyAddingScript = n,
				baseElement ? head.insertBefore(n, baseElement) : head.appendChild(n), currentlyAddingScript = null,
				n;
				if (isWebWorker) try {
					setTimeout(function() {}, 0), importScripts(i), e.completeLoad(t);
				} catch (n) {
					e.onError(makeError("importscripts", "importScripts failed for " + t + " at " + i, n, [ t ]));
				}
			}, isBrowser && !cfg.skipDataMain && eachReverse(scripts(), function(e) {
				if (head || (head = e.parentNode), dataMain = e.getAttribute("data-main")) return mainScript = dataMain,
				cfg.baseUrl || -1 !== mainScript.indexOf("!") || (mainScript = (src = mainScript.split("/")).pop(),
				subPath = src.length ? src.join("/") + "/" : "./", cfg.baseUrl = subPath), mainScript = mainScript.replace(jsSuffixRegExp, ""),
				req.jsExtRegExp.test(mainScript) && (mainScript = dataMain), cfg.deps = cfg.deps ? cfg.deps.concat(mainScript) : [ mainScript ],
				!0;
			}), define = function(e, t, i) {
				var n, r;
				"string" != typeof e && (i = t, t = e, e = null), isArray(t) || (i = t, t = null),
				!t && isFunction(i) && (t = [], i.length && (i.toString().replace(commentRegExp, commentReplace).replace(cjsRequireRegExp, function(e, i) {
					t.push(i);
				}), t = (1 === i.length ? [ "require" ] : [ "require", "exports", "module" ]).concat(t))),
				useInteractive && (n = currentlyAddingScript || getInteractiveScript()) && (e || (e = n.getAttribute("data-requiremodule")),
				r = contexts[n.getAttribute("data-requirecontext")]), r ? (r.defQueue.push([ e, t, i ]),
				r.defQueueMap[e] = !0) : globalDefQueue.push([ e, t, i ]);
			}, define.amd = {
				jQuery: !0
			}, req.exec = function(text) {
				return eval(text);
			}, req(cfg);
		}
	}(this, "undefined" == typeof setTimeout ? void 0 : setTimeout), define("requireLib", function() {}),
	define("sdk/utils", [], function() {
		return {
			getWindow: function() {
				return window;
			}
		};
	}), define("sdk/logger", [ "sdk/utils" ], function(e) {
		function t(e) {
			return "true" === localStorage.getItem(e);
		}
		function i(i) {
			function a() {
				return t(o) || t(d);
			}
			function s() {
				try {
					for (var e, t = "[" + i + "]", n = [], r = 0; r < arguments.length; r++) n.push(arguments[r]);
					return e = n[0], "string" == typeof e || e instanceof String ? n[0] = t + " - " + e : n.unshift(t),
					n;
				} catch (e) {
					console.error("logger", e);
				}
			}
			var u, d = r + i + ".debug";
			n = e.getWindow(), u = a(), n.addEventListener("storage", function(e) {
				e.key !== o && e.key !== d || (u = a());
			}), this.debug = function() {
				var e = s.apply(null, arguments);
				u && console.log.apply(null, e);
			}, this.error = function() {
				var e = s.apply(null, arguments);
				console.error.apply(null, e);
			};
		}
		var n, r = "oracle.content.ui.extension.", o = r + "debug";
		return i;
	}), define("sdk/messenger", [ "sdk/logger" ], function(e) {
		var t = new e("messenger"), i = 0, n = {}, r = {};
		return {
			on: function(e, t, i) {
				r[e] = t.bind(i);
			},
			startListening: function() {
				window.addEventListener("message", this.onMessage.bind(this));
			},
			onMessage: function(e) {
				if (e.origin === this.getOrigin()) {
					var i = e.data, o = i.type;
					t.debug("receiving data:", e.data), "replyTo" === i.type && (i.replyStatus && "error" === i.replyStatus.replyType ? (t.error("replyTo returned error :", i.replyStatus.message),
					n[i.messageId] && "function" == typeof n[i.messageId].rejectCallBack ? (t.debug("processing reject callback"),
					n[i.messageId].rejectCallBack.call(null, i.replyStatus.message ? i.replyStatus.message : "Error")) : t.debug("no reject callback for message id:", i.messageId)) : n[i.messageId] && "function" == typeof n[i.messageId].resolveCallBack ? (t.debug("processing resolve callback"),
					n[i.messageId].resolveCallBack.call(null, i.payload)) : t.debug("no resolve callback for message id:", i.messageId)),
					"function" == typeof r[o] && (t.debug("processing event", o), r[o].call(null, e.data.payload, e.data.messageId));
				}
			},
			getSenderId: function() {
				return window.location.hash.slice(1);
			},
			send: function(e, i) {
				i = i || {};
				var n = {
					type: e,
					payload: i,
					senderId: this.getSenderId()
				};
				t.debug("sending:", n), this.getTargetWindow().postMessage(n, this.getOrigin());
			},
			replyTo: function(e, i) {
				var n = {
					type: "replyTo",
					payload: i,
					messageId: e,
					senderId: this.getSenderId()
				};
				t.debug("sending:", n), this.getTargetWindow().postMessage(n, this.getOrigin());
			},
			sendAndWait: function(e, r) {
				return new Promise(function(o, a) {
					r = r || {}, i++, n[i] = {
						resolveCallBack: o,
						rejectCallBack: a
					};
					var s = {
						type: e,
						payload: r,
						senderId: this.getSenderId(),
						messageId: i
					};
					t.debug("sending:", s), this.getTargetWindow().postMessage(s, this.getOrigin());
				}.bind(this));
			},
			getTargetWindow: function() {
				return window.parent;
			},
			getOrigin: function() {
				return window.origin;
			}
		};
	}), define("sdk/Field", [ "sdk/messenger", "sdk/logger" ], function(e, t) {
		function i(t) {
			var i = {
				name: t.getName(),
				value: t.getValue()
			};
			n.debug("Notifying UI that the field value has changed:", i), e.send("edit", i);
		}
		var n = new t("sdk");
		return function(e) {
			e = e || {};
			var t = {}, r = e.value, o = e.defaultValue, a = e.index;
			this.on = function(e, i) {
				t[e] = i;
			}, this.getName = function() {
				return e.name;
			}, this.getDefaultValue = function() {
				return o;
			}, this.getDataType = function() {
				return e.dataType;
			}, this.setValue = function(e, o) {
				void 0 === a || isNaN(a) ? r = e : (r = r || [], r[a] = e), o && o.notifyEditor ? t.update && (void 0 === a || isNaN(a) ? (n.debug("Notifying to update the value for single valued field:", r),
				t.update.call(null, r)) : (n.debug("Notifying to update the value " + r + " for multi valued field at index:" + a),
				t.update.call(null, r[a]))) : i(this);
			}, this.getValue = function() {
				return void 0 === a || isNaN(a) ? r : r && r.length && r.length > a ? r[a] : void 0;
			};
		};
	}), define("sdk/sizeTracker", [ "sdk/logger" ], function(e) {
		var t = new e("sizeTracker");
		return function(e, i) {
			function n(e) {
				o.height = e.height, o.width = e.width;
			}
			var r, o = {};
			this.calcSize = function() {
				var i = e.getBoundingClientRect(), r = {
					width: Math.round(i.width),
					height: Math.round(i.height)
				};
				return n(r), t.debug("calculated size:", r), r;
			}, this.start = function() {
				if (!r) {
					r = new MutationObserver(this.onSizeChange.bind(this));
					var i = {
						attributes: !0,
						attributesOldValue: !1,
						childList: !0,
						characterData: !0,
						characterDataOldValue: !1,
						subtree: !0
					};
					t.debug("observing target node:", e, i), r.observe(e, i), this.isTracking = !0;
				}
			}, this.stop = function() {
				r && r.disconnect();
			}, this.sizeHasChanged = function(e) {
				return o.height !== e.height || o.width !== e.width;
			}, this.onSizeChange = function() {
				var r = e.getBoundingClientRect();
				this.sizeHasChanged(r) && (t.debug("size has changed:", r), i.call(null, {
					width: r.width,
					height: r.height
				}), n(r));
			};
		};
	}), define("sdk/types", [], function() {
		var e = {
			TEXT: "text",
			LARGETEXT: "largetext",
			DATETIME: "datetime",
			NUMBER: "number",
			DECIMAL: "decimal",
			BOOLEAN: "boolean",
			JSON: "json"
		};
		return Object.freeze(e);
	}), define("sdk/api", [ "sdk/Field", "sdk/sizeTracker", "sdk/messenger", "sdk/types", "sdk/logger" ], function(e, t, i, n, r) {
		var o = new r("sdk"), a = function(n, r, a) {
			a = a || {};
			var s;
			if (!n) throw s = "Unable to initialize sdk - no initialization parameters were received",
			new Error(s);
			if (r = r || document.querySelector("body"), !n.fields || !n.fields.length) throw s = 'Unable to initialize sdk - invalid "fields" parameter:',
			o.error(s, p), new Error(s);
			var u, d = n.editor, c = n.locale, l = n.dir;
			if (!d) throw s = 'Unable to initialize sdk - missing "editor" parameter', new Error(s);
			var f, p = n.fields.map(function(t) {
					return new e(t);
				}), h = n.fields.indexOf(n.field);
			-1 !== h && (f = p[h], i.on("update", function(e) {
				f.setValue(e, {
					notifyEditor: !0
				});
			})), this.getField = function() {
				return f;
			}, this.getFields = function() {
				return p;
			}, this.getSettings = function() {
				return d.settings || {};
			}, this.getSetting = function(e) {
				return this.getSettings()[e];
			}, this.getLocale = function() {
				return c;
			}, this.getDirection = function() {
				return l;
			}, this.resize = function(e) {
				e || (e = u.calcSize());
				var t = {
					width: parseInt(e.width),
					height: parseInt(e.height)
				};
				i.send("resize", {
					width: t.width,
					height: t.height
				});
			}, u = a && "function" == typeof a.SizeTracker ? new a.SizeTracker(r, this.resize.bind(this)) : new t(r, this.resize.bind(this)),
			this.startTrackingSize = function() {
				d.autoresize && u.start(), o.debug("autoresizing is " + String(d.autoresize));
			}, this.stopTrackingSize = function() {
				u.stop(), o.debug("autoresizing is off");
			}, this.openContentPicker = function(e) {
				return e = e || {}, i.sendAndWait("openContentPicker", e);
			};
			var g, m, v, b;
			this.setValidation = function(e, t) {
				g = e, t = t || {}, m = t.title || "", v = t.message || "";
			}, this.isValid = function() {
				if ("function" != typeof g) return o.debug("Unable to validate value: no validation function has been registered"),
				!1;
				var e = f.getValue();
				try {
					return o.debug("Evaluating custom validation function with value:", e), Promise.resolve(g.call(this, e)).then(function(e) {
						var t;
						switch (o.debug("validation function returned:", e), typeof e) {
						case "boolean":
							t = {
								isValid: e
							};
							break;

						case "object":
							e.hasOwnProperty("isValid") && "boolean" == typeof e.isValid && (t = {
								isValid: e.isValid,
								error: {
									title: e.title || m,
									message: e.message || v
								}
							});
						}
						if (!t) {
							var i = 'Validation function must return a boolean, or an object with an "isValid" boolean property';
							throw o.error(i), new Error(i);
						}
						return t.error = t.error || {}, t;
					});
				} catch (e) {
					o.error("Validation function failed unexpectedly:", e);
				}
			}, this.registerDisable = function(e) {
				b = e;
			}, this.renderDisabled = function(e) {
				if ("function" != typeof b) return o.debug("Unable to render disabled view . no render disable function has been registered"),
				!1;
				b.call(this, e);
			};
		};
		return a.types = n, a;
	}), define("sdk/api/sdk", [ "sdk/logger" ], function(e) {
		return function(e) {
			return {
				getFields: function() {
					return e.getFields();
				},
				getField: function() {
					return e.getField();
				},
				getLocale: function() {
					return e.getLocale();
				},
				getDirection: function() {
					return e.getDirection();
				},
				getSettings: function() {
					return e.getSettings();
				},
				getSetting: function(t) {
					return e.getSetting(t);
				},
				registerDisable: function(t) {
					e.registerDisable(t);
				},
				resize: function(t) {
					e.resize(t);
				},
				setValidation: function(t) {
					e.setValidation(t);
				},
				openContentPicker: function(t) {
					return e.openContentPicker(t);
				}
			};
		};
	}), define("sdk/api/init", [ "sdk/api", "sdk/api/sdk", "sdk/messenger", "sdk/logger" ], function(e, t, i, n) {
		var r, o = new n("init");
		return {
			onInit: function(i, n, a) {
				o.debug("Received initialization data:", a), r = new e(a, n);
				var s = new t(r);
				return "function" == typeof i && i.apply(null, [ s ]), r.resize(), r.startTrackingSize(),
				r;
			},
			onDisable: function(e) {
				r.renderDisabled(e);
			},
			onValidate: function(e, t) {
				if (o.debug("Received a validation request"), !r) return void o.debug('Ignoring incoming "validate" message: "init" not received yet');
				var n = r.isValid();
				return Promise.resolve(n).then(function(e) {
					var n = {
						isValid: e.isValid
					};
					e.error && (n.error = e.error), i.replyTo(t, n);
				}, function() {
					o.error("Custom validation should not return a rejected promise");
				}).catch(function(e) {
					o.error("Validation failed:", e);
				});
			},
			init: function(e, t) {
				i.on("init", this.onInit.bind(this, e, t)), i.on("validate", this.onValidate), i.on("disable", this.onDisable),
				i.startListening(), o.debug('sending "ready" message'), i.send("ready");
			}
		};
	}), define("sdk/ui", [ "sdk/api/init" ], function(e) {
		return {
			init: function(t, i) {
				e.init(t, i);
			}
		};
	}), editorSDK.initSDK = function(e, t) {
		require([ "sdk/ui" ], function(i) {
			i.init(e, t);
		}, function(e) {
			console.error("Error loading field editor sdk module:", e);
		});
	}, editorSDK;
});