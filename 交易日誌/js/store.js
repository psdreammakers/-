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
 *   store.getCardById(id)      -> card (real or demo) | null — for opening one card's detail view
 *   store.addScreenshot(id, dataUri)    -> { ok:true, card } | { ok:false, errors:string[] }
 *   store.removeScreenshot(id, index)   -> { ok:true, card } | { ok:false, errors:string[] }
 *
 * Screenshots (ticket 18): a card holds 0–3 screenshots (data URIs / opaque
 * strings — the store never looks inside them). They are attached one at a
 * time via addScreenshot after the card already exists ("打開報告卡才看得到
 * 圖" — screenshots are a property of an opened card, not a create-form
 * field). The 4th attempt is rejected here, in the store, not just the UI —
 * same seam tests hit as ticket 13's required-field validation. Screenshots
 * are ordinary bytes living in this same storage backend (localStorage in
 * the browser, in-memory in tests) — no upload, no network, nothing written
 * to the git repo. Demo cards are read-only (they live in a constant, not in
 * state.cards), so addScreenshot/removeScreenshot on a demo id simply find
 * nothing and report an error, exactly like editing any other demo field.
 *
 *   -- settings mutation (ticket 14) --
 *   store.addProduct(name)     -> { ok, errors? }
 *   store.removeProduct(name)  -> { ok, errors? } (guarded: refuses if any real card uses it)
 *   store.addSetup(name)       -> { ok, errors? }
 *   store.removeSetup(name)    -> { ok, errors? } (guarded: refuses if any real card uses it)
 *   store.addAccount({name, startingCapital}) -> { ok, account? , errors? }
 *   store.removeAccount(id)    -> { ok, errors? } (guarded: refuses if in use, or if it's the last account)
 *
 *   -- 指揮中心 (ticket 14) --
 *   store.createDefaultFilters() -> { accountId:"all", product:"all", setup:"all", dateFrom:null, dateTo:null }
 *   store.getCommandCenterStats(filters) -> stats object, demo-aware (see below)
 *
 *     filters.accountId === "all"  -> { mode:"all", ...aggregate numbers..., currentEquity:null,
 *                                        startingCapital:null, equityCurve:null }
 *       "全部帳戶" has no such thing as a combined equity line across accounts with different
 *       starting capital (hard rule) — currentEquity/startingCapital/equityCurve are null, not
 *       fabricated, and mode:"all" says explicitly this is the aggregate view.
 *
 *     filters.accountId === <id>   -> { mode:"single", accountId, accountName, startingCapital,
 *                                        currentEquity, ...same numbers..., equityCurve:{startEquity, points} }
 *       equityCurve.points only advances on cards that pass the product/setup filters; when a
 *       date range is given, equityCurve.startEquity = 初始資金 + net P&L of that account's
 *       (product/setup-filtered) cards dated before the range start.
 *
 *       Each point (ticket 20, one point per card, in chronological order) is
 *       { cardId, dateET, timeET, pnl, equity, dayNetPnl, dayCardCount }:
 *         pnl          - that one card's net P&L (平倉損益 − 手續費)
 *         equity       - running equity through and including this card
 *         dayNetPnl    - that whole 交易日's net P&L across the SAME filtered
 *                        card set (not cumulative, not just this card) —
 *                        identical on every point sharing a dateET
 *         dayCardCount - that whole 交易日's card count, same filtered set,
 *                        identical on every point sharing a dateET
 *       This is what a hover/click UI (指揮中心's equity curve) reads to show
 *       a day's 日期/權益/當日損益/筆數 without hand-rolling a second
 *       "which cards belong to this day" definition.
 *
 *     shared numeric fields on both shapes: count, netPnl (累積損益), winCount, lossCount,
 *     breakEvenCount, winRate, avgWin, avgLoss, expectancy, profitFactor (賺賠比),
 *     rewardRiskRatio (風報比), maxWin, maxLoss, totalFees, cards (the matching cards).
 *   store.getCardsOnDate(d)    -> cards (demo-aware, like getCards()) dated d, sorted by time ascending
 *   store.getDayJournal(d)     -> { dateET, background, riskCapUsd, plannedSetups, planLine, didWell,
 *                                   changeTomorrow, economicEvents } for that 交易日 — always a valid
 *                                   empty shape if unsaved
 *   store.setDayJournal(d, f)  -> { ok:true, journal } | { ok:false, errors:string[] } (upserts whole
 *                                   record — but does NOT touch economicEvents; see below)
 *
 *   -- 經濟事件 (ticket 17): 日程表 lookup + per-user local data --
 *   store.getEconomicEventsForDate(d) -> { dateET, scheduleVerifiedAsOf, scheduled, manual }
 *     scheduled: rows from js/schedule.js (the shared, hand-maintained official table) that fall on
 *       this 交易日, each with impact/actual/forecast layered on from this journal's local data (or
 *       null if never filled in). Most dates: []. That's correct, not a failure — there is no live
 *       fetch to fail, so there is never a "未能自動更新" state.
 *     manual: rows the user typed in for this date only (js/schedule.js never sees these).
 *     scheduleVerifiedAsOf: js/schedule.js's SCHEDULE_VERIFIED_AS_OF, so the UI can show "as of X" next
 *       to an empty list, distinguishing "genuinely nothing today" from "table might be stale".
 *   store.setEconomicEventLocalFields(d, eventId, {impact, actual, forecast})
 *     -> { ok, journal? , errors? } — local-only overlay on one scheduled row. Never writes to
 *        js/schedule.js. Rejects an eventId that isn't one of that date's scheduled rows.
 *   store.addManualEconomicEvent(d, {timeET, name, agency, impact, actual, forecast})
 *     -> { ok, journal?, errors? } — a hand-typed row that js/schedule.js's table doesn't cover for
 *        that day (Fed minutes, ad-hoc releases). Lives only in this day's journal data.
 *   store.removeManualEconomicEvent(d, id) -> { ok, journal?, errors? }
 *
 *   -- 心理遊戲 / 心理戰 (ticket 19) --
 *   A 心理遊戲 entry is written only when a decision was emotionally hijacked
 *   (not a daily mood log, no per-trade or per-day required field). Every
 *   entry has a fixed 類型 (one of MIND_GAME_TYPES, below — never editable
 *   via settings), a required 強度 1–10, an optional one-line 一句說明 (except
 *   when 類型 is "其他", where it becomes required), and a binding to EXACTLY
 *   ONE of {cardId, dateET} — never both, never neither. A card-bound entry
 *   is how it "shows up" for that card's day; there is no separate/implicit
 *   day binding for the same entry. Same-day and same-card entries are
 *   unlimited (no daily or per-card cap).
 *
 *   store.addMindGameEntry(input)         -> { ok:true, entry } | { ok:false, errors:string[] }
 *     input: { type, intensity, note?, cardId? , dateET? } — exactly one of
 *     cardId/dateET. cardId must reference an existing REAL card (demo cards
 *     are read-only, same principle as screenshots).
 *   store.getMindGameEntriesForCard(cardId) -> entries bound to that card, oldest first
 *   store.getMindGameEntriesForDate(dateET) -> entries bound to that day, oldest first
 *   store.getAllMindGameEntries()           -> every entry (card- and day-bound), newest first
 *     (the 心理戰 tab's browse view — a third door into the same data, not a
 *     separate store)
 *   store.getMindGameEntryById(id)          -> entry | null
 *
 *   -- 分解表與時段熱力圖 (ticket 16) --
 *   store.weekdayOfDateET(dateET) -> 0..6 (0=Sun), weekday of a card's 美東日期 (a plain calendar
 *     date string, no timezone math needed — dateET already IS the America/New_York date).
 *
 *   store.getBreakdown(filters, dimension) -> row[]
 *     dimension: "all" | "setup" | "product" | "grade". Runs over the SAME card set
 *     getCommandCenterStats(filters).cards exposes (i.e. ticket 14's primary filters: account/
 *     product/setup/date-range). "all" -> one row. "setup"/"product" -> one row per DISTINCT
 *     value actually present among those cards (absent values get no row). "grade" -> always
 *     exactly 4 rows, fixed as ["A","B","C","D"], present even at zero count (a card graded E/F
 *     simply appears in none of the 4 rows — 成績 field itself stays A–F, this table just never
 *     shows a 5th/6th row). Each row: { key, title, count, winRate, expectancy, avgWin, avgLoss,
 *     profitFactor, rewardRiskRatio, netPnl, cumulativeEquity }. cumulativeEquity = that row's
 *     netPnl, plus the account's 初始資金 when filters.accountId is a single account (mode:
 *     "single"); under 全部帳戶 there is no combined starting capital to add (same hard rule as
 *     目前權益), so cumulativeEquity there is just the row's netPnl. Rows are returned pre-sorted
 *     by cumulativeEquity descending (the table's default sort) — re-sorting by another column is
 *     a display-only concern for the UI layer, not the store.
 *
 *   store.getBreakdownForCards(cards, dimension, startingCapitalOrNull) -> row[]
 *     Same shape/logic as getBreakdown, but over a caller-supplied card list instead of re-deriving
 *     it from filters. This is what lets the UI recompute breakdown rows against an ephemeral,
 *     further-narrowed subset (see below) without duplicating the grouping/stat math.
 *
 *   store.getHeatmap(filters) -> { grid } where grid[weekday][hour] = { count, netPnl }
 *     weekday 0..6 (0=Sun), hour 0..23, full 24h (not clipped to RTH — MNQ/MES trade nearly
 *     around the clock). Over the same getCommandCenterStats(filters).cards set as getBreakdown.
 *     count===0 means no card fell in that slot — render that as a blank cell, NOT "0". netPnl is
 *     `null` exactly when count===0; once count>=1, netPnl is the real (possibly-zero) summed net
 *     P&L, and a slot whose cards sum to exactly 0 must be shown as "0" — these two states are
 *     deliberately distinguishable in the data (null vs 0), not just in some UI heuristic.
 *
 *   store.getHeatmapForCards(cards) -> { grid } — same shape, over a caller-supplied card list.
 *
 *   Design note on "linked selection" (the ephemeral state that ties 分解表, the 熱力圖, and the
 *   交易報告卡清單 together on 指揮中心): the store has NO notion of this selection at all — it is
 *   pure UI state living in app.js (see state.secondarySelection there), never written into
 *   state.filters, never touching getCommandCenterStats. The UI narrows the primary-filtered card
 *   list down to the current selection itself (in app.js), then hands that narrowed list to
 *   getBreakdownForCards/getHeatmapForCards to redraw the two views that did NOT originate the
 *   click; the view that originated the click keeps showing the full primary-filtered set (with
 *   the picked row/cell highlighted) rather than collapsing into itself.
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

  // 日程表 (ticket 17): a separate, sibling module (js/schedule.js) — a plain
  // hand-maintained table, not something this store computes. In Node
  // (tests, this file's own module.exports branch) it's require()'d
  // directly; in the browser it's a global set by schedule.js's own
  // <script> tag, loaded before this file. If neither is present (schedule.js
  // missing from the page) economic-event lookups degrade to "no scheduled
  // rows" rather than throwing — manual rows and the rest of the day journal
  // still work.
  var Schedule = (function () {
    if (typeof module !== "undefined" && module.exports) {
      try {
        return require("./schedule.js");
      } catch (e) {
        return null;
      }
    }
    var g = typeof globalThis !== "undefined" ? globalThis : this;
    return (g && g.TradingJournalSchedule) || null;
  })();

  var GRADES = ["A", "B", "C", "D", "E", "F"];
  var SIDES = ["多", "空"];
  var MAX_SCREENSHOTS = 3;

  // 心理遊戲 類型: fixed, first-version list. No settings UI to add/remove
  // these, ever (per the ticket). 其他 is for a genuinely new emotional
  // category not yet on this list (with the mandatory 一句說明 covering what
  // it actually was) — never a stand-in for sleep issues, rule-breaks,
  // oversizing or disconnects, which are explicitly not 心理遊戲 types.
  var MIND_GAME_TYPES = ["想翻本", "怕錯過", "怕虧", "犯錯怒", "覺得不公平", "覺得自己該贏", "其他"];
  var MIN_INTENSITY = 1;
  var MAX_INTENSITY = 10;

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
      nextAccountSeq: 1,
      nextEconomicEventSeq: 1,
      dayJournals: {},
      mindGameEntries: [],
      nextMindGameSeq: 1,
      processLogEntries: [],
      nextProcessLogSeq: 1,
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
    { id: "demo-1", isDemo: true, product: "MNQ", setup: "突破", accountId: "acc-main", grade: "B", execGrade: "B", side: "多", size: 2, pnl: 240, fee: 4.5, dateET: "2026-09-08", timeET: "09:42", entryPrice: null, exitPrice: null, stopPrice: null, plannedRisk: null, entryReason: null, exitReason: null, lesson: null, screenshots: [] },
    { id: "demo-2", isDemo: true, product: "MNQ", setup: "回歸", accountId: "acc-main", grade: "D", execGrade: "C", side: "空", size: 1, pnl: -80, fee: 2.25, dateET: "2026-09-08", timeET: "15:12", entryPrice: null, exitPrice: null, stopPrice: null, plannedRisk: null, entryReason: null, exitReason: null, lesson: null, screenshots: [] },
    { id: "demo-3", isDemo: true, product: "MES", setup: "開盤區間", accountId: "acc-main", grade: "A", execGrade: "A", side: "多", size: 3, pnl: 120, fee: null, dateET: "2026-09-10", timeET: "10:05", entryPrice: null, exitPrice: null, stopPrice: null, plannedRisk: null, entryReason: null, exitReason: null, lesson: null, screenshots: [] },
    { id: "demo-4", isDemo: true, product: "MNQ", setup: "突破", accountId: "acc-main", grade: "A", execGrade: "B", side: "多", size: 2, pnl: 200, fee: 4.5, dateET: "2026-09-15", timeET: "09:35", entryPrice: null, exitPrice: null, stopPrice: null, plannedRisk: null, entryReason: null, exitReason: null, lesson: null, screenshots: [] },
    { id: "demo-5", isDemo: true, product: "MES", setup: "回歸", accountId: "acc-main", grade: "D", execGrade: "D", side: "空", size: 2, pnl: -120, fee: 3, dateET: "2026-09-16", timeET: "15:40", entryPrice: null, exitPrice: null, stopPrice: null, plannedRisk: null, entryReason: null, exitReason: null, lesson: null, screenshots: [] },
    { id: "demo-6", isDemo: true, product: "MNQ", setup: "開盤區間", accountId: "acc-main", grade: "C", execGrade: "B", side: "多", size: 1, pnl: 50, fee: null, dateET: "2026-09-18", timeET: "10:02", entryPrice: null, exitPrice: null, stopPrice: null, plannedRisk: null, entryReason: null, exitReason: null, lesson: null, screenshots: [] },
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
          nextAccountSeq: parsed.nextAccountSeq || base.nextAccountSeq,
          nextEconomicEventSeq: parsed.nextEconomicEventSeq || base.nextEconomicEventSeq,
          dayJournals: (parsed.dayJournals && typeof parsed.dayJournals === "object") ? parsed.dayJournals : {},
          mindGameEntries: (parsed.mindGameEntries && Array.isArray(parsed.mindGameEntries)) ? parsed.mindGameEntries : [],
          nextMindGameSeq: parsed.nextMindGameSeq || base.nextMindGameSeq,
          processLogEntries: (parsed.processLogEntries && Array.isArray(parsed.processLogEntries)) ? parsed.processLogEntries : [],
          nextProcessLogSeq: parsed.nextProcessLogSeq || base.nextProcessLogSeq,
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
        screenshots: [],
      };

      state.cards.push(card);
      state.nextCardSeq += 1;
      persist(state);

      return { ok: true, card: deepClone(card) };
    }

    function findRealCardIndex(state, cardId) {
      for (var i = 0; i < state.cards.length; i++) {
        if (state.cards[i].id === cardId) return i;
      }
      return -1;
    }

    function getCardById(id) {
      var cards = getCards();
      for (var i = 0; i < cards.length; i++) {
        if (cards[i].id === id) return cards[i];
      }
      return null;
    }

    // A card holds 0–MAX_SCREENSHOTS screenshots, attached one at a time to
    // an already-saved card (screenshots are only ever seen/managed on an
    // opened card, never on the create form). This is the seam that rejects
    // a 4th screenshot — enforced here, not just in whatever UI calls it.
    function addScreenshot(cardId, dataUri) {
      var state = getState();
      var idx = findRealCardIndex(state, cardId);
      if (idx === -1) {
        // Covers both "no such card" and "this is demo data" — demo cards
        // live in the DEMO_CARDS constant, never in state.cards, so they
        // are read-only by construction, same as every other demo field.
        return { ok: false, errors: ["找不到這筆交易報告卡（示範資料不可貼圖）"] };
      }
      if (typeof dataUri !== "string" || dataUri.trim() === "") {
        return { ok: false, errors: ["截圖：必須是有效的圖片資料"] };
      }
      var card = state.cards[idx];
      if (!Array.isArray(card.screenshots)) card.screenshots = [];
      if (card.screenshots.length >= MAX_SCREENSHOTS) {
        return { ok: false, errors: ["截圖：一筆最多 " + MAX_SCREENSHOTS + " 張，這張存不進去"] };
      }
      card.screenshots.push(dataUri);
      persist(state);
      return { ok: true, card: deepClone(card) };
    }

    function removeScreenshot(cardId, index) {
      var state = getState();
      var idx = findRealCardIndex(state, cardId);
      if (idx === -1) {
        return { ok: false, errors: ["找不到這筆交易報告卡"] };
      }
      var card = state.cards[idx];
      if (!Array.isArray(card.screenshots) || index < 0 || index >= card.screenshots.length) {
        return { ok: false, errors: ["截圖：索引超出範圍"] };
      }
      card.screenshots.splice(index, 1);
      persist(state);
      return { ok: true, card: deepClone(card) };
    }

    // ---- settings mutation (ticket 14) --------------------------------
    //
    // Guard policy: add operations reject empty/duplicate names. Remove
    // operations reject when the item is still referenced by a real (saved)
    // card — this app has no cascading delete, so removing something in use
    // would silently orphan existing cards' references. Demo cards are not
    // considered "in use" since demo data isn't real and disappears the
    // moment a real card is saved.

    function addProduct(name) {
      var trimmed = typeof name === "string" ? name.trim() : "";
      if (!trimmed) return { ok: false, errors: ["商品：不能空白"] };
      var state = getState();
      if (state.settings.products.indexOf(trimmed) !== -1) {
        return { ok: false, errors: ["商品：清單裡已經有這個"] };
      }
      state.settings.products.push(trimmed);
      persist(state);
      return { ok: true, products: state.settings.products.slice() };
    }

    function removeProduct(name) {
      var state = getState();
      var idx = state.settings.products.indexOf(name);
      if (idx === -1) return { ok: false, errors: ["商品：清單裡沒有這個"] };
      var inUse = state.cards.some(function (c) { return c.product === name; });
      if (inUse) return { ok: false, errors: ["商品：已經有交易報告卡用這個商品，不能刪"] };
      state.settings.products.splice(idx, 1);
      persist(state);
      return { ok: true, products: state.settings.products.slice() };
    }

    function addSetup(name) {
      var trimmed = typeof name === "string" ? name.trim() : "";
      if (!trimmed) return { ok: false, errors: ["setup 標：不能空白"] };
      var state = getState();
      if (state.settings.setups.indexOf(trimmed) !== -1) {
        return { ok: false, errors: ["setup 標：清單裡已經有這個"] };
      }
      state.settings.setups.push(trimmed);
      persist(state);
      return { ok: true, setups: state.settings.setups.slice() };
    }

    function removeSetup(name) {
      var state = getState();
      var idx = state.settings.setups.indexOf(name);
      if (idx === -1) return { ok: false, errors: ["setup 標：清單裡沒有這個"] };
      var inUse = state.cards.some(function (c) { return c.setup === name; });
      if (inUse) return { ok: false, errors: ["setup 標：已經有交易報告卡用這個標，不能刪"] };
      state.settings.setups.splice(idx, 1);
      persist(state);
      return { ok: true, setups: state.settings.setups.slice() };
    }

    function addAccount(input) {
      input = input || {};
      var errors = [];
      var name = typeof input.name === "string" ? input.name.trim() : "";
      if (!name) errors.push("帳戶：名稱不能空白");

      var state = getState();
      if (name && state.settings.accounts.some(function (a) { return a.name === name; })) {
        errors.push("帳戶：名稱已經在清單裡");
      }

      var startingCapital = input.startingCapital;
      if (startingCapital === undefined || startingCapital === null || startingCapital === "") {
        startingCapital = 0;
      } else {
        startingCapital = Number(startingCapital);
      }
      if (!isFiniteNumber(startingCapital) || startingCapital < 0) {
        errors.push("初始資金：必須是 0 或正數");
      }

      if (errors.length > 0) return { ok: false, errors: errors };

      var account = {
        id: "acc-" + state.nextAccountSeq + "-" + Date.now(),
        name: name,
        startingCapital: startingCapital,
      };
      state.settings.accounts.push(account);
      state.nextAccountSeq += 1;
      persist(state);
      return { ok: true, account: deepClone(account) };
    }

    function removeAccount(id) {
      var state = getState();
      var idx = -1;
      for (var i = 0; i < state.settings.accounts.length; i++) {
        if (state.settings.accounts[i].id === id) { idx = i; break; }
      }
      if (idx === -1) return { ok: false, errors: ["帳戶：清單裡沒有這個"] };
      if (state.settings.accounts.length <= 1) {
        return { ok: false, errors: ["帳戶：至少要留一戶"] };
      }
      var inUse = state.cards.some(function (c) { return c.accountId === id; });
      if (inUse) return { ok: false, errors: ["帳戶：已經有交易報告卡用這戶，不能刪"] };
      state.settings.accounts.splice(idx, 1);
      persist(state);
      return { ok: true, accounts: deepClone(state.settings.accounts) };
    }

    // ---- 指揮中心: filters + stats (ticket 14) -------------------------

    function createDefaultFilters() {
      return { accountId: "all", product: "all", setup: "all", dateFrom: null, dateTo: null };
    }

    function normalizeFilters(filters) {
      filters = filters || {};
      return {
        accountId: filters.accountId || "all",
        product: filters.product || "all",
        setup: filters.setup || "all",
        dateFrom: filters.dateFrom || null,
        dateTo: filters.dateTo || null,
      };
    }

    function matchesProductSetupDate(card, filters) {
      if (filters.product !== "all" && card.product !== filters.product) return false;
      if (filters.setup !== "all" && card.setup !== filters.setup) return false;
      if (filters.dateFrom && card.dateET < filters.dateFrom) return false;
      if (filters.dateTo && card.dateET > filters.dateTo) return false;
      return true;
    }

    function chronoKey(card) {
      return card.dateET + " " + card.timeET;
    }

    function sumOf(list) {
      var total = 0;
      for (var i = 0; i < list.length; i++) total += list[i];
      return total;
    }

    // Shared number crunching over an already-filtered set of cards.
    function computeCardStats(cards) {
      var count = cards.length;
      var netPnl = 0;
      var totalFees = 0;
      var winNet = [];
      var lossNet = [];
      var breakEvenCount = 0;

      for (var i = 0; i < cards.length; i++) {
        var c = cards[i];
        var net = netPnlOf(c);
        netPnl += net;
        totalFees += typeof c.fee === "number" ? c.fee : 0;
        if (net > 0) winNet.push(net);
        else if (net < 0) lossNet.push(net);
        else breakEvenCount++;
      }

      var winCount = winNet.length;
      var lossCount = lossNet.length;
      var totalWin = sumOf(winNet);
      var totalLossAbs = Math.abs(sumOf(lossNet));
      var avgWin = winCount > 0 ? totalWin / winCount : null;
      var avgLoss = lossCount > 0 ? sumOf(lossNet) / lossCount : null; // negative, or null

      var winRate = count > 0 ? winCount / count : null;
      var expectancy = count > 0 ? netPnl / count : null;
      var profitFactor = totalLossAbs > 0 ? totalWin / totalLossAbs : null; // 賺賠比
      var rewardRiskRatio = (avgWin !== null && avgLoss !== null && avgLoss !== 0)
        ? avgWin / Math.abs(avgLoss)
        : null; // 風報比
      var maxWin = winCount > 0 ? Math.max.apply(null, winNet) : null;
      var maxLoss = lossCount > 0 ? Math.min.apply(null, lossNet) : null;

      return {
        count: count,
        netPnl: netPnl,
        winCount: winCount,
        lossCount: lossCount,
        breakEvenCount: breakEvenCount,
        winRate: winRate,
        avgWin: avgWin,
        avgLoss: avgLoss,
        expectancy: expectancy,
        profitFactor: profitFactor,
        rewardRiskRatio: rewardRiskRatio,
        maxWin: maxWin,
        maxLoss: maxLoss,
        totalFees: totalFees,
      };
    }

    function getCommandCenterStats(rawFilters) {
      var filters = normalizeFilters(rawFilters);
      var allCards = getCards(); // demo-aware, same set the rest of the UI sees

      if (filters.accountId === "all") {
        var matched = allCards.filter(function (c) { return matchesProductSetupDate(c, filters); });
        var stats = computeCardStats(matched);
        stats.mode = "all";
        stats.accountId = "all";
        stats.accountName = "全部帳戶";
        // Hard rule: no combined equity concept across accounts with
        // different starting capital. These are null, not fabricated.
        stats.startingCapital = null;
        stats.currentEquity = null;
        stats.equityCurve = null;
        stats.cards = matched;
        return stats;
      }

      var accounts = getAccounts();
      var account = accounts.filter(function (a) { return a.id === filters.accountId; })[0];
      if (!account) {
        // Defensive: filters referencing a since-removed account. Since
        // removeAccount() refuses removal while cards reference it, this
        // can only happen with a stale UI selection — treat as an empty
        // single-account view rather than throwing.
        account = { id: filters.accountId, name: filters.accountId, startingCapital: 0 };
      }

      // Product/setup filtered, but NOT date filtered yet — the date range
      // only trims which points are *shown*; cards before it are folded
      // into the starting equity instead of being dropped from the count.
      var accountFiltered = allCards.filter(function (c) {
        return c.accountId === account.id &&
          (filters.product === "all" || c.product === filters.product) &&
          (filters.setup === "all" || c.setup === filters.setup);
      });
      accountFiltered.sort(function (a, b) { return chronoKey(a) < chronoKey(b) ? -1 : chronoKey(a) > chronoKey(b) ? 1 : 0; });

      var preRangeNet = 0;
      var inRange = [];
      for (var i = 0; i < accountFiltered.length; i++) {
        var c = accountFiltered[i];
        if (filters.dateFrom && c.dateET < filters.dateFrom) {
          preRangeNet += netPnlOf(c);
          continue;
        }
        if (filters.dateTo && c.dateET > filters.dateTo) continue; // after range: excluded entirely
        inRange.push(c);
      }

      var startEquity = account.startingCapital + preRangeNet;

      // Per-day aggregates (ticket 20) over this same filtered card set, so
      // hovering any point that day shows the day's total, not a running
      // partial. Keyed by dateET.
      var dayTotals = Object.create(null);
      for (var j = 0; j < inRange.length; j++) {
        var dc = inRange[j];
        var dt = dayTotals[dc.dateET] || { netPnl: 0, count: 0 };
        dt.netPnl += netPnlOf(dc);
        dt.count += 1;
        dayTotals[dc.dateET] = dt;
      }

      var running = startEquity;
      var points = inRange.map(function (c) {
        running += netPnlOf(c);
        var day = dayTotals[c.dateET];
        return {
          cardId: c.id,
          dateET: c.dateET,
          timeET: c.timeET,
          pnl: netPnlOf(c),
          equity: running,
          dayNetPnl: day.netPnl,
          dayCardCount: day.count,
        };
      });

      var singleStats = computeCardStats(inRange);
      singleStats.mode = "single";
      singleStats.accountId = account.id;
      singleStats.accountName = account.name;
      singleStats.startingCapital = account.startingCapital;
      singleStats.currentEquity = points.length > 0 ? points[points.length - 1].equity : startEquity;
      singleStats.equityCurve = { startEquity: startEquity, points: points };
      singleStats.cards = inRange;
      return singleStats;
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

    // ---- 分解表與時段熱力圖 (ticket 16) -----------------------------------
    //
    // Pure aggregation over an already-decided card list — no DOM, no state
    // of its own (the ephemeral "linked selection" that narrows this list
    // lives entirely in the UI layer; see module doc above).

    var BREAKDOWN_GRADES = ["A", "B", "C", "D"];

    function distinctValuesInOrder(cards, field) {
      var seen = Object.create(null);
      var out = [];
      for (var i = 0; i < cards.length; i++) {
        var v = cards[i][field];
        if (!seen[v]) {
          seen[v] = true;
          out.push(v);
        }
      }
      return out;
    }

    function breakdownGroups(cards, dimension) {
      if (dimension === "grade") {
        return BREAKDOWN_GRADES.map(function (g) {
          return { key: g, title: g, cards: cards.filter(function (c) { return c.grade === g; }) };
        });
      }
      if (dimension === "setup") {
        return distinctValuesInOrder(cards, "setup").map(function (s) {
          return { key: s, title: s, cards: cards.filter(function (c) { return c.setup === s; }) };
        });
      }
      if (dimension === "product") {
        return distinctValuesInOrder(cards, "product").map(function (p) {
          return { key: p, title: p, cards: cards.filter(function (c) { return c.product === p; }) };
        });
      }
      // "all" (and any unrecognized dimension) -> one row, everything.
      return [{ key: "all", title: "全部", cards: cards }];
    }

    function computeBreakdownRows(cards, dimension, startingCapitalOrNull) {
      var rows = breakdownGroups(cards, dimension).map(function (g) {
        var s = computeCardStats(g.cards);
        var cumulativeEquity = (startingCapitalOrNull === null || startingCapitalOrNull === undefined)
          ? s.netPnl
          : startingCapitalOrNull + s.netPnl;
        return {
          key: g.key,
          title: g.title,
          count: s.count,
          winRate: s.winRate,
          expectancy: s.expectancy,
          avgWin: s.avgWin,
          avgLoss: s.avgLoss,
          profitFactor: s.profitFactor,
          rewardRiskRatio: s.rewardRiskRatio,
          netPnl: s.netPnl,
          cumulativeEquity: cumulativeEquity,
        };
      });
      // Default sort: 累積權益 descending.
      rows.sort(function (a, b) { return b.cumulativeEquity - a.cumulativeEquity; });
      return rows;
    }

    function getBreakdown(rawFilters, dimension) {
      var stats = getCommandCenterStats(rawFilters);
      var startingCapitalOrNull = stats.mode === "single" ? stats.startingCapital : null;
      return computeBreakdownRows(stats.cards, dimension, startingCapitalOrNull);
    }

    function getBreakdownForCards(cards, dimension, startingCapitalOrNull) {
      return computeBreakdownRows(cards, dimension, startingCapitalOrNull);
    }

    function weekdayOfDateET(dateET) {
      var y = parseInt(dateET.slice(0, 4), 10);
      var m = parseInt(dateET.slice(5, 7), 10);
      var d = parseInt(dateET.slice(8, 10), 10);
      return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    }

    function computeHeatmapGrid(cards) {
      var grid = [];
      for (var wd = 0; wd < 7; wd++) {
        var row = [];
        for (var h = 0; h < 24; h++) row.push({ count: 0, netPnl: null });
        grid.push(row);
      }
      for (var i = 0; i < cards.length; i++) {
        var c = cards[i];
        var wd2 = weekdayOfDateET(c.dateET);
        var hour = parseInt(c.timeET.slice(0, 2), 10);
        var cell = grid[wd2][hour];
        cell.netPnl = (cell.netPnl === null ? 0 : cell.netPnl) + netPnlOf(c);
        cell.count += 1;
      }
      return grid;
    }

    function getHeatmap(rawFilters) {
      var stats = getCommandCenterStats(rawFilters);
      return { grid: computeHeatmapGrid(stats.cards) };
    }

    function getHeatmapForCards(cards) {
      return { grid: computeHeatmapGrid(cards) };
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

    function emptyEconomicEventsLocal() {
      return { local: {}, manual: [] };
    }

    // Defensive merge, field by field, against emptyEconomicEventsLocal()
    // rather than trusting the stored shape wholesale — a record can reach
    // this function having been created by setDayJournal() alone (before
    // ticket 17 existed, or before this date ever got an economic-event
    // edit), in which case record.economicEvents is simply undefined.
    function shapeEconomicEventsLocal(raw) {
      raw = raw || {};
      var local = {};
      if (raw.local && typeof raw.local === "object") {
        for (var eventId in raw.local) {
          if (!Object.prototype.hasOwnProperty.call(raw.local, eventId)) continue;
          var f = raw.local[eventId] || {};
          local[eventId] = { impact: f.impact != null ? f.impact : null, actual: f.actual != null ? f.actual : null, forecast: f.forecast != null ? f.forecast : null };
        }
      }
      var manual = Array.isArray(raw.manual) ? raw.manual.map(function (m) {
        return {
          id: m.id, dateET: m.dateET, timeET: m.timeET || null, name: m.name,
          agency: m.agency != null ? m.agency : null,
          impact: m.impact != null ? m.impact : null,
          actual: m.actual != null ? m.actual : null,
          forecast: m.forecast != null ? m.forecast : null,
        };
      }) : [];
      return { local: local, manual: manual };
    }

    // Defensive merge against emptyDayJournalRecord() rather than trusting
    // the stored record wholesale — a record can reach this function having
    // been created by an economic-event write alone (see below), in which
    // case background/riskCapUsd/etc. were never set.
    function shapeDayJournal(dateET, record) {
      var base = emptyDayJournalRecord();
      record = record || {};
      return {
        dateET: dateET,
        background: record.background !== undefined ? record.background : base.background,
        riskCapUsd: record.riskCapUsd !== undefined ? record.riskCapUsd : base.riskCapUsd,
        plannedSetups: (Array.isArray(record.plannedSetups) ? record.plannedSetups : base.plannedSetups).slice(),
        planLine: record.planLine !== undefined ? record.planLine : base.planLine,
        didWell: record.didWell !== undefined ? record.didWell : base.didWell,
        changeTomorrow: record.changeTomorrow !== undefined ? record.changeTomorrow : base.changeTomorrow,
        economicEvents: shapeEconomicEventsLocal(record.economicEvents),
      };
    }

    function emptyDayJournalRecord() {
      return { background: null, riskCapUsd: null, plannedSetups: [], planLine: null, didWell: null, changeTomorrow: null, economicEvents: emptyEconomicEventsLocal() };
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
      var existing = state.dayJournals[dateET];
      var record = {
        background: toNullableLine(input.background),
        riskCapUsd: toNullableNumber(input.riskCapUsd),
        plannedSetups: normalizePlannedSetups(input.plannedSetups, state.settings.setups),
        planLine: toNullableLine(input.planLine),
        didWell: toNullableLine(input.didWell),
        changeTomorrow: toNullableLine(input.changeTomorrow),
        // 經濟事件 (ticket 17) lives in its own appended section with its own
        // add/edit functions below, not this form — carry it forward
        // untouched so saving 當日背景/盤前/盤後 never wipes it, and vice
        // versa. Same reasoning covers ticket 19's psychology section once
        // merged in as its own carried-forward key.
        economicEvents: (existing && existing.economicEvents) || emptyEconomicEventsLocal(),
      };
      state.dayJournals[dateET] = record;
      persist(state);
      return { ok: true, journal: shapeDayJournal(dateET, record) };
    }

    // ---- 心理遊戲 / 心理戰 (ticket 19) -----------------------------------
    //
    // Written only at the moment a decision was emotionally hijacked — not a
    // daily mood log, no per-trade or per-day required field, no cap on how
    // many entries share a day or a card. A binding is exactly one of
    // {cardId, dateET}: if a trade actually happened, the entry binds to
    // that report card (its own date is how it "shows up" for that day —
    // never ALSO store a day binding for the same entry); a day binding is
    // only for when there was no corresponding trade.

    function shapeMindGameEntry(record) {
      return {
        id: record.id,
        seq: record.seq,
        type: record.type,
        intensity: record.intensity,
        note: record.note,
        cardId: record.cardId,
        dateET: record.dateET,
      };
    }

    function addMindGameEntry(input) {
      var state = getState();
      input = input || {};
      var errors = [];

      var type = input.type;
      if (!type || MIND_GAME_TYPES.indexOf(type) === -1) {
        errors.push("類型：必須是心理遊戲固定類型之一");
      }

      var intensity = input.intensity;
      if (!Number.isInteger(intensity) || intensity < MIN_INTENSITY || intensity > MAX_INTENSITY) {
        errors.push("強度：必須是 " + MIN_INTENSITY + "–" + MAX_INTENSITY + " 的整數");
      }

      var note = toNullableLine(input.note);
      if (type === "其他" && !note) {
        errors.push("一句說明：類型選「其他」時必填");
      }

      var hasCardId = typeof input.cardId === "string" && input.cardId.trim() !== "";
      var hasDateET = typeof input.dateET === "string" && input.dateET.trim() !== "";

      if (hasCardId && hasDateET) {
        errors.push("綁定：只能綁一張交易報告卡或一個交易日，不能兩者都綁");
      } else if (!hasCardId && !hasDateET) {
        errors.push("綁定：必須綁一張交易報告卡或一個交易日");
      } else if (hasCardId) {
        if (findRealCardIndex(state, input.cardId) === -1) {
          // Covers both "no such card" and "this is demo data" — same
          // read-only-demo principle as addScreenshot above.
          errors.push("找不到這筆交易報告卡（示範資料不可記心理遊戲）");
        }
      } else if (!isValidDateET(input.dateET)) {
        errors.push("交易日：必須是有效日期");
      }

      if (errors.length > 0) {
        return { ok: false, errors: errors };
      }

      var record = {
        id: "mindgame-" + state.nextMindGameSeq + "-" + Date.now(),
        seq: state.nextMindGameSeq,
        type: type,
        intensity: intensity,
        note: note,
        cardId: hasCardId ? input.cardId : null,
        dateET: hasDateET ? input.dateET : null,
      };

      state.mindGameEntries.push(record);
      state.nextMindGameSeq += 1;
      persist(state);

      return { ok: true, entry: shapeMindGameEntry(record) };
    }

    function getMindGameEntriesForCard(cardId) {
      var state = getState();
      return state.mindGameEntries
        .filter(function (e) { return e.cardId === cardId; })
        .sort(function (a, b) { return a.seq - b.seq; })
        .map(shapeMindGameEntry);
    }

    function getMindGameEntriesForDate(dateET) {
      var state = getState();
      return state.mindGameEntries
        .filter(function (e) { return e.dateET === dateET; })
        .sort(function (a, b) { return a.seq - b.seq; })
        .map(shapeMindGameEntry);
    }

    function getAllMindGameEntries() {
      var state = getState();
      return state.mindGameEntries
        .slice()
        .sort(function (a, b) { return b.seq - a.seq; }) // newest first, for the 心理戰 browse tab
        .map(shapeMindGameEntry);
    }

    function getMindGameEntryById(id) {
      var state = getState();
      for (var i = 0; i < state.mindGameEntries.length; i++) {
        if (state.mindGameEntries[i].id === id) return shapeMindGameEntry(state.mindGameEntries[i]);
      }
      return null;
    }

    // ---- 盤前盤後過程紀錄 (追加需求：把盤前/盤後合成一頁，能記整個過程) -----
    //
    // The locked 盤前三欄／盤後兩句 fields (see setDayJournal above) stay
    // exactly as spec'd — one short answer each, never rich text. This is a
    // SEPARATE, additive seam for the actual back-and-forth of the day: an
    // append-only list of short one-line notes you add to as the day
    // happens ("9:15 看盤前新聞", "14:05 收盤：今天有守紀律"), the same
    // append-only-log shape as 心理遊戲 above (ordered by `seq`, not a wall
    // clock — no entry can be edited or reordered after the fact, same
    // "this really happened, in this order" principle). Never touches
    // state.dayJournals — writing/reading a process-log entry cannot wipe
    // or be wiped by 背景/盤前/盤後/經濟事件, which all live there.

    function shapeProcessLogEntry(record) {
      return { id: record.id, seq: record.seq, dateET: record.dateET, note: record.note };
    }

    function addProcessLogEntry(input) {
      var state = getState();
      input = input || {};
      var errors = [];

      if (!isValidDateET(input.dateET)) {
        errors.push("交易日：必須是有效日期");
      }

      var note = toNullableLine(input.note);
      if (!note) {
        errors.push("內容：必填，一句話");
      }

      if (errors.length > 0) {
        return { ok: false, errors: errors };
      }

      var record = {
        id: "processlog-" + state.nextProcessLogSeq + "-" + Date.now(),
        seq: state.nextProcessLogSeq,
        dateET: input.dateET,
        note: note,
      };

      state.processLogEntries.push(record);
      state.nextProcessLogSeq += 1;
      persist(state);

      return { ok: true, entry: shapeProcessLogEntry(record) };
    }

    function getProcessLogEntriesForDate(dateET) {
      var state = getState();
      return state.processLogEntries
        .filter(function (e) { return e.dateET === dateET; })
        .sort(function (a, b) { return a.seq - b.seq; })
        .map(shapeProcessLogEntry);
    }

    // ---- 經濟事件 (ticket 17): 日程表 lookup + per-user local overlay -------
    //
    // Scheduled rows come from js/schedule.js (pure, stateless, shared) and
    // are never mutated here. What this store adds on top, per 交易日, lives
    // only in state.dayJournals[dateET].economicEvents:
    //   local:  { [scheduleRowId]: {impact, actual, forecast} } — per-user
    //           fields layered onto an auto-appeared (scheduled) row.
    //   manual: [{id, dateET, timeET, name, agency, impact, actual, forecast}]
    //           — rows the user typed in because the official table doesn't
    //           cover that day. Never written into js/schedule.js.
    //
    // Getting a lazily-created record here (one that only exists because of
    // an economic-event write, never a setDayJournal() call) is exactly why
    // shapeDayJournal()/emptyDayJournalRecord() default every other field
    // defensively above — this function does not go through setDayJournal.

    function getDayJournalRecordOrEmpty(state, dateET) {
      return state.dayJournals[dateET] || emptyDayJournalRecord();
    }

    function getEconomicEventsForDate(dateET) {
      if (!isValidDateET(dateET)) {
        return { dateET: dateET, scheduleVerifiedAsOf: Schedule ? Schedule.SCHEDULE_VERIFIED_AS_OF : null, scheduled: [], manual: [] };
      }
      var state = getState();
      var record = getDayJournalRecordOrEmpty(state, dateET);
      var local = shapeEconomicEventsLocal(record.economicEvents);
      var officialRows = Schedule ? Schedule.getScheduledEventsForDate(dateET) : [];

      var scheduled = officialRows.map(function (row) {
        var overlay = local.local[row.id] || { impact: null, actual: null, forecast: null };
        return {
          id: row.id, dateET: row.dateET, timeET: row.timeET, name: row.name, agency: row.agency, url: row.url,
          impact: overlay.impact, actual: overlay.actual, forecast: overlay.forecast,
        };
      });

      return {
        dateET: dateET,
        scheduleVerifiedAsOf: Schedule ? Schedule.SCHEDULE_VERIFIED_AS_OF : null,
        scheduled: scheduled,
        manual: local.manual.slice(),
      };
    }

    function saveDayJournalRecord(state, dateET, record, economicEvents) {
      var stored = { background: record.background, riskCapUsd: record.riskCapUsd, plannedSetups: record.plannedSetups, planLine: record.planLine, didWell: record.didWell, changeTomorrow: record.changeTomorrow, economicEvents: economicEvents };
      state.dayJournals[dateET] = stored;
      persist(state);
    }

    function setEconomicEventLocalFields(dateET, eventId, fields) {
      if (!isValidDateET(dateET)) {
        return { ok: false, errors: ["美東日期：必須是有效日期"] };
      }
      var officialRows = Schedule ? Schedule.getScheduledEventsForDate(dateET) : [];
      var isKnownRow = officialRows.some(function (row) { return row.id === eventId; });
      if (!isKnownRow) {
        return { ok: false, errors: ["經濟事件：這天的日程表裡沒有這一列"] };
      }
      fields = fields || {};
      var state = getState();
      var record = getDayJournalRecordOrEmpty(state, dateET);
      var economicEvents = shapeEconomicEventsLocal(record.economicEvents);
      economicEvents.local[eventId] = {
        impact: toNullableLine(fields.impact),
        actual: toNullableLine(fields.actual),
        forecast: toNullableLine(fields.forecast),
      };
      saveDayJournalRecord(state, dateET, record, economicEvents);
      return { ok: true, journal: getEconomicEventsForDate(dateET) };
    }

    function addManualEconomicEvent(dateET, input) {
      if (!isValidDateET(dateET)) {
        return { ok: false, errors: ["美東日期：必須是有效日期"] };
      }
      input = input || {};
      var name = toNullableLine(input.name);
      if (!name) {
        return { ok: false, errors: ["經濟事件：名稱不能空白"] };
      }
      if (input.timeET !== undefined && input.timeET !== null && input.timeET !== "" && !TIME_RE.test(input.timeET)) {
        return { ok: false, errors: ["經濟事件：時間格式須為 HH:MM（可留空）"] };
      }

      var state = getState();
      var record = getDayJournalRecordOrEmpty(state, dateET);
      var economicEvents = shapeEconomicEventsLocal(record.economicEvents);

      var row = {
        id: "manual-" + state.nextEconomicEventSeq + "-" + Date.now(),
        dateET: dateET,
        timeET: toNullableLine(input.timeET),
        name: name,
        agency: toNullableLine(input.agency),
        impact: toNullableLine(input.impact),
        actual: toNullableLine(input.actual),
        forecast: toNullableLine(input.forecast),
      };
      economicEvents.manual.push(row);
      state.nextEconomicEventSeq += 1;

      saveDayJournalRecord(state, dateET, record, economicEvents);
      return { ok: true, journal: getEconomicEventsForDate(dateET), event: row };
    }

    function removeManualEconomicEvent(dateET, id) {
      if (!isValidDateET(dateET)) {
        return { ok: false, errors: ["美東日期：必須是有效日期"] };
      }
      var state = getState();
      var record = state.dayJournals[dateET];
      if (!record || !record.economicEvents || !Array.isArray(record.economicEvents.manual)) {
        return { ok: false, errors: ["經濟事件：找不到這一筆手填列"] };
      }
      var idx = -1;
      for (var i = 0; i < record.economicEvents.manual.length; i++) {
        if (record.economicEvents.manual[i].id === id) { idx = i; break; }
      }
      if (idx === -1) {
        return { ok: false, errors: ["經濟事件：找不到這一筆手填列"] };
      }
      record.economicEvents.manual.splice(idx, 1);
      persist(state);
      return { ok: true, journal: getEconomicEventsForDate(dateET) };
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
      getCardById: getCardById,
      netPnlOf: netPnlOf,
      getSummary: getSummary,
      getRealSummary: getRealSummary,
      addScreenshot: addScreenshot,
      removeScreenshot: removeScreenshot,
      addProduct: addProduct,
      removeProduct: removeProduct,
      addSetup: addSetup,
      removeSetup: removeSetup,
      addAccount: addAccount,
      removeAccount: removeAccount,
      createDefaultFilters: createDefaultFilters,
      getCommandCenterStats: getCommandCenterStats,
      getCardsOnDate: getCardsOnDate,
      getBreakdown: getBreakdown,
      getBreakdownForCards: getBreakdownForCards,
      getHeatmap: getHeatmap,
      getHeatmapForCards: getHeatmapForCards,
      weekdayOfDateET: weekdayOfDateET,
      getDayJournal: getDayJournal,
      setDayJournal: setDayJournal,
      addMindGameEntry: addMindGameEntry,
      getMindGameEntriesForCard: getMindGameEntriesForCard,
      getMindGameEntriesForDate: getMindGameEntriesForDate,
      getAllMindGameEntries: getAllMindGameEntries,
      getMindGameEntryById: getMindGameEntryById,
      addProcessLogEntry: addProcessLogEntry,
      getProcessLogEntriesForDate: getProcessLogEntriesForDate,
      getEconomicEventsForDate: getEconomicEventsForDate,
      setEconomicEventLocalFields: setEconomicEventLocalFields,
      addManualEconomicEvent: addManualEconomicEvent,
      removeManualEconomicEvent: removeManualEconomicEvent,
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
    MAX_SCREENSHOTS: MAX_SCREENSHOTS,
    MIND_GAME_TYPES: MIND_GAME_TYPES,
  };
});
