// 交易日誌 — 損益月曆與當日日誌 (day journal) store tests.
// Run with:  node 交易日誌/tests/day-journal.test.js
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

// ---- untouched date: valid empty shape, not an error / undefined -------

test("getDayJournal on an untouched date returns a valid empty-shaped journal, not an error or undefined", function () {
  var store = freshStore();
  var journal = store.getDayJournal("2026-09-10");
  assert.notStrictEqual(journal, undefined);
  assert.strictEqual(journal.dateET, "2026-09-10");
  assert.strictEqual(journal.background, null);
  assert.strictEqual(journal.riskCapUsd, null);
  assert.deepStrictEqual(journal.plannedSetups, []);
  assert.strictEqual(journal.planLine, null);
  assert.strictEqual(journal.didWell, null);
  assert.strictEqual(journal.changeTomorrow, null);
});

test("getCardsOnDate on an untouched date returns an empty array, not an error", function () {
  var store = freshStore();
  // force real-card mode so we are not reading demo data here
  store.addCard(validCardInput({ dateET: "2020-01-01" }));
  var cards = store.getCardsOnDate("2026-09-10");
  assert.deepStrictEqual(cards, []);
});

// ---- required behavior from the ticket: write then read back exactly ----

test("某交易日讀出的背景／盤前／盤後／當日交易清單與寫入一致", function () {
  var store = freshStore();
  var date = "2026-09-10";

  // A couple of trade cards dated that day, entered out of time order.
  var afternoon = store.addCard(validCardInput({ dateET: date, timeET: "15:12", product: "MES", pnl: -80 }));
  var morning = store.addCard(validCardInput({ dateET: date, timeET: "09:41", product: "MNQ", pnl: 240 }));
  // A card on a different day must not leak into this day's list.
  store.addCard(validCardInput({ dateET: "2026-09-11", timeET: "10:00" }));

  assert.strictEqual(afternoon.ok, true);
  assert.strictEqual(morning.ok, true);

  var writeResult = store.setDayJournal(date, {
    background: "早上斷線 20 分鐘",
    riskCapUsd: 400,
    plannedSetups: ["突破", "回歸"],
    planLine: "只做突破",
    didWell: "第一筆守紀律",
    changeTomorrow: "回歸不該做",
  });
  assert.strictEqual(writeResult.ok, true);

  var journal = store.getDayJournal(date);
  assert.strictEqual(journal.dateET, date);
  assert.strictEqual(journal.background, "早上斷線 20 分鐘");
  assert.strictEqual(journal.riskCapUsd, 400);
  assert.deepStrictEqual(journal.plannedSetups, ["突破", "回歸"]);
  assert.strictEqual(journal.planLine, "只做突破");
  assert.strictEqual(journal.didWell, "第一筆守紀律");
  assert.strictEqual(journal.changeTomorrow, "回歸不該做");

  var cardsOnDate = store.getCardsOnDate(date);
  assert.strictEqual(cardsOnDate.length, 2, "only the two cards dated that day, not the third day's card");
  assert.strictEqual(cardsOnDate[0].timeET, "09:41", "ascending time order: earliest first");
  assert.strictEqual(cardsOnDate[0].product, "MNQ");
  assert.strictEqual(cardsOnDate[1].timeET, "15:12");
  assert.strictEqual(cardsOnDate[1].product, "MES");
});

// ---- optional fields stay optional; empty writes stay empty -------------

test("setDayJournal with no fields writes an all-blank record, not an error", function () {
  var store = freshStore();
  var result = store.setDayJournal("2026-09-12", {});
  assert.strictEqual(result.ok, true);
  var journal = store.getDayJournal("2026-09-12");
  assert.strictEqual(journal.background, null);
  assert.strictEqual(journal.riskCapUsd, null);
  assert.deepStrictEqual(journal.plannedSetups, []);
  assert.strictEqual(journal.planLine, null);
  assert.strictEqual(journal.didWell, null);
  assert.strictEqual(journal.changeTomorrow, null);
});

test("setDayJournal rejects an invalid 美東日期", function () {
  var store = freshStore();
  var result = store.setDayJournal("not-a-date", { background: "x" });
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.length > 0);
});

test("plannedSetups is filtered to the current setup-tag list; unknown tags and duplicates are dropped", function () {
  var store = freshStore();
  var result = store.setDayJournal("2026-09-13", {
    plannedSetups: ["突破", "隨便亂打", "突破", "開盤區間"],
  });
  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(result.journal.plannedSetups, ["突破", "開盤區間"]);
});

test("writing a day journal does not create a trade card, and vice versa", function () {
  var store = freshStore();
  var date = "2026-09-14";
  store.setDayJournal(date, { background: "跳空" });
  assert.strictEqual(store.getCardsOnDate(date).length, 0);

  store.addCard(validCardInput({ dateET: date }));
  var journal = store.getDayJournal(date);
  assert.strictEqual(journal.background, "跳空", "the trade card must not have reset the journal fields");
});

test("re-saving a day journal fully replaces the prior fields (upsert, not append)", function () {
  var store = freshStore();
  var date = "2026-09-15";
  store.setDayJournal(date, { background: "斷線", planLine: "觀望" });
  store.setDayJournal(date, { didWell: "有守紀律" });
  var journal = store.getDayJournal(date);
  assert.strictEqual(journal.background, null, "second write replaces the whole record");
  assert.strictEqual(journal.planLine, null);
  assert.strictEqual(journal.didWell, "有守紀律");
});

// ---- getAllPlanReviewEntries: the 交易規劃與檢討 tab's history list -----

test("getAllPlanReviewEntries is empty when nothing has been planned or reviewed", function () {
  var store = freshStore();
  assert.deepStrictEqual(store.getAllPlanReviewEntries(), []);
});

test("getAllPlanReviewEntries excludes dates only touched for 背景 (not a plan or review)", function () {
  var store = freshStore();
  store.setDayJournal("2026-09-10", { background: "斷線" });
  assert.deepStrictEqual(store.getAllPlanReviewEntries(), []);
});

test("getAllPlanReviewEntries includes any date with a 盤前 or 盤後 field set, newest first", function () {
  var store = freshStore();
  store.setDayJournal("2026-09-08", { planLine: "只做順勢" });
  store.setDayJournal("2026-09-12", { didWell: "有守紀律" });
  var entries = store.getAllPlanReviewEntries();
  assert.strictEqual(entries.length, 2);
  assert.strictEqual(entries[0].dateET, "2026-09-12", "newest first");
  assert.strictEqual(entries[1].dateET, "2026-09-08");
});

// ---- getCardsOnDate is demo-aware, like getCards() ----------------------

test("getCardsOnDate reads from demo data when there are no real cards yet", function () {
  var store = freshStore();
  assert.strictEqual(store.isDemoActive(), true);
  var cards = store.getCardsOnDate("2026-09-08"); // two demo cards share this date
  assert.strictEqual(cards.length, 2);
  assert.ok(cards.every(function (c) { return c.isDemo === true; }));
  assert.ok(cards[0].timeET <= cards[1].timeET, "ascending time order");
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
