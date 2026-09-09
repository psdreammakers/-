/*
 * 交易日誌 — journal data store (the one seam this app is tested through).
 *
 * Usage (browser, plain <script> tag, no build step):
 *   const store = TradingJournal.createDefaultStore();
 *   store.addCard({ product: "MNQ", setup: "突破", accountId: "acc-main",
 *     grade: "B", execGrade: "B", side: "多", size: 2, pnl: 180,
 *     dateET: "2026-09-10", timeET: "09:41" });
 *   store.getSummary(); // -> { count, netPnl }
 *
 * Usage (Node, tests — no localStorage, so inject an in-memory backend):
 *   const { createStore, createMemoryStorage } = require("./store.js");
 *   const store = createStore(createMemoryStorage());
 *
 * API surface (small on purpose; documented by usage, not prose):
 *   store.getSettings()        -> { products, setups, accounts }
 *   store.getProducts()        -> string[]
 *   store.getSetups()          -> string[]
 *   store.getAccounts()        -> { id, name, startingCapital }[]
 *   store.addCard(input)       -> { ok:true, card } | { ok:false, errors:string[] }
 *   store.getRealCards()       -> only cards the user actually saved
 *   store.hasRealCards()       -> boolean
 *   store.isDemoActive()       -> boolean (true iff there are zero real cards)
 *   store.getCards()           -> real cards, or built-in demo cards when there are none
 *   store.netPnlOf(card)       -> number (平倉損益 − 手續費, missing fee = 0)
 *   store.getSummary()         -> { count, netPnl } over getCards() (demo-aware, what the UI shows)
 *   store.getRealSummary()     -> { count, netPnl } over getRealCards() only (never counts demo)
 *   store.getCardsOnDate(d)    -> cards (demo-aware, like getCards()) dated d, sorted by time ascending
 *   store.getDayJournal(d)     -> { dateET, background, riskCapUsd, plannedSetups, planLine, didWell,
 *                                   changeTomorrow } for that 交易日 — always a valid empty shape if unsaved
 *   store.setDayJournal(d, f)  -> { ok:true, journal } | { ok:false, errors:string[] } (upserts whole record)
 *
 * Design note: demo data is never written to storage. It is a constant that
 * getCards() returns only while getRealCards() is empty. The moment one real
 * card is saved, demo data is gone by construction — there is nothing to
 * "wipe" and nothing to toggle back on.
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
  } else {
    root.TradingJournal = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var STORAGE_KEY = "tradingJournal:v1";

  var GRADES = ["A", "B", "C", "D", "E", "F"];
  var SIDES = ["多", "空"];

  var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  var TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

  // ---- storage backends -----------------------------------------------

  function createMemoryStorage() {
    var data = Object.create(null);
    return {
      getItem: function (key) {
        return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
      },
      setItem: function (key, value) {
        data[key] = String(value);
      },
      removeItem: function (key) {
        delete data[key];
      },
    };
  }

  function detectDefaultStorage() {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        var probeKey = "__tradingJournal_probe__";
        window.localStorage.setItem(probeKey, "1");
        window.localStorage.removeItem(probeKey);
        return window.localStorage;
      }
    } catch (e) {
      // localStorage disabled (private mode, quota, etc.) — fall through.
    }
    return createMemoryStorage();
  }

  // ---- default factory-shipped settings --------------------------------

  function defaultState() {
    return {
      schemaVersion: 1,
      settings: {
        products: ["MNQ", "MES"],
        setups: ["突破", "回歸", "開盤區間"],
        accounts: [{ id: "acc-main", name: "主帳戶", startingCapital: 0 }],
      },
      cards: [],
      nextCardSeq: 1,
      dayJournals: {},
    };
  }

  // ---- small helpers -----------------------------------------------

  function isFiniteNumber(v) {
    return typeof v === "number" && isFinite(v);
  }

  function toNullableNumber(v) {
    if (v === undefined || v === null || v === "") return null;
    var n = typeof v === "number" ? v : Number(v);
    return isFinite(n) ? n : null;
  }

  function toNullableLine(v) {
    if (v === undefined || v === null) return null;
    var s = String(v).trim();
    return s === "" ? null : s;
  }

  function deepClone(v) {
    return JSON.parse(JSON.stringify(v));
  }

  // ---- demo data (never persisted; see module doc above) --------------

  var DEMO_CARDS = [
    { id: "demo-1", isDemo: true, product: "MNQ", setup: "突破", accountId: "acc-main", grade: "B", execGrade: "B", side: "多", size: 2, pnl: 240, fee: 4.5, dateET: "2026-09-08", timeET: "09:42", entryPrice: null, exitPrice: null, stopPrice: null, plannedRisk: null, entryReason: null, exitReason: null, lesson: null },
    { id: "demo-2", isDemo: true, product: "MNQ", setup: "回歸", accountId: "acc-main", grade: "D", execGrade: "C", side: "空", size: 1, pnl: -80, fee: 2.25, dateET: "2026-09-08", timeET: "15:12", entryPrice: null, exitPrice: null, stopPrice: null, plannedRisk: null, entryReason: null, exitReason: null, lesson: null },
    { id: "demo-3", isDemo: true, product: "MES", setup: "開盤區間", accountId: "acc-main", grade: "A", execGrade: "A", side: "多", size: 3, pnl: 120, fee: null, dateET: "2026-09-10", timeET: "10:05", entryPrice: null, exitPrice: null, stopPrice: null, plannedRisk: null, entryReason: null, exitReason: null, lesson: null },
    { id: "demo-4", isDemo: true, product: "MNQ", setup: "突破", accountId: "acc-main", grade: "A", execGrade: "B", side: "多", size: 2, pnl: 200, fee: 4.5, dateET: "2026-09-15", timeET: "09:35", entryPrice: null, exitPrice: null, stopPrice: null, plannedRisk: null, entryReason: null, exitReason: null, lesson: null },
    { id: "demo-5", isDemo: true, product: "MES", setup: "回歸", accountId: "acc-main", grade: "D", execGrade: "D", side: "空", size: 2, pnl: -120, fee: 3, dateET: "2026-09-16", timeET: "15:40", entryPrice: null, exitPrice: null, stopPrice: null, plannedRisk: null, entryReason: null, exitReason: null, lesson: null },
    { id: "demo-6", isDemo: true, product: "MNQ", setup: "開盤區間", accountId: "acc-main", grade: "C", execGrade: "B", side: "多", size: 1, pnl: 50, fee: null, dateET: "2026-09-18", timeET: "10:02", entryPrice: null, exitPrice: null, stopPrice: null, plannedRisk: null, entryReason: null, exitReason: null, lesson: null },
  ];

  // ---- validation --------------------------------------------------

  function validateCardInput(input, settings) {
    var errors = [];
    input = input || {};

    if (!input.product || settings.products.indexOf(input.product) === -1) {
      errors.push("商品：必須從商品清單選一個");
    }
    if (!input.setup || settings.setups.indexOf(input.setup) === -1) {
      errors.push("setup 標：必須從清單選剛好一個");
    }
    var accountIds = settings.accounts.map(function (a) { return a.id; });
    if (!input.accountId || accountIds.indexOf(input.accountId) === -1) {
      errors.push("帳戶：必須選一個已存在的帳戶");
    }
    if (!input.grade || GRADES.indexOf(input.grade) === -1) {
      errors.push("成績：必須是 A–F");
    }
    if (!input.execGrade || GRADES.indexOf(input.execGrade) === -1) {
      errors.push("執行評等：必須是 A–F");
    }
    if (!input.side || SIDES.indexOf(input.side) === -1) {
      errors.push("方向：必須是多或空");
    }
    if (!Number.isInteger(input.size) || input.size <= 0) {
      errors.push("口數：必須是正整數");
    }
    if (!isFiniteNumber(input.pnl)) {
      errors.push("平倉損益：必須手打一個數字");
    }
    if (typeof input.dateET !== "string" || !DATE_RE.test(input.dateET) || isNaN(Date.parse(input.dateET + "T00:00:00Z"))) {
      errors.push("美東日期：必須是有效日期");
    }
    if (typeof input.timeET !== "string" || !TIME_RE.test(input.timeET)) {
      errors.push("美東時間：必須是有效時間");
    }

    return errors;
  }

  // ---- store factory -------------------------------------------------

  function createStore(storage) {
    storage = storage || createMemoryStorage();

    function load() {
      var raw;
      try {
        raw = storage.getItem(STORAGE_KEY);
      } catch (e) {
        raw = null;
      }
      if (!raw) return defaultState();
      try {
        var parsed = JSON.parse(raw);
        var base = defaultState();
        return {
          schemaVersion: parsed.schemaVersion || base.schemaVersion,
          settings: {
            products: (parsed.settings && parsed.settings.products) || base.settings.products,
            setups: (parsed.settings && parsed.settings.setups) || base.settings.setups,
            accounts: (parsed.settings && parsed.settings.accounts) || base.settings.accounts,
          },
          cards: (parsed.cards && Array.isArray(parsed.cards)) ? parsed.cards : [],
          nextCardSeq: parsed.nextCardSeq || base.nextCardSeq,
          dayJournals: (parsed.dayJournals && typeof parsed.dayJournals === "object") ? parsed.dayJournals : {},
        };
      } catch (e) {
        return defaultState();
      }
    }

    function persist(state) {
      storage.setItem(STORAGE_KEY, JSON.stringify(state));
    }

    function getState() {
      return load();
    }

    function getSettings() {
      return deepClone(getState().settings);
    }

    function getProducts() {
      return getState().settings.products.slice();
    }

    function getSetups() {
      return getState().settings.setups.slice();
    }

    function getAccounts() {
      return deepClone(getState().settings.accounts);
    }

    function getRealCards() {
      return deepClone(getState().cards);
    }

    function hasRealCards() {
      return getState().cards.length > 0;
    }

    function isDemoActive() {
      return !hasRealCards();
    }

    function getCards() {
      return hasRealCards() ? getRealCards() : deepClone(DEMO_CARDS);
    }

    function netPnlOf(card) {
      var fee = typeof card.fee === "number" ? card.fee : 0;
      return card.pnl - fee;
    }

    function summarize(cards) {
      var netPnl = 0;
      for (var i = 0; i < cards.length; i++) {
        netPnl += netPnlOf(cards[i]);
      }
      return { count: cards.length, netPnl: netPnl };
    }

    function getSummary() {
      return summarize(getCards());
    }

    function getRealSummary() {
      return summarize(getRealCards());
    }

    function addCard(input) {
      var state = getState();
      var errors = validateCardInput(input, state.settings);
      if (errors.length > 0) {
        return { ok: false, errors: errors };
      }

      var card = {
        id: "card-" + state.nextCardSeq + "-" + Date.now(),
        isDemo: false,
        product: input.product,
        setup: input.setup,
        accountId: input.accountId,
        grade: input.grade,
        execGrade: input.execGrade,
        side: input.side,
        size: input.size,
        pnl: input.pnl,
        dateET: input.dateET,
        timeET: input.timeET,
        fee: toNullableNumber(input.fee),
        entryPrice: toNullableNumber(input.entryPrice),
        exitPrice: toNullableNumber(input.exitPrice),
        stopPrice: toNullableNumber(input.stopPrice),
        plannedRisk: toNullableNumber(input.plannedRisk),
        entryReason: toNullableLine(input.entryReason),
        exitReason: toNullableLine(input.exitReason),
        lesson: toNullableLine(input.lesson),
      };

      state.cards.push(card);
      state.nextCardSeq += 1;
      persist(state);

      return { ok: true, card: deepClone(card) };
    }

    // ---- 交易日 (calendar-day) lookups ---------------------------------

    function getCardsOnDate(dateET) {
      return getCards()
        .filter(function (c) { return c.dateET === dateET; })
        .sort(function (a, b) {
          if (a.timeET < b.timeET) return -1;
          if (a.timeET > b.timeET) return 1;
          return 0;
        });
    }

    // ---- 當日日誌 (day journal) -----------------------------------------

    function normalizePlannedSetups(input, setups) {
      if (!Array.isArray(input)) return [];
      var seen = Object.create(null);
      var out = [];
      for (var i = 0; i < input.length; i++) {
        var s = input[i];
        if (typeof s === "string" && setups.indexOf(s) !== -1 && !seen[s]) {
          seen[s] = true;
          out.push(s);
        }
      }
      return out;
    }

    function shapeDayJournal(dateET, record) {
      return {
        dateET: dateET,
        background: record.background,
        riskCapUsd: record.riskCapUsd,
        plannedSetups: record.plannedSetups.slice(),
        planLine: record.planLine,
        didWell: record.didWell,
        changeTomorrow: record.changeTomorrow,
      };
    }

    function emptyDayJournalRecord() {
      return { background: null, riskCapUsd: null, plannedSetups: [], planLine: null, didWell: null, changeTomorrow: null };
    }

    function isValidDateET(dateET) {
      return typeof dateET === "string" && DATE_RE.test(dateET) && !isNaN(Date.parse(dateET + "T00:00:00Z"));
    }

    function getDayJournal(dateET) {
      if (!isValidDateET(dateET)) {
        return shapeDayJournal(dateET, emptyDayJournalRecord());
      }
      var state = getState();
      var rec = state.dayJournals[dateET];
      return shapeDayJournal(dateET, rec || emptyDayJournalRecord());
    }

    function setDayJournal(dateET, input) {
      if (!isValidDateET(dateET)) {
        return { ok: false, errors: ["美東日期：必須是有效日期"] };
      }
      var state = getState();
      input = input || {};
      var record = {
        background: toNullableLine(input.background),
        riskCapUsd: toNullableNumber(input.riskCapUsd),
        plannedSetups: normalizePlannedSetups(input.plannedSetups, state.settings.setups),
        planLine: toNullableLine(input.planLine),
        didWell: toNullableLine(input.didWell),
        changeTomorrow: toNullableLine(input.changeTomorrow),
      };
      state.dayJournals[dateET] = record;
      persist(state);
      return { ok: true, journal: shapeDayJournal(dateET, record) };
    }

    return {
      getSettings: getSettings,
      getProducts: getProducts,
      getSetups: getSetups,
      getAccounts: getAccounts,
      addCard: addCard,
      getRealCards: getRealCards,
      hasRealCards: hasRealCards,
      isDemoActive: isDemoActive,
      getCards: getCards,
      netPnlOf: netPnlOf,
      getSummary: getSummary,
      getRealSummary: getRealSummary,
      getCardsOnDate: getCardsOnDate,
      getDayJournal: getDayJournal,
      setDayJournal: setDayJournal,
    };
  }

  function createDefaultStore() {
    return createStore(detectDefaultStorage());
  }

  return {
    createStore: createStore,
    createDefaultStore: createDefaultStore,
    createMemoryStorage: createMemoryStorage,
    validateCardInput: validateCardInput,
    GRADES: GRADES,
    SIDES: SIDES,
    DEMO_CARDS: DEMO_CARDS,
  };
});
