(() => {
  const STORAGE_KEY = "goodsheet.trades.v1";
  const SETTINGS_KEY = "goodsheet.settings.v1";
  const FILTER_KEY = "goodsheet.filter.v1";
  const FORM_KEY = "goodsheet.form.v1";
  const PSYCH_KEY = "goodsheet.psych.v1";
  const PAGE_KEY = "goodsheet.page.v1";
  const DEFAULT_MIND_TAGS = ["睡不好", "趕時間", "想翻本", "怕錯過", "很穩", "心煩", "過勞"];
  const DEFAULT_BEH_TYPES = ["破規則", "停手", "加碼", "提前出場", "其他"];
  const DEFAULT_EVT_TYPES = ["重大消息", "跳空", "斷線", "會議", "資金異動", "生活事件", "其他"];

  const els = {
    form: document.getElementById("trade-form"),
    tradeId: document.getElementById("trade-id"),
    date: document.getElementById("f-date"),
    time: document.getElementById("f-time"),
    pnl: document.getElementById("f-pnl"),
    fee: document.getElementById("f-fee"),
    notes: document.getElementById("f-notes"),
    formMode: document.getElementById("form-mode"),
    netPreview: document.getElementById("net-preview"),
    accountManager: document.getElementById("account-manager"),
    strategyManager: document.getElementById("strategy-manager"),
    formAccounts: document.getElementById("form-accounts"),
    formStrategies: document.getElementById("form-strategies"),
    accountInitial: document.getElementById("account-initial"),
    allInitial: document.getElementById("all-initial"),
    accountFilters: document.getElementById("account-filters"),
    strategyFilters: document.getElementById("strategy-filters"),
    rangeFrom: document.getElementById("range-from"),
    rangeTo: document.getElementById("range-to"),
    curveMeta: document.getElementById("curve-meta"),
    kpiEquity: document.getElementById("kpi-equity"),
    kpiCount: document.getElementById("kpi-count"),
    kpiPnl: document.getElementById("kpi-pnl"),
    kpiAvgWin: document.getElementById("kpi-avg-win"),
    kpiAvgLoss: document.getElementById("kpi-avg-loss"),
    kpiWl: document.getElementById("kpi-wl"),
    kpiWinrate: document.getElementById("kpi-winrate"),
    kpiInitial: document.getElementById("kpi-initial"),
    kpiSharpe: document.getElementById("kpi-sharpe"),
    kpiMaxWin: document.getElementById("kpi-max-win"),
    kpiMaxLoss: document.getElementById("kpi-max-loss"),
    kpiGross: document.getElementById("kpi-gross"),
    kpiGrossAmt: document.getElementById("kpi-gross-amt"),
    calendar: document.getElementById("calendar"),
    calTitle: document.getElementById("cal-title"),
    rows: document.getElementById("trade-rows"),
    checkBanner: document.getElementById("check-banner"),
    modal: document.getElementById("day-modal"),
    modalTitle: document.getElementById("modal-title"),
    modalSub: document.getElementById("modal-sub"),
    paneCurve: document.getElementById("pane-curve"),
    paneFills: document.getElementById("pane-fills"),
    panePsych: document.getElementById("pane-psych"),
    pageLedger: document.getElementById("page-ledger"),
    pagePsych: document.getElementById("page-psych"),
    psychDate: document.getElementById("psych-date"),
    psychTime: document.getElementById("psych-time"),
    mindForm: document.getElementById("mind-form"),
    mindId: document.getElementById("mind-id"),
    mindNote: document.getElementById("mind-note"),
    mindMode: document.getElementById("mind-mode"),
    mindTagManager: document.getElementById("mind-tag-manager"),
    behForm: document.getElementById("beh-form"),
    behId: document.getElementById("beh-id"),
    behNote: document.getElementById("beh-note"),
    behMode: document.getElementById("beh-mode"),
    behTypeManager: document.getElementById("beh-type-manager"),
    evtForm: document.getElementById("evt-form"),
    evtId: document.getElementById("evt-id"),
    evtNote: document.getElementById("evt-note"),
    evtMode: document.getElementById("evt-mode"),
    evtTypeManager: document.getElementById("evt-type-manager"),
    psychLogRows: document.getElementById("psych-log-rows"),
    psychTodayPnl: document.getElementById("psych-today-pnl"),
  };

  let trades = loadTrades();
  let settings = loadSettings();
  let psych = loadPsych();
  let filters = loadFilters();
  let formAccount = settings.accounts[0]?.name || "";
  let formStrategy = settings.strategies[0] || "";
  let formSide = "";
  let currentPage = localStorage.getItem(PAGE_KEY) || "ledger";
  let mindSession = "pre";
  let mindEnergy = 3;
  let mindAnxiety = 3;
  let mindFocus = 3;
  let mindTagSel = new Set();
  let behType = "";
  let evtType = "";
  let psychLogSort = "time";
  let psychLogDir = "desc";
  loadFormPrefs();
  let viewYear;
  let viewMonth;
  let chart;
  let dayChart;
  const now = new Date();
  viewYear = now.getFullYear();
  viewMonth = now.getMonth();

  function uid() {
    return crypto.randomUUID ? crypto.randomUUID() : `t_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  function round2(n) {
    return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  }

  function cents(n) {
    return Math.round(Number(n) * 100);
  }

  function netOf(trade) {
    return round2(Number(trade.pnl) - Math.abs(Number(trade.fee) || 0));
  }

  function fmtMoney(n) {
    const v = Number(n) || 0;
    const sign = v > 0 ? "+" : "";
    return `${sign}${v.toLocaleString("zh-TW", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  }

  function pnlClass(n) {
    const v = Number(n);
    if (v > 0) return "profit";
    if (v < 0) return "loss";
    return "flat";
  }

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function splitStoredDatetime(value) {
    const s = String(value || "").trim().replace("T", " ");
    const [d, t = ""] = s.split(/\s+/);
    const time = (t || "00:00").slice(0, 5);
    return { date: d, time };
  }

  function parseDateInput(raw) {
    const s = String(raw || "").trim();
    if (!s) return "";
    const digits = s.replace(/\D/g, "");
    let y;
    let m;
    let d;
    if (/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/.test(s)) {
      const parts = s.split(/[-/.]/).map(Number);
      [y, m, d] = parts;
    } else if (/^\d{1,2}[-/.]\d{1,2}$/.test(s)) {
      const parts = s.split(/[-/.]/).map(Number);
      y = new Date().getFullYear();
      [m, d] = parts;
    } else if (digits.length === 8) {
      y = Number(digits.slice(0, 4));
      m = Number(digits.slice(4, 6));
      d = Number(digits.slice(6, 8));
    } else if (digits.length === 4) {
      y = new Date().getFullYear();
      m = Number(digits.slice(0, 2));
      d = Number(digits.slice(2, 4));
    } else {
      return "";
    }
    const dt = new Date(y, m - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return "";
    return `${y}-${pad(m)}-${pad(d)}`;
  }

  function parseTimeInput(raw) {
    const s = String(raw || "").trim();
    if (!s) {
      const n = new Date();
      return `${pad(n.getHours())}:${pad(n.getMinutes())}`;
    }
    const digits = s.replace(/\D/g, "");
    let h;
    let min;
    if (/^\d{1,2}:\d{2}/.test(s)) {
      const parts = s.split(":");
      h = Number(parts[0]);
      min = Number(parts[1]);
    } else if (digits.length === 3 || digits.length === 4) {
      const padded = digits.padStart(4, "0");
      h = Number(padded.slice(0, 2));
      min = Number(padded.slice(2, 4));
    } else {
      return "";
    }
    if (h < 0 || h > 23 || min < 0 || min > 59) return "";
    return `${pad(h)}:${pad(min)}`;
  }

  function composeDatetime() {
    const date = parseDateInput(els.date.value);
    const time = parseTimeInput(els.time.value);
    if (!date || !time) return "";
    return `${date}T${time}`;
  }

  function fillDatetimeFields(value) {
    if (value instanceof Date) {
      els.date.value = `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
      els.time.value = `${pad(value.getHours())}:${pad(value.getMinutes())}`;
      return;
    }
    const parts = splitStoredDatetime(value);
    els.date.value = parseDateInput(parts.date) || parts.date;
    els.time.value = parts.time ? parseTimeInput(parts.time) || parts.time : "";
  }

  function setDefaultDatetime() {
    if (!els.date.value) fillDatetimeFields(new Date());
  }

  function nowTimeStr() {
    const n = new Date();
    return `${pad(n.getHours())}:${pad(n.getMinutes())}`;
  }

  function fillPsychDatetime(value) {
    if (value instanceof Date) {
      els.psychDate.value = `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
      els.psychTime.value = `${pad(value.getHours())}:${pad(value.getMinutes())}`;
      return;
    }
    const parts = splitStoredDatetime(value);
    els.psychDate.value = parseDateInput(parts.date) || parts.date;
    els.psychTime.value = parts.time ? parseTimeInput(parts.time) || parts.time : "";
  }

  function setDefaultPsychDatetime() {
    if (!els.psychDate.value) {
      const n = new Date();
      els.psychDate.value = `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`;
    } else {
      const d = parseDateInput(els.psychDate.value);
      if (d) els.psychDate.value = d;
    }
    if (!els.psychTime.value.trim()) els.psychTime.value = nowTimeStr();
  }

  function refreshPsychTimeNow() {
    els.psychTime.value = nowTimeStr();
  }

  function dayKey(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function sideLabel(side) {
    if (side === "long") return "多";
    if (side === "short") return "空";
    return "—";
  }

  function migrateTrade(raw) {
    const account = String(raw.account || "").trim();
    const strategy = String(raw.strategy || raw.tag || "").trim();
    return {
      id: String(raw.id || uid()),
      datetime: String(raw.datetime || raw.date || ""),
      account,
      strategy,
      side: raw.side === "long" || raw.side === "short" ? raw.side : "",
      pnl: round2(raw.pnl ?? raw.realizedPnl ?? 0),
      fee: round2(Math.abs(Number(raw.fee) || 0)),
      notes: String(raw.notes || ""),
    };
  }

  function loadTrades() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.map(migrateTrade) : [];
    } catch {
      return [];
    }
  }

  function loadSettings() {
    let parsed = { accounts: [], strategies: [] };
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) parsed = { accounts: [], strategies: [], ...JSON.parse(raw) };
    } catch {
      parsed = { accounts: [], strategies: [] };
    }
    if (!Array.isArray(parsed.accounts)) parsed.accounts = [];
    if (!Array.isArray(parsed.strategies)) parsed.strategies = [];
    parsed.strategies = parsed.strategies.map((s) => (typeof s === "string" ? s : s?.name || "")).filter(Boolean);
    const accNames = new Set(parsed.accounts.map((a) => a.name));
    const stNames = new Set(parsed.strategies);
    for (const t of trades || []) {
      if (t.account && !accNames.has(t.account)) {
        parsed.accounts.push({ name: t.account, initial: 0 });
        accNames.add(t.account);
      }
      if (t.strategy && !stNames.has(t.strategy)) {
        parsed.strategies.push(t.strategy);
        stNames.add(t.strategy);
      }
    }
    return parsed;
  }

  function loadPsych() {
    try {
      const raw = localStorage.getItem(PSYCH_KEY);
      const p = raw ? JSON.parse(raw) : {};
      return {
        mind: Array.isArray(p.mind) ? p.mind : [],
        behaviors: Array.isArray(p.behaviors) ? p.behaviors : [],
        events: Array.isArray(p.events) ? p.events : [],
        mindTags: Array.isArray(p.mindTags) && p.mindTags.length ? p.mindTags : [...DEFAULT_MIND_TAGS],
        behaviorTypes: Array.isArray(p.behaviorTypes) && p.behaviorTypes.length ? p.behaviorTypes : [...DEFAULT_BEH_TYPES],
        eventTypes: Array.isArray(p.eventTypes) && p.eventTypes.length ? p.eventTypes : [...DEFAULT_EVT_TYPES],
      };
    } catch {
      return {
        mind: [],
        behaviors: [],
        events: [],
        mindTags: [...DEFAULT_MIND_TAGS],
        behaviorTypes: [...DEFAULT_BEH_TYPES],
        eventTypes: [...DEFAULT_EVT_TYPES],
      };
    }
  }

  function loadFilters() {
    try {
      const raw = localStorage.getItem(FILTER_KEY);
      if (!raw) return { account: "ALL", strategy: "ALL", from: "", to: "", preset: "ALL" };
      if (raw.startsWith("{")) {
        const parsed = JSON.parse(raw);
        return {
          account: parsed.account || "ALL",
          strategy: parsed.strategy || "ALL",
          from: parsed.from || "",
          to: parsed.to || "",
          preset: parsed.preset || "ALL",
        };
      }
      return { account: raw, strategy: "ALL", from: "", to: "", preset: "ALL" };
    } catch {
      return { account: "ALL", strategy: "ALL", from: "", to: "", preset: "ALL" };
    }
  }

  function saveFilters() {
    localStorage.setItem(FILTER_KEY, JSON.stringify(filters));
  }

  function loadFormPrefs() {
    try {
      const p = JSON.parse(localStorage.getItem(FORM_KEY) || "{}");
      if (p.account && settings.accounts.some((a) => a.name === p.account)) formAccount = p.account;
      if (p.strategy && settings.strategies.includes(p.strategy)) formStrategy = p.strategy;
      if (p.side === "long" || p.side === "short" || p.side === "") formSide = p.side || "";
      if (Number.isFinite(Number(p.fee))) els.fee.value = String(round2(Math.abs(p.fee)));
    } catch {
      /* ignore */
    }
  }

  function persistFormPrefs() {
    localStorage.setItem(
      FORM_KEY,
      JSON.stringify({
        account: formAccount,
        strategy: formStrategy,
        side: formSide,
        fee: round2(Math.abs(Number(els.fee.value) || 0)),
      })
    );
  }

  function saveAll() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trades));
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    localStorage.setItem(PSYCH_KEY, JSON.stringify(psych));
  }

  function sorted(list) {
    return [...list].sort((a, b) => String(a.datetime).localeCompare(String(b.datetime)) || String(a.id).localeCompare(String(b.id)));
  }

  function accountNames() {
    return settings.accounts.map((a) => a.name);
  }

  function strategyNames() {
    return settings.strategies;
  }

  function ymd(d) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function mondayOf(d) {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const dow = x.getDay();
    x.setDate(x.getDate() - (dow === 0 ? 6 : dow - 1));
    return x;
  }

  function accountStrategyTrades() {
    return trades.filter((t) => {
      if (filters.account !== "ALL" && t.account !== filters.account) return false;
      if (filters.strategy !== "ALL" && t.strategy !== filters.strategy) return false;
      return true;
    });
  }

  function inDateRange(key) {
    if (!key) return false;
    if (filters.from && key < filters.from) return false;
    if (filters.to && key > filters.to) return false;
    return true;
  }

  function filteredTrades() {
    return accountStrategyTrades().filter((t) => inDateRange(dayKey(t.datetime)));
  }

  function priorNet() {
    if (!filters.from) return 0;
    return round2(
      accountStrategyTrades().reduce((s, t) => {
        const k = dayKey(t.datetime);
        return k && k < filters.from ? s + netOf(t) : s;
      }, 0)
    );
  }

  function initialOf(accountFilter) {
    if (accountFilter === "ALL") {
      return round2(settings.accounts.reduce((s, a) => s + Number(a.initial || 0), 0));
    }
    const acc = settings.accounts.find((a) => a.name === accountFilter);
    return round2(acc ? Number(acc.initial || 0) : 0);
  }

  function filterCaption() {
    const acc = filters.account === "ALL" ? "全部帳戶" : filters.account;
    const st = filters.strategy === "ALL" ? "全部策略" : filters.strategy;
    const time =
      !filters.from && !filters.to ? "全部時間" : `${filters.from || "起"}～${filters.to || "迄"}`;
    return `${acc} · ${st} · ${time}`;
  }

  function equitySeries(list, initial) {
    let run = round2(initial);
    const pts = [{ x: "起始", y: run, id: "start" }];
    for (const t of sorted(list)) {
      run = round2(run + netOf(t));
      pts.push({ x: t.datetime, y: run, id: t.id });
    }
    return pts;
  }

  function dailyBuckets(list) {
    const map = new Map();
    for (const t of list) {
      const key = dayKey(t.datetime);
      if (!key) continue;
      const cur = map.get(key) || { pnl: 0, count: 0, trades: [] };
      cur.pnl = round2(cur.pnl + netOf(t));
      cur.count += 1;
      cur.trades.push(t);
      map.set(key, cur);
    }
    return map;
  }

  function winStats(list) {
    const wins = [];
    const losses = [];
    let maxWin = null;
    let maxLoss = null;
    for (const t of list) {
      const n = netOf(t);
      if (maxWin === null || n > maxWin) maxWin = n;
      if (maxLoss === null || n < maxLoss) maxLoss = n;
      if (n > 0) wins.push(n);
      else if (n < 0) losses.push(n);
    }
    const sumWin = wins.length ? round2(wins.reduce((s, v) => s + v, 0)) : 0;
    const sumLoss = losses.length ? round2(losses.reduce((s, v) => s + v, 0)) : 0;
    const avgWin = wins.length ? round2(sumWin / wins.length) : null;
    const avgLoss = losses.length ? round2(sumLoss / losses.length) : null;
    return { wins: wins.length, losses: losses.length, sumWin, sumLoss, avgWin, avgLoss, maxWin, maxLoss };
  }

  function sampleStdev(arr) {
    if (arr.length < 2) return null;
    const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
    const variance = arr.reduce((s, v) => s + (v - mean) ** 2, 0) / (arr.length - 1);
    return Math.sqrt(variance);
  }

  function sharpeOf(list, initial) {
    const days = [...dailyBuckets(list).entries()].sort((a, b) => a[0].localeCompare(b[0]));
    if (days.length < 2) return null;
    let eq = round2(initial);
    const rets = [];
    const pnls = [];
    for (const [, b] of days) {
      pnls.push(b.pnl);
      if (eq > 0) rets.push(b.pnl / eq);
      eq = round2(eq + b.pnl);
    }
    const series = rets.length >= 2 ? rets : pnls;
    const stdev = sampleStdev(series);
    if (stdev === null || stdev === 0) return null;
    const mean = series.reduce((s, v) => s + v, 0) / series.length;
    return round2((mean / stdev) * Math.sqrt(252));
  }

  function setFormMode(mode) {
    els.formMode.textContent = mode;
    els.formMode.classList.toggle("is-edit", mode === "編輯");
  }

  function updateNetPreview() {
    const pnl = Number(els.pnl.value);
    const fee = Math.abs(Number(els.fee.value) || 0);
    if (!Number.isFinite(pnl) || els.pnl.value === "") {
      els.netPreview.textContent = "—";
      els.netPreview.className = "num text-sm flat";
      return;
    }
    const net = round2(pnl - fee);
    els.netPreview.textContent = fmtMoney(net);
    els.netPreview.className = `num text-sm ${pnlClass(net)}`;
  }

  function syncActive(root, attr, value) {
    if (!root) return;
    root.querySelectorAll(`[${attr}]`).forEach((btn) => {
      btn.classList.toggle("is-active", btn.getAttribute(attr) === value);
    });
  }

  function selectAccount(name) {
    formAccount = name || "";
    persistFormPrefs();
    syncActive(els.formAccounts, "data-form-acc", formAccount);
    syncActive(els.accountManager, "data-pick-acc", formAccount);
    const selected = settings.accounts.find((a) => a.name === formAccount);
    els.accountInitial.value = selected ? selected.initial : "";
    els.accountInitial.disabled = !selected;
  }

  function selectStrategy(name) {
    formStrategy = name || "";
    persistFormPrefs();
    syncActive(els.formStrategies, "data-form-st", formStrategy);
    syncActive(els.strategyManager, "data-pick-st", formStrategy);
  }

  function resetForm(keepContext) {
    const dateKeep = keepContext ? els.date.value : "";
    const feeKeep = keepContext ? els.fee.value : "";
    const accKeep = formAccount;
    const stKeep = formStrategy;
    const sideKeep = formSide;
    els.form.reset();
    els.tradeId.value = "";
    setFormMode("新增");
    if (keepContext) {
      els.date.value = dateKeep;
      formAccount = accKeep;
      formStrategy = stKeep;
      formSide = sideKeep;
      els.fee.value = feeKeep || "0";
      fillDatetimeFields(composeDatetime() || new Date());
      syncActive(els.formAccounts, "data-form-acc", formAccount);
      syncActive(els.formStrategies, "data-form-st", formStrategy);
      renderSideChips();
    } else {
      els.fee.value = feeKeep || "0";
      loadFormPrefs();
      setDefaultDatetime();
      renderFormAccounts();
      renderFormStrategies();
      renderSideChips();
    }
    els.pnl.value = "";
    els.notes.value = "";
    updateNetPreview();
    if (keepContext) els.pnl.focus();
  }

  function renderChipRow(items, selected, pickAttr, delAttr, addId, addLabel) {
    const chips = items
      .map((name) => {
        const on = name === selected ? "is-active" : "";
        return `<span class="inline-flex items-center gap-1">
          <button type="button" ${pickAttr}="${escapeAttr(name)}" class="strategy-chip ${on} rounded-full px-3 py-1 text-xs">${escapeHtml(name)}</button>
          <button type="button" ${delAttr}="${escapeAttr(name)}" class="rounded-full border border-slate-700 px-2 py-0.5 text-xs text-slate-400">−</button>
        </span>`;
      })
      .join("");
    return `${chips}<button type="button" id="${addId}" class="rounded-full border border-sky-500/50 px-3 py-1 text-xs text-sky-200">${addLabel}</button>`;
  }

  function renderAccountManager() {
    els.accountManager.innerHTML = renderChipRow(accountNames(), formAccount, "data-pick-acc", "data-del-acc", "btn-add-account", "＋ 新增帳戶");
    const selected = settings.accounts.find((a) => a.name === formAccount);
    els.accountInitial.value = selected ? selected.initial : "";
    els.accountInitial.disabled = !selected;
    els.allInitial.textContent = fmtMoney(initialOf("ALL"));
  }

  function renderStrategyManager() {
    els.strategyManager.innerHTML = renderChipRow(strategyNames(), formStrategy, "data-pick-st", "data-del-st", "btn-add-strategy", "＋ 新增策略");
  }

  function renderFormAccounts() {
    renderSelectChips(els.formAccounts, accountNames(), formAccount, "data-form-acc", "請先在上方按 ＋ 新增帳戶。");
  }

  function renderFormStrategies() {
    renderSelectChips(els.formStrategies, strategyNames(), formStrategy, "data-form-st", "請先在上方按 ＋ 新增策略。");
  }

  function renderSelectChips(el, names, selected, attr, emptyMsg) {
    if (!names.length) {
      el.dataset.sig = "";
      el.innerHTML = `<p class="text-xs text-amber-300">${emptyMsg}</p>`;
      return;
    }
    const sig = names.join("\0");
    if (el.dataset.sig !== sig) {
      el.dataset.sig = sig;
      el.innerHTML = names
        .map((name) => `<button type="button" ${attr}="${escapeAttr(name)}" class="strategy-chip rounded-full px-3 py-1 text-xs">${escapeHtml(name)}</button>`)
        .join("");
    }
    syncActive(el, attr, selected);
  }

  function renderSideChips() {
    document.querySelectorAll("#side-group .side-chip").forEach((btn) => {
      btn.classList.toggle("is-active", (btn.getAttribute("data-side") || "") === formSide);
    });
  }

  function renderFilterRow(el, items, current, allLabel, attr) {
    const tags = ["ALL", ...items];
    el.innerHTML = tags
      .map((tag) => {
        const label = tag === "ALL" ? allLabel : tag;
        const active = tag === current ? "is-active" : "";
        return `<button type="button" ${attr}="${escapeAttr(tag)}" class="strategy-chip ${active} rounded-full px-3 py-1 text-xs">${escapeHtml(label)}</button>`;
      })
      .join("");
  }

  function renderFilters() {
    if (filters.account !== "ALL" && !accountNames().includes(filters.account)) filters.account = "ALL";
    if (filters.strategy !== "ALL" && !strategyNames().includes(filters.strategy)) filters.strategy = "ALL";
    renderFilterRow(els.accountFilters, accountNames(), filters.account, "全部帳戶", "data-filter-acc");
    renderFilterRow(els.strategyFilters, strategyNames(), filters.strategy, "全部策略", "data-filter-st");
    syncRangeInputs();
  }

  function syncRangeInputs() {
    if (!els.rangeFrom) return;
    els.rangeFrom.value = filters.from || "";
    els.rangeTo.value = filters.to || "";
    const preset = !filters.from && !filters.to ? "ALL" : filters.preset || "CUSTOM";
    document.querySelectorAll("#range-presets [data-range]").forEach((btn) => {
      btn.classList.toggle("is-active", btn.getAttribute("data-range") === preset);
    });
  }

  function yearsAgo(d, n) {
    return new Date(d.getFullYear() - n, d.getMonth(), d.getDate());
  }

  function applyRangePreset(preset) {
    const d = new Date();
    const y = d.getFullYear();
    const m = d.getMonth();
    filters.preset = preset;
    if (preset === "ALL") {
      filters.from = "";
      filters.to = "";
    } else if (preset === "TODAY") {
      filters.from = ymd(d);
      filters.to = ymd(d);
    } else if (preset === "WEEK") {
      filters.from = ymd(mondayOf(d));
      filters.to = ymd(d);
    } else if (preset === "MONTH") {
      filters.from = `${y}-${pad(m + 1)}-01`;
      filters.to = ymd(d);
    } else if (preset === "QUARTER") {
      const qStart = Math.floor(m / 3) * 3;
      filters.from = `${y}-${pad(qStart + 1)}-01`;
      filters.to = ymd(d);
    } else if (preset === "HALF") {
      filters.from = `${y}-${m < 6 ? "01" : "07"}-01`;
      filters.to = ymd(d);
    } else if (preset === "YEAR") {
      filters.from = `${y}-01-01`;
      filters.to = ymd(d);
    } else if (preset === "Y2") {
      filters.from = ymd(yearsAgo(d, 2));
      filters.to = ymd(d);
    } else if (preset === "Y3") {
      filters.from = ymd(yearsAgo(d, 3));
      filters.to = ymd(d);
    }
    saveFilters();
    render();
  }

  function commitRangeInputs() {
    let from = parseDateInput(els.rangeFrom.value) || "";
    let to = parseDateInput(els.rangeTo.value) || "";
    if (from && to && from > to) {
      const tmp = from;
      from = to;
      to = tmp;
    }
    filters.from = from;
    filters.to = to;
    filters.preset = !from && !to ? "ALL" : "CUSTOM";
    saveFilters();
    render();
  }

  function renderKpis(list, series, initial) {
    const pnl = round2(list.reduce((s, t) => s + netOf(t), 0));
    const end = series.length ? series[series.length - 1].y : initial;
    const stats = winStats(list);
    els.kpiCount.textContent = String(list.length);
    els.kpiPnl.textContent = fmtMoney(pnl);
    els.kpiPnl.className = `num mt-1 text-lg ${pnlClass(pnl)}`;
    els.kpiAvgWin.textContent = stats.avgWin === null ? "—" : fmtMoney(stats.avgWin);
    els.kpiAvgWin.className = `num mt-1 text-lg ${stats.avgWin === null ? "flat" : "profit"}`;
    els.kpiAvgLoss.textContent = stats.avgLoss === null ? "—" : fmtMoney(stats.avgLoss);
    els.kpiAvgLoss.className = `num mt-1 text-lg ${stats.avgLoss === null ? "flat" : "loss"}`;
    els.kpiWl.textContent = `${stats.wins} / ${stats.losses}`;
    const lossAbs = Math.abs(stats.sumLoss);
    els.kpiGrossAmt.innerHTML = `<span class="${stats.sumWin > 0 ? "profit" : "flat"}">${fmtMoney(stats.sumWin)}</span> / <span class="${stats.sumLoss < 0 ? "loss" : "flat"}">${fmtMoney(stats.sumLoss)}</span>`;
    if (!lossAbs) {
      els.kpiGross.textContent = "—";
      els.kpiGross.className = "num mt-1 text-lg flat";
    } else {
      const ratio = stats.sumWin / lossAbs;
      els.kpiGross.textContent = ratio.toFixed(3);
      els.kpiGross.className = `num mt-1 text-lg ${ratio > 1 ? "profit" : ratio < 1 ? "loss" : "flat"}`;
    }
    els.kpiWinrate.textContent = list.length ? `${round2((stats.wins / list.length) * 100).toFixed(1)}%` : "—";
    els.kpiWinrate.className = `num mt-1 text-lg ${!list.length ? "flat" : stats.wins / list.length >= 0.5 ? "profit" : "loss"}`;
    els.kpiInitial.textContent = fmtMoney(initial);
    const sharpe = sharpeOf(list, round2(initial + priorNet()));
    els.kpiSharpe.textContent = sharpe === null ? "—" : sharpe.toFixed(2);
    els.kpiSharpe.className = `num mt-1 text-lg ${sharpe === null ? "flat" : pnlClass(sharpe)}`;
    els.kpiMaxWin.textContent = stats.maxWin === null ? "—" : fmtMoney(stats.maxWin);
    els.kpiMaxWin.className = `num mt-1 text-lg ${stats.maxWin === null ? "flat" : pnlClass(stats.maxWin)}`;
    els.kpiMaxLoss.textContent = stats.maxLoss === null ? "—" : fmtMoney(stats.maxLoss);
    els.kpiMaxLoss.className = `num mt-1 text-lg ${stats.maxLoss === null ? "flat" : pnlClass(stats.maxLoss)}`;
    els.kpiEquity.textContent = fmtMoney(end);
    els.kpiEquity.className = `num text-xl font-semibold ${pnlClass(end - initial)}`;
    els.curveMeta.textContent = `${filterCaption()} · 帳戶初始資金 + 篩選後累積淨損益`;
  }

  function applyChart(instance, canvas, series, label) {
    const labels = series.map((p) => String(p.x).replace("T", " "));
    const data = series.map((p) => p.y);
    if (instance) {
      instance.data.labels = labels;
      instance.data.datasets[0].data = data;
      instance.data.datasets[0].label = label;
      instance.update();
      return instance;
    }
    return new Chart(canvas, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label,
            data,
            borderColor: "#38bdf8",
            backgroundColor: "rgba(56, 189, 248, 0.12)",
            fill: true,
            tension: 0.2,
            pointRadius: series.length > 60 ? 0 : 3,
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: {
            ticks: { color: "#8b9bb0", maxRotation: 0, autoSkip: true, maxTicksLimit: 8 },
            grid: { color: "rgba(36, 48, 65, 0.6)" },
          },
          y: {
            ticks: { color: "#8b9bb0" },
            grid: { color: "rgba(36, 48, 65, 0.6)" },
          },
        },
      },
    });
  }

  function renderChart(series) {
    chart = applyChart(chart, document.getElementById("equity-chart"), series, "權益");
  }

  function renderCalendar(list) {
    const buckets = dailyBuckets(list);
    els.calTitle.textContent = `${viewYear} / ${pad(viewMonth + 1)}`;
    const first = new Date(viewYear, viewMonth, 1);
    const startWeekday = first.getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const cells = [];
    const weekDays = [];
    for (let i = 0; i < startWeekday; i += 1) {
      const dt = new Date(viewYear, viewMonth, 1 - (startWeekday - i));
      weekDays.push(dt);
      cells.push(dayCell(dt, buckets, true));
    }
    for (let d = 1; d <= daysInMonth; d += 1) {
      const dt = new Date(viewYear, viewMonth, d);
      weekDays.push(dt);
      cells.push(dayCell(dt, buckets, false));
    }
    while (weekDays.length % 7 !== 0) {
      const dt = new Date(viewYear, viewMonth + 1, weekDays.length - (startWeekday + daysInMonth) + 1);
      weekDays.push(dt);
      cells.push(dayCell(dt, buckets, true));
    }
    const withTotals = [];
    for (let i = 0; i < weekDays.length; i += 7) {
      const slice = weekDays.slice(i, i + 7);
      withTotals.push(...cells.slice(i, i + 7));
      withTotals.push(weekTotalCell(slice, buckets));
    }
    els.calendar.innerHTML = withTotals.join("");
  }

  function dayCell(dt, buckets, muted) {
    const key = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
    const bucket = buckets.get(key);
    const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const isToday = key === today ? "is-today" : "";
    const mutedCls = muted ? "is-muted" : "";
    const pnlHtml = bucket
      ? `<div class="num text-xs ${pnlClass(bucket.pnl)}">${fmtMoney(bucket.pnl)}</div><div class="text-[10px] text-slate-500">${bucket.count} 筆</div>`
      : `<div class="text-[10px] text-slate-600">—</div>`;
    const mark = dayHasPsych(key) ? `<span class="mt-1 inline-block h-1.5 w-1.5 rounded-full bg-violet-400"></span>` : "";
    return `<button type="button" class="cal-cell has-trades ${isToday} ${mutedCls}" data-day="${key}">
      <div class="flex items-start justify-between gap-1">
        <div class="text-[11px] text-slate-400">${dt.getDate()}</div>
        ${mark}
      </div>
      ${pnlHtml}
    </button>`;
  }

  function weekTotalCell(days, buckets) {
    let pnl = 0;
    let count = 0;
    for (const dt of days) {
      const key = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
      const b = buckets.get(key);
      if (!b) continue;
      pnl = round2(pnl + b.pnl);
      count += b.count;
    }
    const body = count
      ? `<div class="num text-xs ${pnlClass(pnl)}">${fmtMoney(pnl)}</div><div class="text-[10px] text-slate-500">${count} 筆</div>`
      : `<div class="text-[10px] text-slate-600">—</div>`;
    return `<div class="week-total"><div class="text-[11px] text-sky-300/80">週計</div>${body}</div>`;
  }

  function renderTable(list) {
    const rows = sorted(list)
      .reverse()
      .map((t) => {
        const net = netOf(t);
        return `<tr class="border-t border-slate-800">
          <td class="py-2 pr-3 whitespace-nowrap">${escapeHtml(String(t.datetime).replace("T", " "))}</td>
          <td class="py-2 pr-3">${escapeHtml(t.account)}</td>
          <td class="py-2 pr-3">${escapeHtml(t.strategy || "—")}</td>
          <td class="py-2 pr-3">${sideLabel(t.side)}</td>
          <td class="py-2 pr-3 text-right num ${pnlClass(t.pnl)}">${fmtMoney(t.pnl)}</td>
          <td class="py-2 pr-3 text-right num">${Number(t.fee || 0).toLocaleString("zh-TW")}</td>
          <td class="py-2 pr-3 text-right num ${pnlClass(net)}">${fmtMoney(net)}</td>
          <td class="py-2 pr-3 text-slate-400">${escapeHtml(t.notes || "")}</td>
          <td class="py-2 text-right whitespace-nowrap">
            <button data-edit="${t.id}" class="text-xs text-sky-300">編輯</button>
            <button data-del="${t.id}" class="ml-2 text-xs text-rose-300">刪除</button>
          </td>
        </tr>`;
      })
      .join("");
    els.rows.innerHTML = rows || `<tr><td colspan="9" class="py-6 text-center text-slate-500">尚無交易。先記一筆當沖。</td></tr>`;
  }

  function render() {
    const list = filteredTrades();
    const initial = initialOf(filters.account);
    const series = equitySeries(list, round2(initial + priorNet()));
    renderAccountManager();
    renderStrategyManager();
    renderFormAccounts();
    renderFormStrategies();
    renderSideChips();
    renderFilters();
    renderKpis(list, series, initial);
    renderChart(series);
    renderCalendar(list);
    renderTable(list);
    updateNetPreview();
    renderPsych();
  }

  function upsertTrade(trade) {
    const idx = trades.findIndex((t) => t.id === trade.id);
    if (idx >= 0) trades[idx] = trade;
    else trades.push(trade);
    saveAll();
    render();
  }

  function addAccount() {
    const name = (prompt("新帳戶名稱", "期貨戶") || "").trim();
    if (!name) return;
    if (settings.accounts.some((a) => a.name === name)) {
      alert("這個帳戶已存在。");
      return;
    }
    const initialRaw = prompt("此帳戶初始資金（可填 0）", "0");
    const initial = round2(Number(initialRaw || 0));
    settings.accounts.push({ name, initial: Number.isFinite(initial) ? initial : 0 });
    formAccount = name;
    saveAll();
    render();
  }

  function addStrategy() {
    const name = (prompt("新策略名稱", "A策略") || "").trim();
    if (!name) return;
    if (settings.strategies.includes(name)) {
      alert("這個策略已存在。");
      return;
    }
    settings.strategies.push(name);
    formStrategy = name;
    saveAll();
    render();
  }

  function deleteAccount(name) {
    const used = trades.some((t) => t.account === name);
    if (used && !confirm(`「${name}」已有交易。刪除後，那些成交仍會留著但不再對應此帳戶。確定刪除？`)) return;
    settings.accounts = settings.accounts.filter((a) => a.name !== name);
    if (formAccount === name) formAccount = settings.accounts[0]?.name || "";
    if (filters.account === name) filters.account = "ALL";
    saveFilters();
    saveAll();
    render();
  }

  function deleteStrategy(name) {
    const used = trades.some((t) => t.strategy === name);
    if (used && !confirm(`「${name}」已有交易。刪除後，那些成交仍會留著但不再對應此策略。確定刪除？`)) return;
    settings.strategies = settings.strategies.filter((s) => s !== name);
    if (formStrategy === name) formStrategy = settings.strategies[0] || "";
    if (filters.strategy === name) filters.strategy = "ALL";
    saveFilters();
    saveAll();
    render();
  }

  function runDataCheck() {
    const nets = trades.map((t) => netOf(t));
    const sumNet = round2(nets.reduce((s, v) => s + v, 0));
    const initial = initialOf("ALL");
    const curveEnd = equitySeries(trades, initial).at(-1)?.y ?? initial;
    const calSum = round2([...dailyBuckets(trades).values()].reduce((s, b) => s + Number(b.pnl), 0));
    const curvePnl = round2(curveEnd - initial);
    const ok = cents(sumNet) === cents(curvePnl) && cents(sumNet) === cents(calSum);
    const list = filteredTrades();
    const fInit = round2(initialOf(filters.account) + priorNet());
    const fSum = round2(list.reduce((s, t) => s + netOf(t), 0));
    const fEnd = equitySeries(list, fInit).at(-1)?.y ?? fInit;
    els.checkBanner.classList.remove("hidden");
    els.checkBanner.innerHTML = ok
      ? `<p class="text-emerald-300 font-semibold">00 數據檢查通過</p>
         <p class="mt-1 text-slate-300">全量淨損益 ${fmtMoney(sumNet)} ＝ 曲線終點 − 初始 ${fmtMoney(curvePnl)} ＝ 日曆加總 ${fmtMoney(calSum)}。權益終點 ${fmtMoney(curveEnd)}（初始 ${fmtMoney(initial)}）。</p>
         <p class="mt-1 text-slate-500">目前篩選「${filterCaption()}」淨損益 ${fmtMoney(fSum)}，權益 ${fmtMoney(fEnd)}。心理 ${psych.mind.length}、行為 ${psych.behaviors.length}、事件 ${(psych.events || []).length} 筆（不計入損益）。</p>`
      : `<p class="text-rose-300 font-semibold">00 數據檢查失敗</p>
         <p class="mt-1">淨損益 ${fmtMoney(sumNet)}、曲線變動 ${fmtMoney(curvePnl)}、日曆加總 ${fmtMoney(calSum)} 不一致。</p>`;
  }

  function download(filename, text, mime) {
    const blob = new Blob([text], { type: mime });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function exportJson() {
    download(
      `goodsheet-${stamp()}.json`,
      JSON.stringify({ version: 5, settings, trades, psych }, null, 2),
      "application/json"
    );
  }

  function csvEscape(v) {
    const s = String(v ?? "");
    if (/[",\n]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
    return s;
  }

  function exportCsv() {
    const header = ["id", "datetime", "account", "strategy", "side", "pnl", "fee", "notes"];
    const lines = [header.join(",")];
    for (const t of sorted(trades)) {
      lines.push([t.id, t.datetime, t.account, t.strategy, t.side, t.pnl, t.fee, t.notes].map(csvEscape).join(","));
    }
    download(`goodsheet-${stamp()}.csv`, lines.join("\n"), "text/csv");
  }

  function stamp() {
    const d = new Date();
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  }

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let cur = "";
    let q = false;
    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i];
      if (q) {
        if (ch === '"' && text[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else if (ch === '"') q = false;
        else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === ",") {
        row.push(cur);
        cur = "";
      } else if (ch === "\n") {
        row.push(cur);
        rows.push(row);
        row = [];
        cur = "";
      } else if (ch !== "\r") cur += ch;
    }
    if (cur.length || row.length) {
      row.push(cur);
      rows.push(row);
    }
    return rows.filter((r) => r.some((c) => String(c).trim() !== ""));
  }

  function normalizeImported(raw) {
    const t = migrateTrade(raw);
    if (!t.datetime || (!t.account && !t.strategy) || !Number.isFinite(Number(t.pnl))) return null;
    t.datetime = t.datetime.includes("T") ? t.datetime : `${t.datetime}T00:00`;
    return t;
  }

  function ensureCatalogFrom(list) {
    const accNames = new Set(settings.accounts.map((a) => a.name));
    const stNames = new Set(settings.strategies);
    for (const t of list) {
      if (t.account && !accNames.has(t.account)) {
        settings.accounts.push({ name: t.account, initial: 0 });
        accNames.add(t.account);
      }
      if (t.strategy && !stNames.has(t.strategy)) {
        settings.strategies.push(t.strategy);
        stNames.add(t.strategy);
      }
    }
  }

  function mergeSettings(incomingSettings) {
    if (!incomingSettings) return;
    if (incomingSettings.accounts) {
      const accMap = new Map(settings.accounts.map((a) => [a.name, a]));
      for (const a of incomingSettings.accounts) accMap.set(a.name, { name: a.name, initial: round2(a.initial || 0) });
      settings.accounts = [...accMap.values()];
    }
    if (incomingSettings.strategies) {
      const names = incomingSettings.strategies.map((s) => (typeof s === "string" ? s : s?.name || "")).filter(Boolean);
      settings.strategies = [...new Set([...settings.strategies, ...names])];
    }
  }

  function importPayload(items, incomingSettings, incomingPsych) {
    const incoming = items.map(normalizeImported).filter(Boolean);
    const hasPsych = incomingPsych && (incomingPsych.mind || incomingPsych.behaviors || incomingPsych.events);
    if (!incoming.length && !hasPsych) {
      alert("檔案沒有可匯入的有效交易或心理紀錄。");
      return;
    }
    const merge = confirm(`讀到成交 ${incoming.length} 筆。\n確定：合併進現有資料\n取消：覆蓋全部現有資料`);
    if (merge) {
      const map = new Map(trades.map((t) => [t.id, t]));
      for (const t of incoming) map.set(t.id, t);
      trades = [...map.values()];
      mergeSettings(incomingSettings);
      mergePsych(incomingPsych, true);
    } else {
      trades = incoming;
      settings = {
        accounts: (incomingSettings?.accounts || []).map((a) => ({ name: a.name, initial: round2(a.initial || 0) })),
        strategies: (incomingSettings?.strategies || []).map((s) => (typeof s === "string" ? s : s?.name || "")).filter(Boolean),
      };
      mergePsych(incomingPsych, false);
    }
    ensureCatalogFrom(trades);
    if (!formAccount) formAccount = settings.accounts[0]?.name || "";
    if (!formStrategy) formStrategy = settings.strategies[0] || "";
    saveAll();
    render();
  }

  function mergePsych(incomingPsych, merge) {
    if (!incomingPsych) return;
    const mind = Array.isArray(incomingPsych.mind) ? incomingPsych.mind : [];
    const behaviors = Array.isArray(incomingPsych.behaviors) ? incomingPsych.behaviors : [];
    const events = Array.isArray(incomingPsych.events) ? incomingPsych.events : [];
    const mindTags = incomingPsych.mindTags || [];
    const behaviorTypes = incomingPsych.behaviorTypes || [];
    const eventTypes = incomingPsych.eventTypes || [];
    if (merge) {
      const m = new Map(psych.mind.map((x) => [x.id, x]));
      for (const x of mind) if (x.id) m.set(x.id, x);
      psych.mind = [...m.values()];
      const b = new Map(psych.behaviors.map((x) => [x.id, x]));
      for (const x of behaviors) if (x.id) b.set(x.id, x);
      psych.behaviors = [...b.values()];
      const e = new Map((psych.events || []).map((x) => [x.id, x]));
      for (const x of events) if (x.id) e.set(x.id, x);
      psych.events = [...e.values()];
      psych.mindTags = [...new Set([...psych.mindTags, ...mindTags])];
      psych.behaviorTypes = [...new Set([...psych.behaviorTypes, ...behaviorTypes])];
      psych.eventTypes = [...new Set([...(psych.eventTypes || []), ...eventTypes])];
    } else {
      if (mind.length) psych.mind = mind;
      if (behaviors.length) psych.behaviors = behaviors;
      if (events.length) psych.events = events;
      if (mindTags.length) psych.mindTags = mindTags;
      if (behaviorTypes.length) psych.behaviorTypes = behaviorTypes;
      if (eventTypes.length) psych.eventTypes = eventTypes;
    }
  }

  function handleImport(file) {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      try {
        const isCsv = file.name.toLowerCase().endsWith(".csv") || (!text.trim().startsWith("{") && !text.trim().startsWith("["));
        if (isCsv) {
          const rows = parseCsv(text);
          const header = rows[0].map((h) => h.trim().toLowerCase());
          const body = rows.slice(1).map((r) => {
            const o = {};
            header.forEach((h, i) => {
              o[h] = r[i];
            });
            return o;
          });
          importPayload(body);
        } else {
          const json = JSON.parse(text);
          const list = Array.isArray(json) ? json : json.trades || [];
          if (!Array.isArray(list) && !json.psych) throw new Error("JSON 格式需為陣列或 { trades, psych }");
          importPayload(list, json.settings, json.psych);
        }
      } catch (err) {
        alert(`匯入失敗：${err.message || err}`);
      }
    };
    reader.readAsText(file);
  }

  function startOfDayEquity(key, list, initial) {
    let run = round2(initial);
    for (const t of sorted(list)) {
      if (dayKey(t.datetime) >= key) break;
      run = round2(run + netOf(t));
    }
    return run;
  }

  function openDay(key) {
    const list = filteredTrades();
    const initial = initialOf(filters.account);
    const bucket = dailyBuckets(list).get(key) || { pnl: 0, count: 0, trades: [] };
    const sod = startOfDayEquity(key, list, initial);
    const dayTrades = sorted(bucket.trades);
    const series = [{ x: `${key} 開盤權益`, y: sod, id: "sod" }];
    let run = sod;
    for (const t of dayTrades) {
      run = round2(run + netOf(t));
      series.push({ x: String(t.datetime).replace("T", " "), y: run, id: t.id });
    }
    els.modalTitle.textContent = key;
    els.modalSub.textContent = `${filterCaption()} · ${bucket.count} 筆 · 當日淨 ${fmtMoney(bucket.pnl)}`;
    els.modalSub.className = `text-sm ${pnlClass(bucket.pnl)}`;
    els.paneFills.innerHTML = dayTrades.length
      ? dayTrades
          .map((t) => {
            const net = netOf(t);
            return `<div class="rounded-xl border border-slate-700 p-3">
              <div class="flex justify-between gap-3 text-sm">
                <span>${escapeHtml(String(t.datetime).replace("T", " "))} · ${escapeHtml(t.account)} · ${escapeHtml(t.strategy || "—")} · ${sideLabel(t.side)}</span>
                <span class="num ${pnlClass(net)}">${fmtMoney(net)}</span>
              </div>
              <p class="mt-1 text-xs text-slate-500">平倉 ${fmtMoney(t.pnl)}　手續費 ${Number(t.fee || 0).toLocaleString("zh-TW")}　${escapeHtml(t.notes || "")}</p>
            </div>`;
          })
          .join("")
      : `<p class="text-sm text-slate-500">當日無成交。</p>`;
    els.panePsych.innerHTML = renderDayPsychHtml(key);
    showPane("curve");
    els.modal.classList.remove("hidden");
    els.modal.classList.add("flex");
    requestAnimationFrame(() => {
      dayChart = applyChart(dayChart, document.getElementById("day-chart"), series, "當日權益");
    });
  }

  function showPane(name) {
    els.paneCurve.classList.toggle("hidden", name !== "curve");
    els.paneFills.classList.toggle("hidden", name !== "fills");
    els.panePsych.classList.toggle("hidden", name !== "psych");
    els.modal.querySelectorAll("[data-pane]").forEach((btn) => {
      btn.classList.toggle("is-active", btn.getAttribute("data-pane") === name);
    });
  }

  function closeModal() {
    els.modal.classList.add("hidden");
    els.modal.classList.remove("flex");
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function escapeAttr(s) {
    return escapeHtml(s).replaceAll("'", "&#39;");
  }

  function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function dayHasPsych(key) {
    return (
      psych.mind.some((m) => m.date === key) ||
      psych.behaviors.some((b) => dayKey(b.datetime) === key) ||
      (psych.events || []).some((e) => dayKey(e.datetime) === key)
    );
  }

  function sessionLabel(s) {
    return s === "post" ? "收盤後" : "開盤前";
  }

  function renderScale(el, key, value) {
    if (!el) return;
    if (el.dataset.ready !== "1") {
      el.innerHTML = [1, 2, 3, 4, 5]
        .map((n) => `<button type="button" data-scale="${key}" data-n="${n}" class="strategy-chip rounded-md px-2.5 py-1 text-xs">${n}</button>`)
        .join("");
      el.dataset.ready = "1";
    }
    el.querySelectorAll("[data-n]").forEach((btn) => {
      btn.classList.toggle("is-active", Number(btn.getAttribute("data-n")) === value);
    });
  }

  function renderMindTags() {
    const chips = psych.mindTags
      .map((name) => {
        const on = mindTagSel.has(name) ? "is-active" : "";
        return `<span class="inline-flex items-center gap-1">
          <button type="button" data-mind-tag="${escapeAttr(name)}" class="strategy-chip ${on} rounded-full px-3 py-1 text-xs">${escapeHtml(name)}</button>
          <button type="button" data-del-mind-tag="${escapeAttr(name)}" class="rounded-full border border-slate-700 px-2 py-0.5 text-xs text-slate-400">−</button>
        </span>`;
      })
      .join("");
    els.mindTagManager.innerHTML = `${chips}<button type="button" id="btn-add-mind-tag" class="rounded-full border border-sky-500/50 px-3 py-1 text-xs text-sky-200">＋</button>`;
  }

  function psychTimeText(kind, rec) {
    if (kind === "mind") return rec.time ? `${rec.date} ${rec.time}` : rec.date || "";
    return String(rec.datetime || "").replace("T", " ");
  }

  function psychSessionText(rec) {
    return rec.session ? sessionLabel(rec.session) : "—";
  }

  function collectPsychLog() {
    const rows = [];
    for (const m of psych.mind) {
      const tags = (m.tags || []).join("、");
      rows.push({
        kind: "mind",
        kindLabel: "心理",
        id: m.id,
        time: psychTimeText("mind", m),
        session: psychSessionText(m),
        status: `能量 ${m.energy} · 心情 ${m.anxiety} · 狀態 ${m.focus}${tags ? "　" + tags : ""}`,
        note: m.note || "",
      });
    }
    for (const b of psych.behaviors) {
      rows.push({
        kind: "beh",
        kindLabel: "行為",
        id: b.id,
        time: psychTimeText("beh", b),
        session: psychSessionText(b),
        status: b.type || "",
        note: b.note || "",
      });
    }
    for (const e of psych.events || []) {
      rows.push({
        kind: "evt",
        kindLabel: "事件",
        id: e.id,
        time: psychTimeText("evt", e),
        session: psychSessionText(e),
        status: e.type || "",
        note: e.note || "",
      });
    }
    const dir = psychLogDir === "asc" ? 1 : -1;
    const kindRank = { mind: 0, beh: 1, evt: 2 };
    const keyOf = (r) => {
      if (psychLogSort === "session") return r.session;
      if (psychLogSort === "kind") return String(kindRank[r.kind] ?? 9);
      if (psychLogSort === "status") return r.status;
      if (psychLogSort === "note") return r.note;
      return r.time;
    };
    rows.sort((a, b) => {
      const cmp = String(keyOf(a)).localeCompare(String(keyOf(b)), "zh-Hant");
      if (cmp) return cmp * dir;
      return String(a.time).localeCompare(String(b.time)) * dir;
    });
    return rows;
  }

  function renderPsychLog() {
    document.querySelectorAll("[data-log-sort]").forEach((th) => {
      const on = th.getAttribute("data-log-sort") === psychLogSort;
      th.classList.toggle("is-asc", on && psychLogDir === "asc");
      th.classList.toggle("is-desc", on && psychLogDir === "desc");
    });
    const rows = collectPsychLog();
    if (!els.psychLogRows) return;
    els.psychLogRows.innerHTML = rows.length
      ? rows
          .map(
            (r) => `<tr class="border-t border-slate-800">
              <td class="py-2 pr-3 whitespace-nowrap num">${escapeHtml(r.time)}</td>
              <td class="py-2 pr-3 whitespace-nowrap">${escapeHtml(r.session)}</td>
              <td class="py-2 pr-3 whitespace-nowrap"><span class="kind-pill kind-${r.kind}">${escapeHtml(r.kindLabel)}</span></td>
              <td class="cell-clip py-2 pr-3" title="${escapeAttr(r.status)}">${escapeHtml(r.status)}</td>
              <td class="cell-clip py-2 pr-3 text-slate-400" title="${escapeAttr(r.note)}">${escapeHtml(r.note)}</td>
              <td class="py-2 text-right whitespace-nowrap">
                <button data-edit-${r.kind}="${r.id}" class="text-xs text-sky-300">編輯</button>
                <button data-del-${r.kind}="${r.id}" class="ml-2 text-xs text-rose-300">刪除</button>
              </td>
            </tr>`
          )
          .join("")
      : `<tr><td colspan="6" class="py-6 text-center text-slate-500">尚無心理戰紀錄。上面三格記下後會出現在這裡。</td></tr>`;
  }

  function renderEvtTypes() {
    if (!psych.eventTypes) psych.eventTypes = [...DEFAULT_EVT_TYPES];
    if (!evtType || !psych.eventTypes.includes(evtType)) evtType = psych.eventTypes[0] || "";
    const chips = psych.eventTypes
      .map((name) => {
        const on = name === evtType ? "is-active" : "";
        return `<span class="inline-flex items-center gap-1">
          <button type="button" data-evt-type="${escapeAttr(name)}" class="strategy-chip ${on} rounded-full px-3 py-1 text-xs">${escapeHtml(name)}</button>
          <button type="button" data-del-evt-type="${escapeAttr(name)}" class="rounded-full border border-slate-700 px-2 py-0.5 text-xs text-slate-400">−</button>
        </span>`;
      })
      .join("");
    els.evtTypeManager.innerHTML = `${chips}<button type="button" id="btn-add-evt-type" class="rounded-full border border-sky-500/50 px-3 py-1 text-xs text-sky-200">＋</button>`;
  }

  function renderBehTypes() {
    if (!behType || !psych.behaviorTypes.includes(behType)) behType = psych.behaviorTypes[0] || "";
    const chips = psych.behaviorTypes
      .map((name) => {
        const on = name === behType ? "is-active" : "";
        return `<span class="inline-flex items-center gap-1">
          <button type="button" data-beh-type="${escapeAttr(name)}" class="strategy-chip ${on} rounded-full px-3 py-1 text-xs">${escapeHtml(name)}</button>
          <button type="button" data-del-beh-type="${escapeAttr(name)}" class="rounded-full border border-slate-700 px-2 py-0.5 text-xs text-slate-400">−</button>
        </span>`;
      })
      .join("");
    els.behTypeManager.innerHTML = `${chips}<button type="button" id="btn-add-beh-type" class="rounded-full border border-sky-500/50 px-3 py-1 text-xs text-sky-200">＋</button>`;
  }

  function renderDayPsychHtml(key) {
    const minds = psych.mind.filter((m) => m.date === key);
    const behs = psych.behaviors.filter((b) => dayKey(b.datetime) === key);
    const evts = (psych.events || []).filter((e) => dayKey(e.datetime) === key);
    const mindHtml = minds.length
      ? minds.map((m) => `<div class="rounded-xl border border-slate-700 p-3 text-sm">${psychSessionText(m)} · 能量 ${m.energy} / 心情 ${m.anxiety} / 狀態 ${m.focus}<p class="mt-1 text-xs text-slate-400">${escapeHtml((m.tags || []).join("、"))} ${escapeHtml(m.note || "")}</p></div>`).join("")
      : `<p class="text-sm text-slate-500">當日無心理紀錄。</p>`;
    const behHtml = behs.length
      ? behs.map((b) => `<div class="rounded-xl border border-slate-700 p-3 text-sm">${escapeHtml(psychTimeText("beh", b))} · ${psychSessionText(b)} · ${escapeHtml(b.type || "")}<p class="mt-1 text-xs text-slate-400">${escapeHtml(b.note || "")}</p></div>`).join("")
      : `<p class="text-sm text-slate-500">當日無行為記錄。</p>`;
    const evtHtml = evts.length
      ? evts.map((e) => `<div class="rounded-xl border border-slate-700 p-3 text-sm">${escapeHtml(psychTimeText("evt", e))} · ${psychSessionText(e)} · ${escapeHtml(e.type || "")}<p class="mt-1 text-xs text-slate-400">${escapeHtml(e.note || "")}</p></div>`).join("")
      : `<p class="text-sm text-slate-500">當日無事件。</p>`;
    return `<p class="text-xs text-slate-500">心理紀錄</p>${mindHtml}<p class="mt-3 text-xs text-slate-500">行為記錄</p>${behHtml}<p class="mt-3 text-xs text-slate-500">事件</p>${evtHtml}`;
  }

  function renderPsych() {
    syncActive(document.getElementById("psych-session"), "data-session", mindSession);
    renderScale(document.getElementById("mind-energy"), "energy", mindEnergy);
    renderScale(document.getElementById("mind-anxiety"), "anxiety", mindAnxiety);
    renderScale(document.getElementById("mind-focus"), "focus", mindFocus);
    renderMindTags();
    renderBehTypes();
    renderEvtTypes();
    renderPsychLog();
    const today = todayKey();
    const pnl = round2(filteredTrades().filter((t) => dayKey(t.datetime) === today).reduce((s, t) => s + netOf(t), 0));
    els.psychTodayPnl.textContent = fmtMoney(pnl);
    els.psychTodayPnl.className = `num ${pnlClass(pnl)}`;
    showPage(currentPage);
  }

  function showPage(name) {
    currentPage = name === "psych" ? "psych" : "ledger";
    localStorage.setItem(PAGE_KEY, currentPage);
    els.pageLedger.classList.toggle("hidden", currentPage !== "ledger");
    els.pagePsych.classList.toggle("hidden", currentPage !== "psych");
    document.querySelectorAll("#page-nav [data-page]").forEach((btn) => {
      btn.classList.toggle("is-active", btn.getAttribute("data-page") === currentPage);
    });
  }

  function resetMindForm() {
    els.mindId.value = "";
    els.mindMode.textContent = "新增";
    els.mindMode.classList.remove("is-edit");
    mindTagSel = new Set();
    els.mindNote.value = "";
  }

  function resetBehForm(refreshTime) {
    els.behId.value = "";
    els.behMode.textContent = "新增";
    els.behMode.classList.remove("is-edit");
    els.behNote.value = "";
    if (refreshTime) refreshPsychTimeNow();
  }

  function resetEvtForm(refreshTime) {
    els.evtId.value = "";
    els.evtMode.textContent = "新增";
    els.evtMode.classList.remove("is-edit");
    els.evtNote.value = "";
    if (refreshTime) refreshPsychTimeNow();
  }

  function refreshPsychView() {
    saveAll();
    renderPsych();
    renderCalendar(filteredTrades());
  }

  els.form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!formAccount) {
      alert("請先新增並選取帳戶。");
      return;
    }
    if (!formStrategy) {
      alert("請先新增並選取策略。");
      return;
    }
    const datetime = composeDatetime();
    if (!datetime) {
      alert("日期請輸入可辨識格式，例如 2026-08-15、20260815 或 8/15；時間例如 09:30 或 930。");
      return;
    }
    const trade = {
      id: els.tradeId.value || uid(),
      datetime,
      account: formAccount,
      strategy: formStrategy,
      side: formSide,
      pnl: round2(els.pnl.value),
      fee: round2(Math.abs(Number(els.fee.value) || 0)),
      notes: els.notes.value.trim(),
    };
    if (!trade.datetime || Number.isNaN(trade.pnl)) return;
    upsertTrade(trade);
    persistFormPrefs();
    resetForm(true);
  });

  document.getElementById("btn-reset-form").addEventListener("click", () => resetForm(false));
  document.getElementById("btn-check").addEventListener("click", runDataCheck);
  document.getElementById("btn-export-json").addEventListener("click", exportJson);
  document.getElementById("btn-export-csv").addEventListener("click", exportCsv);
  document.getElementById("import-file").addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) handleImport(file);
    e.target.value = "";
  });
  document.getElementById("cal-prev").addEventListener("click", () => {
    viewMonth -= 1;
    if (viewMonth < 0) {
      viewMonth = 11;
      viewYear -= 1;
    }
    renderCalendar(filteredTrades());
  });
  document.getElementById("cal-next").addEventListener("click", () => {
    viewMonth += 1;
    if (viewMonth > 11) {
      viewMonth = 0;
      viewYear += 1;
    }
    renderCalendar(filteredTrades());
  });
  document.getElementById("modal-close").addEventListener("click", closeModal);
  els.modal.addEventListener("click", (e) => {
    if (e.target === els.modal) closeModal();
  });
  els.modal.addEventListener("click", (e) => {
    const tab = e.target.closest("[data-pane]");
    if (tab) showPane(tab.getAttribute("data-pane"));
  });

  function onAddKind(kind) {
    if (kind === "account") addAccount();
    if (kind === "strategy") addStrategy();
  }

  els.accountManager.addEventListener("click", (e) => {
    if (e.target.closest("#btn-add-account")) {
      addAccount();
      return;
    }
    const pick = e.target.closest("[data-pick-acc]");
    if (pick) {
      selectAccount(pick.getAttribute("data-pick-acc") || "");
      return;
    }
    const del = e.target.closest("[data-del-acc]");
    if (del) deleteAccount(del.getAttribute("data-del-acc"));
  });

  els.strategyManager.addEventListener("click", (e) => {
    if (e.target.closest("#btn-add-strategy")) {
      addStrategy();
      return;
    }
    const pick = e.target.closest("[data-pick-st]");
    if (pick) {
      selectStrategy(pick.getAttribute("data-pick-st") || "");
      return;
    }
    const del = e.target.closest("[data-del-st]");
    if (del) deleteStrategy(del.getAttribute("data-del-st"));
  });

  els.formAccounts.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-form-acc]");
    if (!btn) return;
    formAccount = btn.getAttribute("data-form-acc") || "";
    selectAccount(formAccount);
  });

  els.formStrategies.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-form-st]");
    if (!btn) return;
    formStrategy = btn.getAttribute("data-form-st") || "";
    selectStrategy(formStrategy);
  });

  document.getElementById("side-group").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-side]");
    if (!btn) return;
    formSide = btn.getAttribute("data-side") || "";
    persistFormPrefs();
    renderSideChips();
  });

  els.accountInitial.addEventListener("change", () => {
    const acc = settings.accounts.find((a) => a.name === formAccount);
    if (!acc) return;
    acc.initial = round2(Number(els.accountInitial.value) || 0);
    saveAll();
    render();
  });

  els.accountFilters.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-filter-acc]");
    if (!btn) return;
    filters.account = btn.getAttribute("data-filter-acc") || "ALL";
    saveFilters();
    render();
  });

  els.strategyFilters.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-filter-st]");
    if (!btn) return;
    filters.strategy = btn.getAttribute("data-filter-st") || "ALL";
    saveFilters();
    render();
  });

  document.getElementById("range-presets").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-range]");
    if (!btn) return;
    applyRangePreset(btn.getAttribute("data-range") || "ALL");
  });
  els.rangeFrom.addEventListener("blur", commitRangeInputs);
  els.rangeTo.addEventListener("blur", commitRangeInputs);
  els.rangeFrom.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitRangeInputs();
    }
  });
  els.rangeTo.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitRangeInputs();
    }
  });

  els.calendar.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-day]");
    if (!btn) return;
    openDay(btn.getAttribute("data-day"));
  });

  els.rows.addEventListener("click", (e) => {
    const editId = e.target.getAttribute("data-edit");
    const delId = e.target.getAttribute("data-del");
    if (editId) {
      const t = trades.find((x) => x.id === editId);
      if (!t) return;
      els.tradeId.value = t.id;
      fillDatetimeFields(t.datetime);
      selectAccount(t.account);
      selectStrategy(t.strategy || "");
      formSide = t.side || "";
      els.pnl.value = t.pnl;
      els.fee.value = t.fee || 0;
      els.notes.value = t.notes || "";
      setFormMode("編輯");
      renderSideChips();
      updateNetPreview();
      els.form.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    if (delId && confirm("確定刪除此筆？")) {
      trades = trades.filter((t) => t.id !== delId);
      saveAll();
      render();
    }
  });

  els.pnl.addEventListener("input", updateNetPreview);
  els.fee.addEventListener("input", () => {
    updateNetPreview();
    persistFormPrefs();
  });
  els.date.addEventListener("blur", () => {
    const d = parseDateInput(els.date.value);
    if (d) els.date.value = d;
  });
  els.time.addEventListener("blur", () => {
    if (!els.time.value.trim()) return;
    const t = parseTimeInput(els.time.value);
    if (t) els.time.value = t;
  });

  document.getElementById("page-nav").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-page]");
    if (btn) showPage(btn.getAttribute("data-page"));
  });

  document.getElementById("psych-session").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-session]");
    if (!btn) return;
    mindSession = btn.getAttribute("data-session") || "pre";
    syncActive(document.getElementById("psych-session"), "data-session", mindSession);
  });

  ["mind-energy", "mind-anxiety", "mind-focus"].forEach((id) => {
    document.getElementById(id).addEventListener("click", (e) => {
      const btn = e.target.closest("[data-scale]");
      if (!btn) return;
      const key = btn.getAttribute("data-scale");
      const n = Number(btn.getAttribute("data-n"));
      if (key === "energy") mindEnergy = n;
      if (key === "anxiety") mindAnxiety = n;
      if (key === "focus") mindFocus = n;
      renderScale(document.getElementById(`mind-${key}`), key, n);
    });
  });

  els.mindTagManager.addEventListener("click", (e) => {
    if (e.target.id === "btn-add-mind-tag") {
      const name = (prompt("新狀態標籤", "想翻本") || "").trim();
      if (name && !psych.mindTags.includes(name)) {
        psych.mindTags.push(name);
        saveAll();
        renderMindTags();
      }
      return;
    }
    const pick = e.target.closest("[data-mind-tag]");
    if (pick) {
      const name = pick.getAttribute("data-mind-tag");
      if (mindTagSel.has(name)) mindTagSel.delete(name);
      else mindTagSel.add(name);
      renderMindTags();
      return;
    }
    const del = e.target.closest("[data-del-mind-tag]");
    if (del) {
      const name = del.getAttribute("data-del-mind-tag");
      psych.mindTags = psych.mindTags.filter((t) => t !== name);
      mindTagSel.delete(name);
      saveAll();
      renderMindTags();
    }
  });

  els.behTypeManager.addEventListener("click", (e) => {
    if (e.target.id === "btn-add-beh-type") {
      const name = (prompt("新行為模型", "復仇單") || "").trim();
      if (name && !psych.behaviorTypes.includes(name)) {
        psych.behaviorTypes.push(name);
        behType = name;
        saveAll();
        renderBehTypes();
      }
      return;
    }
    const pick = e.target.closest("[data-beh-type]");
    if (pick) {
      behType = pick.getAttribute("data-beh-type") || "";
      renderBehTypes();
      return;
    }
    const del = e.target.closest("[data-del-beh-type]");
    if (del) {
      const name = del.getAttribute("data-del-beh-type");
      psych.behaviorTypes = psych.behaviorTypes.filter((t) => t !== name);
      if (behType === name) behType = psych.behaviorTypes[0] || "";
      saveAll();
      renderBehTypes();
    }
  });

  els.mindForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const date = parseDateInput(els.psychDate.value);
    if (!date) {
      alert("請輸入日期，例如 2026-08-15、20260815 或 8/15。");
      return;
    }
    els.psychDate.value = date;
    const time = parseTimeInput(els.psychTime.value) || "";
    const rec = {
      id: els.mindId.value || uid(),
      date,
      time,
      session: mindSession,
      energy: mindEnergy,
      anxiety: mindAnxiety,
      focus: mindFocus,
      tags: [...mindTagSel],
      note: els.mindNote.value.trim(),
    };
    const idx = psych.mind.findIndex((m) => m.id === rec.id);
    if (idx >= 0) psych.mind[idx] = rec;
    else psych.mind.push(rec);
    resetMindForm();
    refreshPsychView();
    els.mindNote.focus();
  });

  els.behForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const date = parseDateInput(els.psychDate.value);
    const time = parseTimeInput(els.psychTime.value);
    if (!date || !time) {
      alert("日期請輸入可辨識格式，例如 2026-08-15、20260815 或 8/15；時間例如 09:30 或 930。");
      return;
    }
    els.psychDate.value = date;
    els.psychTime.value = time;
    if (!behType) {
      alert("請選行為模型。");
      return;
    }
    const rec = {
      id: els.behId.value || uid(),
      datetime: `${date}T${time}`,
      session: mindSession,
      type: behType,
      note: els.behNote.value.trim(),
    };
    const idx = psych.behaviors.findIndex((b) => b.id === rec.id);
    if (idx >= 0) psych.behaviors[idx] = rec;
    else psych.behaviors.push(rec);
    resetBehForm(true);
    refreshPsychView();
    els.behNote.focus();
  });

  document.getElementById("mind-reset").addEventListener("click", () => {
    mindEnergy = 3;
    mindAnxiety = 3;
    mindFocus = 3;
    resetMindForm();
    renderPsych();
  });
  document.getElementById("beh-reset").addEventListener("click", () => {
    resetBehForm(false);
    renderPsych();
  });
  document.getElementById("evt-reset").addEventListener("click", () => {
    resetEvtForm(false);
    renderPsych();
  });

  document.getElementById("psych-log-rows").addEventListener("click", (e) => {
    const mindEdit = e.target.getAttribute("data-edit-mind");
    const mindDel = e.target.getAttribute("data-del-mind");
    const behEdit = e.target.getAttribute("data-edit-beh");
    const behDel = e.target.getAttribute("data-del-beh");
    const evtEdit = e.target.getAttribute("data-edit-evt");
    const evtDel = e.target.getAttribute("data-del-evt");
    if (mindEdit) {
      const m = psych.mind.find((x) => x.id === mindEdit);
      if (!m) return;
      els.mindId.value = m.id;
      els.psychDate.value = parseDateInput(m.date) || m.date;
      if (m.time) els.psychTime.value = m.time;
      else setDefaultPsychDatetime();
      mindSession = m.session || "pre";
      mindEnergy = Number(m.energy) || 3;
      mindAnxiety = Number(m.anxiety) || 3;
      mindFocus = Number(m.focus) || 3;
      mindTagSel = new Set(m.tags || []);
      els.mindNote.value = m.note || "";
      els.mindMode.textContent = "編輯";
      els.mindMode.classList.add("is-edit");
      renderPsych();
      els.mindForm.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    if (mindDel && confirm("確定刪除此筆心理紀錄？")) {
      psych.mind = psych.mind.filter((m) => m.id !== mindDel);
      refreshPsychView();
    }
    if (behEdit) {
      const b = psych.behaviors.find((x) => x.id === behEdit);
      if (!b) return;
      els.behId.value = b.id;
      fillPsychDatetime(b.datetime);
      mindSession = b.session || mindSession;
      behType = b.type;
      els.behNote.value = b.note || "";
      els.behMode.textContent = "編輯";
      els.behMode.classList.add("is-edit");
      renderPsych();
      els.behForm.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    if (behDel && confirm("確定刪除此筆行為記錄？")) {
      psych.behaviors = psych.behaviors.filter((b) => b.id !== behDel);
      refreshPsychView();
    }
    if (evtEdit) {
      const rec = (psych.events || []).find((x) => x.id === evtEdit);
      if (!rec) return;
      els.evtId.value = rec.id;
      fillPsychDatetime(rec.datetime);
      mindSession = rec.session || mindSession;
      evtType = rec.type;
      els.evtNote.value = rec.note || "";
      els.evtMode.textContent = "編輯";
      els.evtMode.classList.add("is-edit");
      renderPsych();
      els.evtForm.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    if (evtDel && confirm("確定刪除此筆事件？")) {
      psych.events = (psych.events || []).filter((x) => x.id !== evtDel);
      refreshPsychView();
    }
  });

  document.querySelectorAll("[data-log-sort]").forEach((th) => {
    th.addEventListener("click", () => {
      const next = th.getAttribute("data-log-sort") || "time";
      if (psychLogSort === next) psychLogDir = psychLogDir === "desc" ? "asc" : "desc";
      else {
        psychLogSort = next;
        psychLogDir = "asc";
      }
      renderPsychLog();
    });
  });

  els.evtTypeManager.addEventListener("click", (e) => {
    if (e.target.id === "btn-add-evt-type") {
      const name = (prompt("新事件類型", "重大消息") || "").trim();
      if (name && !psych.eventTypes.includes(name)) {
        psych.eventTypes.push(name);
        evtType = name;
        saveAll();
        renderEvtTypes();
      }
      return;
    }
    const pick = e.target.closest("[data-evt-type]");
    if (pick) {
      evtType = pick.getAttribute("data-evt-type") || "";
      renderEvtTypes();
      return;
    }
    const del = e.target.closest("[data-del-evt-type]");
    if (del) {
      const name = del.getAttribute("data-del-evt-type");
      psych.eventTypes = psych.eventTypes.filter((t) => t !== name);
      if (evtType === name) evtType = psych.eventTypes[0] || "";
      saveAll();
      renderEvtTypes();
    }
  });

  els.evtForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const date = parseDateInput(els.psychDate.value);
    const time = parseTimeInput(els.psychTime.value);
    if (!date || !time) {
      alert("日期請輸入可辨識格式，例如 2026-08-15、20260815 或 8/15；時間例如 09:30 或 930。");
      return;
    }
    els.psychDate.value = date;
    els.psychTime.value = time;
    if (!evtType) {
      alert("請選事件類型。");
      return;
    }
    if (!psych.events) psych.events = [];
    const rec = {
      id: els.evtId.value || uid(),
      datetime: `${date}T${time}`,
      session: mindSession,
      type: evtType,
      note: els.evtNote.value.trim(),
    };
    const idx = psych.events.findIndex((x) => x.id === rec.id);
    if (idx >= 0) psych.events[idx] = rec;
    else psych.events.push(rec);
    resetEvtForm(true);
    refreshPsychView();
    els.evtNote.focus();
  });

  els.psychDate.addEventListener("blur", () => {
    const d = parseDateInput(els.psychDate.value);
    if (d) els.psychDate.value = d;
  });
  els.psychTime.addEventListener("blur", () => {
    if (!els.psychTime.value.trim()) return;
    const t = parseTimeInput(els.psychTime.value);
    if (t) els.psychTime.value = t;
  });

  function wipeWithConfirm(count, label, apply) {
    if (!count) {
      alert(`目前沒有${label}。`);
      return;
    }
    if (!confirm(`確定一鍵刪除全部 ${count} 筆${label}？此動作無法復原。`)) return;
    apply();
    saveAll();
    render();
  }

  document.getElementById("btn-wipe-mind").addEventListener("click", () => {
    wipeWithConfirm(psych.mind.length, "心理紀錄", () => {
      psych.mind = [];
      resetMindForm();
    });
  });
  document.getElementById("btn-wipe-beh").addEventListener("click", () => {
    wipeWithConfirm(psych.behaviors.length, "行為記錄", () => {
      psych.behaviors = [];
      resetBehForm(false);
    });
  });
  document.getElementById("btn-wipe-evt").addEventListener("click", () => {
    wipeWithConfirm((psych.events || []).length, "事件", () => {
      psych.events = [];
      resetEvtForm(false);
    });
  });
  document.getElementById("btn-wipe-psych").addEventListener("click", () => {
    const n = psych.mind.length + psych.behaviors.length + (psych.events || []).length;
    wipeWithConfirm(n, "心理／行為／事件", () => {
      psych.mind = [];
      psych.behaviors = [];
      psych.events = [];
      resetMindForm();
      resetBehForm(false);
      resetEvtForm(false);
    });
  });
  els.form.addEventListener("click", (e) => {
    const add = e.target.closest("[data-add-kind]");
    if (!add) return;
    e.preventDefault();
    onAddKind(add.getAttribute("data-add-kind"));
  });
  document.getElementById("btn-new-trade").addEventListener("click", () => {
    resetForm(false);
    els.form.scrollIntoView({ behavior: "smooth", block: "start" });
    els.pnl.focus();
  });
  document.getElementById("btn-wipe-trades").addEventListener("click", () => {
    wipeWithConfirm(trades.length, "成交", () => {
      trades = [];
    });
  });

  function isLocalHost() {
    return location.protocol === "file:" || location.hostname === "localhost" || location.hostname === "127.0.0.1";
  }

  function onlineUrl() {
    return (window.GOODSHEET && window.GOODSHEET.onlineUrl) || "";
  }

  async function downloadOfflinePack() {
    const files = ["index.html", "styles.css", "app.js", "config.js"];
    for (const name of files) {
      const res = await fetch(name);
      if (!res.ok) continue;
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      URL.revokeObjectURL(a.href);
    }
  }

  const btnOffline = document.getElementById("btn-open-offline");
  const btnOnline = document.getElementById("btn-open-online");
  const btnPublish = document.getElementById("btn-publish-online");
  if (btnPublish && isLocalHost()) btnPublish.classList.remove("hidden");
  btnOffline.addEventListener("click", () => {
    if (isLocalHost()) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    downloadOfflinePack();
  });
  btnOnline.addEventListener("click", () => {
    const url = onlineUrl();
    if (!url) {
      alert("還沒上架。請在資料夾雙擊「一鍵-線上更新.command」。");
      return;
    }
    window.open(url, "_blank", "noopener");
  });
  if (btnPublish) {
    btnPublish.addEventListener("click", () => {
      alert("瀏覽器不能直接上架。請到專案資料夾雙擊「一鍵-線上更新.command」。");
    });
  }

  setDefaultDatetime();
  setDefaultPsychDatetime();
  render();
})();
