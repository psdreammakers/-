// 交易日誌 — 從權益線點進當天 (ticket 20): equity-curve per-point day data.
// Run with:  node 交易日誌/tests/equity-curve-points.test.js
// No build step, no runtime deps beyond Node's built-in "assert".
//
// This only tests the store-side data (js/store.js). The click/hover DOM
// wiring in js/app.js reuses state.openDayJournalDate — the exact same field
// the already-tested 損益月曆 day cells set (see day-journal.test.js) — so
// there is no second "open day journal" mechanism to test here.

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

// ---- each equity-curve point carries dateET/equity/dayNetPnl/dayCardCount --

test("each equity-curve point has dateET, equity, dayNetPnl, dayCardCount", function () {
  var store = freshStore();
  store.addCard(card({ pnl: 100, dateET: "2026-09-01", timeET: "09:30" }));
  var stats = store.getCommandCenterStats({ accountId: "acc-main" });
  var p = stats.equityCurve.points[0];
  assert.strictEqual(p.dateET, "2026-09-01");
  assert.strictEqual(typeof p.equity, "number");
  assert.strictEqual(typeof p.dayNetPnl, "number");
  assert.strictEqual(typeof p.dayCardCount, "number");
});

// ---- multi-card day: every point that day shows the SAME day totals, not a
// running partial (this is the "當日損益 not cumulative" rule from the ticket) --

test("multiple cards on the same day: every point's dayNetPnl/dayCardCount is the whole day's total, identical across points that day", function () {
  var store = freshStore();
  // Day 1: three cards, net = 100 - 40 + 10 = 70
  store.addCard(card({ pnl: 100, dateET: "2026-09-01", timeET: "09:30" }));
  store.addCard(card({ pnl: -40, dateET: "2026-09-01", timeET: "10:15" }));
  store.addCard(card({ pnl: 10, dateET: "2026-09-01", timeET: "14:00" }));
  // Day 2: one card, net = -25 (fee 5)
  store.addCard(card({ pnl: -20, fee: 5, dateET: "2026-09-03", timeET: "09:45" }));

  var stats = store.getCommandCenterStats({ accountId: "acc-main" });
  var points = stats.equityCurve.points;
  assert.strictEqual(points.length, 4);

  var day1Points = points.filter(function (p) { return p.dateET === "2026-09-01"; });
  assert.strictEqual(day1Points.length, 3);
  day1Points.forEach(function (p) {
    assert.strictEqual(p.dayNetPnl, 70, "day-1 net P&L must be the whole day's total on every one of its points");
    assert.strictEqual(p.dayCardCount, 3, "day-1 card count must be the whole day's count on every one of its points");
  });
  // Running equity still advances per-card within the day (not flattened).
  assert.strictEqual(day1Points[0].equity, 100);
  assert.strictEqual(day1Points[1].equity, 60);
  assert.strictEqual(day1Points[2].equity, 70);

  var day2Points = points.filter(function (p) { return p.dateET === "2026-09-03"; });
  assert.strictEqual(day2Points.length, 1);
  assert.strictEqual(day2Points[0].dayNetPnl, -25);
  assert.strictEqual(day2Points[0].dayCardCount, 1);
});

// ---- consistency check against getCardsOnDate + netPnlOf directly ---------

test("equity-curve per-point day data is internally consistent with the account's actual cards, verified via store.getCardsOnDate", function () {
  var store = freshStore();
  var days = ["2026-09-01", "2026-09-02", "2026-09-02", "2026-09-05", "2026-09-05", "2026-09-05"];
  var pnls = [50, -30, 80, 0, 20, -100];
  var fees = [1, null, 4, 0, null, 2];
  var times = ["09:30", "09:31", "11:00", "09:45", "10:00", "15:30"];

  for (var i = 0; i < days.length; i++) {
    var result = store.addCard(card({ dateET: days[i], pnl: pnls[i], fee: fees[i], timeET: times[i] }));
    assert.strictEqual(result.ok, true, "fixture card " + i + " must save: " + JSON.stringify(result.errors));
  }

  var stats = store.getCommandCenterStats({ accountId: "acc-main" });
  var points = stats.equityCurve.points;
  assert.strictEqual(points.length, days.length);

  // Cross-check every distinct date's point data against getCardsOnDate +
  // netPnlOf directly — the same helpers the rest of the app already uses —
  // rather than re-deriving the "which cards belong to this day" definition.
  var seenDates = {};
  points.forEach(function (p) {
    if (seenDates[p.dateET]) return;
    seenDates[p.dateET] = true;

    var cardsThatDay = store.getCardsOnDate(p.dateET);
    var expectedNet = 0;
    cardsThatDay.forEach(function (c) { expectedNet += store.netPnlOf(c); });

    assert.strictEqual(p.dayCardCount, cardsThatDay.length, "筆數 mismatch for " + p.dateET);
    assert.ok(Math.abs(p.dayNetPnl - expectedNet) < 1e-9, "當日損益 mismatch for " + p.dateET);
  });

  // Sanity: we actually exercised more than one distinct date.
  assert.ok(Object.keys(seenDates).length >= 3);
});

// ---- product/setup filtering feeds the same day aggregates, not a second
// definition of "that day's cards" --------------------------------------

test("day aggregates respect the product/setup filter already applied to the curve (no second definition)", function () {
  var store = freshStore();
  store.addCard(card({ product: "MNQ", setup: "突破", pnl: 100, dateET: "2026-09-01", timeET: "09:30" }));
  store.addCard(card({ product: "MES", setup: "回歸", pnl: 500, dateET: "2026-09-01", timeET: "09:31" })); // filtered out
  store.addCard(card({ product: "MNQ", setup: "突破", pnl: -20, dateET: "2026-09-01", timeET: "09:32" }));

  var stats = store.getCommandCenterStats({ accountId: "acc-main", product: "MNQ", setup: "突破" });
  assert.strictEqual(stats.equityCurve.points.length, 2, "the MES/回歸 card must not become a point");
  stats.equityCurve.points.forEach(function (p) {
    assert.strictEqual(p.dateET, "2026-09-01");
    assert.strictEqual(p.dayNetPnl, 80, "day total must only include the filtered-in MNQ/突破 cards (100 - 20)");
    assert.strictEqual(p.dayCardCount, 2);
  });
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
