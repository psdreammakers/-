// 交易日誌 — 分解表與時段熱力圖聯動 (ticket 16) store-layer tests.
// Run with:  node 交易日誌/tests/breakdown-heatmap.test.js
// No build step, no runtime deps beyond Node's built-in "assert".
//
// These test the pure aggregation functions in store.js only
// (getBreakdown/getBreakdownForCards, getHeatmap/getHeatmapForCards,
// weekdayOfDateET) — the "linked selection" itself is UI state in app.js and
// is not exercised here (no DOM in this suite, per existing pattern).

var assert = require("assert");
var path = require("path");
var TradingJournal = require(path.join(__dirname, "..", "js", "store.js"));

var tests = [];
function test(name, fn) {
  tests.push({ name: name, fn: fn });
}

function freshStore() {
  return TradingJournal.createStore(TradingJournal.createMemoryStorage());
}

function card(overrides) {
  var base = {
    product: "MNQ",
    setup: "突破",
    accountId: "acc-main",
    grade: "B",
    execGrade: "B",
    side: "多",
    size: 1,
    pnl: 0,
    dateET: "2026-09-10", // Thursday (weekday 4)
    timeET: "09:41",
  };
  for (var k in overrides) base[k] = overrides[k];
  return base;
}

// Known weekdays used throughout (America/New_York calendar dates, computed
// the same way store.weekdayOfDateET does: Date.UTC(y, m-1, d).getUTCDay()).
//   2026-09-10 -> Thursday -> 4
//   2026-09-11 -> Friday   -> 5
//   2026-09-14 -> Monday   -> 1

test("weekdayOfDateET matches plain calendar weekday, no timezone conversion needed", function () {
  var store = freshStore();
  assert.strictEqual(store.weekdayOfDateET("2026-09-10"), 4);
  assert.strictEqual(store.weekdayOfDateET("2026-09-11"), 5);
  assert.strictEqual(store.weekdayOfDateET("2026-09-14"), 1);
});

// ---- 熱力圖: blank vs "0" -------------------------------------------------

test("heatmap cell is blank (null netPnl, 0 count) when no card falls in that weekday+hour slot", function () {
  var store = freshStore();
  store.addCard(card({ dateET: "2026-09-10", timeET: "09:41", pnl: 100 })); // Thu 09:xx only

  var heatmap = store.getHeatmap({ accountId: "acc-main" });
  var untouched = heatmap.grid[4][8]; // Thu 08:00 - no card here
  assert.strictEqual(untouched.count, 0);
  assert.strictEqual(untouched.netPnl, null, "an empty slot must be null, not 0 or undefined");
});

test("heatmap cell shows exactly 0 (distinct from blank) when matching cards net to zero", function () {
  var store = freshStore();
  // Two cards in the same Fri 10:xx slot, net to exactly 0.
  store.addCard(card({ dateET: "2026-09-11", timeET: "10:05", pnl: 50, fee: 0 }));
  store.addCard(card({ dateET: "2026-09-11", timeET: "10:47", pnl: -50, fee: 0 }));

  var heatmap = store.getHeatmap({ accountId: "acc-main" });
  var cell = heatmap.grid[5][10]; // Fri 10:00
  assert.strictEqual(cell.count, 2);
  assert.strictEqual(cell.netPnl, 0, "a slot with matching cards summing to 0 must be 0, not null");

  // And confirm this is genuinely distinguishable from a truly empty slot.
  var empty = heatmap.grid[5][11];
  assert.strictEqual(empty.count, 0);
  assert.strictEqual(empty.netPnl, null);
});

test("heatmap is not clipped to RTH: a late-night slot (hour 22) still registers", function () {
  var store = freshStore();
  store.addCard(card({ dateET: "2026-09-14", timeET: "22:15", pnl: 40 })); // Mon 22:xx
  var heatmap = store.getHeatmap({ accountId: "acc-main" });
  var cell = heatmap.grid[1][22];
  assert.strictEqual(cell.count, 1);
  assert.strictEqual(cell.netPnl, 40);
  // Full 24-hour grid must exist for every weekday.
  assert.strictEqual(heatmap.grid.length, 7);
  heatmap.grid.forEach(function (row) { assert.strictEqual(row.length, 24); });
});

test("heatmap only aggregates cards passing the primary filters (account/product/setup/date)", function () {
  var store = freshStore();
  store.addCard(card({ dateET: "2026-09-10", timeET: "09:41", product: "MNQ", pnl: 100 }));
  store.addCard(card({ dateET: "2026-09-10", timeET: "09:41", product: "MES", pnl: 999 })); // filtered out below

  var heatmap = store.getHeatmap({ accountId: "acc-main", product: "MNQ" });
  var cell = heatmap.grid[4][9];
  assert.strictEqual(cell.count, 1);
  assert.strictEqual(cell.netPnl, 100);
});

test("getHeatmapForCards computes over a caller-supplied list, independent of filters", function () {
  var store = freshStore();
  store.addCard(card({ dateET: "2026-09-10", timeET: "09:41", pnl: 100 }));
  var allCards = store.getRealCards();
  var heatmap = store.getHeatmapForCards(allCards);
  assert.strictEqual(heatmap.grid[4][9].netPnl, 100);
});

// ---- 分解表: 成績固定 4 列 (A-D), even on an empty account ------------------

test("breakdown 成績 view always has exactly 4 rows (A, B, C, D), present even on an empty account", function () {
  var store = freshStore();
  // A real card exists on 主帳戶, so demo data is gone by construction (this
  // must be a genuinely empty result for 空戶 below, not built-in demo
  // cards filling it in) — but a brand new second account has zero cards.
  store.addCard(card({ accountId: "acc-main", grade: "B", pnl: 100, dateET: "2026-09-01" }));
  var added = store.addAccount({ name: "空戶", startingCapital: 500 });
  assert.strictEqual(added.ok, true);

  var rows = store.getBreakdown({ accountId: added.account.id }, "grade");
  assert.strictEqual(rows.length, 4);
  assert.deepStrictEqual(rows.map(function (r) { return r.key; }).sort(), ["A", "B", "C", "D"]);
  rows.forEach(function (r) {
    assert.strictEqual(r.count, 0);
    assert.strictEqual(r.winRate, null);
    // Empty account: 累積權益 = 初始資金 (500) + 0 淨損益.
    assert.strictEqual(r.cumulativeEquity, 500);
  });
});

test("breakdown 成績 view never grows a 5th/6th row for E/F, even though 成績 itself allows A-F", function () {
  var store = freshStore();
  store.addCard(card({ grade: "E", dateET: "2026-09-10" }));
  store.addCard(card({ grade: "F", dateET: "2026-09-11" }));
  store.addCard(card({ grade: "B", dateET: "2026-09-12", pnl: 50 }));

  var rows = store.getBreakdown({ accountId: "acc-main" }, "grade");
  assert.strictEqual(rows.length, 4, "still exactly 4 rows");
  assert.deepStrictEqual(rows.map(function (r) { return r.key; }).sort(), ["A", "B", "C", "D"]);
  var totalCounted = rows.reduce(function (sum, r) { return sum + r.count; }, 0);
  assert.strictEqual(totalCounted, 1, "the E and F graded cards must not appear in any of the 4 rows");
});

// ---- 分解表: setup/product only get rows for values actually present -------

test("breakdown setup/product dimensions only produce rows for values present among matched cards", function () {
  var store = freshStore();
  store.addCard(card({ setup: "突破", dateET: "2026-09-10" }));
  store.addCard(card({ setup: "突破", dateET: "2026-09-11" }));
  // "回歸" and "開盤區間" exist in settings but no card uses them here.

  var rows = store.getBreakdown({ accountId: "acc-main" }, "setup");
  assert.strictEqual(rows.length, 1, "only 突破 has a card, so only 突破 gets a row");
  assert.strictEqual(rows[0].key, "突破");
  assert.strictEqual(rows[0].count, 2);
});

// ---- 分解表: default sort = 累積權益 descending -----------------------------

test("breakdown rows are returned pre-sorted by 累積權益 descending by default", function () {
  var store = freshStore(); // 主帳戶 startingCapital = 0
  store.addCard(card({ setup: "突破", pnl: 500, dateET: "2026-09-01" }));   // cumEq 500
  store.addCard(card({ setup: "回歸", pnl: -100, dateET: "2026-09-02" }));  // cumEq -100
  store.addCard(card({ setup: "開盤區間", pnl: 50, dateET: "2026-09-03" })); // cumEq 50

  var rows = store.getBreakdown({ accountId: "acc-main" }, "setup");
  assert.deepStrictEqual(rows.map(function (r) { return r.key; }), ["突破", "開盤區間", "回歸"]);
  assert.strictEqual(rows[0].cumulativeEquity, 500);
  assert.strictEqual(rows[1].cumulativeEquity, 50);
  assert.strictEqual(rows[2].cumulativeEquity, -100);
});

// ---- 分解表: 累積權益 = 該戶初始資金 + 該列淨損益 (single account) -----------

test("breakdown 累積權益 = account 初始資金 + that row's net P&L, for a single account", function () {
  var store = freshStore();
  store.addAccount({ name: "戶B", startingCapital: 1000 });
  var accId = store.getAccounts().filter(function (a) { return a.name === "戶B"; })[0].id;
  store.addCard(card({ accountId: accId, setup: "突破", pnl: 200, dateET: "2026-09-01" }));

  var rows = store.getBreakdown({ accountId: accId }, "setup");
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].netPnl, 200);
  assert.strictEqual(rows[0].cumulativeEquity, 1200, "1000 初始資金 + 200 淨損益");
});

// ---- 分解表: 全部帳戶 -> no fabricated combined starting capital ------------

test("breakdown under 全部帳戶 does not fabricate a combined starting capital: 累積權益 = row's 淨損益 only", function () {
  var store = freshStore();
  store.addAccount({ name: "戶B", startingCapital: 10000 });
  var accId = store.getAccounts().filter(function (a) { return a.name === "戶B"; })[0].id;
  store.addCard(card({ accountId: "acc-main", setup: "突破", pnl: 100, dateET: "2026-09-01" }));
  store.addCard(card({ accountId: accId, setup: "突破", pnl: 50, dateET: "2026-09-02" }));

  var rows = store.getBreakdown({ accountId: "all" }, "setup");
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].netPnl, 150);
  assert.strictEqual(rows[0].cumulativeEquity, 150, "no combined starting capital fabricated across accounts");
});

// ---- 分解表: 賺賠比 vs 風報比 stay distinct at the row level -----------------

test("breakdown row 賺賠比 (profitFactor) and 風報比 (rewardRiskRatio) use different formulas and differ", function () {
  var store = freshStore();
  // Wins: 300, 100 (total 400, avg 200). Losses: -50, -50, -100 (total -200, avg -66.666...)
  store.addCard(card({ setup: "突破", pnl: 300, dateET: "2026-09-01" }));
  store.addCard(card({ setup: "突破", pnl: 100, dateET: "2026-09-02" }));
  store.addCard(card({ setup: "突破", pnl: -50, dateET: "2026-09-03" }));
  store.addCard(card({ setup: "突破", pnl: -50, dateET: "2026-09-04" }));
  store.addCard(card({ setup: "突破", pnl: -100, dateET: "2026-09-05" }));

  var rows = store.getBreakdown({ accountId: "acc-main" }, "setup");
  var row = rows[0];
  assert.strictEqual(row.profitFactor, 2); // 400 / 200
  assert.ok(Math.abs(row.rewardRiskRatio - 3) < 1e-9); // 200 / 66.666...
  assert.notStrictEqual(row.profitFactor, row.rewardRiskRatio);
});

// ---- 分解表: getBreakdownForCards works over a caller-supplied (narrowed) list --

test("getBreakdownForCards computes the same shape over an arbitrary (e.g. already-narrowed) card list", function () {
  var store = freshStore();
  store.addCard(card({ grade: "A", pnl: 100, dateET: "2026-09-01" }));
  store.addCard(card({ grade: "A", pnl: 50, dateET: "2026-09-02" }));
  store.addCard(card({ grade: "B", pnl: -30, dateET: "2026-09-03" }));

  var narrowedToGradeA = store.getRealCards().filter(function (c) { return c.grade === "A"; });
  var rows = store.getBreakdownForCards(narrowedToGradeA, "all", 0);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].count, 2);
  assert.strictEqual(rows[0].netPnl, 150);
  assert.strictEqual(rows[0].cumulativeEquity, 150);
});

test("getBreakdownForCards with startingCapitalOrNull = null does not add any starting capital", function () {
  var store = freshStore();
  store.addCard(card({ pnl: 100, dateET: "2026-09-01" }));
  var rows = store.getBreakdownForCards(store.getRealCards(), "all", null);
  assert.strictEqual(rows[0].cumulativeEquity, rows[0].netPnl);
});

// ---- runner ----------------------------------------------------------

var passed = 0;
var failed = 0;
tests.forEach(function (t) {
  try {
    t.fn();
    passed++;
    console.log("ok - " + t.name);
  } catch (err) {
    failed++;
    console.log("FAIL - " + t.name);
    console.log("    " + (err && err.message ? err.message : err));
  }
});

console.log("");
console.log(passed + " passed, " + failed + " failed, " + tests.length + " total");

process.exit(failed > 0 ? 1 : 0);
