/** vim: et:ts=4:sw=4:sts=4
 * @license RequireJS 2.3.6 Copyright jQuery Foundation and other contributors.
 * Released under MIT license, https://github.com/requirejs/requirejs/blob/master/LICENSE
 */

!function(e, t) {
    "function" == typeof define ? define(t) : "object" == typeof exports ? module.exports = t() : (e.contentFormSDK = e.contentFormSDK || {}, 
    e.contentFormSDK = t(e.contentFormSDK));
}(this, function(contentFormSDK) {
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
            var r;
            if (e) for (r = 0; r < e.length && (!e[r] || !t(e[r], r, e)); r += 1) ;
        }
        function eachReverse(e, t) {
            var r;
            if (e) for (r = e.length - 1; -1 < r && (!e[r] || !t(e[r], r, e)); r -= 1) ;
        }
        function hasProp(e, t) {
            return hasOwn.call(e, t);
        }
        function getOwn(e, t) {
            return hasProp(e, t) && e[t];
        }
        function eachProp(e, t) {
            var r;
            for (r in e) if (hasProp(e, r) && t(e[r], r)) break;
        }
        function mixin(e, t, r, i) {
            return t && eachProp(t, function(t, n) {
                !r && hasProp(e, n) || (!i || "object" != typeof t || !t || isArray(t) || isFunction(t) || t instanceof RegExp ? e[n] = t : (e[n] || (e[n] = {}), 
                mixin(e[n], t, r, i)));
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
        function makeError(e, t, r, i) {
            var n = new Error(t + "\nhttps://requirejs.org/docs/errors.html#" + e);
            return n.requireType = e, n.requireModules = i, r && (n.originalError = r), n;
        }
        function newContext(e) {
            function t(e, t, r) {
                var i, n, o, a, s, d, u, l, c, f, p = t && t.split("/"), h = E.map, g = h && h["*"];
                if (e && (d = (e = e.split("/")).length - 1, E.nodeIdCompat && jsSuffixRegExp.test(e[d]) && (e[d] = e[d].replace(jsSuffixRegExp, "")), 
                "." === e[0].charAt(0) && p && (e = p.slice(0, p.length - 1).concat(e)), function(e) {
                    var t, r;
                    for (t = 0; t < e.length; t++) if ("." === (r = e[t])) e.splice(t, 1), t -= 1; else if (".." === r) {
                        if (0 === t || 1 === t && ".." === e[2] || ".." === e[t - 1]) continue;
                        0 < t && (e.splice(t - 1, 2), t -= 2);
                    }
                }(e), e = e.join("/")), r && h && (p || g)) {
                    e: for (o = (n = e.split("/")).length; 0 < o; o -= 1) {
                        if (s = n.slice(0, o).join("/"), p) for (a = p.length; 0 < a; a -= 1) if ((i = getOwn(h, p.slice(0, a).join("/"))) && (i = getOwn(i, s))) {
                            u = i, l = o;
                            break e;
                        }
                        !c && g && getOwn(g, s) && (c = getOwn(g, s), f = o);
                    }
                    !u && c && (u = c, l = f), u && (n.splice(0, l, u), e = n.join("/"));
                }
                return getOwn(E.pkgs, e) || e;
            }
            function r(e) {
                isBrowser && each(scripts(), function(t) {
                    if (t.getAttribute("data-requiremodule") === e && t.getAttribute("data-requirecontext") === w.contextName) return t.parentNode.removeChild(t), 
                    !0;
                });
            }
            function i(e) {
                var t = getOwn(E.paths, e);
                if (t && isArray(t) && 1 < t.length) return t.shift(), w.require.undef(e), w.makeRequire(null, {
                    skipMap: !0
                })([ e ]), !0;
            }
            function n(e) {
                var t, r = e ? e.indexOf("!") : -1;
                return -1 < r && (t = e.substring(0, r), e = e.substring(r + 1, e.length)), [ t, e ];
            }
            function o(e, r, i, o) {
                var a, s, d, u, l = null, c = r ? r.name : null, f = e, p = !0, h = "";
                return e || (p = !1, e = "_@r" + (O += 1)), l = (u = n(e))[0], e = u[1], l && (l = t(l, c, o), 
                s = getOwn(S, l)), e && (l ? h = i ? e : s && s.normalize ? s.normalize(e, function(e) {
                    return t(e, c, o);
                }) : -1 === e.indexOf("!") ? t(e, c, o) : e : (l = (u = n(h = t(e, c, o)))[0], h = u[1], 
                i = !0, a = w.nameToUrl(h))), {
                    prefix: l,
                    name: h,
                    parentMap: r,
                    unnormalized: !!(d = !l || s || i ? "" : "_unnormalized" + (q += 1)),
                    url: a,
                    originalName: f,
                    isDefine: p,
                    id: (l ? l + "!" + h : h) + d
                };
            }
            function a(e) {
                var t = e.id, r = getOwn(x, t);
                return r || (r = x[t] = new w.Module(e)), r;
            }
            function s(e, t, r) {
                var i = e.id, n = getOwn(x, i);
                !hasProp(S, i) || n && !n.defineEmitComplete ? (n = a(e)).error && "error" === t ? r(n.error) : n.on(t, r) : "defined" === t && r(S[i]);
            }
            function d(e, t) {
                var r = e.requireModules, i = !1;
                t ? t(e) : (each(r, function(t) {
                    var r = getOwn(x, t);
                    r && (r.error = e, r.events.error && (i = !0, r.emit("error", e)));
                }), i || req.onError(e));
            }
            function u() {
                globalDefQueue.length && (each(globalDefQueue, function(e) {
                    var t = e[0];
                    "string" == typeof t && (w.defQueueMap[t] = !0), T.push(e);
                }), globalDefQueue = []);
            }
            function l(e) {
                delete x[e], delete k[e];
            }
            function c() {
                var e, t, n = 1e3 * E.waitSeconds, o = n && w.startTime + n < new Date().getTime(), a = [], s = [], u = !1, l = !0;
                if (!m) {
                    if (m = !0, eachProp(k, function(e) {
                        var n = e.map, d = n.id;
                        if (e.enabled && (n.isDefine || s.push(e), !e.error)) if (!e.inited && o) i(d) ? u = t = !0 : (a.push(d), 
                        r(d)); else if (!e.inited && e.fetched && n.isDefine && (u = !0, !n.prefix)) return l = !1;
                    }), o && a.length) return (e = makeError("timeout", "Load timeout for modules: " + a, null, a)).contextName = w.contextName, 
                    d(e);
                    l && each(s, function(e) {
                        !function e(t, r, i) {
                            var n = t.map.id;
                            t.error ? t.emit("error", t.error) : (r[n] = !0, each(t.depMaps, function(n, o) {
                                var a = n.id, s = getOwn(x, a);
                                !s || t.depMatched[o] || i[a] || (getOwn(r, a) ? (t.defineDep(o, S[a]), t.check()) : e(s, r, i));
                            }), i[n] = !0);
                        }(e, {}, {});
                    }), o && !t || !u || !isBrowser && !isWebWorker || y || (y = setTimeout(function() {
                        y = 0, c();
                    }, 50)), m = !1;
                }
            }
            function f(e) {
                hasProp(S, e[0]) || a(o(e[0], null, !0)).init(e[1], e[2]);
            }
            function p(e, t, r, i) {
                e.detachEvent && !isOpera ? i && e.detachEvent(i, t) : e.removeEventListener(r, t, !1);
            }
            function h(e) {
                var t = e.currentTarget || e.srcElement;
                return p(t, w.onScriptLoad, "load", "onreadystatechange"), p(t, w.onScriptError, "error"), 
                {
                    node: t,
                    id: t && t.getAttribute("data-requiremodule")
                };
            }
            function g() {
                var e;
                for (u(); T.length; ) {
                    if (null === (e = T.shift())[0]) return d(makeError("mismatch", "Mismatched anonymous define() module: " + e[e.length - 1]));
                    f(e);
                }
                w.defQueueMap = {};
            }
            var m, v, w, b, y, E = {
                waitSeconds: 7,
                baseUrl: "./",
                paths: {},
                bundles: {},
                pkgs: {},
                shim: {},
                config: {}
            }, x = {}, k = {}, I = {}, T = [], S = {}, A = {}, F = {}, O = 1, q = 1;
            return b = {
                require: function(e) {
                    return e.require ? e.require : e.require = w.makeRequire(e.map);
                },
                exports: function(e) {
                    if (e.usingExports = !0, e.map.isDefine) return e.exports ? S[e.map.id] = e.exports : e.exports = S[e.map.id] = {};
                },
                module: function(e) {
                    return e.module ? e.module : e.module = {
                        id: e.map.id,
                        uri: e.map.url,
                        config: function() {
                            return getOwn(E.config, e.map.id) || {};
                        },
                        exports: e.exports || (e.exports = {})
                    };
                }
            }, (v = function(e) {
                this.events = getOwn(I, e.id) || {}, this.map = e, this.shim = getOwn(E.shim, e.id), 
                this.depExports = [], this.depMaps = [], this.depMatched = [], this.pluginMaps = {}, 
                this.depCount = 0;
            }).prototype = {
                init: function(e, t, r, i) {
                    i = i || {}, this.inited || (this.factory = t, r ? this.on("error", r) : this.events.error && (r = bind(this, function(e) {
                        this.emit("error", e);
                    })), this.depMaps = e && e.slice(0), this.errback = r, this.inited = !0, this.ignore = i.ignore, 
                    i.enabled || this.enabled ? this.enable() : this.check());
                },
                defineDep: function(e, t) {
                    this.depMatched[e] || (this.depMatched[e] = !0, this.depCount -= 1, this.depExports[e] = t);
                },
                fetch: function() {
                    if (!this.fetched) {
                        this.fetched = !0, w.startTime = new Date().getTime();
                        var e = this.map;
                        if (!this.shim) return e.prefix ? this.callPlugin() : this.load();
                        w.makeRequire(this.map, {
                            enableBuildCallback: !0
                        })(this.shim.deps || [], bind(this, function() {
                            return e.prefix ? this.callPlugin() : this.load();
                        }));
                    }
                },
                load: function() {
                    var e = this.map.url;
                    A[e] || (A[e] = !0, w.load(this.map.id, e));
                },
                check: function() {
                    if (this.enabled && !this.enabling) {
                        var e, t, r = this.map.id, i = this.depExports, n = this.exports, o = this.factory;
                        if (this.inited) {
                            if (this.error) this.emit("error", this.error); else if (!this.defining) {
                                if (this.defining = !0, this.depCount < 1 && !this.defined) {
                                    if (isFunction(o)) {
                                        if (this.events.error && this.map.isDefine || req.onError !== defaultOnError) try {
                                            n = w.execCb(r, o, i, n);
                                        } catch (t) {
                                            e = t;
                                        } else n = w.execCb(r, o, i, n);
                                        if (this.map.isDefine && void 0 === n && ((t = this.module) ? n = t.exports : this.usingExports && (n = this.exports)), 
                                        e) return e.requireMap = this.map, e.requireModules = this.map.isDefine ? [ this.map.id ] : null, 
                                        e.requireType = this.map.isDefine ? "define" : "require", d(this.error = e);
                                    } else n = o;
                                    if (this.exports = n, this.map.isDefine && !this.ignore && (S[r] = n, req.onResourceLoad)) {
                                        var a = [];
                                        each(this.depMaps, function(e) {
                                            a.push(e.normalizedMap || e);
                                        }), req.onResourceLoad(w, this.map, a);
                                    }
                                    l(r), this.defined = !0;
                                }
                                this.defining = !1, this.defined && !this.defineEmitted && (this.defineEmitted = !0, 
                                this.emit("defined", this.exports), this.defineEmitComplete = !0);
                            }
                        } else hasProp(w.defQueueMap, r) || this.fetch();
                    }
                },
                callPlugin: function() {
                    var e = this.map, r = e.id, i = o(e.prefix);
                    this.depMaps.push(i), s(i, "defined", bind(this, function(i) {
                        var n, u, c, f = getOwn(F, this.map.id), p = this.map.name, h = this.map.parentMap ? this.map.parentMap.name : null, g = w.makeRequire(e.parentMap, {
                            enableBuildCallback: !0
                        });
                        return this.map.unnormalized ? (i.normalize && (p = i.normalize(p, function(e) {
                            return t(e, h, !0);
                        }) || ""), s(u = o(e.prefix + "!" + p, this.map.parentMap, !0), "defined", bind(this, function(e) {
                            this.map.normalizedMap = u, this.init([], function() {
                                return e;
                            }, null, {
                                enabled: !0,
                                ignore: !0
                            });
                        })), void ((c = getOwn(x, u.id)) && (this.depMaps.push(u), this.events.error && c.on("error", bind(this, function(e) {
                            this.emit("error", e);
                        })), c.enable()))) : f ? (this.map.url = w.nameToUrl(f), void this.load()) : ((n = bind(this, function(e) {
                            this.init([], function() {
                                return e;
                            }, null, {
                                enabled: !0
                            });
                        })).error = bind(this, function(e) {
                            this.inited = !0, (this.error = e).requireModules = [ r ], eachProp(x, function(e) {
                                0 === e.map.id.indexOf(r + "_unnormalized") && l(e.map.id);
                            }), d(e);
                        }), n.fromText = bind(this, function(t, i) {
                            var s = e.name, u = o(s), l = useInteractive;
                            i && (t = i), l && (useInteractive = !1), a(u), hasProp(E.config, r) && (E.config[s] = E.config[r]);
                            try {
                                req.exec(t);
                            } catch (t) {
                                return d(makeError("fromtexteval", "fromText eval for " + r + " failed: " + t, t, [ r ]));
                            }
                            l && (useInteractive = !0), this.depMaps.push(u), w.completeLoad(s), g([ s ], n);
                        }), void i.load(e.name, g, n, E));
                    })), w.enable(i, this), this.pluginMaps[i.id] = i;
                },
                enable: function() {
                    (k[this.map.id] = this).enabled = !0, this.enabling = !0, each(this.depMaps, bind(this, function(e, t) {
                        var r, i, n;
                        if ("string" == typeof e) {
                            if (e = o(e, this.map.isDefine ? this.map : this.map.parentMap, !1, !this.skipMap), 
                            this.depMaps[t] = e, n = getOwn(b, e.id)) return void (this.depExports[t] = n(this));
                            this.depCount += 1, s(e, "defined", bind(this, function(e) {
                                this.undefed || (this.defineDep(t, e), this.check());
                            })), this.errback ? s(e, "error", bind(this, this.errback)) : this.events.error && s(e, "error", bind(this, function(e) {
                                this.emit("error", e);
                            }));
                        }
                        r = e.id, i = x[r], hasProp(b, r) || !i || i.enabled || w.enable(e, this);
                    })), eachProp(this.pluginMaps, bind(this, function(e) {
                        var t = getOwn(x, e.id);
                        t && !t.enabled && w.enable(e, this);
                    })), this.enabling = !1, this.check();
                },
                on: function(e, t) {
                    var r = this.events[e];
                    r || (r = this.events[e] = []), r.push(t);
                },
                emit: function(e, t) {
                    each(this.events[e], function(e) {
                        e(t);
                    }), "error" === e && delete this.events[e];
                }
            }, (w = {
                config: E,
                contextName: e,
                registry: x,
                defined: S,
                urlFetched: A,
                defQueue: T,
                defQueueMap: {},
                Module: v,
                makeModuleMap: o,
                nextTick: req.nextTick,
                onError: d,
                configure: function(e) {
                    if (e.baseUrl && "/" !== e.baseUrl.charAt(e.baseUrl.length - 1) && (e.baseUrl += "/"), 
                    "string" == typeof e.urlArgs) {
                        var t = e.urlArgs;
                        e.urlArgs = function(e, r) {
                            return (-1 === r.indexOf("?") ? "?" : "&") + t;
                        };
                    }
                    var r = E.shim, i = {
                        paths: !0,
                        bundles: !0,
                        config: !0,
                        map: !0
                    };
                    eachProp(e, function(e, t) {
                        i[t] ? (E[t] || (E[t] = {}), mixin(E[t], e, !0, !0)) : E[t] = e;
                    }), e.bundles && eachProp(e.bundles, function(e, t) {
                        each(e, function(e) {
                            e !== t && (F[e] = t);
                        });
                    }), e.shim && (eachProp(e.shim, function(e, t) {
                        isArray(e) && (e = {
                            deps: e
                        }), !e.exports && !e.init || e.exportsFn || (e.exportsFn = w.makeShimExports(e)), 
                        r[t] = e;
                    }), E.shim = r), e.packages && each(e.packages, function(e) {
                        var t;
                        t = (e = "string" == typeof e ? {
                            name: e
                        } : e).name, e.location && (E.paths[t] = e.location), E.pkgs[t] = e.name + "/" + (e.main || "main").replace(currDirRegExp, "").replace(jsSuffixRegExp, "");
                    }), eachProp(x, function(e, t) {
                        e.inited || e.map.unnormalized || (e.map = o(t, null, !0));
                    }), (e.deps || e.callback) && w.require(e.deps || [], e.callback);
                },
                makeShimExports: function(e) {
                    return function() {
                        var t;
                        return e.init && (t = e.init.apply(global, arguments)), t || e.exports && getGlobal(e.exports);
                    };
                },
                makeRequire: function(i, n) {
                    function s(t, r, u) {
                        var l, f;
                        return n.enableBuildCallback && r && isFunction(r) && (r.__requireJsBuild = !0), 
                        "string" == typeof t ? isFunction(r) ? d(makeError("requireargs", "Invalid require call"), u) : i && hasProp(b, t) ? b[t](x[i.id]) : req.get ? req.get(w, t, i, s) : (l = o(t, i, !1, !0).id, 
                        hasProp(S, l) ? S[l] : d(makeError("notloaded", 'Module name "' + l + '" has not been loaded yet for context: ' + e + (i ? "" : ". Use require([])")))) : (g(), 
                        w.nextTick(function() {
                            g(), (f = a(o(null, i))).skipMap = n.skipMap, f.init(t, r, u, {
                                enabled: !0
                            }), c();
                        }), s);
                    }
                    return n = n || {}, mixin(s, {
                        isBrowser: isBrowser,
                        toUrl: function(e) {
                            var r, n = e.lastIndexOf("."), o = e.split("/")[0];
                            return -1 !== n && (!("." === o || ".." === o) || 1 < n) && (r = e.substring(n, e.length), 
                            e = e.substring(0, n)), w.nameToUrl(t(e, i && i.id, !0), r, !0);
                        },
                        defined: function(e) {
                            return hasProp(S, o(e, i, !1, !0).id);
                        },
                        specified: function(e) {
                            return e = o(e, i, !1, !0).id, hasProp(S, e) || hasProp(x, e);
                        }
                    }), i || (s.undef = function(e) {
                        u();
                        var t = o(e, i, !0), n = getOwn(x, e);
                        n.undefed = !0, r(e), delete S[e], delete A[t.url], delete I[e], eachReverse(T, function(t, r) {
                            t[0] === e && T.splice(r, 1);
                        }), delete w.defQueueMap[e], n && (n.events.defined && (I[e] = n.events), l(e));
                    }), s;
                },
                enable: function(e) {
                    getOwn(x, e.id) && a(e).enable();
                },
                completeLoad: function(e) {
                    var t, r, n, o = getOwn(E.shim, e) || {}, a = o.exports;
                    for (u(); T.length; ) {
                        if (null === (r = T.shift())[0]) {
                            if (r[0] = e, t) break;
                            t = !0;
                        } else r[0] === e && (t = !0);
                        f(r);
                    }
                    if (w.defQueueMap = {}, n = getOwn(x, e), !t && !hasProp(S, e) && n && !n.inited) {
                        if (!(!E.enforceDefine || a && getGlobal(a))) return i(e) ? void 0 : d(makeError("nodefine", "No define call for " + e, null, [ e ]));
                        f([ e, o.deps || [], o.exportsFn ]);
                    }
                    c();
                },
                nameToUrl: function(e, t, r) {
                    var i, n, o, a, s, d, u = getOwn(E.pkgs, e);
                    if (u && (e = u), d = getOwn(F, e)) return w.nameToUrl(d, t, r);
                    if (req.jsExtRegExp.test(e)) a = e + (t || ""); else {
                        for (i = E.paths, o = (n = e.split("/")).length; 0 < o; o -= 1) if (s = getOwn(i, n.slice(0, o).join("/"))) {
                            isArray(s) && (s = s[0]), n.splice(0, o, s);
                            break;
                        }
                        a = n.join("/"), a = ("/" === (a += t || (/^data\:|^blob\:|\?/.test(a) || r ? "" : ".js")).charAt(0) || a.match(/^[\w\+\.\-]+:/) ? "" : E.baseUrl) + a;
                    }
                    return E.urlArgs && !/^blob\:/.test(a) ? a + E.urlArgs(e, a) : a;
                },
                load: function(e, t) {
                    req.load(w, e, t);
                },
                execCb: function(e, t, r, i) {
                    return t.apply(i, r);
                },
                onScriptLoad: function(e) {
                    if ("load" === e.type || readyRegExp.test((e.currentTarget || e.srcElement).readyState)) {
                        interactiveScript = null;
                        var t = h(e);
                        w.completeLoad(t.id);
                    }
                },
                onScriptError: function(e) {
                    var t = h(e);
                    if (!i(t.id)) {
                        var r = [];
                        return eachProp(x, function(e, i) {
                            0 !== i.indexOf("_@r") && each(e.depMaps, function(e) {
                                if (e.id === t.id) return r.push(i), !0;
                            });
                        }), d(makeError("scripterror", 'Script error for "' + t.id + (r.length ? '", needed by: ' + r.join(", ") : '"'), e, [ t.id ]));
                    }
                }
            }).require = w.makeRequire(), w;
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
            req = requirejs = function(e, t, r, i) {
                var n, o, a = defContextName;
                return isArray(e) || "string" == typeof e || (o = e, isArray(t) ? (e = t, t = r, 
                r = i) : e = []), o && o.context && (a = o.context), (n = getOwn(contexts, a)) || (n = contexts[a] = req.s.newContext(a)), 
                o && n.configure(o), n.require(e, t, r);
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
            req.onError = defaultOnError, req.createNode = function(e, t, r) {
                var i = e.xhtml ? document.createElementNS("http://www.w3.org/1999/xhtml", "html:script") : document.createElement("script");
                return i.type = e.scriptType || "text/javascript", i.charset = "utf-8", i.async = !0, 
                i;
            }, req.load = function(e, t, r) {
                var i, n = e && e.config || {};
                if (isBrowser) return (i = req.createNode(n, t, r)).setAttribute("data-requirecontext", e.contextName), 
                i.setAttribute("data-requiremodule", t), !i.attachEvent || i.attachEvent.toString && i.attachEvent.toString().indexOf("[native code") < 0 || isOpera ? (i.addEventListener("load", e.onScriptLoad, !1), 
                i.addEventListener("error", e.onScriptError, !1)) : (useInteractive = !0, i.attachEvent("onreadystatechange", e.onScriptLoad)), 
                i.src = r, n.onNodeCreated && n.onNodeCreated(i, n, t, r), currentlyAddingScript = i, 
                baseElement ? head.insertBefore(i, baseElement) : head.appendChild(i), currentlyAddingScript = null, 
                i;
                if (isWebWorker) try {
                    setTimeout(function() {}, 0), importScripts(r), e.completeLoad(t);
                } catch (i) {
                    e.onError(makeError("importscripts", "importScripts failed for " + t + " at " + r, i, [ t ]));
                }
            }, isBrowser && !cfg.skipDataMain && eachReverse(scripts(), function(e) {
                if (head || (head = e.parentNode), dataMain = e.getAttribute("data-main")) return mainScript = dataMain, 
                cfg.baseUrl || -1 !== mainScript.indexOf("!") || (mainScript = (src = mainScript.split("/")).pop(), 
                subPath = src.length ? src.join("/") + "/" : "./", cfg.baseUrl = subPath), mainScript = mainScript.replace(jsSuffixRegExp, ""), 
                req.jsExtRegExp.test(mainScript) && (mainScript = dataMain), cfg.deps = cfg.deps ? cfg.deps.concat(mainScript) : [ mainScript ], 
                !0;
            }), define = function(e, t, r) {
                var i, n;
                "string" != typeof e && (r = t, t = e, e = null), isArray(t) || (r = t, t = null), 
                !t && isFunction(r) && (t = [], r.length && (r.toString().replace(commentRegExp, commentReplace).replace(cjsRequireRegExp, function(e, r) {
                    t.push(r);
                }), t = (1 === r.length ? [ "require" ] : [ "require", "exports", "module" ]).concat(t))), 
                useInteractive && (i = currentlyAddingScript || getInteractiveScript()) && (e || (e = i.getAttribute("data-requiremodule")), 
                n = contexts[i.getAttribute("data-requirecontext")]), n ? (n.defQueue.push([ e, t, r ]), 
                n.defQueueMap[e] = !0) : globalDefQueue.push([ e, t, r ]);
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
        function r(r) {
            function a() {
                return t(o) || t(u);
            }
            function s() {
                try {
                    for (var e, t = "[" + r + "]", i = [], n = 0; n < arguments.length; n++) i.push(arguments[n]);
                    return e = i[0], "string" == typeof e || e instanceof String ? i[0] = t + " - " + e : i.unshift(t), 
                    i;
                } catch (e) {
                    console.error("logger", e);
                }
            }
            var d, u = n + r + ".debug";
            i = e.getWindow(), d = a(), i.addEventListener("storage", function(e) {
                e.key !== o && e.key !== u || (d = a());
            }), this.debug = function() {
                var e = s.apply(null, arguments);
                d && console.log.apply(null, e);
            }, this.error = function() {
                var e = s.apply(null, arguments);
                console.error.apply(null, e);
            };
        }
        var i, n = "oracle.content.ui.customform.", o = n + "debug";
        return r;
    }), define("sdk/dispatcher", [ "sdk/logger" ], function(e) {
        var t = new e("dispatcher"), r = 0, i = {}, n = {}, o = {};
        return {
            on: function(e, t, r) {
                n[e] = t.bind(r);
            },
            startListening: function() {
                window.addEventListener("message", this.onMessage.bind(this));
            },
            onMessage: function(e) {
                if (e.origin === this.getOrigin()) {
                    var r = e.data, a = r.type;
                    t.debug("receiving data:", e.data), r.senderId && o[r.senderId] && o[r.senderId].frame ? (t.debug("subscriber found for sender:", r.senderId), 
                    e.source === o[r.senderId].frame.contentWindow ? ("ready" === a && (t.debug("processing event customEditorReady for type:", a), 
                    n.customEditorReady.call(null, e.data.payload, r.senderId, o[r.senderId].index)), 
                    "edit" === a && (t.debug("processing event customEditorUpdate for type:", a), n.customEditorUpdate.call(null, e.data.payload, r.senderId, o[r.senderId].index)), 
                    "resize" === a && (t.debug("processing event customEditorResize for type:", a), 
                    n.customEditorResize.call(null, e.data.payload, r.senderId, o[r.senderId].index)), 
                    "replyTo" === a && (i[r.messageId] && "function" == typeof i[r.messageId].resolveCallBack ? (t.debug("processing resolve callback"), 
                    i[r.messageId].resolveCallBack.call(null, r.payload)) : t.debug("no resolve callback for message id:", r.messageId))) : t.debug("No content window found for:", r.senderId)) : ("replyTo" === r.type && (r.replyStatus && "error" === r.replyStatus.replyType ? (t.error("replyTo returned error :", r.replyStatus.message), 
                    i[r.messageId] && "function" == typeof i[r.messageId].rejectCallBack ? (t.debug("processing reject callback"), 
                    i[r.messageId].rejectCallBack.call(null, r.replyStatus.message ? r.replyStatus.message : "Error")) : t.debug("no reject callback for message id:", r.messageId)) : i[r.messageId] ? (i[r.messageId].callBack && "function" == typeof i[r.messageId].callBack && i[r.messageId].callBack.call(null, r.payload), 
                    "function" == typeof i[r.messageId].resolveCallBack && (t.debug("processing resolve callback"), 
                    i[r.messageId].resolveCallBack.call(null, r.payload))) : t.debug("no resolve callback for message id:", r.messageId)), 
                    "function" == typeof n[a] && (t.debug("processing event", a), n[a].call(null, e.data.payload, e.data.messageId)));
                }
            },
            getSenderId: function() {
                return window.location.hash.slice(1);
            },
            send: function(e, r) {
                r = r || {};
                var i = {
                    type: e,
                    payload: r,
                    senderId: this.getSenderId()
                };
                t.debug("sending:", i), this.getTargetWindow().postMessage(i, this.getOrigin());
            },
            sendToSubscriber: function(e, r, i) {
                var n = {
                    type: r,
                    payload: i,
                    senderId: e
                }, a = o[e];
                if (!a || !a.frame || !a.frame.contentWindow) throw new Error("There is no target window corresponding to subscriber :", e);
                a.frame.contentWindow.postMessage(n, this.getOrigin()), t.debug("sending data " + n + " to subscriber " + e);
            },
            replyTo: function(e, r, i) {
                var n = {
                    type: "replyTo",
                    payload: r,
                    messageId: e,
                    senderId: this.getSenderId(),
                    replyStatus: i
                };
                t.debug("sending:", n), this.getTargetWindow().postMessage(n, this.getOrigin());
            },
            sendAndWait: function(e, n) {
                return new Promise(function(o, a) {
                    n = n || {}, r++, i[r] = {
                        resolveCallBack: o,
                        rejectCallBack: a,
                        callBack: n && n.callBack ? n.callBack : void 0
                    }, delete n.callBack;
                    var s = {
                        type: e,
                        payload: n,
                        senderId: this.getSenderId(),
                        messageId: r
                    };
                    t.debug("sending:", s), this.getTargetWindow().postMessage(s, this.getOrigin());
                }.bind(this));
            },
            sendToSubscriberAndWait: function(e, t, n) {
                var a = o[e];
                if (!a || !a.frame || !a.frame.contentWindow) throw new Error("There is no target window corresponding to subscriber :", e);
                return new Promise(function(e, o) {
                    n = n || {}, r++, i[r] = {
                        resolveCallBack: e,
                        rejectCallBack: o
                    };
                    var s = {
                        type: t,
                        payload: n,
                        messageId: r
                    };
                    a.frame.contentWindow.postMessage(s, this.getOrigin());
                }.bind(this));
            },
            getTargetWindow: function() {
                return window.parent;
            },
            getOrigin: function() {
                return window.origin;
            },
            addToSubscriber: function(e, r) {
                o[e] = {
                    frame: r.frame,
                    index: r.index
                }, t.debug("adding " + e + " to subscribers list");
            }
        };
    }), define("sdk/storage", [ "sdk/logger" ], function(e) {
        var t = new e("storage"), r = {};
        return {
            put: function(e, i) {
                if (!e || !i) throw new Error("key and value should be present");
                r[e] = i, t.debug("Adding key: " + e + " to storage");
            },
            get: function(e) {
                if (!e) throw new Error("key should be present");
                return t.debug("Getting value for key: " + e + " from storage"), r[e];
            },
            delete: function(e) {
                e && (t.debug("Remove value for key: " + e + " from storage"), delete r[e]);
            }
        };
    }), define("sdk/CustomEditor", [ "sdk/dispatcher", "sdk/logger" ], function(e, t) {
        var r = new t("CustomEditor");
        return function(t) {
            t = t || {};
            var i = {}, n = t.frame, o = t.editorValue, a = t.customEditor, s = t.frameId, d = {
                ready: !1
            };
            this.getCustomEditorInfo = function() {
                var e = t.customEditor;
                return e.widgetId = s, Object.freeze(e);
            }, this.setEditorReady = function() {
                Object.isFrozen(d) || (d.ready = !0, Object.freeze(d), i.editorReady && (r.debug("Triggering custom editor ready"), 
                i.editorReady.call(null)));
            }, this.triggerChange = function(e) {
                o = e, i.change && (i.change.call(null, e), r.debug("Triggering custom editor value changed, new value :" + e));
            }, this.getValue = function() {
                return o;
            }, this.on = function(e, t) {
                i[e] = t;
            }, this.getFrame = function() {
                return n;
            }, this.setDisabled = function(t) {
                if (!d.ready) throw new Error("Can not disable editor that is not ready");
                e.sendToSubscriber(s, "disable", t);
            }, this.validate = function() {
                if (!d.ready) throw new Error("Editor should be ready inorder to validate");
                return !a || !a.hasOwnProperty("validation") || !a.validation ? new Promise(function(e) {
                    e({
                        isValid: !0
                    });
                }) : e.sendToSubscriberAndWait(s, "validate").then(function(e) {
                    r.debug("Editor validation retuned :" + e);
                    var t = !e || !e.hasOwnProperty("isValid") || e.isValid, i = {
                        isValid: t
                    };
                    if (!t) {
                        var n = !!(e && e.hasOwnProperty("error") && e.error.hasOwnProperty("title")), o = !!(e && e.hasOwnProperty("error") && e.error.hasOwnProperty("message"));
                        i.errorMessageSummary = n ? e.error.title : "Invalid value", i.errorMessageDetail = o ? e.error.message : "Invalid value";
                    }
                    return new Promise(function(e) {
                        e(i);
                    });
                });
            }, this.resizeEditorFrame = function(e, t) {
                if (!d.ready) throw new Error("Editor should be ready inorder to resize");
                if (e) {
                    var o = e.width ? e.width : 0, a = e.height ? e.height : 0;
                    o = "number" == typeof o ? o += "px" : o, a = "number" == typeof a ? a += "px" : a, 
                    n.style.width = o, n.style.height = a, t && t.notify && i.editorResized && (r.debug("Triggering custom editor ready"), 
                    i.editorResized.call(null, {
                        width: o,
                        height: a
                    })), r.debug("Resizing custom editor frame to width:" + o + " ,height:" + a);
                }
            };
        };
    }), define("sdk/dataTypes", [], function() {
        var e = {
            TEXT: "text",
            LARGETEXT: "largetext",
            REFERENCE: "reference",
            DATETIME: "datetime",
            NUMBER: "number",
            DECIMAL: "decimal",
            BOOLEAN: "boolean",
            JSON: "json"
        };
        return Object.freeze(e);
    }), define("sdk/Field", [ "sdk/dispatcher", "sdk/storage", "sdk/CustomEditor", "sdk/dataTypes", "sdk/logger" ], function(e, t, r, i, n) {
        function o(e, t) {
            return u++, "_widget_" + e + "_" + t + "_" + u;
        }
        function a(e, t) {
            if (!e || !t) return null;
            var r = t.filter(function(t) {
                return t.id === e;
            });
            return r && r.length > 0 ? r[0] : null;
        }
        function s(r, i, n, o, a) {
            t.put(r, {
                fieldId: i,
                widget: a
            }), e.addToSubscriber(r, {
                frame: n,
                index: o
            });
        }
        var d = new n("Field"), u = 0;
        return function(t) {
            function n(t) {
                var r = {
                    nodeName: h,
                    value: c,
                    isField: !0,
                    options: t
                };
                d.debug("Notifying UI that the field value has changed:", r), e.send("edit", r);
            }
            if (d.debug("Field received params :", t), !t || !t.definition) {
                var u = "Unable to initialize Field - invalid  parameter: no field definition provided";
                throw d.error(u), new Error(u);
            }
            var l = {}, c = t.value, f = t.definition, p = f.id, h = f.name, g = f.datatype, m = "list" === f.valuecount, v = (f.valuecount, 
            t.availableCustomEditors);
            this.on = function(e, t) {
                l[e] = t;
            }, this.getDefinition = function() {
                return Object.freeze(f);
            }, this.createCustomEditor = function(e, t) {
                t = t || {};
                var i = a(e, v), n = t.width ? t.width : "100%", u = t.height ? t.height : "0", l = t.index;
                if (i) try {
                    var f = o(p, i.id), g = document.createElement("iframe"), m = "/_themes/_components/" + i.id + "/publish/assets/edit.html#" + f;
                    g.setAttribute("src", m), g.setAttribute("frameborder", 0), g.style.height = u, 
                    g.style.width = n;
                    var w = void 0 === l || isNaN(l) ? c : c && c.length && c.length > l ? c[l] : void 0, b = new r({
                        frame: g,
                        frameId: f,
                        fieldId: p,
                        customEditor: i,
                        editorValue: w
                    });
                    return s(f, p, g, l, b), d.debug("custom editor frame is built for editor " + e), 
                    b;
                } catch (t) {
                    throw d.debug("Failed to build custom editor frame for editor " + e), new Error("Failed to build custom editor frame for editor :" + t.message);
                } else new Error("No custom editor named " + e + " applicable for field " + h);
            }, this.removeValueAt = function(e, t) {
                if (t = t || {}, !m) throw new Error("Field" + h + " is not a multi valued field");
                if (void 0 === e || isNaN(e) || e < 0) throw new Error("Invalid index passed :" + e);
                c && Array.isArray(c) && c.length > e && (c.splice(e, 1), n(t));
            }, this.getValueAt = function(e) {
                if (!m) throw new Error("Field" + h + " is not a multi valued field");
                if (void 0 === e || isNaN(e) || e < 0) throw new Error("Invalid index passed :" + e);
                var t;
                return c && Array.isArray(c) && c.length > e && (t = c[e]), t;
            }, this.setValueAt = function(e, t, r) {
                if (r = r || {}, void 0 === e || isNaN(e) || e < 0) throw new Error("Invalid index passed :" + e);
                if (!m) throw new Error("Field" + h + " is not a multi valued field");
                !c && m && (c = []), c[e] = t, n(r);
            }, this.validate = function(t, r) {
                if (r = r || {}, m && r.hasOwnProperty("index") && (void 0 === r.index || isNaN(r.index) || r.index < 0)) throw new Error("Invalid index passed :" + r.index);
                return e.sendAndWait("validateField", {
                    fieldValue: t,
                    fieldName: h,
                    options: r
                });
            }, this.setValue = function(e, t) {
                c = e, t = t || {}, t.notifyForm ? l.update && (d.debug("Notifying the form to update the value for field:" + h + "with value: " + c), 
                l.update.call(null, c)) : n(t);
            }, this.getValue = function() {
                return c;
            }, this.openAssetPicker = function(t) {
                var r = g;
                if (r !== i.REFERENCE && r !== i.LARGETEXT) throw new Error("Opening asset picker is not supported for field with data type " + r);
                return t = t || void 0, e.sendAndWait("openAssetPicker", {
                    options: t,
                    fieldName: h
                });
            }, this.openLinkDialog = function(t) {
                var r = g;
                if (r !== i.LARGETEXT) throw new Error("Opening link dialog is not supported for field with data type " + r);
                return t = t || {}, e.sendAndWait("openLinkDialog", {
                    options: t,
                    fieldName: h
                });
            };
        };
    }), define("sdk/Type", [ "sdk/logger" ], function(e) {
        var t = new e("Type");
        return function(e) {
            if (!e || !e.name) {
                var r = "Unable to initialize Type - invalid  parameter: no name provided";
                throw t.error(r), new Error(r);
            }
            if (!e.typeCategory) {
                var r = "Unable to initialize Type - invalid  parameter: no typeCategory provided";
                throw t.error(r), new Error(r);
            }
            e.allowedFileTypes && (this.allowedFileTypes = e.allowedFileTypes), this.name = e.name, 
            this.description = e.description, this.displayName = e.displayName, this.typeCategory = e.typeCategory, 
            this.getSlug = function() {
                return Object.freeze(e.slug);
            }, this.getGroups = function() {
                return Object.freeze(e.groups);
            }, this.getCaasTranslations = function() {
                return Object.freeze(e["caas-translations"]);
            };
        };
    }), define("sdk/Item", [ "sdk/Field", "sdk/Type", "sdk/dispatcher", "sdk/logger" ], function(e, t, r, i) {
        function n(e) {
            s.debug("Notifying UI that the item property value has changed:", e), r.send("edit", e);
        }
        function o(e, t) {
            return e = e || [], e.some(function(e) {
                return e.value === t;
            });
        }
        function a(e, t) {
            return -1 !== t.map(function(e) {
                return e.toLowerCase();
            }).indexOf(e ? e.toLowerCase() : null);
        }
        var s = new i("Item");
        return function(t) {
            function i(e) {
                c = e.id, f = e.type, p = e.name, h = e.description, g = e.slug, m = e.language, 
                v = e.translatable, w = e.languageIsMaster, b = e.version, y = e.isPublished, E = e.scheduled, 
                x = e.status, k = e.createdDate, I = e.createdBy, T = e.updatedDate, S = e.updatedBy, 
                A = e.repositoryId, F = e.latestVersion, O = e.currentVersion, q = e.mimeType, N = e.fileGroup, 
                C = e.varSetId, D = e.fileExtension, M = e.versionInfo, R = e.publishInfo, P = e.tags, 
                j = e.collections, B = e.channels, z = e.publishedChannels, V = e.taxonomies, L = e.isNew;
            }
            function d() {
                return {
                    id: c,
                    type: f,
                    name: p,
                    description: h,
                    createdBy: I,
                    createdDate: k,
                    updatedBy: S,
                    updatedDate: T,
                    slug: g,
                    repositoryId: A,
                    language: m,
                    translatable: v,
                    status: x,
                    isPublished: y,
                    scheduled: E,
                    languageIsMaster: w,
                    version: b,
                    currentVersion: O,
                    latestVersion: F,
                    mimeType: q,
                    fileGroup: N,
                    varSetId: C,
                    fileExtension: D
                };
            }
            function u(e) {
                s.debug("Item update recived data: ", e), i(e), e.formOptions && (K = e.formOptions);
                var t = e.fieldData;
                t && Array.isArray(t) && t.forEach(function(e) {
                    var t = e.definition.id, r = e.value, i = J.filter(function(e) {
                        return e.getDefinition().id === t;
                    }), n = i && i.length > 0 ? i[0] : null;
                    n && (s.debug("Syncing field value for field : " + e.definition.name + " with value " + r), 
                    n.setValue(r, {
                        notifyForm: !0
                    }));
                }), Q.update && (s.debug("Notifying the form to update the item with itemData:" + d()), 
                Q.update.call(null, d()));
            }
            if (!t) {
                var l = "Unable to initialize Item - invalid  parameter:" + t;
                throw s.error(l), new Error(l);
            }
            if (!t.contentType) throw s.error("Type must be  provided"), new Error("Type must be  provided");
            r.on("update", u);
            var c, f, p, h, g, m, v, w, b, y, E, x, k, I, T, S, A, F, O, q, N, C, D, M, R, P, j, B, z, V, L, U = t.contentType, W = U.getSlug(), Q = (W && W.enabled, 
            {}), _ = t.itemData, G = _.fieldData, K = t.formOptions, $ = _.languageOptions, X = _.nativeFileOptions;
            i(_);
            var J = G.map(function(t) {
                return new e(t);
            });
            this.getFormOptions = function() {
                return Object.freeze(K);
            }, this.get = function() {
                return d();
            }, this.on = function(e, t) {
                Q[e] = t;
            }, this.isNew = function() {
                return L;
            }, this.getLanguageOptions = function() {
                return $;
            }, this.getFields = function() {
                return J;
            }, this.getFieldByName = function(e) {
                var t = J.filter(function(t) {
                    return t.getDefinition().name === e;
                });
                return t && t.length > 0 ? t[0] : null;
            }, this.getFieldById = function(e) {
                var t = J.filter(function(t) {
                    return t.getDefinition().id === e;
                });
                return t && t.length > 0 ? t[0] : null;
            }, this.setName = function(e, t) {
                if (K && !K.supportsSetName) throw new Error("Form does not support changing name");
                t = t || {}, p = e, n({
                    nodeName: "name",
                    value: p,
                    options: t
                });
            }, this.validateName = function(e) {
                return r.sendAndWait("validateItemName", {
                    value: e
                });
            }, this.setDescription = function(e, t) {
                if (K && !K.supportsSetDescription) throw new Error("Form does not support changing description .");
                t = t || {}, h = e, n({
                    nodeName: "description",
                    value: h,
                    options: t
                });
            }, this.validateDescription = function(e) {
                return r.sendAndWait("validateItemDescription", {
                    value: e
                });
            }, this.setSlug = function(e, t) {
                if (K && !K.supportsSetSlug) throw new Error("Form does not support changing slug.");
                t = t || {}, g = e, n({
                    nodeName: "slug",
                    value: g,
                    options: t
                });
            }, this.validateSlug = function(e) {
                return r.sendAndWait("validateItemSlug", {
                    value: e
                });
            }, this.setLanguage = function(e, t) {
                if (K && !K.supportsSetLanguage) throw new Error("Form does not support changing language.");
                if (t = t || {}, y || E) throw new Error("Form does not support changing language as the asset is either published or scheduled for publish.");
                if (!o($, e)) throw new Error('Invalid Language "' + e + '" passed');
                m = e, n({
                    nodeName: "language",
                    value: m,
                    options: t
                });
            }, this.validateLanguage = function(e) {
                return r.sendAndWait("validateItemLanguage", {
                    value: e
                });
            }, this.setTranslatable = function(e, t) {
                if (K && !K.supportsSetTranslatable) throw new Error("Form does not support changing translatable.");
                if (t = t || {}, !this.isNew()) throw new Error("Translatbale property cannot be modified for an existing item");
                if ("boolean" != typeof e) throw new Error("Translatbale property must be boolean");
                e = e, n({
                    nodeName: "translatable",
                    value: e,
                    options: t
                });
            }, this.getVersionInfo = function() {
                return Promise.resolve(M);
            }, this.getPublishInfo = function() {
                return Promise.resolve(R);
            }, this.getTags = function() {
                return Promise.resolve(P);
            }, this.getCollections = function() {
                return Promise.resolve(j);
            }, this.getChannels = function() {
                return Promise.resolve(B);
            }, this.getPublishedChannels = function() {
                return Promise.resolve(z);
            }, this.getTaxonomies = function() {
                return Promise.resolve(V);
            }, this.addChannels = function(e, t) {
                if (K && !K.supportsSetMetaData) throw new Error("Form does not support adding channels.");
                if (!Array.isArray(e)) throw new Error("Channels must be an array");
                t = t || {}, n({
                    nodeName: "channels",
                    operation: "add",
                    value: {
                        channels: e
                    },
                    options: t
                });
            }, this.removeChannels = function(e, t) {
                if (K && !K.supportsSetMetaData) throw new Error("Form does not support removing channels.");
                if (!Array.isArray(e)) throw new Error("Channels must be an array");
                t = t || {}, n({
                    nodeName: "channels",
                    operation: "remove",
                    value: {
                        channels: e
                    },
                    options: t
                });
            }, this.addTags = function(e, t) {
                if (K && !K.supportsSetMetaData) throw new Error("Form does not support adding tags.");
                if (!Array.isArray(e)) throw new Error("Tags must be an array");
                t = t || {}, n({
                    nodeName: "tags",
                    operation: "add",
                    value: {
                        tags: e
                    },
                    options: t
                });
            }, this.removeTags = function(e, t) {
                if (K && !K.supportsSetMetaData) throw new Error("Form does not support removing tags.");
                if (!Array.isArray(e)) throw new Error("Tags must be an array");
                t = t || {}, n({
                    nodeName: "tags",
                    operation: "remove",
                    value: {
                        tags: e
                    },
                    options: t
                });
            }, this.addCollections = function(e, t) {
                if (K && !K.supportsSetMetaData) throw new Error("Form does not support adding collections.");
                if (!Array.isArray(e)) throw new Error("Collections must be an array");
                t = t || {}, n({
                    nodeName: "collections",
                    operation: "add",
                    value: {
                        collections: e
                    },
                    options: t
                });
            }, this.removeCollections = function(e, t) {
                if (K && !K.supportsSetMetaData) throw new Error("Form does not support removing collections.");
                if (!Array.isArray(e)) throw new Error("Collections must be an array");
                t = t || {}, n({
                    nodeName: "collections",
                    operation: "remove",
                    value: {
                        collections: e
                    },
                    options: t
                });
            }, this.addCategories = function(e, t, r) {
                if (K && !K.supportsSetMetaData) throw new Error("Form does not support adding categories.");
                if (!e) throw new Error("Taxonomy is missing");
                if (Array.isArray(e)) throw new Error("Taxonomy must not be an array");
                if (!Array.isArray(t)) throw new Error("Categories must be an array");
                r = r || {}, n({
                    nodeName: "categories",
                    operation: "add",
                    value: {
                        taxonomy: e,
                        categories: t
                    },
                    options: r
                });
            }, this.removeCategories = function(e, t, r) {
                if (K && !K.supportsSetMetaData) throw new Error("Form does not support removing categories.");
                if (!e) throw new Error("Taxonomy is missing");
                if (Array.isArray(e)) throw new Error("Taxonomy must not be an array");
                if (!Array.isArray(t)) throw new Error("Categories must be an array");
                r = r || {}, n({
                    nodeName: "categories",
                    operation: "remove",
                    value: {
                        taxonomy: e,
                        categories: t
                    },
                    options: r
                });
            }, this.getNativeFileOptions = function() {
                return X;
            }, this.setNativeFile = function(e, t) {
                if (K && !K.supportsSetNativeFile) throw new Error("Form does not support setting native file");
                if (e && !(e instanceof File)) throw new Error('Unable to setNativeFile - invalid  parameter: "file" should be an instance of File');
                var r = e.name ? e.name.split(".").pop() : "";
                if (!a(r, U.allowedFileTypes)) throw new Error(r + " file type is not supported");
                t = t || {}, n({
                    nodeName: "nativefile",
                    value: e,
                    options: t
                });
            }, this.setSourceId = function(e, t) {
                if (K && !K.supportsSetNativeFile) throw new Error("Form does not support setting sourceId");
                if (!e) throw new Error("Unable to set sourceId - invalid  parameter: no sourceId provided");
                t = t || {}, n({
                    nodeName: "sourceId",
                    value: e,
                    options: t
                });
            }, this.validateNativeFile = function(e) {
                if (K && !K.supportsSetNativeFile) throw new Error("Form does not support validate native file");
                if (!(e && e instanceof File)) throw new Error('Unable to validate file - invalid  parameter: "file" should be an instance of File');
                return r.sendAndWait("validateNativeFile", {
                    value: e
                });
            }, this.openDocumentPicker = function(e) {
                if (K && !K.supportsSetNativeFile) throw new Error("Form does not support opening document picker");
                return e = e || {}, r.sendAndWait("openDocumentPicker", {
                    options: e
                });
            }, this.validateDocument = function(e) {
                if (K && !K.supportsSetNativeFile) throw new Error("Form does not support validate document");
                if (!e || !e.name) throw new Error("Unable to validate document - invalid  parameter: document should have name");
                return r.sendAndWait("validateDocument", {
                    value: e
                });
            }, this.setDocument = function(e, t) {
                if (K && !K.supportsSetNativeFile) throw new Error("Form does not support setting document");
                if (!e || !e.id) throw new Error("Unable to setDocument - invalid  parameter: document object not passed");
                var r = e.name ? e.name.split(".").pop() : "";
                if (!a(r, U.allowedFileTypes)) throw new Error(r + " file type is not supported");
                t = t || {}, n({
                    nodeName: "document",
                    value: e,
                    options: t
                });
            };
        };
    }), define("sdk/api", [ "sdk/Item", "sdk/Type", "sdk/dataTypes", "sdk/dispatcher", "sdk/logger" ], function(e, t, r, i, n) {
        var o = new n("sdk");
        return function(n, a) {
            a = a || {};
            var s;
            if (!n) throw s = "Unable to initialize sdk - no initialization parameters were received", 
            new Error(s);
            var d = document.querySelector("body");
            if (!n.contentItemData || !n.contentTypeData) throw s = 'Unable to initialize sdk - invalid  parameter: "contentItemData" and "contentTypeData', 
            o.error(s), new Error(s);
            var u = n.contentItemData, l = n.contentTypeData, c = n.formOptions, f = n.locale, p = n.repositoryId, h = n.repositoryDefaultLanguage, g = new t(l), m = new e({
                itemData: u,
                contentType: g,
                formOptions: c
            });
            this.getType = function() {
                return g;
            }, this.getItem = function() {
                return m;
            }, this.getLocale = function() {
                return f;
            }, this.getRepositoryId = function() {
                return p;
            }, this.getRepositoryDefaultLanguage = function() {
                return h;
            }, this.previewAsset = function(e) {
                if (!e || !e.id) throw new Error('Invalid params. {"id" : "<id of asset>" must be provided to open asset preview.');
                return i.send("previewAsset", e);
            }, this.isMediaEditable = function(e) {
                if (!e || !e.id) throw new Error('Invalid params. {"id" : "<id of asset>" must be provided to check if its media can be edited');
                return i.sendAndWait("isMediaEditable", e);
            }, this.editMedia = function(e) {
                if (!e || !e.id) throw new Error('Invalid params. {"id" : "<id of asset>" must be provided to edit asset media');
                return i.sendAndWait("openMediaEditDrawer", e);
            }, this.isAssetEditable = function(e) {
                if (!e || !e.id) throw new Error('Invalid params. {"id" : "<id of asset>" must be provided to check if asset can be edited');
                return i.sendAndWait("isAssetEditable", e);
            }, this.editAsset = function(e) {
                if (!e || !e.id) throw new Error('Invalid params. {"id" : "<id of asset>" must be provided to edit asset');
                return i.sendAndWait("openEditItemDrawer", e);
            }, this.createAsset = function(e) {
                return i.sendAndWait("openCreateItemDrawer", e);
            }, this.resize = function(e) {
                if (!e) {
                    var t = d.getBoundingClientRect();
                    e = {
                        width: t.width + "px",
                        height: t.height + "px"
                    };
                }
                i.send("resize", {
                    width: e.width,
                    height: e.height
                });
            };
            var v, w;
            this.registerFormValidation = function(e, t) {
                v = e, t = t || {}, w = t.message || "";
            }, this.isFormValid = function() {
                if ("function" != typeof v) return o.debug("Unable to validate value: no validation function has been registered"), 
                {
                    isValid: !0
                };
                try {
                    return o.debug("Evaluating custom validation function for item :", m), Promise.resolve(v.call(this, m)).then(function(e) {
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
                                    message: e.message || w
                                }
                            });
                        }
                        if (!t) {
                            var r = 'Validation function must return a boolean, or an object with an "isValid" boolean property';
                            throw o.error(r), new Error(r);
                        }
                        return t.error = t.error || {}, t;
                    });
                } catch (e) {
                    o.error("Validation function failed unexpectedly:", e);
                }
            }, this.dataTypes = r;
        };
    }), define("sdk/api/init", [ "sdk/api", "sdk/dispatcher", "sdk/storage", "sdk/logger" ], function(e, t, r, i) {
        var n, o = new i("init");
        return {
            onInit: function(t, r) {
                return o.debug("Received initialization data:", r), n = new e(r), "function" == typeof t && t.apply(null, [ n ]), 
                n;
            },
            onCustomEditorReady: function(e, i, a) {
                if (!i || !r.get(i)) throw o.error("There is no sender info to process ready message"), 
                new Error("There is no sender info to process ready message");
                var s = n.getItem(), d = s.getFields(), u = n.getLocale(), l = r.get(i), c = l.fieldId, f = s.getFieldById(c);
                if (!f) throw o.error("There is no matching field for fieldId:", l.fieldId), new Error("There is no matching field for fieldId:", l.fieldId);
                var p = [];
                d.forEach(function(e) {
                    var t = e.getDefinition();
                    p.push({
                        id: t.id,
                        name: t.name,
                        dataType: t.datatype,
                        value: e.getValue(),
                        defaultValue: t.defaultValue
                    });
                });
                var h = p.filter(function(e) {
                    return c === e.id;
                }), g = h.length ? h[0] : null;
                g && void 0 !== a && a >= 0 && (g.index = a);
                var m = l.widget;
                if (!m) throw o.error("There is no custom editor widget for sender:", i), new Error("There is no custom editor widget for sender:", i);
                var v = m.getCustomEditorInfo(), w = f.getDefinition().settings || {}, b = !!w.caas.editor.hasOwnProperty("isCustom") && w.caas.editor.hasOwnProperty("isCustom"), y = b ? w.caas.editor.options.settings || {} : {}, E = !!v.hasOwnProperty("autoresize") && v.autoresize;
                (v.settings || []).filter(function(e) {
                    return "value" === e.type;
                }).forEach(function(e) {
                    y[e.id] = e.value;
                });
                var x = {
                    locale: u,
                    fields: p,
                    field: g,
                    editor: {
                        settings: y,
                        autoresize: E,
                        parameters: {}
                    }
                };
                t.sendToSubscriber(i, "init", x), m && m.setEditorReady(!0);
            },
            onCustomEditorUpdate: function(e, t, i) {
                if (!t || !r.get(t)) throw o.error("There is no sender info to process editor update message"), 
                new Error("There is no sender info to process editor update message");
                var a = r.get(t), s = a.widget, d = n.getItem(), u = d.getFieldById(a.fieldId), l = e.value, c = u.getDefinition();
                if (!u || !s) throw o.error("There is no matching field for fieldId:", a.fieldId), 
                new Error("There is no matching field for fieldId:", a.fieldId);
                void 0 !== i && i >= 0 ? (o.debug("Value changing for field " + c.name + " at index " + i + " with value " + l), 
                s.triggerChange(l)) : (o.debug("Value changing for field " + c.name + " with value " + l), 
                s.triggerChange(l));
            },
            onCustomEditorResize: function(e, t, i) {
                if (!t || !r.get(t)) throw o.error("There is no sender info to process custom editor resize"), 
                new Error("There is no sender info to process custom editor resize");
                var n = r.get(t), a = n.widget;
                a && a.resizeEditorFrame(e, {
                    notify: !0
                });
            },
            onValidateForm: function(e, r) {
                if (o.debug("Received a validation request"), !n) return void o.debug('Ignoring incoming "validate" message: "init" not received yet');
                var i = n.isFormValid();
                return Promise.resolve(i).then(function(e) {
                    var i = {
                        isValid: e.isValid
                    };
                    e.error && (i.error = e.error), t.replyTo(r, i);
                }, function() {
                    o.error("Custom validation should not return a rejected promise");
                }).catch(function(e) {
                    o.error("Validation failed:", e);
                });
            },
            init: function(e) {
                t.on("init", this.onInit.bind(this, e)), t.on("validateForm", this.onValidateForm), 
                t.on("customEditorReady", this.onCustomEditorReady), t.on("customEditorUpdate", this.onCustomEditorUpdate), 
                t.on("customEditorResize", this.onCustomEditorResize), t.startListening(), o.debug('sending "formReady" message'), 
                t.send("formReady");
            }
        };
    }), define("sdk/ui", [ "sdk/api/init" ], function(e) {
        return {
            init: function(t) {
                e.init(t);
            }
        };
    }), contentFormSDK.init = function(e) {
        require([ "sdk/ui" ], function(t) {
            t.init(e);
        }, function(e) {
            console.error("Error loading content form sdk module:", e);
        });
    }, contentFormSDK;
});