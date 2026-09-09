// 交易日誌 — 帳戶與指揮中心數字、篩選、權益線 tests (ticket 14).
// Run with:  node 交易日誌/tests/command-center.test.js
// No build step, no runtime deps beyond Node's built-in "assert".

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
    dateET: "2026-09-10",
    timeET: "09:41",
  };
  for (var k in overrides) base[k] = overrides[k];
  return base;
}

// ---- settings CRUD guards -------------------------------------------

test("addProduct rejects blank/duplicate, accepts a new one", function () {
  var store = freshStore();
  assert.strictEqual(store.addProduct("").ok, false);
  assert.strictEqual(store.addProduct("  ").ok, false);
  assert.strictEqual(store.addProduct("MNQ").ok, false, "duplicate should be rejected");
  var result = store.addProduct("MYM");
  assert.strictEqual(result.ok, true);
  assert.ok(store.getProducts().indexOf("MYM") !== -1);
});

test("removeProduct is refused while a real card references it (no orphaning)", function () {
  var store = freshStore();
  store.addCard(card({ product: "MNQ" }));
  var result = store.removeProduct("MNQ");
  assert.strictEqual(result.ok, false);
  assert.ok(store.getProducts().indexOf("MNQ") !== -1, "product must still be in the list");
});

test("removeProduct succeeds when no real card references it (demo cards don't count)", function () {
  var store = freshStore();
  assert.strictEqual(store.isDemoActive(), true);
  var result = store.removeProduct("MES");
  assert.strictEqual(result.ok, true);
  assert.strictEqual(store.getProducts().indexOf("MES"), -1);
});

test("addSetup/removeSetup follow the same guard as products", function () {
  var store = freshStore();
  assert.strictEqual(store.addSetup("突破").ok, false, "duplicate rejected");
  store.addCard(card({ setup: "突破" }));
  assert.strictEqual(store.removeSetup("突破").ok, false, "in-use setup can't be removed");
  assert.strictEqual(store.removeSetup("回歸").ok, true, "unused setup can be removed");
});

test("addAccount validates name and 初始資金, assigns a fresh id", function () {
  var store = freshStore();
  assert.strictEqual(store.addAccount({ name: "" }).ok, false);
  assert.strictEqual(store.addAccount({ name: "主帳戶" }).ok, false, "duplicate name rejected");
  assert.strictEqual(store.addAccount({ name: "第二戶", startingCapital: -5 }).ok, false, "negative starting capital rejected");

  var result = store.addAccount({ name: "第二戶", startingCapital: 5000 });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.account.name, "第二戶");
  assert.strictEqual(result.account.startingCapital, 5000);
  assert.ok(result.account.id && result.account.id !== "acc-main");

  var accounts = store.getAccounts();
  assert.strictEqual(accounts.length, 2);
});

test("addAccount defaults startingCapital to 0 when omitted", function () {
  var store = freshStore();
  var result = store.addAccount({ name: "第二戶" });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.account.startingCapital, 0);
});

test("removeAccount is refused while in use, and refused as the last remaining account", function () {
  var store = freshStore();
  store.addCard(card({ accountId: "acc-main" }));
  assert.strictEqual(store.removeAccount("acc-main").ok, false, "in-use account can't be removed");

  var store2 = freshStore();
  assert.strictEqual(store2.removeAccount("acc-main").ok, false, "last remaining account can't be removed");
});

test("removeAccount succeeds for an unused, non-last account", function () {
  var store = freshStore();
  var added = store.addAccount({ name: "第二戶", startingCapital: 100 });
  var result = store.removeAccount(added.account.id);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(store.getAccounts().length, 1);
});

// ---- 賺賠比 vs 風報比: different formulas ------------------------------

test("賺賠比 (total win / |total loss|) and 風報比 (avg win / |avg loss|) differ and are both correct", function () {
  var store = freshStore();
  // Wins: 300, 100 (total 400, avg 200). Losses: -50, -50, -100 (total -200, avg -66.666...)
  store.addCard(card({ pnl: 300, dateET: "2026-09-01" }));
  store.addCard(card({ pnl: 100, dateET: "2026-09-02" }));
  store.addCard(card({ pnl: -50, dateET: "2026-09-03" }));
  store.addCard(card({ pnl: -50, dateET: "2026-09-04" }));
  store.addCard(card({ pnl: -100, dateET: "2026-09-05" }));

  var stats = store.getCommandCenterStats({ accountId: "acc-main" });
  assert.strictEqual(stats.count, 5);
  assert.strictEqual(stats.winCount, 2);
  assert.strictEqual(stats.lossCount, 3);

  // 賺賠比 = 400 / 200 = 2
  assert.strictEqual(stats.profitFactor, 2);
  // 風報比 = avgWin(200) / |avgLoss(-66.666...)| = 3
  assert.ok(Math.abs(stats.rewardRiskRatio - 3) < 1e-9);
  assert.notStrictEqual(stats.profitFactor, stats.rewardRiskRatio, "the two ratios must not collapse to the same formula");
});

// ---- 勝率: breakeven excluded from win/loss, included in denominator --

test("勝率 excludes breakeven cards from both win and loss counts, but counts them in the denominator", function () {
  var store = freshStore();
  store.addCard(card({ pnl: 100, dateET: "2026-09-01" })); // win
  store.addCard(card({ pnl: -50, dateET: "2026-09-02" })); // loss
  store.addCard(card({ pnl: 20, fee: 20, dateET: "2026-09-03" })); // net 0 -> breakeven

  var stats = store.getCommandCenterStats({ accountId: "acc-main" });
  assert.strictEqual(stats.count, 3);
  assert.strictEqual(stats.winCount, 1);
  assert.strictEqual(stats.lossCount, 1);
  assert.strictEqual(stats.breakEvenCount, 1);
  // 勝率 = 1 / 3, not 1 / 2
  assert.ok(Math.abs(stats.winRate - (1 / 3)) < 1e-9);
});

// ---- 全部帳戶: no 目前權益 / 初始資金 / equity curve --------------------

test("全部帳戶 aggregates trade-count numbers but exposes no 目前權益/初始資金/equity-curve (not a fabricated number)", function () {
  var store = freshStore();
  store.addAccount({ name: "第二戶", startingCapital: 10000 });
  var accounts = store.getAccounts();
  var secondId = accounts.filter(function (a) { return a.name === "第二戶"; })[0].id;

  store.addCard(card({ accountId: "acc-main", pnl: 100, dateET: "2026-09-01" }));
  store.addCard(card({ accountId: secondId, pnl: -40, dateET: "2026-09-02" }));

  var stats = store.getCommandCenterStats({ accountId: "all" });
  assert.strictEqual(stats.mode, "all");
  assert.strictEqual(stats.count, 2);
  assert.strictEqual(stats.netPnl, 60);
  assert.strictEqual(stats.currentEquity, null, "目前權益 must not apply to 全部帳戶");
  assert.strictEqual(stats.startingCapital, null, "初始資金 must not apply to 全部帳戶");
  assert.strictEqual(stats.equityCurve, null, "there is no combined equity line across accounts");
});

test("single-account view DOES expose 目前權益/初始資金/equity curve", function () {
  var store = freshStore();
  store.addCard(card({ pnl: 100, dateET: "2026-09-01" }));
  var stats = store.getCommandCenterStats({ accountId: "acc-main" });
  assert.strictEqual(stats.mode, "single");
  assert.strictEqual(stats.startingCapital, 0);
  assert.strictEqual(stats.currentEquity, 100);
  assert.ok(stats.equityCurve && Array.isArray(stats.equityCurve.points));
});

// ---- equity curve: time-range start accounts for pre-range P&L -------

test("single-account equity curve start under a time-range filter = 初始資金 + pre-range net P&L", function () {
  var store = freshStore();
  store.addAccount({ name: "戶B", startingCapital: 1000 });
  var accId = store.getAccounts().filter(function (a) { return a.name === "戶B"; })[0].id;

  store.addCard(card({ accountId: accId, pnl: 100, dateET: "2026-09-01" })); // before range
  store.addCard(card({ accountId: accId, pnl: -30, dateET: "2026-09-05" })); // before range
  store.addCard(card({ accountId: accId, pnl: 50, dateET: "2026-09-10" }));  // in range
  store.addCard(card({ accountId: accId, pnl: 20, dateET: "2026-09-12" }));  // in range

  var stats = store.getCommandCenterStats({ accountId: accId, dateFrom: "2026-09-08" });
  // pre-range net = 100 - 30 = 70; start = 1000 + 70 = 1070
  assert.strictEqual(stats.equityCurve.startEquity, 1070);
  assert.strictEqual(stats.equityCurve.points.length, 2, "only in-range cards become points");
  assert.strictEqual(stats.equityCurve.points[0].equity, 1120); // 1070 + 50
  assert.strictEqual(stats.equityCurve.points[1].equity, 1140); // 1120 + 20
  // 目前權益 under this filter = last point's equity
  assert.strictEqual(stats.currentEquity, 1140);
  // stats numbers (count/netPnl) only cover the in-range cards
  assert.strictEqual(stats.count, 2);
  assert.strictEqual(stats.netPnl, 70);
});

// ---- product/setup filter on top of account only advances matching cards --

test("product/setup filter on top of an account only advances the equity curve on matching cards", function () {
  var store = freshStore();
  store.addCard(card({ product: "MNQ", setup: "突破", pnl: 100, dateET: "2026-09-01" }));
  store.addCard(card({ product: "MES", setup: "回歸", pnl: 500, dateET: "2026-09-02" })); // filtered out
  store.addCard(card({ product: "MNQ", setup: "突破", pnl: -20, dateET: "2026-09-03" }));

  var stats = store.getCommandCenterStats({ accountId: "acc-main", product: "MNQ", setup: "突破" });
  assert.strictEqual(stats.count, 2, "only the two MNQ/突破 cards count");
  assert.strictEqual(stats.equityCurve.points.length, 2);
  // starts fresh from 初始資金 (0) since no date filter is applied
  assert.strictEqual(stats.equityCurve.startEquity, 0);
  assert.strictEqual(stats.equityCurve.points[0].equity, 100);
  assert.strictEqual(stats.equityCurve.points[1].equity, 80);
  assert.strictEqual(stats.currentEquity, 80);
});

// ---- 期望值 -----------------------------------------------------------

test("期望值 = 累積損益 ÷ 筆數", function () {
  var store = freshStore();
  store.addCard(card({ pnl: 100, dateET: "2026-09-01" }));
  store.addCard(card({ pnl: -20, dateET: "2026-09-02" }));
  store.addCard(card({ pnl: 30, dateET: "2026-09-03" }));
  var stats = store.getCommandCenterStats({ accountId: "acc-main" });
  assert.strictEqual(stats.netPnl, 110);
  assert.strictEqual(stats.count, 3);
  assert.ok(Math.abs(stats.expectancy - (110 / 3)) < 1e-9);
});

// ---- 最大單筆賺／賠 and 總手續費 ---------------------------------------

test("最大單筆賺/賠 are single-trade extremes, 總手續費 sums fees (missing = 0)", function () {
  var store = freshStore();
  store.addCard(card({ pnl: 300, fee: 5, dateET: "2026-09-01" }));
  store.addCard(card({ pnl: 50, fee: 2, dateET: "2026-09-02" }));
  store.addCard(card({ pnl: -80, dateET: "2026-09-03" })); // fee missing -> 0
  store.addCard(card({ pnl: -20, fee: 1, dateET: "2026-09-04" }));

  var stats = store.getCommandCenterStats({ accountId: "acc-main" });
  // maxWin/maxLoss are over 淨損益 (net P&L), same as every other number here.
  assert.strictEqual(stats.maxWin, 295); // 300 - fee 5
  assert.strictEqual(stats.maxLoss, -80); // fee missing -> 0
  assert.strictEqual(stats.totalFees, 8);
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
