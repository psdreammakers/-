// 交易日誌 — 經濟事件從日程表進當日日誌 (ticket 17) tests.
// Run with:  node 交易日誌/tests/economic-events.test.js
// No build step, no runtime deps beyond Node's built-in "assert".
//
// Tests through the store/schedule-lookup layer (js/schedule.js directly,
// and js/store.js's getEconomicEventsForDate/setEconomicEventLocalFields/
// addManualEconomicEvent/removeManualEconomicEvent), never through the DOM.

var assert = require("assert");
var path = require("path");
var TradingJournal = require(path.join(__dirname, "..", "js", "store.js"));
var Schedule = require(path.join(__dirname, "..", "js", "schedule.js"));

var tests = [];
function test(name, fn) {
  tests.push({ name: name, fn: fn });
}

function freshStore() {
  return TradingJournal.createStore(TradingJournal.createMemoryStorage());
}

// ---- 日程表 module itself (pure lookup, no store involved) ---------------

test("一個對上 FOMC 的交易日：日程表恰好讀出兩列（聲明＋記者會），欄位正確", function () {
  var rows = Schedule.getScheduledEventsForDate("2026-09-16"); // published FOMC date
  assert.strictEqual(rows.length, 2);

  var statement = rows.filter(function (r) { return r.name === "FOMC 聲明"; })[0];
  var presser = rows.filter(function (r) { return r.name === "FOMC 記者會"; })[0];
  assert.ok(statement, "must include the statement row");
  assert.ok(presser, "must include the press conference row");

  [statement, presser].forEach(function (row) {
    assert.strictEqual(row.dateET, "2026-09-16");
    assert.strictEqual(row.agency, "聯準會（Federal Reserve / FOMC）");
    assert.strictEqual(row.url, "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm");
  });
  assert.strictEqual(statement.timeET, "14:00");
  assert.strictEqual(presser.timeET, "14:30");
});

test("沒有排定事件的交易日：日程表讀出空集合，不是錯誤", function () {
  var rows = Schedule.getScheduledEventsForDate("2026-09-10"); // an ordinary Thursday, nothing scheduled
  assert.deepStrictEqual(rows, []);
});

test("日程表核對日是一個固定字串，不是即時計算", function () {
  assert.strictEqual(typeof Schedule.SCHEDULE_VERIFIED_AS_OF, "string");
  assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(Schedule.SCHEDULE_VERIFIED_AS_OF));
});

test("日程表只含鎖定的六類：FOMC 聲明／記者會、BLS Employment Situation、BLS CPI、BEA GDP、BEA 個人所得與支出", function () {
  var allowedNames = ["FOMC 聲明", "FOMC 記者會"];
  var rows = Schedule.getFullSchedule();
  assert.ok(rows.length > 50, "table should be a genuinely useful size, not a token stub");
  rows.forEach(function (r) {
    var isFomc = allowedNames.indexOf(r.name) !== -1;
    var isBlsEmpSit = /Employment Situation/.test(r.name);
    var isBlsCpi = /^CPI/.test(r.name);
    var isBeaGdp = /^GDP/.test(r.name);
    var isBeaPio = /個人所得與支出/.test(r.name);
    assert.ok(
      isFomc || isBlsEmpSit || isBlsCpi || isBeaGdp || isBeaPio,
      "unexpected row outside the locked six categories: " + r.name
    );
    // Explicitly excluded categories must never appear.
    assert.ok(!/EIA/i.test(r.name) && !/EIA/i.test(r.agency), "EIA rows are excluded");
  });
});

// ---- store integration: getEconomicEventsForDate ------------------------

test("當日日誌打開某交易日：對上的日程表列已經在，且帶上核對日", function () {
  var store = freshStore();
  var result = store.getEconomicEventsForDate("2026-09-16");
  assert.strictEqual(result.dateET, "2026-09-16");
  assert.strictEqual(result.scheduled.length, 2);
  assert.strictEqual(result.scheduleVerifiedAsOf, Schedule.SCHEDULE_VERIFIED_AS_OF);
  assert.deepStrictEqual(result.manual, []);
});

test("多數交易日一列都沒有：空集合是正常，不是「未能自動更新」", function () {
  var store = freshStore();
  var result = store.getEconomicEventsForDate("2026-09-10");
  assert.deepStrictEqual(result.scheduled, []);
  assert.deepStrictEqual(result.manual, []);
  // No error/failure flag exists on this shape at all — there is nothing to fail.
  assert.strictEqual(Object.prototype.hasOwnProperty.call(result, "error"), false);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(result, "failed"), false);
});

test("自動列上填 impact／實際／預估：只活在本機，重新讀日程表本體不受影響", function () {
  var store = freshStore();
  var date = "2026-09-16";
  var eventId = "fomc-statement-" + date;

  var setResult = store.setEconomicEventLocalFields(date, eventId, {
    impact: "高", actual: "維持利率不變", forecast: "市場預期維持不變",
  });
  assert.strictEqual(setResult.ok, true);

  // Layered on top when read through the store.
  var afterViaStore = store.getEconomicEventsForDate(date);
  var statementRow = afterViaStore.scheduled.filter(function (r) { return r.id === eventId; })[0];
  assert.strictEqual(statementRow.impact, "高");
  assert.strictEqual(statementRow.actual, "維持利率不變");
  assert.strictEqual(statementRow.forecast, "市場預期維持不變");
  // The official fields must be untouched.
  assert.strictEqual(statementRow.name, "FOMC 聲明");
  assert.strictEqual(statementRow.agency, "聯準會（Federal Reserve / FOMC）");

  // The shared schedule module itself must come back with ONLY official
  // fields — no impact/actual/forecast ever written into it.
  var pureRows = Schedule.getScheduledEventsForDate(date);
  var pureStatement = pureRows.filter(function (r) { return r.id === eventId; })[0];
  assert.strictEqual(Object.prototype.hasOwnProperty.call(pureStatement, "impact"), false);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(pureStatement, "actual"), false);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(pureStatement, "forecast"), false);
});

test("setEconomicEventLocalFields 拒絕不在當天日程表裡的 eventId", function () {
  var store = freshStore();
  var result = store.setEconomicEventLocalFields("2026-09-16", "not-a-real-row-id", { impact: "高" });
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.length > 0);
});

test("官方表沒列到的當天可手填多列，不寫回日程表", function () {
  var store = freshStore();
  var date = "2026-09-10"; // a day with zero official rows

  var add1 = store.addManualEconomicEvent(date, { timeET: "10:00", name: "Fed 官員談話（臨時）", agency: "Fed" });
  var add2 = store.addManualEconomicEvent(date, { name: "紀要公布" }); // timeET optional
  assert.strictEqual(add1.ok, true);
  assert.strictEqual(add2.ok, true);

  var afterAdd = store.getEconomicEventsForDate(date);
  assert.strictEqual(afterAdd.scheduled.length, 0, "manual rows must not leak into the official scheduled list");
  assert.strictEqual(afterAdd.manual.length, 2);
  assert.strictEqual(afterAdd.manual[0].name, "Fed 官員談話（臨時）");
  assert.strictEqual(afterAdd.manual[1].name, "紀要公布");
  assert.strictEqual(afterAdd.manual[1].timeET, null);

  // The shared schedule module must be completely unaffected by manual adds.
  var pureRows = Schedule.getScheduledEventsForDate(date);
  assert.deepStrictEqual(pureRows, []);
  var fullSchedule = Schedule.getFullSchedule();
  assert.ok(fullSchedule.every(function (r) { return r.name !== "紀要公布" && r.name !== "Fed 官員談話（臨時）"; }));
});

test("手填列必須有名稱；空白名稱回錯誤，不寫入", function () {
  var store = freshStore();
  var result = store.addManualEconomicEvent("2026-09-10", { name: "  " });
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.length > 0);
  assert.deepStrictEqual(store.getEconomicEventsForDate("2026-09-10").manual, []);
});

test("手填列可以刪除，刪除後不影響其他列或日程表", function () {
  var store = freshStore();
  var date = "2026-09-10";
  var added = store.addManualEconomicEvent(date, { name: "A" });
  store.addManualEconomicEvent(date, { name: "B" });
  var removed = store.removeManualEconomicEvent(date, added.event.id);
  assert.strictEqual(removed.ok, true);

  var after = store.getEconomicEventsForDate(date);
  assert.strictEqual(after.manual.length, 1);
  assert.strictEqual(after.manual[0].name, "B");
});

// ---- economic events are decoupled from the rest of the day journal -----

test("存 impact／實際／預估或手填列，不影響當日背景／盤前／盤後；反之亦然", function () {
  var store = freshStore();
  var date = "2026-09-16";

  store.setDayJournal(date, { background: "斷線 10 分鐘", planLine: "只做突破" });
  store.setEconomicEventLocalFields(date, "fomc-statement-" + date, { impact: "高" });
  store.addManualEconomicEvent(date, { name: "額外公布" });

  var journal = store.getDayJournal(date);
  assert.strictEqual(journal.background, "斷線 10 分鐘", "economic-event writes must not touch 當日背景");
  assert.strictEqual(journal.planLine, "只做突破");

  var events = store.getEconomicEventsForDate(date);
  var statementRow = events.scheduled.filter(function (r) { return r.id === "fomc-statement-" + date; })[0];
  assert.strictEqual(statementRow.impact, "高");
  assert.strictEqual(events.manual.length, 1);

  // Now re-save the main day-journal form (as the UI does on its own submit) —
  // this must NOT wipe out the economic-event data saved above.
  store.setDayJournal(date, { background: "已補上盤前資訊", didWell: "守紀律" });
  var eventsAfter = store.getEconomicEventsForDate(date);
  var statementRowAfter = eventsAfter.scheduled.filter(function (r) { return r.id === "fomc-statement-" + date; })[0];
  assert.strictEqual(statementRowAfter.impact, "高", "re-saving 當日日誌 main form must not wipe economic-event local data");
  assert.strictEqual(eventsAfter.manual.length, 1, "re-saving 當日日誌 main form must not wipe manual economic-event rows");
});

test("getDayJournal 在從未寫過經濟事件的日子上，economicEvents 是有效空殼", function () {
  var store = freshStore();
  var journal = store.getDayJournal("2026-01-01");
  assert.notStrictEqual(journal.economicEvents, undefined);
  assert.deepStrictEqual(journal.economicEvents, { local: {}, manual: [] });
});

test("經濟事件無效日期一律回錯誤/空殼，不丟例外", function () {
  var store = freshStore();
  var bad = store.getEconomicEventsForDate("not-a-date");
  assert.deepStrictEqual(bad.scheduled, []);
  assert.deepStrictEqual(bad.manual, []);

  var setBad = store.setEconomicEventLocalFields("not-a-date", "x", {});
  assert.strictEqual(setBad.ok, false);

  var addBad = store.addManualEconomicEvent("not-a-date", { name: "x" });
  assert.strictEqual(addBad.ok, false);
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
