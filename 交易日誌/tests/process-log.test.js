// 交易日誌 — 盤前盤後過程紀錄 store tests.
// Run with:  node 交易日誌/tests/process-log.test.js
// No build step, no runtime deps beyond Node's built-in "assert".
//
// The locked 盤前三欄／盤後兩句 fields (tested in day-journal.test.js) stay
// exactly as spec'd. This is a separate, additive append-only log — short
// one-line notes added throughout the day, ordered by insertion (seq), the
// same shape as 心理遊戲 entries — and must never interact with
// setDayJournal()/getDayJournal()'s fields.

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

test("addProcessLogEntry rejects a missing/blank note", function () {
  var store = freshStore();
  var result = store.addProcessLogEntry({ dateET: "2026-09-10", note: "" });
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.length > 0);
});

test("addProcessLogEntry rejects an invalid 美東日期", function () {
  var store = freshStore();
  var result = store.addProcessLogEntry({ dateET: "not-a-date", note: "看盤前新聞" });
  assert.strictEqual(result.ok, false);
});

test("a valid entry is written and read back for its date, in insertion order", function () {
  var store = freshStore();
  var date = "2026-09-10";
  store.addProcessLogEntry({ dateET: date, note: "09:15 看盤前新聞" });
  store.addProcessLogEntry({ dateET: date, note: "09:40 定義關鍵價位" });
  store.addProcessLogEntry({ dateET: date, note: "14:05 收盤：今天有守紀律" });

  var entries = store.getProcessLogEntriesForDate(date);
  assert.strictEqual(entries.length, 3);
  assert.strictEqual(entries[0].note, "09:15 看盤前新聞");
  assert.strictEqual(entries[1].note, "09:40 定義關鍵價位");
  assert.strictEqual(entries[2].note, "14:05 收盤：今天有守紀律");
});

test("entries are scoped to their own date", function () {
  var store = freshStore();
  store.addProcessLogEntry({ dateET: "2026-09-10", note: "第一天的紀錄" });
  store.addProcessLogEntry({ dateET: "2026-09-11", note: "第二天的紀錄" });

  assert.strictEqual(store.getProcessLogEntriesForDate("2026-09-10").length, 1);
  assert.strictEqual(store.getProcessLogEntriesForDate("2026-09-11").length, 1);
  assert.strictEqual(store.getProcessLogEntriesForDate("2026-09-12").length, 0);
});

test("writing a process-log entry does not touch the day journal's 背景/盤前/盤後 fields, and vice versa", function () {
  var store = freshStore();
  var date = "2026-09-10";
  store.setDayJournal(date, { background: "跳空", planLine: "只做突破" });
  store.addProcessLogEntry({ dateET: date, note: "09:15 看盤前新聞" });

  var journal = store.getDayJournal(date);
  assert.strictEqual(journal.background, "跳空", "process-log write must not disturb the day journal record");
  assert.strictEqual(journal.planLine, "只做突破");

  var entries = store.getProcessLogEntriesForDate(date);
  assert.strictEqual(entries.length, 1, "day-journal write must not disturb the process log");

  // and the reverse: re-saving the day journal (a full upsert) must not
  // wipe process-log entries, since they live in a completely separate
  // top-level state key.
  store.setDayJournal(date, { didWell: "有守紀律" });
  assert.strictEqual(store.getProcessLogEntriesForDate(date).length, 1);
});

test("multiple entries on the same date all get distinct ids", function () {
  var store = freshStore();
  var date = "2026-09-10";
  store.addProcessLogEntry({ dateET: date, note: "第一則" });
  store.addProcessLogEntry({ dateET: date, note: "第二則" });
  var entries = store.getProcessLogEntriesForDate(date);
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
