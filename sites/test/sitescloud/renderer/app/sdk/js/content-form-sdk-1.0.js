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
                var n, r, o, a, s, d, u, c, l, f, p = t && t.split("/"), h = E.map, g = h && h["*"];
                if (e && (d = (e = e.split("/")).length - 1, E.nodeIdCompat && jsSuffixRegExp.test(e[d]) && (e[d] = e[d].replace(jsSuffixRegExp, "")), 
                "." === e[0].charAt(0) && p && (e = p.slice(0, p.length - 1).concat(e)), function(e) {
                    var t, i;
                    for (t = 0; t < e.length; t++) if ("." === (i = e[t])) e.splice(t, 1), t -= 1; else if (".." === i) {
                        if (0 === t || 1 === t && ".." === e[2] || ".." === e[t - 1]) continue;
                        0 < t && (e.splice(t - 1, 2), t -= 2);
                    }
                }(e), e = e.join("/")), i && h && (p || g)) {
                    e: for (o = (r = e.split("/")).length; 0 < o; o -= 1) {
                        if (s = r.slice(0, o).join("/"), p) for (a = p.length; 0 < a; a -= 1) if ((n = getOwn(h, p.slice(0, a).join("/"))) && (n = getOwn(n, s))) {
                            u = n, c = o;
                            break e;
                        }
                        !l && g && getOwn(g, s) && (l = getOwn(g, s), f = o);
                    }
                    !u && l && (u = l, c = f), u && (r.splice(0, c, u), e = r.join("/"));
                }
                return getOwn(E.pkgs, e) || e;
            }
            function i(e) {
                isBrowser && each(scripts(), function(t) {
                    if (t.getAttribute("data-requiremodule") === e && t.getAttribute("data-requirecontext") === b.contextName) return t.parentNode.removeChild(t), 
                    !0;
                });
            }
            function n(e) {
                var t = getOwn(E.paths, e);
                if (t && isArray(t) && 1 < t.length) return t.shift(), b.require.undef(e), b.makeRequire(null, {
                    skipMap: !0
                })([ e ]), !0;
            }
            function r(e) {
                var t, i = e ? e.indexOf("!") : -1;
                return -1 < i && (t = e.substring(0, i), e = e.substring(i + 1, e.length)), [ t, e ];
            }
            function o(e, i, n, o) {
                var a, s, d, u, c = null, l = i ? i.name : null, f = e, p = !0, h = "";
                return e || (p = !1, e = "_@r" + (R += 1)), c = (u = r(e))[0], e = u[1], c && (c = t(c, l, o), 
                s = getOwn(S, c)), e && (c ? h = n ? e : s && s.normalize ? s.normalize(e, function(e) {
                    return t(e, l, o);
                }) : -1 === e.indexOf("!") ? t(e, l, o) : e : (c = (u = r(h = t(e, l, o)))[0], h = u[1], 
                n = !0, a = b.nameToUrl(h))), {
                    prefix: c,
                    name: h,
                    parentMap: i,
                    unnormalized: !!(d = !c || s || n ? "" : "_unnormalized" + (M += 1)),
                    url: a,
                    originalName: f,
                    isDefine: p,
                    id: (c ? c + "!" + h : h) + d
                };
            }
            function a(e) {
                var t = e.id, i = getOwn(x, t);
                return i || (i = x[t] = new b.Module(e)), i;
            }
            function s(e, t, i) {
                var n = e.id, r = getOwn(x, n);
                !hasProp(S, n) || r && !r.defineEmitComplete ? (r = a(e)).error && "error" === t ? i(r.error) : r.on(t, i) : "defined" === t && i(S[n]);
            }
            function d(e, t) {
                var i = e.requireModules, n = !1;
                t ? t(e) : (each(i, function(t) {
                    var i = getOwn(x, t);
                    i && (i.error = e, i.events.error && (n = !0, i.emit("error", e)));
                }), n || req.onError(e));
            }
            function u() {
                globalDefQueue.length && (each(globalDefQueue, function(e) {
                    var t = e[0];
                    "string" == typeof t && (b.defQueueMap[t] = !0), T.push(e);
                }), globalDefQueue = []);
            }
            function c(e) {
                delete x[e], delete k[e];
            }
            function l() {
                var e, t, r = 1e3 * E.waitSeconds, o = r && b.startTime + r < new Date().getTime(), a = [], s = [], u = !1, c = !0;
                if (!m) {
                    if (m = !0, eachProp(k, function(e) {
                        var r = e.map, d = r.id;
                        if (e.enabled && (r.isDefine || s.push(e), !e.error)) if (!e.inited && o) n(d) ? u = t = !0 : (a.push(d), 
                        i(d)); else if (!e.inited && e.fetched && r.isDefine && (u = !0, !r.prefix)) return c = !1;
                    }), o && a.length) return (e = makeError("timeout", "Load timeout for modules: " + a, null, a)).contextName = b.contextName, 
                    d(e);
                    c && each(s, function(e) {
                        !function e(t, i, n) {
                            var r = t.map.id;
                            t.error ? t.emit("error", t.error) : (i[r] = !0, each(t.depMaps, function(r, o) {
                                var a = r.id, s = getOwn(x, a);
                                !s || t.depMatched[o] || n[a] || (getOwn(i, a) ? (t.defineDep(o, S[a]), t.check()) : e(s, i, n));
                            }), n[r] = !0);
                        }(e, {}, {});
                    }), o && !t || !u || !isBrowser && !isWebWorker || w || (w = setTimeout(function() {
                        w = 0, l();
                    }, 50)), m = !1;
                }
            }
            function f(e) {
                hasProp(S, e[0]) || a(o(e[0], null, !0)).init(e[1], e[2]);
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
                for (u(); T.length; ) {
                    if (null === (e = T.shift())[0]) return d(makeError("mismatch", "Mismatched anonymous define() module: " + e[e.length - 1]));
                    f(e);
                }
                b.defQueueMap = {};
            }
            var m, v, b, y, w, E = {
                waitSeconds: 7,
                baseUrl: "./",
                paths: {},
                bundles: {},
                pkgs: {},
                shim: {},
                config: {}
            }, x = {}, k = {}, I = {}, T = [], S = {}, q = {}, O = {}, R = 1, M = 1;
            return y = {
                require: function(e) {
                    return e.require ? e.require : e.require = b.makeRequire(e.map);
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
                    q[e] || (q[e] = !0, b.load(this.map.id, e));
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
                                        e.requireType = this.map.isDefine ? "define" : "require", d(this.error = e);
                                    } else r = o;
                                    if (this.exports = r, this.map.isDefine && !this.ignore && (S[i] = r, req.onResourceLoad)) {
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
                        var r, u, l, f = getOwn(O, this.map.id), p = this.map.name, h = this.map.parentMap ? this.map.parentMap.name : null, g = b.makeRequire(e.parentMap, {
                            enableBuildCallback: !0
                        });
                        return this.map.unnormalized ? (n.normalize && (p = n.normalize(p, function(e) {
                            return t(e, h, !0);
                        }) || ""), s(u = o(e.prefix + "!" + p, this.map.parentMap, !0), "defined", bind(this, function(e) {
                            this.map.normalizedMap = u, this.init([], function() {
                                return e;
                            }, null, {
                                enabled: !0,
                                ignore: !0
                            });
                        })), void ((l = getOwn(x, u.id)) && (this.depMaps.push(u), this.events.error && l.on("error", bind(this, function(e) {
                            this.emit("error", e);
                        })), l.enable()))) : f ? (this.map.url = b.nameToUrl(f), void this.load()) : ((r = bind(this, function(e) {
                            this.init([], function() {
                                return e;
                            }, null, {
                                enabled: !0
                            });
                        })).error = bind(this, function(e) {
                            this.inited = !0, (this.error = e).requireModules = [ i ], eachProp(x, function(e) {
                                0 === e.map.id.indexOf(i + "_unnormalized") && c(e.map.id);
                            }), d(e);
                        }), r.fromText = bind(this, function(t, n) {
                            var s = e.name, u = o(s), c = useInteractive;
                            n && (t = n), c && (useInteractive = !1), a(u), hasProp(E.config, i) && (E.config[s] = E.config[i]);
                            try {
                                req.exec(t);
                            } catch (t) {
                                return d(makeError("fromtexteval", "fromText eval for " + i + " failed: " + t, t, [ i ]));
                            }
                            c && (useInteractive = !0), this.depMaps.push(u), b.completeLoad(s), g([ s ], r);
                        }), void n.load(e.name, g, r, E));
                    })), b.enable(n, this), this.pluginMaps[n.id] = n;
                },
                enable: function() {
                    (k[this.map.id] = this).enabled = !0, this.enabling = !0, each(this.depMaps, bind(this, function(e, t) {
                        var i, n, r;
                        if ("string" == typeof e) {
                            if (e = o(e, this.map.isDefine ? this.map : this.map.parentMap, !1, !this.skipMap), 
                            this.depMaps[t] = e, r = getOwn(y, e.id)) return void (this.depExports[t] = r(this));
                            this.depCount += 1, s(e, "defined", bind(this, function(e) {
                                this.undefed || (this.defineDep(t, e), this.check());
                            })), this.errback ? s(e, "error", bind(this, this.errback)) : this.events.error && s(e, "error", bind(this, function(e) {
                                this.emit("error", e);
                            }));
                        }
                        i = e.id, n = x[i], hasProp(y, i) || !n || n.enabled || b.enable(e, this);
                    })), eachProp(this.pluginMaps, bind(this, function(e) {
                        var t = getOwn(x, e.id);
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
                config: E,
                contextName: e,
                registry: x,
                defined: S,
                urlFetched: q,
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
                        e.urlArgs = function(e, i) {
                            return (-1 === i.indexOf("?") ? "?" : "&") + t;
                        };
                    }
                    var i = E.shim, n = {
                        paths: !0,
                        bundles: !0,
                        config: !0,
                        map: !0
                    };
                    eachProp(e, function(e, t) {
                        n[t] ? (E[t] || (E[t] = {}), mixin(E[t], e, !0, !0)) : E[t] = e;
                    }), e.bundles && eachProp(e.bundles, function(e, t) {
                        each(e, function(e) {
                            e !== t && (O[e] = t);
                        });
                    }), e.shim && (eachProp(e.shim, function(e, t) {
                        isArray(e) && (e = {
                            deps: e
                        }), !e.exports && !e.init || e.exportsFn || (e.exportsFn = b.makeShimExports(e)), 
                        i[t] = e;
                    }), E.shim = i), e.packages && each(e.packages, function(e) {
                        var t;
                        t = (e = "string" == typeof e ? {
                            name: e
                        } : e).name, e.location && (E.paths[t] = e.location), E.pkgs[t] = e.name + "/" + (e.main || "main").replace(currDirRegExp, "").replace(jsSuffixRegExp, "");
                    }), eachProp(x, function(e, t) {
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
                    function s(t, i, u) {
                        var c, f;
                        return r.enableBuildCallback && i && isFunction(i) && (i.__requireJsBuild = !0), 
                        "string" == typeof t ? isFunction(i) ? d(makeError("requireargs", "Invalid require call"), u) : n && hasProp(y, t) ? y[t](x[n.id]) : req.get ? req.get(b, t, n, s) : (c = o(t, n, !1, !0).id, 
                        hasProp(S, c) ? S[c] : d(makeError("notloaded", 'Module name "' + c + '" has not been loaded yet for context: ' + e + (n ? "" : ". Use require([])")))) : (g(), 
                        b.nextTick(function() {
                            g(), (f = a(o(null, n))).skipMap = r.skipMap, f.init(t, i, u, {
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
                            return hasProp(S, o(e, n, !1, !0).id);
                        },
                        specified: function(e) {
                            return e = o(e, n, !1, !0).id, hasProp(S, e) || hasProp(x, e);
                        }
                    }), n || (s.undef = function(e) {
                        u();
                        var t = o(e, n, !0), r = getOwn(x, e);
                        r.undefed = !0, i(e), delete S[e], delete q[t.url], delete I[e], eachReverse(T, function(t, i) {
                            t[0] === e && T.splice(i, 1);
                        }), delete b.defQueueMap[e], r && (r.events.defined && (I[e] = r.events), c(e));
                    }), s;
                },
                enable: function(e) {
                    getOwn(x, e.id) && a(e).enable();
                },
                completeLoad: function(e) {
                    var t, i, r, o = getOwn(E.shim, e) || {}, a = o.exports;
                    for (u(); T.length; ) {
                        if (null === (i = T.shift())[0]) {
                            if (i[0] = e, t) break;
                            t = !0;
                        } else i[0] === e && (t = !0);
                        f(i);
                    }
                    if (b.defQueueMap = {}, r = getOwn(x, e), !t && !hasProp(S, e) && r && !r.inited) {
                        if (!(!E.enforceDefine || a && getGlobal(a))) return n(e) ? void 0 : d(makeError("nodefine", "No define call for " + e, null, [ e ]));
                        f([ e, o.deps || [], o.exportsFn ]);
                    }
                    l();
                },
                nameToUrl: function(e, t, i) {
                    var n, r, o, a, s, d, u = getOwn(E.pkgs, e);
                    if (u && (e = u), d = getOwn(O, e)) return b.nameToUrl(d, t, i);
                    if (req.jsExtRegExp.test(e)) a = e + (t || ""); else {
                        for (n = E.paths, o = (r = e.split("/")).length; 0 < o; o -= 1) if (s = getOwn(n, r.slice(0, o).join("/"))) {
                            isArray(s) && (s = s[0]), r.splice(0, o, s);
                            break;
                        }
                        a = r.join("/"), a = ("/" === (a += t || (/^data\:|^blob\:|\?/.test(a) || i ? "" : ".js")).charAt(0) || a.match(/^[\w\+\.\-]+:/) ? "" : E.baseUrl) + a;
                    }
                    return E.urlArgs && !/^blob\:/.test(a) ? a + E.urlArgs(e, a) : a;
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
                        return eachProp(x, function(e, n) {
                            0 !== n.indexOf("_@r") && each(e.depMaps, function(e) {
                                if (e.id === t.id) return i.push(n), !0;
                            });
                        }), d(makeError("scripterror", 'Script error for "' + t.id + (i.length ? '", needed by: ' + i.join(", ") : '"'), e, [ t.id ]));
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
                return t(o) || t(u);
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
            var d, u = r + i + ".debug";
            n = e.getWindow(), d = a(), n.addEventListener("storage", function(e) {
                e.key !== o && e.key !== u || (d = a());
            }), this.debug = function() {
                var e = s.apply(null, arguments);
                d && console.log.apply(null, e);
            }, this.error = function() {
                var e = s.apply(null, arguments);
                console.error.apply(null, e);
            };
        }
        var n, r = "oracle.content.ui.customform.", o = r + "debug";
        return i;
    }), define("sdk/dispatcher", [ "sdk/logger" ], function(e) {
        var t = new e("dispatcher"), i = 0, n = {}, r = {}, o = {};
        return {
            on: function(e, t, i) {
                r[e] = t.bind(i);
            },
            startListening: function() {
                window.addEventListener("message", this.onMessage.bind(this));
            },
            onMessage: function(e) {
                if (e.origin === this.getOrigin()) {
                    var i = e.data, a = i.type;
                    t.debug("receiving data:", e.data), i.senderId && o[i.senderId] && o[i.senderId].frame ? (t.debug("subscriber found for sender:", i.senderId), 
                    e.source === o[i.senderId].frame.contentWindow ? ("ready" === a && (t.debug("processing event customEditorReady for type:", a), 
                    r.customEditorReady.call(null, e.data.payload, i.senderId, o[i.senderId].index)), 
                    "edit" === a && (t.debug("processing event customEditorUpdate for type:", a), r.customEditorUpdate.call(null, e.data.payload, i.senderId, o[i.senderId].index)), 
                    "resize" === a && (t.debug("processing event customEditorResize for type:", a), 
                    r.customEditorResize.call(null, e.data.payload, i.senderId, o[i.senderId].index))) : t.debug("No content window found for:", i.senderId)) : ("replyTo" === i.type && (i.replyStatus && "error" === i.replyStatus.replyType ? (t.error("replyTo returned error :", i.replyStatus.message), 
                    n[i.messageId] && "function" == typeof n[i.messageId].rejectCallBack ? (t.debug("processing reject callback"), 
                    n[i.messageId].rejectCallBack.call(null, i.replyStatus.message ? i.replyStatus.message : "Error")) : t.debug("no reject callback for message id:", i.messageId)) : n[i.messageId] && "function" == typeof n[i.messageId].resolveCallBack ? (t.debug("processing resolve callback"), 
                    n[i.messageId].resolveCallBack.call(null, i.payload)) : t.debug("no resolve callback for message id:", i.messageId)), 
                    "function" == typeof r[a] && (t.debug("processing event", a), r[a].call(null, e.data.payload, e.data.messageId)));
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
            sendToSubscriber: function(e, i, n) {
                var r = {
                    type: i,
                    payload: n,
                    senderId: e
                }, a = o[e];
                if (!a || !a.frame || !a.frame.contentWindow) throw new Error("There is no target window corresponding to subscriber :", e);
                a.frame.contentWindow.postMessage(r, this.getOrigin()), t.debug("sending data " + r + " to subscriber " + e);
            },
            replyTo: function(e, i, n) {
                var r = {
                    type: "replyTo",
                    payload: i,
                    messageId: e,
                    senderId: this.getSenderId(),
                    replyStatus: n
                };
                t.debug("sending:", r), this.getTargetWindow().postMessage(r, this.getOrigin());
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
            },
            addToSubscriber: function(e, i) {
                o[e] = {
                    frame: i.frame,
                    index: i.index
                }, t.debug("adding " + e + " to subscribers list");
            }
        };
    }), define("sdk/storage", [ "sdk/logger" ], function(e) {
        var t = new e("storage"), i = {};
        return {
            put: function(e, n) {
                if (!e || !n) throw new Error("key and value should be present");
                i[e] = n, t.debug("Adding key: " + e + " to storage");
            },
            get: function(e) {
                if (!e) throw new Error("key should be present");
                return t.debug("Getting value for key: " + e + " from storage"), i[e];
            },
            delete: function(e) {
                e && (t.debug("Remove value for key: " + e + " from storage"), delete i[e]);
            }
        };
    }), define("sdk/EditorFrame", [ "sdk/dispatcher", "sdk/storage", "sdk/logger" ], function(e, t, i) {
        var n = new i("EditorFrame");
        return function(t) {
            t = t || {};
            var i = {}, r = t.frame, o = t.frameId, a = {
                ready: !1
            };
            this.setEditorReady = function() {
                if (Object.isFrozen(a)) throw new Error("Can not setEditorReady for an editor that is already ready");
                a.ready = !0, Object.freeze(a), i.editorReady && i.editorReady.call(null);
            }, this.on = function(e, t) {
                i[e] = t;
            }, this.getFrame = function() {
                return r;
            }, this.disable = function(t) {
                if (!a.ready) throw new Error("Can not disable editor that is not ready");
                e.sendToSubscriber(o, "disable", t);
            }, this.resizeEditorFrame = function(e) {
                if (e && e.width && e.height) {
                    var t = e.width + "px", i = e.height + "px";
                    r.style.width = t, r.style.height = i, n.debug("Resizing custom editor frame to width:" + t + " ,height:" + i);
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
    }), define("sdk/Field", [ "sdk/dispatcher", "sdk/storage", "sdk/EditorFrame", "sdk/dataTypes", "sdk/logger" ], function(e, t, i, n, r) {
        var o = new r("Field");
        return function(t) {
            function i() {
                var t = {
                    nodeName: u,
                    value: s,
                    isField: !0
                };
                o.debug("Notifying UI that the field value has changed:", t), e.send("edit", t);
            }
            if (o.debug("Field received params :", t), !t || !t.definition) {
                var r = "Unable to initialize Field - invalid  parameter: no field definition provided";
                throw o.error(r), new Error(r);
            }
            var a = {}, s = t.value, d = t.definition, u = (d.id, d.name), c = d.datatype, l = "list" === d.valuecount;
            d.valuecount, t.avilableCustomEditors;
            this.on = function(e, t) {
                a[e] = t;
            }, this.getDefinition = function() {
                return Object.freeze(d);
            }, this.removeValueAt = function(e) {
                if (!l) throw new Error("Field" + u + " is not a multi valued field");
                if (void 0 === e || isNaN(e) || e < 0) throw new Error("Invalid index passed :" + e);
                s && Array.isArray(s) && s.length > e && (s.splice(e, 1), i());
            }, this.getValueAt = function(e) {
                if (!l) throw new Error("Field" + u + " is not a multi valued field");
                if (void 0 === e || isNaN(e) || e < 0) throw new Error("Invalid index passed :" + e);
                var t;
                return s && Array.isArray(s) && s.length > e && (t = s[e]), t;
            }, this.setValueAt = function(e, t) {
                if (void 0 === e || isNaN(e) || e < 0) throw new Error("Invalid index passed :" + e);
                if (!l) throw new Error("Field" + u + " is not a multi valued field");
                !s && l && (s = []), s[e] = t, i();
            }, this.validate = function(t, i) {
                if (i = i || {}, l && i.hasOwnProperty("index") && (void 0 === i.index || isNaN(i.index) || i.index < 0)) throw new Error("Invalid index passed :" + i.index);
                return e.sendAndWait("validateField", {
                    fieldValue: t,
                    fieldName: u,
                    options: i
                });
            }, this.setValue = function(e, t) {
                s = e, t && t.notifyForm ? a.update && (o.debug("Notifying the form to update the value for field:" + u + "with value: " + s), 
                a.update.call(null, s)) : i();
            }, this.getValue = function() {
                return s;
            }, this.openAssetPicker = function(t) {
                var i = c;
                if (i !== n.REFERENCE && i !== n.LARGETEXT) throw new Error("Opening asset picker is not supported for field with data type " + i);
                return t = t || {}, e.sendAndWait("openAssetPicker", {
                    options: t,
                    fieldName: u
                });
            };
        };
    }), define("sdk/Type", [ "sdk/logger" ], function(e) {
        var t = new e("Type");
        return function(e) {
            if (!e || !e.name) {
                var i = "Unable to initialize Type - invalid  parameter: no name provided";
                throw t.error(i), new Error(i);
            }
            this.name = Object.freeze(e.name), this.description = Object.freeze(e.description), 
            this.getSlug = function() {
                return Object.freeze(e.slug);
            }, this.getGroups = function() {
                return Object.freeze(e.groups);
            };
        };
    }), define("sdk/Item", [ "sdk/Field", "sdk/Type", "sdk/dispatcher", "sdk/logger" ], function(e, t, i, n) {
        function r(e) {
            a.debug("Notifying UI that the item property value has changed:", e), i.send("edit", e);
        }
        function o(e, t) {
            return e = e || [], e.some(function(e) {
                return e.value === t;
            });
        }
        var a = new n("Item");
        return function(t) {
            function n(e) {
                c = e.id, l = e.type, f = e.name, p = e.description, h = e.slug, g = e.language, 
                m = e.translatable, v = e.languageIsMaster, b = e.version, y = e.isPublished, w = e.status, 
                E = e.createdDate, x = e.createdBy, k = e.updatedDate, I = e.updatedBy, T = e.repositoryId, 
                S = e.latestVersion, q = e.currentVersion, O = e.mimeType, R = e.fileGroup, M = e.varSetId, 
                D = e.versionInfo, A = e.publishInfo, N = e.isNew;
            }
            function s() {
                return {
                    id: c,
                    type: l,
                    name: f,
                    description: p,
                    createdBy: x,
                    createdDate: E,
                    updatedBy: I,
                    updatedDate: k,
                    slug: h,
                    repositoryId: T,
                    language: g,
                    translatable: m,
                    status: w,
                    isPublished: y,
                    languageIsMaster: v,
                    version: b,
                    currentVersion: q,
                    latestVersion: S,
                    mimeType: O,
                    fileGroup: R,
                    varSetId: M
                };
            }
            function d(e) {
                a.debug("Item update recived data: ", e), n(e);
                var t = e.fieldData;
                t && Array.isArray(t) && t.forEach(function(e) {
                    var t = e.definition.id, i = e.value, n = V.filter(function(e) {
                        return e.getDefinition().id === t;
                    }), r = n && n.length > 0 ? n[0] : null;
                    r && (a.debug("Syncing field value for field : " + e.definition.name + " with value " + i), 
                    r.setValue(i, {
                        notifyForm: !0
                    }));
                }), C.update && (a.debug("Notifying the form to update the item with itemData:" + s()), 
                C.update.call(null, s()));
            }
            if (!t) {
                var u = "Unable to initialize Type - invalid  parameter:" + t;
                throw a.error(u), new Error(u);
            }
            if (!t.contentType) throw a.error("Type must be  provided"), new Error("Type must be  provided");
            i.on("update", d);
            var c, l, f, p, h, g, m, v, b, y, w, E, x, k, I, T, S, q, O, R, M, D, A, N, j = t.contentType, F = j.getSlug(), C = (F && F.enabled, 
            {}), P = t.itemData, z = P.fieldData, B = P.languageOptions;
            n(P);
            var V = z.map(function(t) {
                return new e(t);
            });
            this.get = function() {
                return s();
            }, this.on = function(e, t) {
                C[e] = t;
            }, this.isNew = function() {
                return N;
            }, this.getLanguageOptions = function() {
                return B;
            }, this.getFields = function() {
                return V;
            }, this.getFieldByName = function(e) {
                var t = V.filter(function(t) {
                    return t.getDefinition().name === e;
                });
                return t && t.length > 0 ? t[0] : null;
            }, this.getFieldById = function(e) {
                var t = V.filter(function(t) {
                    return t.getDefinition().id === e;
                });
                return t && t.length > 0 ? t[0] : null;
            }, this.setName = function(e) {
                f = e, r({
                    nodeName: "name",
                    value: f
                });
            }, this.validateName = function(e) {
                return i.sendAndWait("validateItemName", {
                    value: e
                });
            }, this.setDescription = function(e) {
                p = e, r({
                    nodeName: "description",
                    value: p
                });
            }, this.validateDescription = function(e) {
                return i.sendAndWait("validateItemDescription", {
                    value: e
                });
            }, this.setSlug = function(e) {
                h = e, r({
                    nodeName: "slug",
                    value: h
                });
            }, this.validateSlug = function(e) {
                return i.sendAndWait("validateItemSlug", {
                    value: e
                });
            }, this.setLanguage = function(e) {
                if (!this.isNew()) throw new Error("Language cannot be modified for an existing item");
                if (!o(B, e)) throw new Error('Invalid Language "' + e + '" passed');
                g = e, r({
                    nodeName: "language",
                    value: g
                });
            }, this.setTranslatable = function(e) {
                if (!this.isNew()) throw new Error("Translatbale property cannot be modified for an existing item");
                if ("boolean" != typeof e) throw new Error("Translatbale property must be boolean");
                e = e, r({
                    nodeName: "translatable",
                    value: e
                });
            };
        };
    }), define("sdk/api", [ "sdk/Item", "sdk/Type", "sdk/dataTypes", "sdk/dispatcher", "sdk/logger" ], function(e, t, i, n, r) {
        var o = new r("sdk");
        return function(r, a) {
            a = a || {};
            var s;
            if (!r) throw s = "Unable to initialize sdk - no initialization parameters were received", 
            new Error(s);
            var d = document.querySelector("body");
            if (!r.contentItemData || !r.contentTypeData) throw s = 'Unable to initialize sdk - invalid  parameter: "contentItemData" and "contentTypeData', 
            o.error(s), new Error(s);
            var u = r.contentItemData, c = r.contentTypeData, l = r.locale, f = r.repositoryDefaultLanguage, p = new t(c), h = new e({
                itemData: u,
                contentType: p
            });
            this.getType = function() {
                return p;
            }, this.getItem = function() {
                return h;
            }, this.getLocale = function() {
                return l;
            }, this.getRepositoryDefaultLanguage = function() {
                return f;
            }, this.previewAsset = function(e) {
                if (!e || !e.id) throw new Error('Invalid params. {"id" : "<id of asset>" must be provided to open asset preview.');
                return n.send("previewAsset", e);
            }, this.resize = function(e) {
                if (!e) {
                    var t = d.getBoundingClientRect();
                    e = {
                        width: t.width + "px",
                        height: t.height + "px"
                    };
                }
                n.send("resize", {
                    width: e.width,
                    height: e.height
                });
            };
            var g, m;
            this.registerFormValidation = function(e, t) {
                g = e, t = t || {}, m = t.message || "";
            }, this.isFormValid = function() {
                if ("function" != typeof g) return o.debug("Unable to validate value: no validation function has been registered"), 
                {
                    isValid: !0
                };
                try {
                    return o.debug("Evaluating custom validation function for item :", h), Promise.resolve(g.call(this, h)).then(function(e) {
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
                                    message: e.message || m
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
            }, this.dataTypes = i;
        };
    }), define("sdk/api/init", [ "sdk/api", "sdk/dispatcher", "sdk/storage", "sdk/logger" ], function(e, t, i, n) {
        var r, o = new n("init");
        return {
            onInit: function(t, i) {
                return o.debug("Received initialization data:", i), r = new e(i), "function" == typeof t && t.apply(null, [ r ]), 
                r;
            },
            onCustomEditorReady: function(e, n, a) {
                if (!n || !i.get(n)) throw o.error("There is no sender info to process ready message"), 
                new Error("There is no sender info to process ready message");
                var s = r.getItem(), d = s.getFields(), u = r.getLocale(), c = i.get(n), l = c.fieldId, f = s.getFieldById(l);
                if (!f) throw o.error("There is no matching field for fieldId:", c.fieldId), new Error("There is no matching field for fieldId:", c.fieldId);
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
                    return l === e.id;
                }), g = h.length ? h[0] : null;
                g && void 0 !== a && a >= 0 && (g.index = a);
                var m = f.getDefinition().settings || {}, v = {
                    locale: u,
                    fields: p,
                    field: g,
                    editor: {
                        settings: m,
                        autoresize: !0,
                        parameters: {}
                    }
                };
                t.sendToSubscriber(n, "init", v);
                var b = c.widget;
                b && b.setEditorReady(!0);
            },
            onCustomEditorUpdate: function(e, t, n) {
                if (!t || !i.get(t)) throw o.error("There is no sender info to process editor update message"), 
                new Error("There is no sender info to process editor update message");
                var a = i.get(t), s = r.getItem(), d = s.getFieldById(a.fieldId), u = e.value, c = d.getDefinition();
                if (!d) throw o.error("There is no matching field for fieldId:", a.fieldId), new Error("There is no matching field for fieldId:", a.fieldId);
                void 0 !== n && n >= 0 ? (o.debug("Setting field value for field " + c.name + " at index " + n + " with value " + u), 
                d.setValueAt(n, u)) : (o.debug("Setting field value for field " + c.name + " with value " + u), 
                d.setValue(u));
            },
            onCustomEditorResize: function(e, t, n) {
                if (!t || !i.get(t)) throw o.error("There is no sender info to process custom editor resize"), 
                new Error("There is no sender info to process custom editor resize");
                var r = i.get(t), a = r.widget;
                a && (o.debug("Resizing editor frame widget:", a), a.resizeEditorFrame(e));
            },
            onValidateForm: function(e, i) {
                if (o.debug("Received a validation request"), !r) return void o.debug('Ignoring incoming "validate" message: "init" not received yet');
                var n = r.isFormValid();
                return Promise.resolve(n).then(function(e) {
                    var n = {
                        isValid: e.isValid
                    };
                    e.error && (n.error = e.error), t.replyTo(i, n);
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