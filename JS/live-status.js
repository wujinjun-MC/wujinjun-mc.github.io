/* Live status renderer. Plain ES2017, no dependencies, no third-party requests. */
(function () {
    "use strict";

    var DEFAULTS = {
        enabled: true,
        endpoint: "./data/status.json",
        batteryEndpoint: "./data/battery.json",
        refreshSeconds: 300,
        tickSeconds: 30,
        staleAfterSeconds: 86400,
        demoEndpoints: {
            status: "./data/status.example.json",
            battery: "./data/battery.example.json"
        }
    };

    var ERROR_LABELS = {
        not_configured: "未配置密钥",
        not_logged_in: "Codex 未登录",
        reauth_required: "Codex 登录已过期",
        auth_failed: "密钥失效",
        account_mismatch: "账号不匹配",
        network_error: "网络异常",
        timeout: "请求超时",
        rate_limited: "请求过于频繁",
        bad_response: "数据格式异常",
        bad_json: "数据不是合法 JSON"
    };

    var config = resolveConfig();
    var state = {
        status: null,
        battery: null,
        lastFetchAt: 0,
        lastAttemptAt: 0,
        loading: false,
        timer: null,
        demo: isDemo()
    };
    var els = {};

    function getElement(id) {
        return document.getElementById(id);
    }

    function isObject(value) {
        return Boolean(value) && typeof value === "object" && !Array.isArray(value);
    }

    function resolveConfig() {
        var merged = {};
        var key;
        for (key in DEFAULTS) {
            if (Object.prototype.hasOwnProperty.call(DEFAULTS, key)) merged[key] = DEFAULTS[key];
        }
        var user = (typeof window.config === "object" && window.config && window.config.liveStatus)
            ? window.config.liveStatus
            : null;
        if (user && typeof user === "object") {
            for (key in user) {
                if (Object.prototype.hasOwnProperty.call(user, key)) merged[key] = user[key];
            }
            merged.demoEndpoints = Object.assign({}, DEFAULTS.demoEndpoints, user.demoEndpoints || {});
        }
        return merged;
    }

    function isDemo() {
        try {
            return new URLSearchParams(window.location.search).has("demo");
        } catch (error) {
            return false;
        }
    }

    function refreshMs() {
        return Math.max(30, Number(config.refreshSeconds) || 300) * 1000;
    }

    function tickMs() {
        return Math.max(5, Number(config.tickSeconds) || 30) * 1000;
    }

    function metricElements(name) {
        return {
            card: getElement("status-card-" + name),
            prefix: getElement("status-" + name + "-prefix"),
            value: getElement("status-" + name + "-value"),
            unit: getElement("status-" + name + "-unit"),
            sub: getElement("status-" + name + "-sub"),
            age: getElement("status-" + name + "-age"),
            meter: getElement("status-" + name + "-meter"),
            bar: getElement("status-" + name + "-bar"),
            flags: getElement("status-" + name + "-flags")
        };
    }

    function cacheElements() {
        els.section = getElement("status");
        els.grid = document.querySelector(".status-grid");
        els.connection = getElement("status-connection");
        els.lastSync = getElement("status-last-sync");
        els.refresh = getElement("status-refresh");
        els.demo = getElement("status-demo");
        els.battery = metricElements("battery");
        els.deepseek = metricElements("deepseek");
        els.codex5 = metricElements("codex5");
        els.codexw = metricElements("codexw");
    }

    function setText(element, text) {
        if (element) element.textContent = text;
    }

    function setConnection(stateName, text) {
        if (!els.connection) return;
        els.connection.setAttribute("data-state", stateName);
        setText(els.connection, text);
    }

    function setFlags(metric, flags) {
        var container = metric && metric.flags;
        if (!container) return;
        while (container.firstChild) container.removeChild(container.firstChild);
        (flags || []).forEach(function (flag) {
            var chip = document.createElement("span");
            chip.className = "status-chip";
            if (flag.tone) chip.setAttribute("data-tone", flag.tone);
            chip.textContent = flag.label;
            container.appendChild(chip);
        });
    }

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    function setMeter(metric, percent, tone, label) {
        var safePercent = Math.round(clamp(percent, 0, 100));
        if (metric.bar) {
            metric.bar.style.width = safePercent + "%";
            metric.bar.setAttribute("data-tone", tone);
        }
        if (metric.meter) {
            metric.meter.setAttribute("aria-valuenow", String(safePercent));
            metric.meter.setAttribute("aria-valuetext", label + " " + safePercent + "%");
        }
    }

    function formatMoney(value) {
        var number = Number(value);
        if (!Number.isFinite(number)) return "—";
        try {
            return new Intl.NumberFormat("zh-CN", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            }).format(number);
        } catch (error) {
            return number.toFixed(2);
        }
    }

    function currencySymbol(currency) {
        var code = String(currency || "").toUpperCase();
        if (code === "CNY" || code === "RMB") return "¥";
        if (code === "USD") return "$";
        return code ? code + " " : "";
    }

    function relative(ms) {
        var seconds = Math.max(0, Math.floor(ms / 1000));
        if (seconds < 60) return "刚刚";
        var minutes = Math.floor(seconds / 60);
        if (minutes < 60) return minutes + " 分钟前";
        var hours = Math.floor(minutes / 60);
        if (hours < 24) return hours + " 小时前";
        var days = Math.floor(hours / 24);
        if (days < 30) return days + " 天前";
        return new Date(Date.now() - ms).toLocaleDateString("zh-CN");
    }

    function formatDuration(totalSeconds) {
        var seconds = Math.max(0, Math.floor(totalSeconds));
        var days = Math.floor(seconds / 86400);
        if (days > 0) return days + " 天";
        var hours = Math.floor(seconds / 3600);
        if (hours > 0) {
            var minutesPart = Math.floor((seconds % 3600) / 60);
            return minutesPart > 0 ? hours + " 小时 " + minutesPart + " 分" : hours + " 小时";
        }
        var minutes = Math.floor(seconds / 60);
        if (minutes > 0) return minutes + " 分钟";
        return "不到 1 分钟";
    }

    function resetText(iso, demoMinutes) {
        if (state.demo) return formatDuration(demoMinutes * 60) + "后重置";
        var timestamp = Date.parse(iso || "");
        if (!Number.isFinite(timestamp)) return "重置时间未知";
        var difference = timestamp - Date.now();
        if (difference <= 0) return "重置时间已到";
        return formatDuration(difference / 1000) + "后重置";
    }

    function setAge(element, iso, demoMinutes) {
        if (!element) return;
        if (state.demo) {
            element.setAttribute("data-stale", "false");
            setText(element, "更新于 " + demoMinutes + " 分钟前 · 演示");
            return;
        }
        var timestamp = Date.parse(iso || "");
        if (!Number.isFinite(timestamp)) {
            element.removeAttribute("data-stale");
            setText(element, "更新时间未知");
            return;
        }
        var difference = Math.max(0, Date.now() - timestamp);
        var stale = difference > (Number(config.staleAfterSeconds) || 86400) * 1000;
        element.setAttribute("data-stale", stale ? "true" : "false");
        setText(element, "更新于 " + relative(difference) + (stale ? " · 可能已过期" : ""));
    }

    function errorLabel(code) {
        if (!code) return "更新失败";
        var key = String(code);
        if (/^http_\d+$/.test(key)) return "服务返回 " + key.slice(5);
        return ERROR_LABELS[key] || "更新失败";
    }

    function renderUnknown(metric, label) {
        if (!metric || !metric.value) return;
        setText(metric.value, "—");
        setText(metric.prefix, "");
        setText(metric.unit, "");
        setText(metric.sub, label);
        setText(metric.age, "—");
        if (metric.bar) {
            metric.bar.style.width = "0%";
            metric.bar.setAttribute("data-tone", "good");
        }
        if (metric.meter) {
            metric.meter.setAttribute("aria-valuenow", "0");
            metric.meter.setAttribute("aria-valuetext", label);
        }
        setFlags(metric, []);
    }

    function renderBattery(battery) {
        var metric = els.battery;
        if (!metric || !metric.value) return;
        var level = isObject(battery) ? Number(battery.level) : NaN;
        if (!Number.isFinite(level)) {
            renderUnknown(metric, "等待手机上报");
            return;
        }
        level = clamp(level, 0, 100);
        setText(metric.value, String(Math.round(level)));
        setText(metric.unit, "%");
        var charging = isObject(battery) && (battery.charging === true || battery.charging === "true");
        setText(metric.sub, charging ? (level >= 100 ? "已充满" : "充电中") : "未充电");
        var tone = level <= 20 ? "bad" : level <= 40 ? "warn" : "good";
        setMeter(metric, level, tone, "手机电量");
        setAge(metric.age, battery.updatedAt, 2);
    }

    function renderDeepSeek(deepseek) {
        var metric = els.deepseek;
        if (!metric || !metric.value) return;
        if (!isObject(deepseek)) {
            renderUnknown(metric, "暂无数据");
            return;
        }
        var total = Number(deepseek.total);
        var hasValue = Number.isFinite(total);
        var reason = deepseek.ok === false ? errorLabel(deepseek.error) : "";
        if (!hasValue) {
            renderUnknown(metric, reason || "暂无数据");
            if (reason) setFlags(metric, [{ label: reason, tone: "warn" }]);
            return;
        }
        setText(metric.value, formatMoney(total));
        setText(metric.prefix, currencySymbol(deepseek.currency));
        setText(metric.unit, "");

        var parts = [];
        var granted = Number(deepseek.granted);
        var toppedUp = Number(deepseek.toppedUp);
        if (Number.isFinite(granted)) parts.push("赠送 " + formatMoney(granted));
        if (Number.isFinite(toppedUp)) parts.push("充值 " + formatMoney(toppedUp));
        if (reason) parts.push(reason);
        setText(metric.sub, parts.length ? parts.join(" · ") : "余额可用");

        var flags = [];
        if (deepseek.available === false) flags.push({ label: "余额不足", tone: "bad" });
        else if (deepseek.available === true) flags.push({ label: "可用", tone: "ok" });
        if (reason) flags.push({ label: "更新失败", tone: "warn" });
        setFlags(metric, flags);
        setAge(metric.age, deepseek.updatedAt, 2);
    }

    function renderCodex(metricName, codex, windowData) {
        var metric = els[metricName];
        if (!metric || !metric.value) return;
        if (!isObject(codex)) {
            renderUnknown(metric, "暂无数据");
            return;
        }
        var reason = codex.ok === false ? errorLabel(codex.error) : "";
        var hasWindow = isObject(windowData);
        var used = hasWindow ? Number(windowData.usedPercent) : NaN;
        var remaining = hasWindow ? Number(windowData.remainingPercent) : NaN;
        if (!Number.isFinite(remaining) && Number.isFinite(used)) remaining = 100 - used;
        if (!Number.isFinite(used) && Number.isFinite(remaining)) used = 100 - remaining;

        if (!Number.isFinite(remaining)) {
            renderUnknown(metric, reason || "暂无额度数据");
            if (reason) setFlags(metric, [{ label: reason, tone: "warn" }]);
            return;
        }

        remaining = clamp(remaining, 0, 100);
        used = Number.isFinite(used) ? clamp(used, 0, 100) : 100 - remaining;
        setText(metric.value, String(Math.round(remaining)));
        setText(metric.unit, "%");

        var demoMinutes = metricName === "codex5" ? 133 : 3 * 24 * 60;
        var reset = resetText(hasWindow ? windowData.resetAt : null, demoMinutes);
        var sub = codex.limitReached === true && remaining <= 0
            ? "额度已用尽 · " + reset
            : "已用 " + Math.round(used) + "% · " + reset;
        if (reason) sub += " · " + reason;
        setText(metric.sub, sub);

        var tone = remaining <= 10 ? "bad" : remaining <= 30 ? "warn" : "good";
        var label = metricName === "codex5" ? "Codex 5 小时额度" : "Codex 本周额度";
        setMeter(metric, remaining, tone, label);

        var flags = [];
        if (reason) flags.push({ label: "更新失败", tone: "warn" });
        if (codex.limitReached === true) flags.push({ label: "额度已用尽", tone: "bad" });
        setFlags(metric, flags);
        setAge(metric.age, codex.updatedAt, 3);
    }

    function renderStatus(status) {
        if (!isObject(status)) status = {};
        renderDeepSeek(status.deepseek);
        renderCodex("codex5", status.codex, status.codex ? status.codex.primary : null);
        renderCodex("codexw", status.codex, status.codex ? status.codex.secondary : null);
    }

    function updateLastSync() {
        if (!els.lastSync) return;
        if (state.demo) {
            setText(els.lastSync, "上次同步：演示数据");
            return;
        }
        if (!state.lastFetchAt) {
            setText(els.lastSync, "上次同步：—");
            return;
        }
        setText(els.lastSync, "上次同步：" + relative(Math.max(0, Date.now() - state.lastFetchAt)));
    }

    function urlFor(kind) {
        if (state.demo && config.demoEndpoints) {
            var demoUrl = kind === "battery" ? config.demoEndpoints.battery : config.demoEndpoints.status;
            if (demoUrl) return demoUrl;
        }
        return kind === "battery" ? config.batteryEndpoint : config.endpoint;
    }

    function withCacheBuster(url) {
        return url + (url.indexOf("?") === -1 ? "?" : "&") + "t=" + Date.now();
    }

    function fetchJson(url) {
        return new Promise(function (resolve) {
            if (typeof url !== "string" || !url) {
                resolve({ error: "not_configured" });
                return;
            }
            if (typeof fetch !== "function") {
                resolve({ error: "network_error" });
                return;
            }

            var controller = null;
            var timer = null;
            if (typeof AbortController === "function") {
                controller = new AbortController();
                timer = setTimeout(function () {
                    controller.abort();
                }, 8000);
            }

            var options = { cache: "no-store", credentials: "omit" };
            if (controller) options.signal = controller.signal;

            fetch(withCacheBuster(url), options).then(function (response) {
                if (!response.ok) {
                    resolve({ error: "http_" + response.status });
                    return;
                }
                response.json().then(function (data) {
                    resolve({ data: data });
                }, function () {
                    resolve({ error: "bad_json" });
                });
            }).catch(function (error) {
                resolve({ error: error && error.name === "AbortError" ? "timeout" : "network_error" });
            }).then(function () {
                if (timer) clearTimeout(timer);
            });
        });
    }

    function finishLoad() {
        state.loading = false;
        if (els.refresh) {
            els.refresh.disabled = false;
            els.refresh.textContent = "刷新";
        }
        updateLastSync();
    }

    function applyResults(results) {
        var statusResult = results[0] || {};
        var batteryResult = results[1] || {};
        var statusOk = isObject(statusResult.data);
        var batteryOk = isObject(batteryResult.data);

        if (statusOk) {
            state.status = statusResult.data;
            renderStatus(state.status);
        } else if (!state.status) {
            renderStatus({});
        }

        if (batteryOk) {
            state.battery = batteryResult.data;
            renderBattery(state.battery);
        } else if (!state.battery) {
            renderBattery(null);
        }

        var anyOk = statusOk || batteryOk;
        if (anyOk) {
            state.lastFetchAt = Date.now();
            if (state.demo) {
                setConnection("demo", "已连接");
            } else {
                setConnection(statusOk && batteryOk ? "ok" : "partial",
                    statusOk && batteryOk ? "已连接" : "部分数据不可用");
            }
        } else {
            setConnection("error", "暂时无法获取");
        }
    }

    function load(manual) {
        if (state.loading) return;
        state.loading = true;
        state.lastAttemptAt = Date.now();
        setConnection("loading", manual ? "刷新中…" : "连接中…");
        if (els.refresh) {
            els.refresh.disabled = true;
            els.refresh.textContent = "刷新中…";
        }

        Promise.all([fetchJson(urlFor("status")), fetchJson(urlFor("battery"))]).then(function (results) {
            try {
                applyResults(results);
            } catch (error) {
                if (window.console && console.warn) console.warn("live-status render failed", error);
            }
        }).then(finishLoad, finishLoad);
    }

    function tick() {
        if (state.status) renderStatus(state.status);
        if (state.battery) renderBattery(state.battery);
        updateLastSync();
        if (!document.hidden && state.lastAttemptAt
            && Date.now() - state.lastAttemptAt >= refreshMs()) {
            load(false);
        }
    }

    function onVisibilityChange() {
        if (document.hidden) return;
        if (!state.lastAttemptAt || Date.now() - state.lastAttemptAt >= refreshMs()) {
            load(false);
        } else {
            tick();
        }
    }

    function hideSection() {
        var section = getElement("status");
        if (section) section.hidden = true;
        var link = document.querySelector('.navbar a[href="#status"]');
        if (link && link.parentNode) link.parentNode.hidden = true;
    }

    function init() {
        if (!config.enabled) {
            hideSection();
            return;
        }
        if (!getElement("status")) return;
        cacheElements();
        if (!els.grid) return;
        if (state.demo && els.demo) els.demo.hidden = false;
        if (els.refresh) {
            els.refresh.addEventListener("click", function () {
                load(true);
            });
        }
        document.addEventListener("visibilitychange", onVisibilityChange);
        load(false);
        state.timer = setInterval(tick, tickMs());
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
