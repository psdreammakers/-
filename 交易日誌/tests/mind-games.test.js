// 交易日誌 — 心理戰可記心理遊戲 (ticket 19) store tests.
// Run with:  node 交易日誌/tests/mind-games.test.js
// No build step, no runtime deps beyond Node's built-in "assert".
//
// A 心理遊戲 entry is written only at the moment a decision was emotionally
// hijacked. It always binds to EXACTLY ONE of {a trade report card, a
// calendar day} — never both, never neither. These tests hit the store
// layer only (the one seam this app is tested through), not the DOM.

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

function validMindGameInput(overrides) {
  var base = { type: "怕虧", intensity: 6 };
  for (var k in overrides) base[k] = overrides[k];
  return base;
}

// ---- fixed type list ---------------------------------------------------

test("MIND_GAME_TYPES exposes exactly the 7 fixed types, in order", function () {
  assert.deepStrictEqual(TradingJournal.MIND_GAME_TYPES, [
    "想翻本", "怕錯過", "怕虧", "犯錯怒", "覺得不公平", "覺得自己該贏", "其他",
  ]);
});

// ---- two doors: card-bound and day-bound both read back correctly ------

test("writing an entry bound to a card reads back via getMindGameEntriesForCard", function () {
  var store = freshStore();
  var created = store.addCard(validCardInput());
  var cardId = created.card.id;

  var result = store.addMindGameEntry(validMindGameInput({ type: "怕錯過", intensity: 8, cardId: cardId }));
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.entry.cardId, cardId);
  assert.strictEqual(result.entry.dateET, null);

  var entries = store.getMindGameEntriesForCard(cardId);
  assert.strictEqual(entries.length, 1);
  assert.strictEqual(entries[0].type, "怕錯過");
  assert.strictEqual(entries[0].intensity, 8);
  assert.strictEqual(entries[0].cardId, cardId);

  // Not visible through the day-bound door — it wasn't bound to a day.
  assert.strictEqual(store.getMindGameEntriesForDate("2026-09-10").length, 0);
});

test("writing an entry bound to a day reads back via getMindGameEntriesForDate", function () {
  var store = freshStore();
  var date = "2026-09-11";
  var result = store.addMindGameEntry(validMindGameInput({ type: "想翻本", intensity: 9, dateET: date }));
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.entry.dateET, date);
  assert.strictEqual(result.entry.cardId, null);

  var entries = store.getMindGameEntriesForDate(date);
  assert.strictEqual(entries.length, 1);
  assert.strictEqual(entries[0].type, "想翻本");
  assert.strictEqual(entries[0].intensity, 9);

  // Not visible through the card-bound door.
  var cardless = store.addCard(validCardInput({ dateET: date }));
  assert.strictEqual(store.getMindGameEntriesForCard(cardless.card.id).length, 0);
});

// ---- exactly one binding: both / neither rejected -----------------------

test("an entry with BOTH cardId and dateET is rejected", function () {
  var store = freshStore();
  var created = store.addCard(validCardInput());
  var result = store.addMindGameEntry(validMindGameInput({ cardId: created.card.id, dateET: "2026-09-10" }));
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.length > 0);
  assert.strictEqual(store.getAllMindGameEntries().length, 0, "rejected entry must not be stored");
});

test("an entry with NEITHER cardId nor dateET is rejected", function () {
  var store = freshStore();
  var result = store.addMindGameEntry(validMindGameInput());
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.length > 0);
  assert.strictEqual(store.getAllMindGameEntries().length, 0);
});

test("binding to a nonexistent card is rejected", function () {
  var store = freshStore();
  var result = store.addMindGameEntry(validMindGameInput({ cardId: "no-such-card" }));
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.length > 0);
});

test("binding to a demo card is rejected (demo data is read-only)", function () {
  var store = freshStore();
  assert.strictEqual(store.isDemoActive(), true);
  var result = store.addMindGameEntry(validMindGameInput({ cardId: "demo-1" }));
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.length > 0);
});

test("binding to an invalid date string is rejected", function () {
  var store = freshStore();
  var result = store.addMindGameEntry(validMindGameInput({ dateET: "not-a-date" }));
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.length > 0);
});

// ---- 類型="其他" requires 一句說明 ----------------------------------------

test("類型 其他 without 一句說明 is rejected", function () {
  var store = freshStore();
  var result = store.addMindGameEntry(validMindGameInput({ type: "其他", dateET: "2026-09-12" }));
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.length > 0);
});

test("類型 其他 WITH 一句說明 is accepted, and note round-trips", function () {
  var store = freshStore();
  var result = store.addMindGameEntry(
    validMindGameInput({ type: "其他", dateET: "2026-09-12", note: "同事嘲笑我，賭氣多做一筆" })
  );
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.entry.note, "同事嘲笑我，賭氣多做一筆");
});

test("a non-其他 type with no 一句說明 is accepted (note stays optional)", function () {
  var store = freshStore();
  var result = store.addMindGameEntry(validMindGameInput({ type: "怕虧", dateET: "2026-09-12" }));
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.entry.note, null);
});

// ---- 強度 required integer 1-10 ------------------------------------------

test("intensity 0 is rejected (below range)", function () {
  var store = freshStore();
  var result = store.addMindGameEntry(validMindGameInput({ intensity: 0, dateET: "2026-09-13" }));
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.length > 0);
});

test("intensity 11 is rejected (above range)", function () {
  var store = freshStore();
  var result = store.addMindGameEntry(validMindGameInput({ intensity: 11, dateET: "2026-09-13" }));
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.length > 0);
});

test("intensity 5.5 is rejected (non-integer)", function () {
  var store = freshStore();
  var result = store.addMindGameEntry(validMindGameInput({ intensity: 5.5, dateET: "2026-09-13" }));
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.length > 0);
});

test("intensity missing is rejected", function () {
  var store = freshStore();
  var result = store.addMindGameEntry({ type: "怕虧", dateET: "2026-09-13" });
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.length > 0);
});

test("intensity 1 and 10 (boundaries) are both accepted", function () {
  var store = freshStore();
  var r1 = store.addMindGameEntry(validMindGameInput({ intensity: 1, dateET: "2026-09-13" }));
  var r10 = store.addMindGameEntry(validMindGameInput({ intensity: 10, dateET: "2026-09-13" }));
  assert.strictEqual(r1.ok, true);
  assert.strictEqual(r10.ok, true);
});

// ---- type must be one of the fixed 7 -------------------------------------

test("an unknown type is rejected — no free-form types, no sleep/rule-break/oversizing/disconnect", function () {
  var store = freshStore();
  ["睡不好", "破規則", "加碼", "斷線", "隨便打的字"].forEach(function (badType) {
    var result = store.addMindGameEntry(validMindGameInput({ type: badType, dateET: "2026-09-14" }));
    assert.strictEqual(result.ok, false, badType + " must be rejected");
  });
});

// ---- multiple entries on the same day and same card, all retrievable ----

test("multiple entries on the same day are all allowed and retrievable (no daily cap)", function () {
  var store = freshStore();
  var date = "2026-09-15";
  var r1 = store.addMindGameEntry(validMindGameInput({ type: "想翻本", dateET: date }));
  var r2 = store.addMindGameEntry(validMindGameInput({ type: "怕虧", dateET: date }));
  var r3 = store.addMindGameEntry(validMindGameInput({ type: "覺得不公平", dateET: date }));
  assert.ok(r1.ok && r2.ok && r3.ok);

  var entries = store.getMindGameEntriesForDate(date);
  assert.strictEqual(entries.length, 3);
  var types = entries.map(function (e) { return e.type; });
  assert.deepStrictEqual(types, ["想翻本", "怕虧", "覺得不公平"], "oldest first");
});

test("multiple entries on the same card are all allowed and retrievable (no per-card cap)", function () {
  var store = freshStore();
  var created = store.addCard(validCardInput());
  var cardId = created.card.id;

  var r1 = store.addMindGameEntry(validMindGameInput({ type: "怕錯過", cardId: cardId }));
  var r2 = store.addMindGameEntry(validMindGameInput({ type: "覺得自己該贏", cardId: cardId }));
  assert.ok(r1.ok && r2.ok);

  var entries = store.getMindGameEntriesForCard(cardId);
  assert.strictEqual(entries.length, 2);
  var types = entries.map(function (e) { return e.type; });
  assert.deepStrictEqual(types, ["怕錯過", "覺得自己該贏"]);
});

// ---- 心理戰 browse tab: all entries reachable from one door --------------

test("getAllMindGameEntries returns both card-bound and day-bound entries, newest first", function () {
  var store = freshStore();
  var created = store.addCard(validCardInput());
  var cardId = created.card.id;

  var r1 = store.addMindGameEntry(validMindGameInput({ type: "想翻本", dateET: "2026-09-16" }));
  var r2 = store.addMindGameEntry(validMindGameInput({ type: "怕虧", cardId: cardId }));

  var all = store.getAllMindGameEntries();
  assert.strictEqual(all.length, 2);
  // newest first
  assert.strictEqual(all[0].id, r2.entry.id);
  assert.strictEqual(all[1].id, r1.entry.id);
});

test("getMindGameEntryById finds an entry regardless of which binding it uses", function () {
  var store = freshStore();
  var dayEntry = store.addMindGameEntry(validMindGameInput({ dateET: "2026-09-17" }));
  var created = store.addCard(validCardInput());
  var cardEntry = store.addMindGameEntry(validMindGameInput({ cardId: created.card.id }));

  assert.strictEqual(store.getMindGameEntryById(dayEntry.entry.id).dateET, "2026-09-17");
  assert.strictEqual(store.getMindGameEntryById(cardEntry.entry.id).cardId, created.card.id);
  assert.strictEqual(store.getMindGameEntryById("no-such-id"), null);
});

// ---- untouched card/date: empty array, not an error ----------------------

test("getMindGameEntriesForCard / getMindGameEntriesForDate return [] when nothing is bound yet", function () {
  var store = freshStore();
  var created = store.addCard(validCardInput());
  assert.deepStrictEqual(store.getMindGameEntriesForCard(created.card.id), []);
  assert.deepStrictEqual(store.getMindGameEntriesForDate("2099-01-01"), []);
});

// ---- distinct situations on the same day stay as separate entries -------

test("a revenge-trade fear then a separate FOMO fear on the same day are two entries, not merged", function () {
  var store = freshStore();
  var date = "2026-09-18";
  store.addMindGameEntry(validMindGameInput({ type: "想翻本", intensity: 7, dateET: date, note: "停損後立刻想拗回來" }));
  store.addMindGameEntry(validMindGameInput({ type: "怕錯過", intensity: 5, dateET: date, note: "看盤面噴出去很心癢" }));
  var entries = store.getMindGameEntriesForDate(date);
  assert.strictEqual(entries.length, 2);
  assert.notStrictEqual(entries[0].id, entries[1].id);
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
