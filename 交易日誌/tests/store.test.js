// 交易日誌 — journal data store tests.
// Run with:  node 交易日誌/tests/store.test.js
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

function validCardInput(overrides) {
  var base = {
    product: "MNQ",
    setup: "突破",
    accountId: "acc-main",
    grade: "B",
    execGrade: "B",
    side: "多",
    size: 2,
    pnl: 100,
    dateET: "2026-09-10",
    timeET: "09:41",
  };
  for (var k in overrides) base[k] = overrides[k];
  return base;
}

// ---- demo data ------------------------------------------------------

test("empty store: demo data is active and visible in getCards()/getSummary()", function () {
  var store = freshStore();
  assert.strictEqual(store.isDemoActive(), true);
  assert.strictEqual(store.hasRealCards(), false);
  var cards = store.getCards();
  assert.ok(cards.length > 0, "expected built-in demo cards");
  assert.ok(cards.every(function (c) { return c.isDemo === true; }));
  var summary = store.getSummary();
  assert.strictEqual(summary.count, cards.length);
});

test("first real card saved: demo data is gone forever, not merged", function () {
  var store = freshStore();
  var beforeDemoCount = store.getCards().length;
  assert.ok(beforeDemoCount > 0);

  var result = store.addCard(validCardInput());
  assert.strictEqual(result.ok, true, "expected a valid card to be accepted");

  assert.strictEqual(store.isDemoActive(), false);
  assert.strictEqual(store.hasRealCards(), true);

  var cards = store.getCards();
  assert.strictEqual(cards.length, 1, "demo cards must not be merged with the real one");
  assert.strictEqual(cards[0].isDemo, false);

  // Saving does not bring demo back, and it stays gone across further reads.
  assert.strictEqual(store.getCards().length, 1);
  assert.strictEqual(store.getSummary().count, 1);
});

// ---- required fields -----------------------------------------------

var requiredFieldCases = [
  "product",
  "setup",
  "accountId",
  "grade",
  "execGrade",
  "side",
  "size",
  "pnl",
  "dateET",
  "timeET",
];

requiredFieldCases.forEach(function (field) {
  test("addCard rejects a card missing required field: " + field, function () {
    var store = freshStore();
    var input = validCardInput();
    delete input[field];
    var result = store.addCard(input);
    assert.strictEqual(result.ok, false, "expected rejection when " + field + " is missing");
    assert.ok(result.errors.length > 0);
    assert.strictEqual(store.hasRealCards(), false, "a rejected card must not be counted as a real card");
  });
});

test("addCard rejects a product not in the settings list (no free text)", function () {
  var store = freshStore();
  var result = store.addCard(validCardInput({ product: "ES" }));
  assert.strictEqual(result.ok, false);
  assert.strictEqual(store.hasRealCards(), false);
});

test("addCard rejects a setup not in the settings list", function () {
  var store = freshStore();
  var result = store.addCard(validCardInput({ setup: "隨便亂打" }));
  assert.strictEqual(result.ok, false);
});

test("addCard rejects a non-integer / non-positive size", function () {
  var store = freshStore();
  assert.strictEqual(store.addCard(validCardInput({ size: 0 })).ok, false);
  assert.strictEqual(store.addCard(validCardInput({ size: 1.5 })).ok, false);
  assert.strictEqual(store.addCard(validCardInput({ size: -1 })).ok, false);
});

test("addCard accepts a fully valid card and it is retrievable", function () {
  var store = freshStore();
  var result = store.addCard(validCardInput());
  assert.strictEqual(result.ok, true);
  var real = store.getRealCards();
  assert.strictEqual(real.length, 1);
  assert.strictEqual(real[0].product, "MNQ");
});

// ---- 淨損益 (net P&L) --------------------------------------------------

test("missing 手續費 (fee) computes 淨損益 as if it were 0, but stores it as null", function () {
  var store = freshStore();
  var result = store.addCard(validCardInput({ pnl: 200 })); // no fee field
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.card.fee, null, "missing fee must be stored as null, not coerced to 0");
  assert.strictEqual(store.netPnlOf(result.card), 200, "淨損益 should equal 平倉損益 when fee is missing");

  var summary = store.getRealSummary();
  assert.strictEqual(summary.netPnl, 200);
  assert.strictEqual(summary.count, 1);
});

test("provided 手續費 is subtracted from 平倉損益 for 淨損益", function () {
  var store = freshStore();
  var result = store.addCard(validCardInput({ pnl: 200, fee: 4.5 }));
  assert.strictEqual(result.ok, true);
  assert.strictEqual(store.netPnlOf(result.card), 195.5);
});

test("累積損益 (aggregate) sums 淨損益 across saved cards, updating as cards are added", function () {
  var store = freshStore();
  store.addCard(validCardInput({ pnl: 100, fee: 5 })); // net 95
  store.addCard(validCardInput({ pnl: -40 })); // fee missing -> net -40
  var summary = store.getRealSummary();
  assert.strictEqual(summary.count, 2);
  assert.strictEqual(summary.netPnl, 55);
});

// ---- optional fields stay null, not coerced -------------------------

test("optional fields left blank are stored as null, not silently coerced", function () {
  var store = freshStore();
  var result = store.addCard(validCardInput());
  var c = result.card;
  ["entryPrice", "exitPrice", "stopPrice", "plannedRisk", "fee", "entryReason", "exitReason", "lesson"].forEach(function (f) {
    assert.strictEqual(c[f], null, f + " should default to null when omitted");
  });
});

// ---- settings shape (factory defaults for ticket 14 to edit later) ----

test("factory defaults: products, setups, and 主帳戶 with 初始資金 0", function () {
  var store = freshStore();
  assert.deepStrictEqual(store.getProducts(), ["MNQ", "MES"]);
  assert.deepStrictEqual(store.getSetups(), ["突破", "回歸", "開盤區間"]);
  var accounts = store.getAccounts();
  assert.strictEqual(accounts.length, 1);
  assert.strictEqual(accounts[0].name, "主帳戶");
  assert.strictEqual(accounts[0].startingCapital, 0);
});

// ---- storage scoping (persists across store instances sharing storage) --

test("data persists only within the given storage backend (localStorage-scoped)", function () {
  var backend = TradingJournal.createMemoryStorage();
  var storeA = TradingJournal.createStore(backend);
  storeA.addCard(validCardInput());
  assert.strictEqual(storeA.hasRealCards(), true);

  // A second store bound to the SAME backend sees the same data (this is
  // what localStorage gives us within one browser).
  var storeB = TradingJournal.createStore(backend);
  assert.strictEqual(storeB.hasRealCards(), true);
  assert.strictEqual(storeB.getRealCards().length, 1);

  // A store bound to a DIFFERENT backend (i.e. a different browser profile)
  // sees nothing — data is scoped to one browser's storage.
  var storeC = TradingJournal.createStore(TradingJournal.createMemoryStorage());
  assert.strictEqual(storeC.hasRealCards(), false);
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
